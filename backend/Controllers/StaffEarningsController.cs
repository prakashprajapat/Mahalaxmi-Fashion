using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// What each shop has earned, what is payable today, and marking it paid.
///
/// One rule runs through the whole file and is worth stating once: a staff
/// member is scoped to their own shop and the owner is not. That scoping is
/// applied to the DATABASE QUERY, not to the answer afterwards - a filter that
/// runs after the rows are loaded is one `return` away from shipping another
/// vendor's takings to a competitor, and vendors on a shared platform are
/// exactly the people who would notice. There is no code path here that reads
/// rows for a shop other than the caller's unless the caller is the owner.
///
/// Two numbers a vendor never sees: the platform fee, and anything at all about
/// a shop that is not his. He sees what he asked for a piece, what it sold for,
/// and what he is owed. He can work out the difference himself if he cares to -
/// but it is not printed for him, because a number on a screen is an invitation
/// to argue about that number rather than about the price.
/// </summary>
[ApiController]
[Route("api/staff-earnings")]
[Authorize]
[RequirePerm("earnings")]
public class StaffEarningsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<StaffEarningsController> _log;

    public StaffEarningsController(AppDbContext db, ILogger<StaffEarningsController> log)
    {
        _db = db;
        _log = log;
    }

    // GET /api/staff-earnings?shop=&status=
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? shop, [FromQuery] string? status)
    {
        var isOwner = User.IsOwner();
        var myShop = await CallerShopAsync();

        if (!isOwner && string.IsNullOrWhiteSpace(myShop))
            return Ok(new
            {
                success = true,
                isOwner = false,
                shop = (string?)null,
                message = "No shop is set on your account, so there is nothing to show. Ask the owner to set one.",
                rows = Array.Empty<object>(),
                totals = EmptyTotals(),
            });

        var q = _db.StaffPayouts.AsNoTracking().AsQueryable();

        // The scope, applied here and nowhere else.
        if (!isOwner) q = q.Where(x => x.ShopName == myShop);
        else if (!string.IsNullOrWhiteSpace(shop)) q = q.Where(x => x.ShopName == shop);

        if (!string.IsNullOrWhiteSpace(status) && status != "all")
            q = q.Where(x => x.Status == status);

        var rows = await q
            .OrderByDescending(x => x.DeliveredAt)
            .Take(500)
            .ToListAsync();

        var now = DateTimeOffset.UtcNow;

        var shaped = rows.Select(r => new
        {
            id = r.Id,
            orderId = r.OrderId,
            productName = r.ProductName,
            sku = r.Sku,
            qty = r.Qty,
            soldUnit = r.SoldUnit,
            staffUnit = r.StaffUnit,
            staffAmount = r.StaffAmount,
            // The owner's cut, and only for the owner.
            platformAmount = isOwner ? (decimal?)r.PlatformAmount : null,
            shopName = isOwner ? r.ShopName : null,
            deliveredAt = r.DeliveredAt,
            payableAt = r.PayableAt,
            status = r.Status,
            // Not a stored state. "pending" plus a date that has passed IS
            // payable, worked out on the way out - so it is right the moment
            // the clock passes it, with no job to be late.
            payable = r.Status == "pending" && r.PayableAt <= now,
            paidAt = r.PaidAt,
            paidNote = r.PaidNote,
            note = r.CancelReason,
        }).ToList();

        var pending = rows.Where(r => r.Status == "pending").ToList();

        var totals = new
        {
            payableNow = pending.Where(r => r.PayableAt <= now).Sum(r => r.StaffAmount),
            heldBack = pending.Where(r => r.PayableAt > now).Sum(r => r.StaffAmount),
            paid = rows.Where(r => r.Status == "paid").Sum(r => r.StaffAmount),
            cancelled = rows.Where(r => r.Status == "cancelled").Sum(r => r.StaffAmount),
            // Paid, and then the customer sent it back. The money is gone and
            // has to come off the next bill, so it is its own number rather
            // than something folded into "paid".
            toRecover = rows.Where(r => r.Status == "paid" && r.CancelReason != null).Sum(r => r.StaffAmount),
            platformKept = isOwner ? (decimal?)rows.Where(r => r.Status != "cancelled").Sum(r => r.PlatformAmount) : null,
        };

        // The shop list is the owner's alone: it is the list of everyone he
        // buys from, which is not a vendor's to read.
        var shops = isOwner
            ? await _db.StaffPayouts.AsNoTracking()
                .Select(x => x.ShopName).Distinct().OrderBy(x => x).ToListAsync()
            : new List<string>();

        return Ok(new
        {
            success = true,
            isOwner,
            shop = isOwner ? shop : myShop,
            shops,
            holdDays = await StaffPayoutSweepService.HoldDaysAsync(_db),
            rows = shaped,
            totals,
        });
    }

    // POST /api/staff-earnings/pay — mark rows settled. Owner only.
    //
    // Deliberately not a "pay everything owed to this shop" button. It takes
    // the exact row ids the screen was showing, so what is marked paid is what
    // he was looking at when he decided - and a row that became payable while
    // he was counting out cash is not swept into the same receipt.
    [HttpPost("pay")]
    public async Task<IActionResult> Pay([FromBody] PayRequest req)
    {
        if (!User.IsOwner())
            return StatusCode(403, new { success = false, message = "Only the owner can settle a payout." });

        var ids = (req.Ids ?? new List<int>()).Distinct().ToList();
        if (ids.Count == 0)
            return BadRequest(new { success = false, message = "Nothing was selected." });

        var now = DateTimeOffset.UtcNow;

        var rows = await _db.StaffPayouts
            .Where(x => ids.Contains(x.Id) && x.Status == "pending")
            .ToListAsync();

        // A row whose window has not run out is not payable yet, whatever the
        // screen sent. The screen already greys those out; this is the half
        // that matters, because the screen is only a screen.
        var tooEarly = rows.Where(r => r.PayableAt > now).ToList();
        var ready = rows.Where(r => r.PayableAt <= now).ToList();

        foreach (var r in ready)
        {
            r.Status = "paid";
            r.PaidAt = now;
            r.PaidNote = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note!.Trim();
        }

        if (ready.Count > 0) await _db.SaveChangesAsync();

        var paid = ready.Sum(r => r.StaffAmount);
        var message = tooEarly.Count == 0
            ? $"{ready.Count} marked paid, Rs. {paid:0.##} in all."
            : $"{ready.Count} marked paid, Rs. {paid:0.##} in all. {tooEarly.Count} skipped - their return window has not closed yet.";

        return Ok(new { success = true, paid = ready.Count, amount = paid, skipped = tooEarly.Count, message });
    }

    // POST /api/staff-earnings/refresh — run the sweep now instead of waiting
    // for the hour. Owner only; it writes rows.
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh()
    {
        if (!User.IsOwner())
            return StatusCode(403, new { success = false, message = "Only the owner can do that." });

        var result = await StaffPayoutSweepService.SweepAsync(_db, _log);
        return Ok(new
        {
            success = true,
            added = result.Added,
            withdrawn = result.Withdrawn,
            message = $"{result.Added} new, {result.Withdrawn} withdrawn after a return.",
        });
    }

    // Not named Empty(): ControllerBase already has one, and hiding it is a
    // warning plus a trap for whoever reads this next.
    private static object EmptyTotals() => new
    {
        payableNow = 0m, heldBack = 0m, paid = 0m, cancelled = 0m, toRecover = 0m,
        platformKept = (decimal?)null,
    };

    /// <summary>The caller's own shop, or null when the caller is the owner.</summary>
    private async Task<string?> CallerShopAsync()
    {
        var role = User.FindFirst("role")?.Value;
        if (role is not ("staff" or "manager")) return null;
        var sub = User.FindFirstValue("sub");
        if (!int.TryParse(sub, out var staffId)) return null;
        var shop = await _db.StaffMembers
            .Where(x => x.Id == staffId)
            .Select(x => x.ShopName)
            .FirstOrDefaultAsync();
        return string.IsNullOrWhiteSpace(shop) ? null : shop.Trim();
    }
}

public record PayRequest(List<int>? Ids, string? Note);
