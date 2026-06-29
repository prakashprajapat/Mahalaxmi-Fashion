using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/influencers")]
public class InfluencersController : ControllerBase
{
    private readonly AppDbContext _db;
    public InfluencersController(AppDbContext db) => _db = db;

    // ── Admin auth helper ────────────────────────────────────────────────────
    private async Task<bool> IsAdmin()
    {
        if (!Request.Headers.TryGetValue("Authorization", out var authHeader)) return false;
        var token = authHeader.ToString().Replace("Bearer ", "").Trim();
        if (string.IsNullOrWhiteSpace(token)) return false;
        var hash = Convert.ToBase64String(
            System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token)));
        var adminToken = await _db.AdminTokens
            .FirstOrDefaultAsync(t => t.TokenHash == hash && t.ExpiresAt > DateTimeOffset.UtcNow);
        return adminToken is not null;
    }

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
            Status         = "pending",
            CreatedAt      = DateTimeOffset.UtcNow,
            UpdatedAt      = DateTimeOffset.UtcNow,
        };
        _db.Influencers.Add(influencer);
        await _db.SaveChangesAsync();
        return Ok(new { success = true, message = "Application submitted! We'll review and contact you within 2–3 business days." });
    }

    // ── GET /api/influencers/dashboard?email=&code=  (public — influencer self) ─
    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard([FromQuery] string email, [FromQuery] string code)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(code))
            return BadRequest(new { message = "Email and coupon code required." });

        var inf = await _db.Influencers.FirstOrDefaultAsync(i =>
            i.Email.ToLower() == email.Trim().ToLower() &&
            i.CouponCode != null &&
            i.CouponCode.ToLower() == code.Trim().ToLower() &&
            i.Status == "approved");

        if (inf is null)
            return Unauthorized(new { message = "Invalid email or coupon code." });

        var orders = await _db.SiteOrders
            .Where(o => o.CouponCode != null &&
                        o.CouponCode.ToLower() == inf.CouponCode!.ToLower() &&
                        o.Status != "Cancelled")
            .OrderByDescending(o => o.PlacedAt)
            .Select(o => new {
                o.OrderId, o.Total, o.Status,
                PlacedAt = o.PlacedAt.HasValue ? o.PlacedAt.Value.ToString("dd MMM yyyy") : "-"
            })
            .ToListAsync();

        var totalSales   = orders.Sum(o => o.Total);
        var commission   = Math.Round(totalSales * inf.CommissionRate / 100, 2);

        return Ok(new {
            name           = inf.Name,
            couponCode     = inf.CouponCode,
            commissionRate = inf.CommissionRate,
            platform       = inf.Platform,
            totalOrders    = orders.Count,
            totalSales,
            commissionEarned = commission,
            orders
        });
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
    string? Platform, string? FollowersCount, string? Category, string? Niche);

public record InfluencerUpdateRequest(
    string? Status, string? CouponCode, decimal? CommissionRate,
    decimal? CouponDiscountPct, string? AdminNotes);
