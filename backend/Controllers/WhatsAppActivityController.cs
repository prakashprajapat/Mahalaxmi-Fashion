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
/// Admin -> WhatsApp Activity: what Interakt reported (see InteraktEvents).
/// Carts from the WhatsApp catalogue, template message statuses, payments,
/// account alerts, and every raw event.
/// </summary>
[ApiController]
[Route("api/whatsapp/activity")]
[Authorize]
[RequirePerm("campaigns")]
public class WhatsAppActivityController : ControllerBase
{
    private readonly AppDbContext _db;
    public WhatsAppActivityController(AppDbContext db) => _db = db;

    private static DateTimeOffset Floor(int days) => DateTimeOffset.UtcNow.AddDays(-Math.Clamp(days, 1, 365));

    // GET /api/whatsapp/activity/summary?days=30
    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] int days = 30)
    {
        var f = Floor(days);
        var msgs = _db.WaMessages.Where(m => m.UpdatedAt >= f);
        return Ok(new
        {
            success = true,
            cartsNew = await _db.WaCarts.CountAsync(c => c.CreatedAt >= f && c.Status == "new"),
            carts = await _db.WaCarts.CountAsync(c => c.CreatedAt >= f),
            sent = await msgs.CountAsync(),
            delivered = await msgs.CountAsync(m => m.DeliveredAt != null),
            read = await msgs.CountAsync(m => m.ReadAt != null),
            clicked = await msgs.CountAsync(m => m.ClickedAt != null),
            failed = await msgs.CountAsync(m => m.Status == "Failed"),
            payments = await _db.WaEvents.CountAsync(e => e.CreatedAt >= f && e.Category == "payment"),
            alerts = await _db.WaEvents.CountAsync(e => e.CreatedAt >= f && e.Category == "alert"),
            lastEventAt = await _db.WaEvents.OrderByDescending(e => e.CreatedAt).Select(e => (DateTimeOffset?)e.CreatedAt).FirstOrDefaultAsync(),
        });
    }

    // GET /api/whatsapp/activity/carts?days=30
    [HttpGet("carts")]
    public async Task<IActionResult> Carts([FromQuery] int days = 30)
    {
        var f = Floor(days);
        var carts = await _db.WaCarts.AsNoTracking().Where(c => c.CreatedAt >= f)
            .OrderByDescending(c => c.CreatedAt).Take(500).ToListAsync();
        // Did the same phone order on the website afterwards?
        var orders = (await _db.SiteOrders.AsNoTracking().Where(o => o.CreatedAt >= f)
                .Select(o => new { o.OrderId, o.CreatedAt, o.CustomerJson, o.ShippingJson }).ToListAsync())
            .Select(o => (o.OrderId, o.CreatedAt, Phone: InteraktEvents.Ten(OrderMessenger.Field(o.CustomerJson, "phone") ?? OrderMessenger.Field(o.ShippingJson, "phone"))))
            .Where(o => o.Phone.Length == 10).ToList();
        var rows = carts.Select(c =>
        {
            JsonElement items;
            try { items = JsonDocument.Parse(c.ItemsJson).RootElement.Clone(); } catch { items = JsonDocument.Parse("[]").RootElement.Clone(); }
            var later = c.Phone is { Length: 10 }
                ? orders.Where(o => o.Phone == c.Phone && o.CreatedAt >= c.CreatedAt).OrderBy(o => o.CreatedAt).Select(o => o.OrderId).FirstOrDefault()
                : null;
            return new
            {
                c.Id, c.Phone, c.Name, items, c.Total, c.Currency, c.CustomerNote, c.Status,
                orderId = c.OrderId ?? later, orderedLater = later, c.Note, c.CreatedAt, c.UpdatedAt,
            };
        });
        var reply = await _db.SiteSettings.Where(x => x.Key == "waCartReply").Select(x => x.Value).FirstOrDefaultAsync();
        return Ok(new { success = true, carts = rows, cartReply = reply ?? "" });
    }

    public record CartUpdate(string? Status, string? Note, string? OrderId);

    // PATCH /api/whatsapp/activity/carts/5  { status, note, orderId }
    [HttpPatch("carts/{id:long}")]
    public async Task<IActionResult> UpdateCart(long id, [FromBody] CartUpdate req)
    {
        var c = await _db.WaCarts.FirstOrDefaultAsync(x => x.Id == id);
        if (c is null) return NotFound(new { success = false, message = "Cart not found." });
        if (req.Status is { } st)
        {
            st = st.Trim().ToLowerInvariant();
            if (st is not ("new" or "contacted" or "ordered" or "cancelled")) return BadRequest(new { success = false, message = "Unknown status." });
            c.Status = st;
        }
        if (req.Note is not null) c.Note = req.Note.Length > 2000 ? req.Note[..2000] : req.Note;
        if (req.OrderId is not null) c.OrderId = req.OrderId.Trim().Length == 0 ? null : req.OrderId.Trim();
        c.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    // GET /api/whatsapp/activity/messages?days=30&status=Failed
    [HttpGet("messages")]
    public async Task<IActionResult> Messages([FromQuery] int days = 30, [FromQuery] string? status = null)
    {
        var f = Floor(days);
        var q = _db.WaMessages.AsNoTracking().Where(m => m.UpdatedAt >= f);
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(m => m.Status == status);
        var rows = await q.OrderByDescending(m => m.UpdatedAt).Take(1000).ToListAsync();
        return Ok(new { success = true, messages = rows });
    }

    // GET /api/whatsapp/activity/events?category=payment|alert|all&days=30
    [HttpGet("events")]
    public async Task<IActionResult> Events([FromQuery] string? category = null, [FromQuery] int days = 30)
    {
        var f = Floor(days);
        var q = _db.WaEvents.AsNoTracking().Where(e => e.CreatedAt >= f);
        if (!string.IsNullOrWhiteSpace(category) && category != "all") q = q.Where(e => e.Category == category);
        var rows = await q.OrderByDescending(e => e.CreatedAt).Take(500)
            .Select(e => new { e.Id, e.Type, e.Category, e.Phone, e.Ref, e.Status, e.Summary, e.Raw, e.CreatedAt })
            .ToListAsync();
        return Ok(new { success = true, events = rows });
    }
}
