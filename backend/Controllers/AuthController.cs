using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
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

    public AuthController(AppDbContext db, AuthService auth, IConfiguration config, IWebHostEnvironment env, EmailService email, SmsService sms)
    {
        _db = db;
        _auth = auth;
        _config = config;
        _env = env;
        _email = email;
        _sms = sms;
    }

    // POST /api/auth/admin-login
    [HttpPost("admin-login")]
    [EnableRateLimiting("auth")]  // SEC-8: brute-force protection
    public async Task<IActionResult> AdminLogin([FromBody] AdminLoginRequest req)
    {
        var loginId = (req.Email ?? "").Trim();

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
            var jwtOwner = await IssueAdminSessionAsync(loginId, "0", "admin");
            return Ok(new { success = true, token = jwtOwner, role = "admin" });
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
            staff.LastLogin = DateTimeOffset.UtcNow;
            var role = string.IsNullOrWhiteSpace(staff.Role) ? "staff" : staff.Role;
            var jwtStaff = await IssueAdminSessionAsync(staff.Username, staff.Id.ToString(), role);
            return Ok(new { success = true, token = jwtStaff, role });
        }

        return Unauthorized(new { success = false, message = "Invalid credentials." });
    }

    // Creates an admin-panel session (opaque token hash stored in DB) and returns a JWT.
    private async Task<string> IssueAdminSessionAsync(string email, string userId, string role)
    {
        var rawToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var tokenHash = Convert.ToHexString(SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(rawToken)));

        _db.AdminTokens.Add(new AdminToken
        {
            Email     = email,
            TokenHash = tokenHash,
            Role      = role,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(role == "admin" ? 7 : 30),
        });
        await _db.SaveChangesAsync();

        // SEC-2: rawToken removed from response — only JWT returned
        return _auth.GenerateJwt(userId, email, role);
    }

    // POST /api/auth/admin-change-password
    [HttpPost("admin-change-password")]
    [Authorize(Policy = "AdminOnly")]
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
        return Ok(new { success = true });
    }

    // POST /api/auth/admin-logout
    [HttpPost("admin-logout")]
    public async Task<IActionResult> AdminLogout([FromBody] LogoutRequest req)
    {
        if (!string.IsNullOrEmpty(req.RawToken))
        {
            var hash = Convert.ToHexString(SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(req.RawToken)));
            var token = await _db.AdminTokens.FirstOrDefaultAsync(t => t.TokenHash == hash);
            if (token is not null)
            {
                _db.AdminTokens.Remove(token);
                await _db.SaveChangesAsync();
            }
        }
        return Ok(new { success = true });
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

        var otp = Random.Shared.Next(100000, 999999).ToString();
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

        // Fallback (no channel configured / all sends failed) — show on screen so the admin isn't locked out.
        return Ok(new { success = true, message = "OTP generated.", devOtp = otp });
    }

    // POST /api/auth/admin-recover/reset
    [HttpPost("admin-recover/reset")]
    public async Task<IActionResult> AdminRecoverReset([FromBody] AdminRecoverResetRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8)
            return BadRequest(new { success = false, message = "Password must be at least 8 characters." });

        var token = await _db.OtpTokens.FirstOrDefaultAsync(t =>
            t.Email == req.Email.Trim().ToLower() &&
            t.Purpose == "admin-recovery" &&
            !t.Used &&
            t.ExpiresAt > DateTimeOffset.UtcNow);

        if (token is null)
            return BadRequest(new { success = false, message = "Invalid or expired session. Please start over." });

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
        return Ok(new { success = true, message = "Password updated successfully." });
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

public record LogoutRequest(string? RawToken);
public record AdminChangePasswordRequest(string NewPassword);
public record AdminRecoverOtpRequest(string Email);
public record AdminRecoverResetRequest(string Email, string Otp, string NewPassword);
