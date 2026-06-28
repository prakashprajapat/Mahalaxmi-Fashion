using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/coupons")]
public class CouponsController : ControllerBase
{
    private readonly AppDbContext _db;
    public CouponsController(AppDbContext db) => _db = db;

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

    // ── POST /api/coupons/validate  (public) ─────────────────────────────────
    [HttpPost("validate")]
    public async Task<IActionResult> Validate([FromBody] ValidateCouponRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Code))
            return BadRequest(new { success = false, message = "Please enter a coupon code." });

        var coupon = await _db.Coupons
            .FirstOrDefaultAsync(c => c.Code.ToLower() == req.Code.ToLower().Trim() && c.IsActive);

        if (coupon is null)
            return BadRequest(new { success = false, message = "Invalid or expired coupon code." });

        if (coupon.ExpiresAt.HasValue && coupon.ExpiresAt.Value < DateTimeOffset.UtcNow)
            return BadRequest(new { success = false, message = "This coupon has expired." });

        if (coupon.MaxUses.HasValue && coupon.UsedCount >= coupon.MaxUses.Value)
            return BadRequest(new { success = false, message = "This coupon has reached its usage limit." });

        if (req.OrderAmount < coupon.MinOrder)
            return BadRequest(new { success = false, message = $"Minimum order of ₹{coupon.MinOrder:0} required for this coupon." });

        var discount = coupon.Type == "percent"
            ? Math.Round(req.OrderAmount * coupon.Value / 100, 2)
            : Math.Min(coupon.Value, req.OrderAmount);

        return Ok(new
        {
            success = true,
            code = coupon.Code,
            type = coupon.Type,
            value = coupon.Value,
            discount,
            message = coupon.Type == "percent"
                ? $"{coupon.Value}% off applied! You save ₹{discount:0}."
                : $"₹{discount:0} off applied!"
        });
    }

    // ── GET /api/coupons  (admin) ─────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> List()
    {
        if (!await IsAdmin()) return Unauthorized();
        var coupons = await _db.Coupons.OrderByDescending(c => c.CreatedAt).ToListAsync();
        return Ok(coupons.Select(c => new {
            c.Id, c.Code, c.Type, c.Value, c.MinOrder,
            c.MaxUses, c.UsedCount, c.ExpiresAt, c.IsActive, c.CreatedAt
        }));
    }

    // ── POST /api/coupons  (admin) ────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CouponRequest req)
    {
        if (!await IsAdmin()) return Unauthorized();
        if (string.IsNullOrWhiteSpace(req.Code))
            return BadRequest(new { success = false, message = "Code is required." });
        if (req.Value <= 0)
            return BadRequest(new { success = false, message = "Value must be positive." });

        var exists = await _db.Coupons.AnyAsync(c => c.Code.ToLower() == req.Code.ToLower().Trim());
        if (exists) return Conflict(new { success = false, message = "Coupon code already exists." });

        var coupon = new Coupon
        {
            Code       = req.Code.Trim().ToUpper(),
            Type       = req.Type == "percent" ? "percent" : "flat",
            Value      = req.Value,
            MinOrder   = req.MinOrder,
            MaxUses    = req.MaxUses,
            ExpiresAt  = req.ExpiresAt,
            IsActive   = true,
            CreatedAt  = DateTimeOffset.UtcNow,
        };
        _db.Coupons.Add(coupon);
        await _db.SaveChangesAsync();
        return Ok(new { success = true, id = coupon.Id });
    }

    // ── PUT /api/coupons/{id}  (admin) ────────────────────────────────────────
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] CouponRequest req)
    {
        if (!await IsAdmin()) return Unauthorized();
        var coupon = await _db.Coupons.FindAsync(id);
        if (coupon is null) return NotFound();

        coupon.Code      = req.Code.Trim().ToUpper();
        coupon.Type      = req.Type == "percent" ? "percent" : "flat";
        coupon.Value     = req.Value;
        coupon.MinOrder  = req.MinOrder;
        coupon.MaxUses   = req.MaxUses;
        coupon.ExpiresAt = req.ExpiresAt;
        coupon.IsActive  = req.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    // ── DELETE /api/coupons/{id}  (admin) ─────────────────────────────────────
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        if (!await IsAdmin()) return Unauthorized();
        var coupon = await _db.Coupons.FindAsync(id);
        if (coupon is null) return NotFound();
        _db.Coupons.Remove(coupon);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }
}

public record ValidateCouponRequest(string Code, decimal OrderAmount);
public record CouponRequest(
    string Code, string Type, decimal Value, decimal MinOrder,
    int? MaxUses, DateTimeOffset? ExpiresAt, bool IsActive = true);
