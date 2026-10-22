using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.DTOs;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuthService _auth;
    private readonly IConfiguration _config;
    private readonly IWebHostEnvironment _env;
    private readonly EmailService _email;
    private readonly SmsService _sms;
    private readonly AttemptLimiter _limit;
    private readonly ILogger<AuthController> _log;
    private readonly TokenService _tokens;
    private readonly FeatureFlags _flags;

    public AuthController(AppDbContext db, AuthService auth, IConfiguration config, IWebHostEnvironment env, EmailService email, SmsService sms, AttemptLimiter limit, ILogger<AuthController> log, TokenService tokens, FeatureFlags flags)
    {
        _db = db;
        _auth = auth;
        _config = config;
        _env = env;
        _email = email;
        _sms = sms;
        _limit = limit;
        _log = log;
        _tokens = tokens;
        _flags = flags;
    }

    // The per-name half of the rate limiting; see CustomersController.TooManyAsync.
    //
    // [EnableRateLimiting] counts per IP, which a hundred machines aimed at the
    // owner's password defeat by arithmetic. This counts per sign-in name, so
    // the budget follows the account being attacked instead of the attacker.
    private async Task<IActionResult?> TooManyAsync(string? key, (int Limit, TimeSpan Window) rule, string what)
    {
        // Switched off, this does nothing at all and the per-IP limiter
        // on the endpoint is the whole of the protection - which is what
        // the shop ran on before. A limit set too tight locks real
        // customers out of signing in, and they do not report it, they
        // just leave; so it has to be possible to stand it down in
        // seconds rather than in a deploy.
        if (!await _flags.IsOnAsync("security.perAccountLimits")) return null;

        var d = _limit.Check(key, rule.Limit, rule.Window);
        if (d.Allowed) return null;

        // Worth a log line here in a way a customer's is not: the only person
        // who should ever be guessing the owner's password is the owner.
        _log.LogWarning("Admin rate limit hit: {Key} ({What})", key, what);
        Response.Headers.RetryAfter = d.RetryAfterSeconds.ToString();
        return StatusCode(StatusCodes.Status429TooManyRequests, new
        {
            success = false,
            message = what + " " + AttemptLimiter.WaitMessage(d.RetryAfterSeconds),
            retryAfterSeconds = d.RetryAfterSeconds,
        });
    }

    // POST /api/auth/admin-login
    [HttpPost("admin-login")]
    // The keys to the whole shop: six tries in five minutes, per caller.
    [EnableRateLimiting("login")]
    public async Task<IActionResult> AdminLogin([FromBody] AdminLoginRequest req)
    {
        var loginId = (req.Email ?? "").Trim();

        var limitKey = AttemptLimiter.AdminKey(loginId);
        if (await TooManyAsync(limitKey, AttemptLimiter.AdminLogin,
            "Too many sign-in attempts for this account.") is { } tooMany) return tooMany;

        var adminEmail = await _db.SiteSettings
            .Where(s => s.Key == "admin_email")
            .Select(s => s.Value)
            .FirstOrDefaultAsync() ?? _config["Admin:Email"] ?? "";
        var adminPassHash = await _db.SiteSettings
            .Where(s => s.Key == "admin_password_hash")
            .Select(s => s.Value)
            .FirstOrDefaultAsync() ?? _config["Admin:PasswordHash"] ?? "";

        // ── 1) Owner / full admin login (matched by email) ──────────────────────
        var isOwner = !string.IsNullOrEmpty(adminPassHash)
            && string.Equals(loginId, adminEmail, StringComparison.OrdinalIgnoreCase)
            && BCrypt.Net.BCrypt.Verify(req.Password, adminPassHash);

        if (isOwner)
        {
            _limit.Forget(limitKey);
            var owner = await IssueAdminSessionAsync(
                new TokenService.Principal(TokenService.Owner, "0", loginId, "admin", null));
            return Ok(new
            {
                success = true,
                token = owner.AccessToken,
                refreshToken = owner.RefreshToken,
                expiresIn = owner.ExpiresInSeconds,
                role = "admin",
            });
        }

        // ── 2) Staff login (matched by username or email) ───────────────────────
        var uname = loginId.ToLower();
        var staff = await _db.StaffMembers.FirstOrDefaultAsync(s =>
            s.Username == uname || (s.Email != null && s.Email.ToLower() == uname));

        if (staff != null
            && staff.IsActive
            && !string.IsNullOrEmpty(staff.PasswordHash)
            && BCrypt.Net.BCrypt.Verify(req.Password, staff.PasswordHash))
        {
            _limit.Forget(limitKey);
            staff.LastLogin = DateTimeOffset.UtcNow;
            var role = string.IsNullOrWhiteSpace(staff.Role) ? "staff" : staff.Role;
            var session = await IssueAdminSessionAsync(new TokenService.Principal(
                TokenService.Staff, staff.Id.ToString(), staff.Username, role, staff.Permissions));
            return Ok(new
            {
                success = true,
                token = session.AccessToken,
                refreshToken = session.RefreshToken,
                expiresIn = session.ExpiresInSeconds,
                role,
                permissions = staff.Permissions ?? "",
            });
        }

        return Unauthorized(new { success = false, message = "Invalid credentials." });
    }

    // Creates an admin-panel session: a short-lived access token plus a refresh
    // token that is written down and can therefore be cancelled.
    //
    // What was here before wrote a row into admin_tokens and threw the raw
    // token away ("SEC-2: rawToken removed from response"), which left two dead
    // halves: the client never had the value admin-logout asks for, so logging
    // out could never find the row - and nothing read admin_tokens on a request
    // anyway, so deleting it would not have ended the session either. The panel
    // JWT simply stayed valid for seven days whatever anybody pressed.
    private async Task<TokenService.Pair> IssueAdminSessionAsync(TokenService.Principal principal)
        => await _tokens.IssuePairAsync(principal, Request.Headers.UserAgent.ToString());

    // POST /api/auth/admin-change-password
    [HttpPost("admin-change-password")]
    [Authorize(Policy = "AdminOnly")]
    // Hashing at work factor 12 costs about a quarter of a second of CPU, and
    // this endpoint does one per request. Signed in or not, nobody needs to
    // change the password ten times a minute, and without a limit a valid
    // token is enough to tie the server in knots.
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> AdminChangePassword([FromBody] AdminChangePasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8)
            return BadRequest(new { success = false, message = "Password must be at least 8 characters." });

        var hash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword, workFactor: 12);
        var setting = await _db.SiteSettings.FirstOrDefaultAsync(s => s.Key == "admin_password_hash");
        if (setting is null)
        {
            _db.SiteSettings.Add(new SiteSetting { Key = "admin_password_hash", Value = hash });
        }
        else
        {
            setting.Value = hash;
            setting.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync();

        // A new password has to end the old sessions, or it does not mean
        // anything. The whole reason to change it after a scare is to shut out
        // whoever might be holding a token - and before refresh tokens existed
        // there was nothing to shut: the panel JWT stayed valid for a week
        // whatever the password became.
        //
        // This device is kept signed in when it says which session it is, so
        // changing a password is not also a logout.
        var ended = await _tokens.RevokeAllOwnerAsync("password-change", req.RefreshToken);

        return Ok(new { success = true, sessionsEnded = ended });
    }

    // POST /api/auth/admin-logout
    //
    // Ends this session. RawToken is kept as a name only so an older panel
    // build does not 400 on it; either field may carry the refresh token.
    [HttpPost("admin-logout")]
    public async Task<IActionResult> AdminLogout([FromBody] LogoutRequest req)
    {
        await _tokens.RevokeAsync(req.RefreshToken ?? req.RawToken, "logout");
        return Ok(new { success = true });
    }

    // POST /api/auth/logout
    //
    // The same thing under a name the shop can call without it reading oddly.
    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest req)
    {
        await _tokens.RevokeAsync(req.RefreshToken ?? req.RawToken, "logout");
        return Ok(new { success = true });
    }

    // POST /api/auth/refresh
    //
    // The exchange: a refresh token in, a fresh access token out. This is the
    // one request in every fifteen minutes that costs a database lookup, and
    // the only moment the server can refuse to keep somebody signed in.
    //
    // 401 means sign in again. 409 means another tab got there a moment ago and
    // the caller should read the token that one stored - NOT that the session is
    // over; signing a customer out because her own two tabs raced would be a
    // fault that only ever hit real people.
    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest req)
    {
        var result = await _tokens.RotateAsync(req.RefreshToken, Request.Headers.UserAgent.ToString());

        if (result.Retry)
            return Conflict(new { success = false, retry = true, message = "Refreshed elsewhere. Please retry." });

        if (result.Pair is null)
            return Unauthorized(new { success = false, message = result.Error ?? "Please sign in again." });

        return Ok(new
        {
            success = true,
            token = result.Pair.AccessToken,
            refreshToken = result.Pair.RefreshToken,
            expiresIn = result.Pair.ExpiresInSeconds,
        });
    }

    // POST /api/auth/logout-all
    //
    // Log out from all devices. Needs a signed-in caller, and ends every
    // session for that account except, optionally, the one asking - so the
    // person pressing it is not the first one thrown out.
    [HttpPost("logout-all")]
    [Authorize]
    public async Task<IActionResult> LogoutAll([FromBody] LogoutRequest? req)
    {
        var role = User.FindFirst("role")?.Value ?? "";
        var sub  = User.FindFirst("sub")?.Value ?? "";
        var keep = req?.RefreshToken ?? req?.RawToken;

        var ended = role == "admin" && sub == "0"
            ? await _tokens.RevokeAllOwnerAsync("logout-all", keep)
            : await _tokens.RevokeAllAsync(
                role == "customer" ? TokenService.Customer : TokenService.Staff,
                sub, "logout-all", keep);

        return Ok(new { success = true, sessionsEnded = ended });
    }

    // POST /api/auth/admin-recover/send-otp
    [HttpPost("admin-recover/send-otp")]
    [EnableRateLimiting("auth")]  // SEC-8: brute-force protection
    public async Task<IActionResult> AdminRecoverSendOtp([FromBody] AdminRecoverOtpRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || !req.Email.Contains('@'))
            return BadRequest(new { success = false, message = "Valid email required." });

        var adminEmail = await _db.SiteSettings
            .Where(s => s.Key == "admin_email")
            .Select(s => s.Value)
            .FirstOrDefaultAsync() ?? _config["Admin:Email"] ?? "";

        if (!string.Equals(req.Email.Trim(), adminEmail, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { success = false, message = "Email not recognised." });

        // Recovery sends the code by email AND SMS, so each request costs a
        // message. Counted per address rather than per caller: the point is
        // that the owner's inbox cannot be buried from a hundred machines.
        if (await TooManyAsync(AttemptLimiter.OtpKey(null, req.Email), AttemptLimiter.OtpBurst,
            "Too many recovery codes requested.") is { } tooMany) return tooMany;

        var otp = System.Security.Cryptography.RandomNumberGenerator
            .GetInt32(100000, 1000000).ToString();
        var (hash, _) = _auth.HashPassword(otp);

        var old = _db.OtpTokens.Where(t => t.Email == req.Email.Trim() && t.Purpose == "admin-recovery");
        _db.OtpTokens.RemoveRange(old);

        _db.OtpTokens.Add(new MahalaxmiApi.Models.OtpToken
        {
            Email     = req.Email.Trim().ToLower(),
            OtpHash   = hash,
            Purpose   = "admin-recovery",
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(15),
        });
        await _db.SaveChangesAsync();

        // Send the OTP over both channels: email + SMS (to the admin recovery mobile).
        var emailed = await _email.SendAsync(
            req.Email.Trim(),
            "Your Mahalaxmi Fashion Hub password reset code",
            EmailService.BuildOtpEmail(otp, "admin password reset", 15));

        var adminPhone = await _db.SiteSettings
            .Where(s => s.Key == "adminRecoveryPhone")
            .Select(s => s.Value)
            .FirstOrDefaultAsync();

        var texted = false;
        if (!string.IsNullOrWhiteSpace(adminPhone))
            texted = await _sms.SendOtpAsync(adminPhone, otp);

        if (emailed || texted)
        {
            var where = (emailed && texted) ? "email and mobile"
                      : emailed ? "email"
                      : "mobile";
            return Ok(new { success = true, message = $"OTP sent to your {where}." });
        }

        // Delivery failed on every channel. Returning the OTP over this unauthenticated endpoint
        // would allow admin account takeover, so we NEVER expose it in production — only in local
        // development. In production, ask the admin to fix email/SMS config (or reset via server).
        if (_env.IsDevelopment())
            return Ok(new { success = true, message = "OTP generated (dev only).", devOtp = otp });

        return StatusCode(500, new { success = false, message = "Could not send the reset code. Please make sure the admin email or recovery mobile is configured correctly." });
    }

    // POST /api/auth/admin-recover/reset
    [HttpPost("admin-recover/reset")]
    [EnableRateLimiting("auth")]  // SEC-8: brute-force protection on the reset endpoint itself
    public async Task<IActionResult> AdminRecoverReset([FromBody] AdminRecoverResetRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8)
            return BadRequest(new { success = false, message = "Password must be at least 8 characters." });

        // The five-guess lock below is per OTP token, which a script resets by
        // asking for a new code. This one is per address and survives that.
        //
        // Kept apart from the shop's reset budget even though the address may be
        // the same: if the owner's email also has a customer account, failed
        // resets there must not be what stands between him and his own panel.
        var recoverKey = AttemptLimiter.ResetKey(req.Email) is { } rk ? rk + ":admin" : null;
        if (await TooManyAsync(recoverKey, AttemptLimiter.Reset,
            "Too many recovery attempts for this account.") is { } tooMany) return tooMany;

        var token = await _db.OtpTokens.FirstOrDefaultAsync(t =>
            t.Email == req.Email.Trim().ToLower() &&
            t.Purpose == "admin-recovery" &&
            !t.Used &&
            t.ExpiresAt > DateTimeOffset.UtcNow);

        if (token is null)
            return BadRequest(new { success = false, message = "Invalid or expired session. Please start over." });

        // SEC: lock the OTP after 5 wrong guesses so the 6-digit code can't be
        // brute-forced within the 15-minute window.
        //
        // The count is taken by the database, before the guess is checked, in one
        // statement that only succeeds while it is under the limit. Read-then-
        // increment let a burst of requests all read 4, all pass, and all
        // increment — the limit held against a person typing and not against a
        // script, which is the only thing it was there to stop.
        var attemptRows = await _db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE otp_tokens SET attempts = attempts + 1 WHERE id = {token.Id} AND attempts < 5");
        if (attemptRows == 0)
            return BadRequest(new { success = false, message = "Too many incorrect attempts. Please start over." });

        if (!BCrypt.Net.BCrypt.Verify(req.Otp, token.OtpHash))
            return BadRequest(new { success = false, message = "Incorrect OTP." });

        token.Used = true;
        var newHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword, workFactor: 12);
        var setting = await _db.SiteSettings.FirstOrDefaultAsync(s => s.Key == "admin_password_hash");
        if (setting is null)
            _db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "admin_password_hash", Value = newHash });
        else
        { setting.Value = newHash; setting.UpdatedAt = DateTimeOffset.UtcNow; }

        await _db.SaveChangesAsync();
        _limit.Forget(recoverKey);

        // Recovery ends every session without exception, including whoever
        // started this one. If the account is being recovered because someone
        // else got into it, the point of the exercise is to put them out - and
        // this is the one case where the person at the keyboard has just proved
        // control of the email and can sign straight back in.
        var ended = await _tokens.RevokeAllOwnerAsync("password-recovery");

        return Ok(new { success = true, message = "Password updated successfully.", sessionsEnded = ended });
    }

    // GET /api/auth/me
    [HttpGet("me")]
    public IActionResult Me()
    {
        if (!User.Identity?.IsAuthenticated ?? true)
            return Unauthorized(new { success = false });

        return Ok(new
        {
            success = true,
            id    = User.FindFirst("sub")?.Value,
            email = User.FindFirst("email")?.Value,
            role  = User.FindFirst("role")?.Value,
        });
    }
}

// RawToken is the old name, kept so an older panel build does not 400.
public record LogoutRequest(string? RawToken, string? RefreshToken);
public record RefreshRequest(string? RefreshToken);
// RefreshToken is optional: send the current session's and it is the one kept
// signed in while the others are ended.
public record AdminChangePasswordRequest(string NewPassword, string? RefreshToken);
public record AdminRecoverOtpRequest(string Email);
public record AdminRecoverResetRequest(string Email, string Otp, string NewPassword);
