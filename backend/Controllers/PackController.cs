using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// The packing bench's own history, and the one way to take a pack back.
///
/// Undo is narrow on purpose. What the pack did was: tie the parcel to a bag,
/// and move the order to Ready for Shipping. Those two are what come back.
///
/// What does NOT come back, and why the screen says so before anybody presses
/// it:
///
///   - the GST invoice number. Once a number is handed out it belongs to that
///     order for good; wiping it would either leave a hole in the book or hand
///     the same number to a second parcel later. If the order is packed again
///     it keeps the number it already has, which is the behaviour the invoice
///     code already had - it only ever assigns to an order with none.
///   - the message the customer was sent. There is no unsending a text saying
///     the parcel has shipped, so the row records that it went.
///   - the shipment at Delhivery. The waybill stays live on their side; if the
///     parcel is genuinely not going, it has to be cancelled with the courier
///     as well, and no button here can do that for anybody.
///
/// And it refuses outright once the parcel has actually moved. A courier scan
/// means the thing is in a van somewhere, and at that point this is not a
/// packing mistake to tidy up - it is a parcel in the field, and putting the
/// order back to "Order Packed" would only hide it from the people watching it.
/// </summary>
[ApiController]
[Route("api/pack")]
[Authorize]
[RequirePerm("orders")]
public class PackController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<PackController> _log;

    public PackController(AppDbContext db, ILogger<PackController> log)
    {
        _db = db;
        _log = log;
    }

    public const string Packed = "packed";
    public const string BagChanged = "bag changed";
    public const string BagCleared = "bag cleared";
    public const string Undone = "undone";

    /// <summary>Everything the bench has done, newest first.</summary>
    // GET /api/pack/history?take=50&q=MFH1014
    [HttpGet("history")]
    public async Task<IActionResult> History([FromQuery] int take = 50, [FromQuery] string? q = null)
    {
        take = Math.Clamp(take, 1, 200);
        var needle = (q ?? "").Trim();

        var query = _db.PackEvents.AsQueryable();
        if (needle.Length > 0)
            query = query.Where(e => e.OrderId.Contains(needle)
                                  || (e.Awb != null && e.Awb.Contains(needle))
                                  || (e.BagBarcode != null && e.BagBarcode.Contains(needle)));

        var rows = await query
            .OrderByDescending(e => e.Id)
            .Take(take)
            .Select(e => new
            {
                e.Id, e.OrderId, e.Awb, e.Action, e.BagBarcode, e.PreviousBag,
                e.PreviousStatus, e.NewStatus, e.Who, e.Note, e.CreatedAt,
            })
            .ToListAsync();

        // Where each order stands NOW, so a row three days old does not invite
        // an undo on a parcel that has since been delivered.
        var ids = rows.Select(r => r.OrderId).Distinct().ToList();
        var orders = await _db.SiteOrders
            .Where(o => ids.Contains(o.OrderId))
            .Select(o => new { o.OrderId, o.Status, o.BagBarcode, o.CourierStatus, o.InvoiceNumber })
            .ToListAsync();

        // Only the newest entry for an order may be taken back. Without this a
        // row could be undone twice, and worse: an entry from Tuesday could be
        // used to unpack the bag the parcel was re-packed into on Thursday,
        // because the old row still says "packed" and still knows a status to
        // put back. Asked of the table rather than of this page, which only
        // holds the last fifty.
        var newest = (await _db.PackEvents
            .Where(e => ids.Contains(e.OrderId))
            .GroupBy(e => e.OrderId)
            .Select(g => new { OrderId = g.Key, Last = g.Max(e => e.Id) })
            .ToListAsync())
            .ToDictionary(x => x.OrderId, x => x.Last);

        var events = rows.Select(r =>
        {
            var now = orders.FirstOrDefault(o => o.OrderId == r.OrderId);
            var isLatest = newest.TryGetValue(r.OrderId, out var last) && last == r.Id;
            var why = WhyNotUndoable(r.Action, now?.Status, now?.CourierStatus, isLatest);
            return new
            {
                id = r.Id,
                orderId = r.OrderId,
                awb = r.Awb,
                action = r.Action,
                bagBarcode = r.BagBarcode,
                previousBag = r.PreviousBag,
                previousStatus = r.PreviousStatus,
                newStatus = r.NewStatus,
                who = r.Who,
                note = r.Note,
                createdAt = r.CreatedAt,
                currentStatus = now?.Status,
                currentBag = now?.BagBarcode,
                hasInvoice = !string.IsNullOrWhiteSpace(now?.InvoiceNumber),
                canUndo = why is null,
                // Said in words, because a button that is simply greyed out
                // teaches the packer nothing and gets asked about instead.
                undoBlockedBecause = why,
            };
        });

        return Ok(new { success = true, events });
    }

    /// <summary>Why this row cannot be taken back, or null when it can.</summary>
    private static string? WhyNotUndoable(string action, string? status, string? courierStatus, bool isLatest)
    {
        if (action == Undone) return "This one is itself an undo.";
        if (!isLatest) return "Something has happened to this parcel since. Only the newest entry can be taken back.";
        if (action == BagCleared) return "Nothing to take back - the bag was already cleared.";

        var s = (status ?? "").Trim();
        if (s.Length == 0) return "That order is no longer in the system.";

        var gone = new[] { "Shipped", "Transit", "Return Transit", "Delivered", "Return", "Returned", "Exchanged" };
        if (gone.Contains(s, StringComparer.OrdinalIgnoreCase))
            return $"The parcel has moved on - it is at \"{s}\". Undo here would only hide it from the people watching it.";

        if (!string.IsNullOrWhiteSpace(courierStatus))
            return $"Delhivery has already scanned this parcel (\"{courierStatus}\"). It is in their hands now.";

        if (s.StartsWith("Cancel", StringComparison.OrdinalIgnoreCase))
            return $"That order is \"{s}\". Reopen it first if it is really being packed again.";

        return null;
    }

    public class UndoRequest
    {
        public long EventId { get; set; }
        public string? Reason { get; set; }
    }

    /// <summary>Put one pack back: free the bag, return the status.</summary>
    // POST /api/pack/undo
    [HttpPost("undo")]
    public async Task<IActionResult> Undo([FromBody] UndoRequest req)
    {
        var ev = await _db.PackEvents.FirstOrDefaultAsync(e => e.Id == req.EventId);
        if (ev is null)
            return NotFound(new { success = false, message = "That entry is not in the history." });

        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == ev.OrderId);
        if (order is null)
            return NotFound(new { success = false, message = "That order is no longer in the system." });

        // Checked again here rather than trusted from the screen. The list was
        // drawn some minutes ago and a courier does not wait for a page to be
        // refreshed.
        var isLatest = !await _db.PackEvents.AnyAsync(e => e.OrderId == ev.OrderId && e.Id > ev.Id);
        var why = WhyNotUndoable(ev.Action, order.Status, order.CourierStatus, isLatest);
        if (why is not null)
            return Conflict(new { success = false, message = why });

        var hadBag = order.BagBarcode;
        var hadStatus = order.Status;

        // The bag goes first and goes to null rather than back to whatever it
        // was before, because the point of undoing a pack is that the parcel is
        // being opened again. The unique index would otherwise keep that bag
        // unusable on any other order.
        order.BagBarcode = null;

        // Back to where the order stood before this pack. Where the row does
        // not know - an old entry, or one written before this was kept - the
        // status is left exactly as it is rather than guessed at.
        var target = (ev.PreviousStatus ?? "").Trim();
        if (target.Length > 0 && !string.Equals(target, order.Status, StringComparison.OrdinalIgnoreCase))
            order.Status = target;

        order.UpdatedAt = DateTimeOffset.UtcNow;

        var note = string.IsNullOrWhiteSpace(req.Reason) ? null : req.Reason.Trim();
        if (note is { Length: > 250 }) note = note.Substring(0, 250);

        _db.PackEvents.Add(new PackEvent
        {
            OrderId = order.OrderId,
            Awb = order.Awb,
            Action = Undone,
            BagBarcode = null,
            PreviousBag = hadBag,
            PreviousStatus = hadStatus,
            NewStatus = order.Status,
            Who = Who(),
            Note = note,
        });

        await _db.SaveChangesAsync();

        _log.LogInformation("Pack undone for {Order} by {Who}: {From} -> {To}, bag {Bag} freed.",
            order.OrderId, Who(), hadStatus, order.Status, hadBag ?? "(none)");

        // What is still true afterwards, said plainly rather than left for
        // somebody to discover.
        var standing = new List<string>();
        if (!string.IsNullOrWhiteSpace(order.InvoiceNumber))
            standing.Add($"Invoice {order.InvoiceNumber} stays with this order - packing it again will reuse the same number.");
        if (!string.IsNullOrWhiteSpace(order.Awb))
            standing.Add($"Waybill {order.Awb} is still live at Delhivery. If the parcel is not going at all, cancel it with them too.");
        standing.Add("Any message already sent to the customer cannot be unsent.");

        return Ok(new
        {
            success = true,
            orderId = order.OrderId,
            status = order.Status,
            bagFreed = hadBag,
            stillStands = standing,
        });
    }

    /// Whoever is signed in, by the email they signed in with.
    private string Who()
    {
        var email = User.FindFirst("email")?.Value;
        if (!string.IsNullOrWhiteSpace(email)) return email.Trim();
        var role = User.FindFirst("role")?.Value;
        return string.IsNullOrWhiteSpace(role) ? "admin" : role.Trim();
    }
}
