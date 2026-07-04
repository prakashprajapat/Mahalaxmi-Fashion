using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/influencers")]
public class InfluencersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly EmailService _email;
    private readonly SmsService _sms;
    private readonly IWebHostEnvironment _env;

    public InfluencersController(AppDbContext db, EmailService email, SmsService sms, IWebHostEnvironment env)
    {
        _db = db;
        _email = email;
        _sms = sms;
        _env = env;
    }

    // ── Admin auth helper ────────────────────────────────────────────────────
    // Admin = a valid JWT carrying the "role":"admin" claim (same auth as the rest of the admin panel).
    private Task<bool> IsAdmin() => Task.FromResult(User.HasClaim("role", "admin"));

    // ── POST /api/influencers  (public — apply) ──────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Apply([FromBody] InfluencerApplyRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { success = false, message = "Name and email are required." });

        // Prevent duplicate applications
        var exists = await _db.Influencers
            .AnyAsync(i => i.Email.ToLower() == req.Email.ToLower().Trim());
        if (exists)
            return Conflict(new { success = false, message = "An application with this email already exists." });

        var influencer = new Influencer
        {
            Name           = req.Name.Trim(),
            Email          = req.Email.Trim().ToLower(),
            Phone          = req.Phone?.Trim(),
            SocialHandle   = req.SocialHandle?.Trim(),
            Platform       = req.Platform ?? "Instagram",
            FollowersCount = req.FollowersCount?.Trim(),
            Category       = req.Category?.Trim(),
            Niche          = req.Niche?.Trim(),
            PasswordHash   = string.IsNullOrWhiteSpace(req.Password) ? null : BCrypt.Net.BCrypt.HashPassword(req.Password, workFactor: 12),
            Status         = "pending",
            CreatedAt      = DateTimeOffset.UtcNow,
            UpdatedAt      = DateTimeOffset.UtcNow,
        };
        _db.Influencers.Add(influencer);
        await _db.SaveChangesAsync();
        return Ok(new { success = true, message = "Application submitted! We'll review and contact you within 2–3 business days." });
    }

    // ── POST /api/influencers/forgot-password  (public) ──────────────────────
    // Records a password-reset request so the admin can reset it and contact the
    // creator (no auto email/SMS provider is wired up, so it's admin-mediated).
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req)
    {
        if (!string.IsNullOrWhiteSpace(req.Email))
        {
            var inf = await _db.Influencers
                .FirstOrDefaultAsync(i => i.Email.ToLower() == req.Email.Trim().ToLower());
            if (inf is not null)
            {
                inf.ResetRequestedAt = DateTimeOffset.UtcNow;
                await _db.SaveChangesAsync();
            }
        }
        // Always generic — don't reveal whether the email is registered.
        return Ok(new { success = true, message = "Request received. We'll reset your password and contact you on WhatsApp shortly." });
    }

    // ── POST /api/influencers/login  (public — creator self) ─────────────────
    // Creators log in with email + password. The coupon code is public (shared
    // with followers) so it is no longer used as a login credential.
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] InfluencerLoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { message = "Email and password are required." });

        var inf = await _db.Influencers.FirstOrDefaultAsync(i =>
            i.Email.ToLower() == req.Email.Trim().ToLower() &&
            i.Status == "approved");

        if (inf is null || string.IsNullOrEmpty(inf.PasswordHash) ||
            !BCrypt.Net.BCrypt.Verify(req.Password, inf.PasswordHash))
            return Unauthorized(new { message = "Invalid email or password. If you haven't set a password, contact us." });

        return Ok(await BuildDashboardAsync(inf));
    }

    // ── POST /api/influencers/send-otp  (public — creator OTP login) ─────────
    // Accepts an email OR mobile number, finds the approved creator, and sends
    // the SAME OTP to every channel on file (email and/or mobile).
    [HttpPost("send-otp")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> SendLoginOtp([FromBody] InfluencerOtpRequest req)
    {
        var idf = (req.Identifier ?? "").Trim();
        if (string.IsNullOrWhiteSpace(idf))
            return BadRequest(new { success = false, message = "Email or mobile number is required." });

        var inf = await FindApprovedInfluencer(idf);
        if (inf is null)
            return NotFound(new { success = false, message = "No approved creator account found for this email or mobile." });

        var accEmail = (inf.Email ?? "").Trim().ToLower();
        var accPhone = (inf.Phone ?? "").Trim();
        if (string.IsNullOrWhiteSpace(accEmail) && string.IsNullOrWhiteSpace(accPhone))
            return BadRequest(new { success = false, message = "This account has no email or mobile on file." });

        var otp  = Random.Shared.Next(100000, 999999).ToString();
        var hash = BCrypt.Net.BCrypt.HashPassword(otp, workFactor: 10);

        var old = _db.OtpTokens.Where(t =>
            t.Purpose == "creator-login" &&
            (t.Used || t.ExpiresAt < DateTimeOffset.UtcNow ||
             (accPhone != "" && t.Phone == accPhone) ||
             (accEmail != "" && t.Email == accEmail)));
        _db.OtpTokens.RemoveRange(old);

        _db.OtpTokens.Add(new OtpToken
        {
            Phone     = accPhone,
            Email     = accEmail,
            OtpHash   = hash,
            Purpose   = "creator-login",
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10),
        });
        await _db.SaveChangesAsync();

        var emailed = false;
        var texted  = false;
        if (!string.IsNullOrWhiteSpace(accEmail))
            emailed = await _email.SendAsync(accEmail,
                "Your Mahalaxmi Fashion Hub creator login code",
                EmailService.BuildOtpEmail(otp, "creator login", 10));
        if (!string.IsNullOrWhiteSpace(accPhone))
            texted = await _sms.SendOtpAsync(accPhone, otp);

        var sentTo = new
        {
            email = emailed ? MaskEmail(accEmail) : null,
            phone = texted  ? MaskPhone(accPhone) : null,
        };

        if (_env.IsDevelopment() || (!emailed && !texted))
            return Ok(new { success = true, message = "OTP sent.", sentTo, devOtp = otp });
        return Ok(new { success = true, message = "OTP sent.", sentTo });
    }

    // ── POST /api/influencers/verify-otp  (public — creator OTP login) ───────
    [HttpPost("verify-otp")]
    public async Task<IActionResult> VerifyLoginOtp([FromBody] InfluencerOtpVerifyRequest req)
    {
        var idf = (req.Identifier ?? "").Trim();
        var otp = (req.Otp ?? "").Trim();
        if (string.IsNullOrWhiteSpace(idf) || string.IsNullOrWhiteSpace(otp))
            return BadRequest(new { success = false, message = "Email/mobile and OTP are required." });

        var inf = await FindApprovedInfluencer(idf);
        if (inf is null)
            return NotFound(new { success = false, message = "No approved creator account found." });

        var accEmail = (inf.Email ?? "").Trim().ToLower();
        var accPhone = (inf.Phone ?? "").Trim();

        var record = await _db.OtpTokens
            .Where(t => t.Purpose == "creator-login" && !t.Used && t.ExpiresAt > DateTimeOffset.UtcNow &&
                ((accPhone != "" && t.Phone == accPhone) || (accEmail != "" && t.Email == accEmail)))
            .OrderByDescending(t => t.CreatedAt)
            .FirstOrDefaultAsync();

        if (record is null || record.Attempts >= 5)
            return BadRequest(new { success = false, message = "OTP expired or too many attempts. Please request a new one." });

        if (!BCrypt.Net.BCrypt.Verify(otp, record.OtpHash))
        {
            record.Attempts++;
            await _db.SaveChangesAsync();
            return BadRequest(new { success = false, message = "Invalid OTP." });
        }

        record.Used = true;
        await _db.SaveChangesAsync();
        return Ok(await BuildDashboardAsync(inf));
    }

    // Finds an approved creator by email (contains '@') or mobile (last 10 digits).
    private async Task<Influencer?> FindApprovedInfluencer(string identifier)
    {
        var idf = (identifier ?? "").Trim();
        if (string.IsNullOrWhiteSpace(idf)) return null;

        if (idf.Contains('@'))
            return await _db.Influencers.FirstOrDefaultAsync(i =>
                i.Email.ToLower() == idf.ToLower() && i.Status == "approved");

        var digits = new string(idf.Where(char.IsDigit).ToArray());
        if (digits.Length < 10) return null;
        var last10 = digits.Substring(digits.Length - 10);
        return await _db.Influencers.FirstOrDefaultAsync(i =>
            i.Status == "approved" && i.Phone != null &&
            (i.Phone == idf || i.Phone == digits || i.Phone == last10 || i.Phone!.EndsWith(last10)));
    }

    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0) return "***";
        var name  = email.Substring(0, at);
        var shown = name.Length <= 2 ? name.Substring(0, 1) : name.Substring(0, 2);
        return shown + new string('*', Math.Max(1, name.Length - shown.Length)) + email.Substring(at);
    }

    private static string MaskPhone(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.Length <= 4) return new string('*', digits.Length);
        return new string('*', digits.Length - 4) + digits.Substring(digits.Length - 4);
    }

    // Shared dashboard payload (stats + profile) for an approved creator.
    private async Task<object> BuildDashboardAsync(Influencer inf)
    {
        var code = inf.CouponCode == null ? null : inf.CouponCode.ToLower();
        var orders = await _db.SiteOrders
            .Where(o => o.CouponCode != null &&
                        o.CouponCode.ToLower() == code &&
                        o.Status != "Cancelled")
            .OrderByDescending(o => o.PlacedAt)
            .Select(o => new {
                o.OrderId, o.Total, o.Status,
                PlacedAt = o.PlacedAt.HasValue ? o.PlacedAt.Value.ToString("dd MMM yyyy") : "-"
            })
            .ToListAsync();

        var totalSales = orders.Sum(o => o.Total);
        var commission = Math.Round(totalSales * inf.CommissionRate / 100, 2);

        return new {
            name           = inf.Name,
            email          = inf.Email,
            couponCode     = inf.CouponCode,
            commissionRate = inf.CommissionRate,
            platform       = inf.Platform,
            phone          = inf.Phone,
            socialHandle   = inf.SocialHandle,
            followersCount = inf.FollowersCount,
            niche          = inf.Niche,
            category       = inf.Category,
            totalOrders    = orders.Count,
            totalSales,
            commissionEarned = commission,
            orders
        };
    }

    // ── PUT /api/influencers/profile  (public — creator self-edit) ───────────
    // Authenticated the same way as the dashboard: email + coupon code of an
    // approved creator. Only lets them edit their own profile details — never
    // the coupon code, commission rate or status (those stay admin-controlled).
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] InfluencerProfileRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return Unauthorized(new { success = false, message = "Email and password required." });

        var inf = await _db.Influencers.FirstOrDefaultAsync(i =>
            i.Email.ToLower() == req.Email.Trim().ToLower() &&
            i.Status == "approved");

        if (inf is null || string.IsNullOrEmpty(inf.PasswordHash) ||
            !BCrypt.Net.BCrypt.Verify(req.Password, inf.PasswordHash))
            return Unauthorized(new { success = false, message = "Invalid email or password." });

        if (!string.IsNullOrWhiteSpace(req.Name)) inf.Name = req.Name.Trim();
        if (req.Phone          != null) inf.Phone          = req.Phone.Trim();
        if (req.SocialHandle   != null) inf.SocialHandle   = req.SocialHandle.Trim();
        if (req.FollowersCount != null) inf.FollowersCount = req.FollowersCount.Trim();
        if (req.Niche          != null) inf.Niche          = req.Niche.Trim();
        inf.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { success = true, message = "Profile updated." });
    }

    // ── GET /api/influencers  (admin) ─────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status)
    {
        if (!await IsAdmin()) return Unauthorized();
        var query = _db.Influencers.AsQueryable();
        if (!string.IsNullOrWhiteSpace(status) && status != "all")
            query = query.Where(i => i.Status == status);
        var list = await query.OrderByDescending(i => i.CreatedAt).ToListAsync();
        return Ok(list);
    }

    // ── GET /api/influencers/report  (admin) — aggregated analytics ──────────
    [HttpGet("report")]
    public async Task<IActionResult> Report()
    {
        if (!await IsAdmin()) return Unauthorized();

        var influencers = await _db.Influencers
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync();

        // All non-cancelled orders that carry a coupon code, grouped by lower-cased code.
        var orders = await _db.SiteOrders
            .Where(o => o.CouponCode != null && o.Status != "Cancelled")
            .Select(o => new { Code = o.CouponCode!.ToLower(), o.Total, o.Status })
            .ToListAsync();

        // Order statuses that count as a return.
        var returnStatuses = new HashSet<string> { "return requested", "return transit", "return" };
        bool IsReturn(string s) => returnStatuses.Contains((s ?? "").ToLower());

        var byCode = orders
            .GroupBy(o => o.Code)
            .ToDictionary(g => g.Key, g => new
            {
                Count         = g.Count(),
                Sales         = g.Sum(o => o.Total),
                Returns       = g.Count(o => IsReturn(o.Status)),
                ReturnedSales = g.Where(o => IsReturn(o.Status)).Sum(o => o.Total),
            });

        var creators = influencers.Select(i =>
        {
            var code    = i.CouponCode?.ToLower();
            var has     = code != null && byCode.ContainsKey(code);
            var count   = has ? byCode[code!].Count : 0;
            var sales   = has ? byCode[code!].Sales : 0m;
            var returns = has ? byCode[code!].Returns : 0;
            var retSales = has ? byCode[code!].ReturnedSales : 0m;
            var netSales = sales - retSales;
            return new
            {
                id               = i.Id,
                name             = i.Name,
                email            = i.Email,
                platform         = i.Platform,
                couponCode       = i.CouponCode,
                status           = i.Status,
                commissionRate   = i.CommissionRate,
                totalOrders      = count,
                totalSales       = sales,
                returnedOrders   = returns,
                returnRate       = count > 0 ? Math.Round((decimal)returns / count * 100, 1) : 0m,
                netSales         = netSales,
                commissionEarned = Math.Round(sales * i.CommissionRate / 100, 2),
                netCommission    = Math.Round(netSales * i.CommissionRate / 100, 2),
                avgOrderValue    = count > 0 ? Math.Round(sales / count, 2) : 0m,
            };
        }).ToList();

        var totalOrders  = creators.Sum(c => c.totalOrders);
        var totalReturns = creators.Sum(c => c.returnedOrders);

        return Ok(new
        {
            creators,
            totals = new
            {
                creators        = influencers.Count,
                approved        = influencers.Count(i => i.Status == "approved"),
                pending         = influencers.Count(i => i.Status == "pending"),
                activeWithCode  = influencers.Count(i => !string.IsNullOrWhiteSpace(i.CouponCode)),
                totalOrders,
                totalReturns,
                returnRate      = totalOrders > 0 ? Math.Round((decimal)totalReturns / totalOrders * 100, 1) : 0m,
                totalSales      = creators.Sum(c => c.totalSales),
                totalCommission = creators.Sum(c => c.commissionEarned),
                netCommission   = creators.Sum(c => c.netCommission),
            }
        });
    }

    // ── GET /api/influencers/fraud-report  (admin) — misuse / return-fraud ───
    [HttpGet("fraud-report")]
    public async Task<IActionResult> FraudReport()
    {
        if (!await IsAdmin()) return Unauthorized();

        var influencers = await _db.Influencers
            .Where(i => i.CouponCode != null)
            .ToListAsync();

        var raw = await _db.SiteOrders
            .Where(o => o.CouponCode != null)
            .Select(o => new { o.OrderId, o.CouponCode, o.Total, o.Status, o.PlacedAt, o.CustomerJson })
            .ToListAsync();
        var emptyLike = raw.Take(0).ToList(); // empty list of the same anonymous type

        var byCode = raw
            .GroupBy(o => o.CouponCode!.ToLower())
            .ToDictionary(g => g.Key, g => g.ToList());

        var returnStatuses = new HashSet<string> { "return requested", "return transit", "return" };
        var cancelStatuses = new HashSet<string> { "cancel requested", "cancelled" };

        var creators = influencers.Select(inf =>
        {
            var code = inf.CouponCode!.ToLower();
            var list = byCode.TryGetValue(code, out var l) ? l : emptyLike;

            var infPhone = NormalizePhone(inf.Phone);
            var infEmail = (inf.Email ?? "").Trim().ToLower();

            var parsed = list.Select(o =>
            {
                var st = (o.Status ?? "").ToLower();
                return new
                {
                    o.OrderId, o.Total, o.Status, o.PlacedAt,
                    name  = JsonStr(o.CustomerJson, "name"),
                    phone = NormalizePhone(JsonStr(o.CustomerJson, "phone")),
                    email = JsonStr(o.CustomerJson, "email").Trim().ToLower(),
                    isReturn = returnStatuses.Contains(st),
                    isCancel = cancelStatuses.Contains(st),
                };
            }).ToList();

            var phoneCounts = parsed.Where(p => p.phone != "")
                .GroupBy(p => p.phone).ToDictionary(g => g.Key, g => g.Count());

            var orders = parsed.OrderByDescending(p => p.PlacedAt).Select(p =>
            {
                var flags = new List<string>();
                if (p.isReturn) flags.Add("Returned");
                if (p.isCancel) flags.Add("Cancelled");
                var isSelf = (p.phone != "" && p.phone == infPhone) || (p.email != "" && p.email == infEmail);
                if (isSelf) flags.Add("Self-order");
                if (p.phone != "" && phoneCounts.TryGetValue(p.phone, out var c) && c > 1) flags.Add($"Repeat ×{c}");
                return new
                {
                    orderId = p.OrderId,
                    customerName = p.name,
                    customerPhone = p.phone,
                    total = p.Total,
                    status = p.Status,
                    date = p.PlacedAt.HasValue ? p.PlacedAt.Value.ToString("dd MMM yyyy") : "-",
                    flags,
                };
            }).ToList();

            var total     = parsed.Count;
            var returned  = parsed.Count(p => p.isReturn);
            var cancelled = parsed.Count(p => p.isCancel);
            var selfCount = orders.Count(o => o.flags.Contains("Self-order"));
            var repeatCustomers = phoneCounts.Count(kv => kv.Value > 1);
            var returnRate = total > 0 ? Math.Round((decimal)returned / total * 100, 1) : 0m;
            var cancelRate = total > 0 ? Math.Round((decimal)cancelled / total * 100, 1) : 0m;

            var risk = "low";
            if (selfCount > 0 || (total >= 2 && returnRate >= 40) || (total >= 2 && cancelRate >= 40))
                risk = "high";
            else if (repeatCustomers > 0 || returnRate >= 20 || cancelRate >= 20)
                risk = "medium";

            return new
            {
                id = inf.Id, name = inf.Name, email = inf.Email, couponCode = inf.CouponCode,
                status = inf.Status, commissionRate = inf.CommissionRate,
                totalOrders = total, returnedOrders = returned, cancelledOrders = cancelled,
                returnRate, cancelRate, selfOrders = selfCount, repeatCustomers,
                flaggedOrders = orders.Count(o => o.flags.Count > 0),
                risk, orders,
            };
        })
        .OrderByDescending(c => c.risk == "high" ? 2 : c.risk == "medium" ? 1 : 0)
        .ThenByDescending(c => c.flaggedOrders)
        .ToList();

        return Ok(new
        {
            creators,
            totals = new
            {
                creators      = creators.Count,
                highRisk      = creators.Count(c => c.risk == "high"),
                flaggedOrders = creators.Sum(c => c.flaggedOrders),
                selfOrders    = creators.Sum(c => c.selfOrders),
            }
        });
    }

    // Safely read a string property out of a stored JSON blob (customer_json etc.).
    private static string JsonStr(string? json, string prop)
    {
        if (string.IsNullOrWhiteSpace(json)) return "";
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind == JsonValueKind.Object &&
                doc.RootElement.TryGetProperty(prop, out var el) &&
                el.ValueKind == JsonValueKind.String)
                return el.GetString() ?? "";
        }
        catch { /* ignore malformed json */ }
        return "";
    }

    // Reduce a phone to digits only so formatting differences don't hide matches.
    private static string NormalizePhone(string? p) =>
        new string((p ?? "").Where(char.IsDigit).ToArray());

    // ── GET /api/influencers/{id}/stats  (admin) ─────────────────────────────
    [HttpGet("{id:int}/stats")]
    public async Task<IActionResult> Stats(int id)
    {
        if (!await IsAdmin()) return Unauthorized();
        var influencer = await _db.Influencers.FindAsync(id);
        if (influencer is null) return NotFound();

        if (string.IsNullOrWhiteSpace(influencer.CouponCode))
            return Ok(new { totalOrders = 0, totalSales = 0m, commissionEarned = 0m, orders = Array.Empty<object>() });

        var orders = await _db.SiteOrders
            .Where(o => o.CouponCode != null &&
                        o.CouponCode.ToLower() == influencer.CouponCode.ToLower() &&
                        o.Status != "Cancelled")
            .OrderByDescending(o => o.PlacedAt)
            .Select(o => new {
                o.OrderId, o.Total, o.Status,
                PlacedAt = o.PlacedAt.HasValue ? o.PlacedAt.Value.ToString("dd MMM yyyy") : "-"
            })
            .ToListAsync();

        var totalSales = orders.Sum(o => o.Total);
        var commission  = Math.Round(totalSales * influencer.CommissionRate / 100, 2);

        return Ok(new {
            totalOrders    = orders.Count,
            totalSales,
            commissionEarned = commission,
            orders
        });
    }

    // ── PUT /api/influencers/{id}  (admin) ────────────────────────────────────
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] InfluencerUpdateRequest req)
    {
        if (!await IsAdmin()) return Unauthorized();
        var influencer = await _db.Influencers.FindAsync(id);
        if (influencer is null) return NotFound();

        influencer.Status         = req.Status ?? influencer.Status;
        // Commission is capped at 3% — influencers can never get more than 3%.
        influencer.CommissionRate = Math.Min(req.CommissionRate ?? influencer.CommissionRate, 3m);
        influencer.AdminNotes     = req.AdminNotes ?? influencer.AdminNotes;
        // Admin can set / reset the creator's login password.
        if (!string.IsNullOrWhiteSpace(req.NewPassword))
        {
            influencer.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword, workFactor: 12);
            influencer.ResetRequestedAt = null; // reset request handled
        }
        influencer.UpdatedAt      = DateTimeOffset.UtcNow;

        // If approving and coupon code provided → create/ensure coupon exists
        if (!string.IsNullOrWhiteSpace(req.CouponCode))
        {
            var code = req.CouponCode.Trim().ToUpper();
            influencer.CouponCode = code;

            var existingCoupon = await _db.Coupons
                .FirstOrDefaultAsync(c => c.Code.ToLower() == code.ToLower());

            if (existingCoupon is null)
            {
                _db.Coupons.Add(new Coupon
                {
                    Code      = code,
                    Type      = "percent",
                    Value     = req.CouponDiscountPct ?? 10m,
                    MinOrder  = 0,
                    MaxUses   = null,
                    IsActive  = true,
                    CreatedAt = DateTimeOffset.UtcNow,
                });
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    // ── DELETE /api/influencers/{id}  (admin) ─────────────────────────────────
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        if (!await IsAdmin()) return Unauthorized();
        var influencer = await _db.Influencers.FindAsync(id);
        if (influencer is null) return NotFound();
        _db.Influencers.Remove(influencer);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }
}

public record InfluencerApplyRequest(
    string Name, string Email, string? Phone, string? SocialHandle,
    string? Platform, string? FollowersCount, string? Category, string? Niche,
    string? Password);

public record InfluencerLoginRequest(string Email, string Password);

public record InfluencerOtpRequest(string Identifier);

public record InfluencerOtpVerifyRequest(string Identifier, string Otp);

public record ForgotPasswordRequest(string Email);

public record InfluencerUpdateRequest(
    string? Status, string? CouponCode, decimal? CommissionRate,
    decimal? CouponDiscountPct, string? AdminNotes, string? NewPassword);

public record InfluencerProfileRequest(
    string Email, string Password, string? Name, string? Phone,
    string? SocialHandle, string? FollowersCount, string? Niche);
