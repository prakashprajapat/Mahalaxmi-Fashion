using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Customers -> Follow-up Calls. Two lists to work through by phone:
///   reviews  delivered orders - has the customer written a review yet?
///   dropped  payments left unfinished - the USER_DROPPED2 text, and did she buy after all?
/// Every call is written down (followup_notes): what happened, what was said,
/// and when to call again, so whoever picks up the phone next knows the story.
/// </summary>
[ApiController]
[Route("api/follow-ups")]
[Authorize]
[RequirePerm("customers")]
public class FollowUpsController : ControllerBase
{
    private readonly AppDbContext _db;
    public FollowUpsController(AppDbContext db) => _db = db;

    private static readonly HashSet<string> Outcomes = new(StringComparer.OrdinalIgnoreCase)
    {
        "will_review", "reviewed", "will_order", "ordered", "not_picked", "busy", "call_later",
        "switched_off", "wrong_number", "complaint", "payment_problem", "not_interested", "whatsapp_sent", "other",
    };
    /// Outcomes that close the follow-up: nothing more to chase.
    private static readonly HashSet<string> Closing = new(StringComparer.OrdinalIgnoreCase)
    {
        "reviewed", "ordered", "wrong_number", "not_interested",
    };

    private static string Last10(string? phone)
    {
        var d = new string((phone ?? "").Where(char.IsDigit).ToArray());
        return d.Length >= 10 ? d[^10..] : d;
    }

    private static List<string> Items(string? cartJson)
    {
        var list = new List<string>();
        if (string.IsNullOrWhiteSpace(cartJson)) return list;
        try
        {
            using var doc = JsonDocument.Parse(cartJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return list;
            foreach (var line in doc.RootElement.EnumerateArray())
            {
                if (line.ValueKind != JsonValueKind.Object) continue;
                string? Get(string k)
                {
                    foreach (var p in line.EnumerateObject())
                        if (p.Name.Equals(k, StringComparison.OrdinalIgnoreCase))
                            return p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() : p.Value.ToString();
                    return null;
                }
                var name = (Get("name") ?? Get("sku") ?? "Item").Trim();
                var size = Get("size");
                var qty = Get("quantity") ?? Get("qty");
                var s = name;
                if (!string.IsNullOrWhiteSpace(size)) s += $" ({size.Trim()})";
                if (int.TryParse(qty, out var q) && q > 1) s += $" x{q}";
                list.Add(s);
            }
        }
        catch { }
        return list;
    }

    private static string? OrderIdOf(string? varsJson)
    {
        if (string.IsNullOrWhiteSpace(varsJson)) return null;
        try
        {
            var d = JsonSerializer.Deserialize<Dictionary<string, string>>(varsJson) ?? new();
            if (d.TryGetValue("order_id", out var o) && !string.IsNullOrWhiteSpace(o)) return o.Trim();
            if (d.TryGetValue("var1", out o) && o.StartsWith("MFH", StringComparison.OrdinalIgnoreCase)) return o.Trim();
        }
        catch { }
        return null;
    }

    private record NoteSum(string? Outcome, string? Note, DateTimeOffset? At, string? By, DateTimeOffset? CallbackAt, int Count);

    private async Task<Dictionary<string, NoteSum>> NotesForAsync(string kind, List<string> ids)
    {
        var notes = await _db.FollowUpNotes.AsNoTracking()
            .Where(n => n.Kind == kind && ids.Contains(n.RefId))
            .OrderByDescending(n => n.CreatedAt)
            .ToListAsync();
        return notes.GroupBy(n => n.RefId).ToDictionary(g => g.Key, g =>
        {
            var last = g.First();
            // The latest "call back on" still in the future, from any note.
            var cb = g.Where(n => n.CallbackAt != null).Select(n => n.CallbackAt).FirstOrDefault();
            return new NoteSum(last.Outcome, last.Note, last.CreatedAt, last.CreatedBy, cb, g.Count());
        });
    }

    private static string Stage(NoteSum? n, bool done)
    {
        if (done) return "done";
        if (n is null) return "todo";
        if (Closing.Contains(n.Outcome ?? "")) return "done";
        if (n.CallbackAt is { } cb && cb <= DateTimeOffset.UtcNow.AddHours(2)) return "callback";
        return "called";
    }

    // GET /api/follow-ups/reviews?days=30&q=
    [HttpGet("reviews")]
    public async Task<IActionResult> Reviews([FromQuery] int days = 30, [FromQuery] string? q = null)
    {
        days = Math.Clamp(days, 1, 180);
        var floor = DateTimeOffset.UtcNow.AddDays(-days);
        var orders = await _db.SiteOrders.AsNoTracking()
            .Where(o => o.Status == "Delivered" && o.DeliveredAt != null && o.DeliveredAt >= floor)
            .OrderByDescending(o => o.DeliveredAt)
            .Take(1000)
            .Select(o => new { o.OrderId, o.DeliveredAt, o.CustomerJson, o.ShippingJson, o.CartJson, o.Total })
            .ToListAsync();
        var ids = orders.Select(o => o.OrderId).ToList();

        var reviews = (await _db.Reviews.AsNoTracking()
            .Where(r => r.OrderId != null && ids.Contains(r.OrderId))
            .Select(r => new { r.OrderId, r.Rating, r.Status, r.CreatedAt })
            .ToListAsync())
            .GroupBy(r => r.OrderId!).ToDictionary(g => g.Key, g => g.OrderByDescending(r => r.CreatedAt).First());
        var tpl = OrderMessenger.Review;
        var asks = (await _db.MessageSends.AsNoTracking()
            .Where(m => m.Template == tpl && m.Phone != null && ids.Contains(m.OrderId))
            .Select(m => new { m.OrderId, m.SentAt })
            .ToListAsync())
            .GroupBy(m => m.OrderId).ToDictionary(g => g.Key, g => (Count: g.Count(), Last: g.Max(x => x.SentAt)));
        var notes = await NotesForAsync("review", ids);

        var rows = orders.Select(o =>
        {
            var phone = Last10(OrderMessenger.Field(o.CustomerJson, "phone") ?? OrderMessenger.Field(o.ShippingJson, "phone"));
            var name = (OrderMessenger.Field(o.CustomerJson, "name") ?? OrderMessenger.Field(o.ShippingJson, "name") ?? "").Trim();
            reviews.TryGetValue(o.OrderId, out var rv);
            asks.TryGetValue(o.OrderId, out var ask);
            notes.TryGetValue(o.OrderId, out var n);
            return new
            {
                refId = o.OrderId, when = o.DeliveredAt, name, phone, amount = o.Total,
                items = Items(o.CartJson),
                reviewed = rv != null, rating = rv?.Rating, reviewStatus = rv?.Status,
                smsCount = ask.Count, smsLast = ask.Count > 0 ? ask.Last : (DateTimeOffset?)null,
                lastOutcome = n?.Outcome, lastNote = n?.Note, lastAt = n?.At, lastBy = n?.By,
                callbackAt = n?.CallbackAt, calls = n?.Count ?? 0,
                stage = Stage(n, rv != null),
            };
        }).ToList();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var t = q.Trim();
            var dg = new string(t.Where(char.IsDigit).ToArray());
            rows = rows.Where(r => r.refId.Contains(t, StringComparison.OrdinalIgnoreCase)
                                || r.name.Contains(t, StringComparison.OrdinalIgnoreCase)
                                || (dg.Length >= 4 && r.phone.Contains(dg))).ToList();
        }
        return Ok(new { success = true, rows });
    }

    // GET /api/follow-ups/dropped?days=15&q=
    [HttpGet("dropped")]
    public async Task<IActionResult> Dropped([FromQuery] int days = 15, [FromQuery] string? q = null)
    {
        days = Math.Clamp(days, 1, 90);
        var floor = DateTimeOffset.UtcNow.AddDays(-days);
        var checkouts = await _db.CashfreeOrders.AsNoTracking()
            .Where(c => c.CreatedAt >= floor && c.PaidAt == null && c.Status != "paid"
                     && (c.CfStatus == null || c.CfStatus != "SUCCESS")
                     && !_db.SiteOrders.Any(o => o.OrderId == c.LocalOrderId))
            .OrderByDescending(c => c.CreatedAt)
            .Take(1000)
            .Select(c => new { c.LocalOrderId, c.CreatedAt, c.CustomerJson, c.ShippingJson, c.CartJson, c.FullTotal, c.AmountPaise, c.CfStatus })
            .ToListAsync();
        var ids = checkouts.Select(c => c.LocalOrderId).ToList();

        var tpl = OrderMessenger.UserDropped;
        var sms = (await _db.MessageSends.AsNoTracking()
            .Where(m => m.Template == tpl && m.Phone != null && ids.Contains(m.OrderId))
            .Select(m => new { m.OrderId, m.SentAt, m.Status })
            .ToListAsync())
            .GroupBy(m => m.OrderId).ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.SentAt).First());

        // The WhatsApp tick from SMS Logs, for the same message.
        var droppedTpl = (await _db.SiteSettings.Where(x => x.Key == "msg91TplUserDropped").Select(x => x.Value).FirstOrDefaultAsync() ?? "").Trim();
        var wa = new Dictionary<string, DateTimeOffset>(StringComparer.OrdinalIgnoreCase);
        if (droppedTpl.Length > 0)
        {
            var logs = await _db.SmsLogs.AsNoTracking()
                .Where(l => l.TemplateId == droppedTpl && l.SentAt >= floor && l.WhatsAppAt != null)
                .Select(l => new { l.VarsJson, l.WhatsAppAt }).ToListAsync();
            foreach (var l in logs)
                if (OrderIdOf(l.VarsJson) is { } oid && l.WhatsAppAt is { } at) wa[oid] = at;
        }

        // Did she buy after all - a later order from the same phone?
        var later = (await _db.SiteOrders.AsNoTracking()
            .Where(o => o.CreatedAt >= floor)
            .Select(o => new { o.OrderId, o.CreatedAt, o.CustomerJson, o.ShippingJson })
            .ToListAsync())
            .Select(o => (o.OrderId, o.CreatedAt, Phone: Last10(OrderMessenger.Field(o.CustomerJson, "phone") ?? OrderMessenger.Field(o.ShippingJson, "phone"))))
            .Where(o => o.Phone.Length == 10)
            .ToList();
        var notes = await NotesForAsync("dropped", ids);

        var rows = checkouts.Select(c =>
        {
            var phone = Last10(OrderMessenger.Field(c.CustomerJson, "phone") ?? OrderMessenger.Field(c.ShippingJson, "phone"));
            var name = (OrderMessenger.Field(c.CustomerJson, "name") ?? OrderMessenger.Field(c.ShippingJson, "name") ?? "").Trim();
            var bought = phone.Length == 10
                ? later.Where(o => o.Phone == phone && o.CreatedAt >= c.CreatedAt).OrderBy(o => o.CreatedAt).Select(o => o.OrderId).FirstOrDefault()
                : null;
            sms.TryGetValue(c.LocalOrderId, out var s);
            notes.TryGetValue(c.LocalOrderId, out var n);
            return new
            {
                refId = c.LocalOrderId, when = c.CreatedAt, name, phone,
                amount = c.FullTotal > 0 ? c.FullTotal : c.AmountPaise / 100m,
                items = Items(c.CartJson), cfStatus = c.CfStatus,
                smsAt = s?.SentAt, smsStatus = s?.Status,
                whatsAppAt = wa.TryGetValue(c.LocalOrderId, out var w) ? w : (DateTimeOffset?)null,
                boughtOrder = bought,
                lastOutcome = n?.Outcome, lastNote = n?.Note, lastAt = n?.At, lastBy = n?.By,
                callbackAt = n?.CallbackAt, calls = n?.Count ?? 0,
                stage = Stage(n, bought != null),
            };
        }).ToList();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var t = q.Trim();
            var dg = new string(t.Where(char.IsDigit).ToArray());
            rows = rows.Where(r => r.refId.Contains(t, StringComparison.OrdinalIgnoreCase)
                                || r.name.Contains(t, StringComparison.OrdinalIgnoreCase)
                                || (dg.Length >= 4 && r.phone.Contains(dg))).ToList();
        }
        return Ok(new { success = true, rows });
    }

    // GET /api/follow-ups/notes?kind=review&refId=MFH...
    [HttpGet("notes")]
    public async Task<IActionResult> Notes([FromQuery] string kind, [FromQuery] string refId)
    {
        var notes = await _db.FollowUpNotes.AsNoTracking()
            .Where(n => n.Kind == kind && n.RefId == refId)
            .OrderByDescending(n => n.CreatedAt)
            .Select(n => new { n.Id, n.Outcome, n.Note, n.CallbackAt, n.CreatedBy, n.CreatedAt })
            .ToListAsync();
        return Ok(new { success = true, notes });
    }

    public record NoteRequest(string? Kind, string? RefId, string? Phone, string? Outcome, string? Note, DateTimeOffset? CallbackAt);

    // POST /api/follow-ups/notes
    [HttpPost("notes")]
    public async Task<IActionResult> AddNote([FromBody] NoteRequest req)
    {
        var kind = (req.Kind ?? "").Trim().ToLowerInvariant();
        if (kind is not ("review" or "dropped")) return BadRequest(new { success = false, message = "Unknown list." });
        var refId = (req.RefId ?? "").Trim();
        if (refId.Length == 0 || refId.Length > 64) return BadRequest(new { success = false, message = "Order id is required." });
        var outcome = (req.Outcome ?? "").Trim();
        if (!Outcomes.Contains(outcome)) return BadRequest(new { success = false, message = "Choose what happened on the call." });
        var note = (req.Note ?? "").Trim();
        if (note.Length > 4000) note = note[..4000];

        var row = new FollowUpNote
        {
            Kind = kind, RefId = refId, Phone = Last10(req.Phone), Outcome = outcome.ToLowerInvariant(),
            Note = note.Length > 0 ? note : null,
            CallbackAt = req.CallbackAt,
            CreatedBy = (User.FindFirstValue("email") ?? User.FindFirstValue(ClaimTypes.Email) ?? "admin").Trim(),
        };
        if (row.CreatedBy!.Length > 120) row.CreatedBy = row.CreatedBy[..120];
        _db.FollowUpNotes.Add(row);
        await _db.SaveChangesAsync();
        return Ok(new { success = true, id = row.Id });
    }

    // DELETE /api/follow-ups/notes/{id} - a note written by mistake.
    [HttpDelete("notes/{id:long}")]
    public async Task<IActionResult> DeleteNote(long id)
    {
        var n = await _db.FollowUpNotes.Where(x => x.Id == id).ExecuteDeleteAsync();
        return n > 0 ? Ok(new { success = true }) : NotFound(new { success = false, message = "Already gone." });
    }
}
