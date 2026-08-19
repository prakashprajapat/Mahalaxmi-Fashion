using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

// Customer "Refer & Earn". Each customer gets a personal referral code (which is a real coupon,
// so the existing ?ref= capture + checkout auto-apply gives the friend their discount). When a
// friend uses the code and that order is DELIVERED, the referrer earns wallet credit (see the
// reward hook in OrdersController.UpdateStatus).
[ApiController]
[Route("api/referral")]
public class ReferralController : ControllerBase
{
    private readonly AppDbContext _db;
    public ReferralController(AppDbContext db) => _db = db;

    // GET /api/referral/me — the signed-in customer's referral code, link, terms and stats.
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Mine()
    {
        var idStr = User.FindFirstValue("sub");
        if (!int.TryParse(idStr, out var customerId)) return Unauthorized();

        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == customerId);
        if (customer is null) return Unauthorized();

        var enabled = (await Setting("referralEnabled") ?? "true").Trim().ToLowerInvariant();
        var isOn = enabled == "true" || enabled == "1";
        decimal.TryParse(await Setting("referralNewUserDiscount"), out var discount); if (discount <= 0) discount = 100m;
        decimal.TryParse(await Setting("referralMinOrder"), out var minOrder); if (minOrder <= 0) minOrder = 499m;
        decimal.TryParse(await Setting("referralReferrerReward"), out var reward); if (reward <= 0) reward = 100m;

        // Find (or lazily create) this customer's referral coupon.
        var coupon = await _db.Coupons.FirstOrDefaultAsync(c => c.Occasion == "referral" && c.ReferrerCustomerId == customerId);
        if (coupon is null)
        {
            var code = await MakeUniqueCodeAsync(customer);
            coupon = new Coupon
            {
                Code = code,
                Type = "flat",
                Value = discount,
                MinOrder = minOrder,
                Occasion = "referral",
                ReferrerCustomerId = customerId,
                CustomerId = null,       // usable by OTHERS, not the owner (owner is blocked at checkout)
                MaxUses = null,
                IsActive = true,
            };
            _db.Coupons.Add(coupon);
            await _db.SaveChangesAsync();
        }
        else
        {
            // Keep the discount/min-order in sync with current settings.
            if (coupon.Value != discount || coupon.MinOrder != minOrder)
            {
                coupon.Value = discount;
                coupon.MinOrder = minOrder;
                await _db.SaveChangesAsync();
            }
        }

        // Stats: friends who ordered with this code, and total the referrer has earned.
        var friendsJoined = await _db.SiteOrders.CountAsync(o => o.CouponCode == coupon.Code);
        var totalEarned = await _db.WalletTransactions
            .Where(t => t.CustomerId == customerId && t.Type == "referral")
            .SumAsync(t => (decimal?)t.Amount) ?? 0m;

        return Ok(new
        {
            success = true,
            enabled = isOn,
            code = coupon.Code,
            discount,
            minOrder,
            reward,
            friendsJoined,
            totalEarned,
        });
    }

    private Task<string?> Setting(string key) =>
        _db.SiteSettings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync();

    // A clean, shareable, unique code built from the customer's first name + id, e.g. "PRAKASH42".
    private async Task<string> MakeUniqueCodeAsync(Customer c)
    {
        var letters = new string((c.FirstName ?? "").Where(char.IsLetter).ToArray()).ToUpperInvariant();
        if (letters.Length > 8) letters = letters.Substring(0, 8);
        if (string.IsNullOrEmpty(letters)) letters = "MFH";
        var baseCode = letters + c.Id;
        var code = baseCode;
        var n = 1;
        while (await _db.Coupons.AnyAsync(x => x.Code.ToLower() == code.ToLower()))
            code = baseCode + (++n);
        return code;
    }
}
