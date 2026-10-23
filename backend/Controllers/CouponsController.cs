using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

using MahalaxmiApi.Authorization;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/coupons")]
public class CouponsController : ControllerBase
{
    private readonly AppDbContext _db;
    public CouponsController(AppDbContext db) => _db = db;

    // customer_json is jsonb, so a LINQ Contains() becomes like_escape(jsonb, unknown) —
    // a function Postgres does not have. Cast to text in SQL instead.
    private async Task<int> CountOrdersMatchingCustomerAsync(int customerId, string? couponCode = null)
    {
        var pattern = "%\"id\":\"" + customerId + "\"%";
        var rows = await _db.Database.SqlQuery<int>(
            $@"SELECT COUNT(*)::int AS ""Value"" FROM site_orders
               WHERE customer_json IS NOT NULL
                 AND customer_json::text LIKE {pattern}
                 AND (CAST({couponCode} AS text) IS NULL OR lower(coupon_code) = lower(CAST({couponCode} AS text)))"
        ).ToListAsync();
        return rows.FirstOrDefault();
    }

    // ── Admin auth helper ────────────────────────────────────────────────────
    // Admin = a valid JWT carrying the "role":"admin" claim (same auth as the rest of the admin panel).
    private Task<bool> IsAdmin() => Task.FromResult(User.HasSectionAccess("coupons"));

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

        // Personal coupon (birthday/anniversary) — only the owner may redeem it.
        if (coupon.CustomerId.HasValue && coupon.CustomerId.Value != (req.CustomerId ?? -1))
            return BadRequest(new { success = false, message = "This is a personal offer code and can only be used by the account it was sent to. Please log in with that account." });

        // Refer & Earn — you can't use your own referral code.
        if (coupon.Occasion == "referral" && coupon.ReferrerCustomerId.HasValue && coupon.ReferrerCustomerId.Value == (req.CustomerId ?? -1))
            return BadRequest(new { success = false, message = "You can't use your own referral code. Share it with friends instead!" });

        // Refer & Earn — a referral code works only on a customer's first order.
        if (coupon.Occasion == "referral" && (req.CustomerId ?? -1) > 0)
        {
            var alreadyOrdered = await CountOrdersMatchingCustomerAsync(req.CustomerId!.Value) > 0;
            if (alreadyOrdered)
                return BadRequest(new { success = false, message = "Referral codes are only valid on your first order." });
        }

        // Influencer code — the DISCOUNT applies only once per customer (the creator still earns
        // on repeat orders, but the shopper doesn't get the discount a second time).
        if ((req.CustomerId ?? -1) > 0)
        {
            var codeL = req.Code.ToLower().Trim();
            var isInfluencer = await _db.Influencers.AnyAsync(i => i.CouponCode != null && i.CouponCode.ToLower() == codeL);
            if (isInfluencer)
            {
                var usedBefore = await CountOrdersMatchingCustomerAsync(req.CustomerId!.Value, couponCode: codeL) > 0;
                if (usedBefore)
                    return BadRequest(new { success = false, message = "You've already used this code — the discount applies only once." });
            }
        }

        // Once per shopper, for ever.
        //
        // Checked by number AND by email: either one matching is enough. The
        // same person keeps one of the two more often than she keeps both, and
        // a rule that needed both to match would be no rule at all.
        //
        // An order that carries neither is let through. A rule that cannot
        // recognise anybody must not pretend it can - refusing everyone
        // anonymous would turn a welcome code into a code nobody can use.
        // Not a tick any more, a number: 0 is no limit, N is N times each.
        // Either identity being full is enough to refuse, because the claim on
        // the order itself needs room on BOTH - a preview that said yes where
        // the order says no is the worst of the two answers.
        var perCustomer = coupon.PerCustomerLimit;
        if (perCustomer > 0)
        {
            var ids = CustomerKeys.Of(req.Phone, req.Email);
            if (ids.Count > 0)
            {
                var codeKey = coupon.Code.ToLowerInvariant();
                var phoneKey = ids.FirstOrDefault(i => i.Kind == "phone").Value;
                var emailKey = ids.FirstOrDefault(i => i.Kind == "email").Value;
                var used = await _db.CouponRedemptions.AnyAsync(r =>
                    r.CodeLower == codeKey
                    && r.Uses >= perCustomer
                    && ((phoneKey != null && r.IdKind == "phone" && r.IdValue == phoneKey)
                     || (emailKey != null && r.IdKind == "email" && r.IdValue == emailKey)));
                if (used)
                    return BadRequest(new
                    {
                        success = false,
                        message = perCustomer == 1
                            ? "You have already used this code. It can be used once per customer."
                            : $"You have already used this code {perCustomer} times, which is the most one customer can.",
                    });
            }
        }

        if (req.OrderAmount < coupon.MinOrder)
            return BadRequest(new { success = false, message = $"Minimum order of ₹{coupon.MinOrder:0} required for this coupon." });

        // Same rule the order itself uses, from one place: rounded to whole
        // rupees in the customer's favour, capped at the order amount so a
        // mis-configured coupon over 100% cannot give money back.
        var discount = Services.CartPricing.CouponDiscount(coupon.Type, coupon.Value, req.OrderAmount);

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
            c.Id, c.Code, c.Type, c.Value, c.Occasion, c.MinOrder,
            c.MaxUses, c.UsedCount, c.OncePerCustomer, c.MaxPerCustomer, c.ExpiresAt, c.IsActive, c.CreatedAt
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
        if (req.Type == "percent" && req.Value > 100)
            return BadRequest(new { success = false, message = "Percentage discount cannot exceed 100%." });

        var exists = await _db.Coupons.AnyAsync(c => c.Code.ToLower() == req.Code.ToLower().Trim());
        if (exists) return Conflict(new { success = false, message = "Coupon code already exists." });

        var coupon = new Coupon
        {
            Code       = req.Code.Trim().ToUpper(),
            Type       = req.Type == "percent" ? "percent" : "flat",
            Value      = req.Value,
            Occasion   = NormalizeOccasion(req.Occasion),
            MinOrder   = req.MinOrder,
            MaxUses    = req.MaxUses,
            MaxPerCustomer  = NormalizePerCustomer(req.MaxPerCustomer, req.OncePerCustomer),
            // Kept in step so a rollback to the previous build still sees a
            // sensible tick instead of losing every per-customer limit.
            OncePerCustomer = NormalizePerCustomer(req.MaxPerCustomer, req.OncePerCustomer) == 1,
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

        // Same guards as Create — otherwise an edit could set an empty code, a non-positive
        // value, or a >100% discount (and a missing code would throw a 500 on .Trim()).
        if (string.IsNullOrWhiteSpace(req.Code))
            return BadRequest(new { success = false, message = "Code is required." });
        if (req.Value <= 0)
            return BadRequest(new { success = false, message = "Value must be positive." });
        if (req.Type == "percent" && req.Value > 100)
            return BadRequest(new { success = false, message = "Percentage discount cannot exceed 100%." });

        coupon.Code      = req.Code.Trim().ToUpper();
        coupon.Type      = req.Type == "percent" ? "percent" : "flat";
        coupon.Value     = req.Value;
        coupon.Occasion  = NormalizeOccasion(req.Occasion);
        coupon.MinOrder  = req.MinOrder;
        coupon.MaxUses   = req.MaxUses;
        coupon.MaxPerCustomer  = NormalizePerCustomer(req.MaxPerCustomer, req.OncePerCustomer);
        coupon.OncePerCustomer = coupon.MaxPerCustomer == 1;
        coupon.ExpiresAt = req.ExpiresAt;
        coupon.IsActive  = req.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    // Only accept the known occasion tags; anything else is treated as a regular coupon.
    private static string NormalizeOccasion(string? o) =>
        o is "birthday" or "anniversary" ? o : "none";

    /// <summary>
    /// What the per-customer limit should be stored as.
    ///
    /// Never NULL on the way out: NULL is reserved for a row nobody has set,
    /// and the startup back-fill turns those into 1. A screen that saved NULL
    /// would get silently changed to 1 on the next restart, which is exactly
    /// the kind of surprise that makes people stop trusting a setting.
    ///
    /// A negative number is read as no limit rather than refused - the box is
    /// a number box and nobody means minus two.
    /// </summary>
    private static int NormalizePerCustomer(int? asked, bool legacyTick)
    {
        if (asked is null) return legacyTick ? 1 : 0;     // older client, still sending the tick
        return asked.Value < 0 ? 0 : asked.Value;
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

public record ValidateCouponRequest(
    string Code, decimal OrderAmount, int? CustomerId = null,
    string? Phone = null, string? Email = null);
public record CouponRequest(
    string Code, string Type, decimal Value, decimal MinOrder,
    int? MaxUses, DateTimeOffset? ExpiresAt, bool IsActive = true,
    string? Occasion = "none", bool OncePerCustomer = false,
    // null here means the caller is an older build that only knows the tick.
    int? MaxPerCustomer = null);
