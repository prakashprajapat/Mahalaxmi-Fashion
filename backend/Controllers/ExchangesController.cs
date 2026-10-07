using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;
using MahalaxmiApi.Authorization;

namespace MahalaxmiApi.Controllers;

// Exchanges: one item out, a different one in, and the money stays put.
//
// The shop's written policy used to handle this as a return plus a fresh order,
// which is tidy for the shop and poor for the customer: their money goes back to
// their bank, and they have to place the order again and pay again while the
// first parcel is still in the post. The owner chose the other way - keep the
// money, take the old item back, send the new one - so that is what this does.
//
// What it does NOT do is move stock or raise a courier booking by itself. An
// exchange is agreed by a person who knows whether the size is really on the
// shelf, and the shop's own screens already do the shipping. This records the
// request, works out the money, and carries the thing through its states.
[ApiController]
[Route("api/exchanges")]
public class ExchangesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AdminNotifier _notify;
    private readonly ILogger<ExchangesController> _log;

    public ExchangesController(AppDbContext db, AdminNotifier notify, ILogger<ExchangesController> log)
    {
        _db = db; _notify = notify; _log = log;
    }

    private static readonly JsonSerializerOptions _json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    /// <summary>Seven days from delivery, the same window the returns policy gives.</summary>
    private static readonly TimeSpan Window = TimeSpan.FromDays(7);

    // The reasons that are the shop's fault. Everything else - a size that did
    // not suit, a change of mind - is the customer's postage, exactly as the
    // returns policy already says.
    private static readonly string[] OurFault =
        { "wrong item sent", "wrong size sent", "damaged", "defective", "missing part" };

    private static readonly string[] Statuses =
        { "Requested", "Approved", "Rejected", "Picked Up", "Sent", "Completed" };

    public record CreateRequest(
        string OrderId,
        int HaveProductId, string? HaveSize, string? HaveColour,
        int WantProductId, string? WantSize, string? WantColour,
        string Reason, string? Description, List<string>? Photos);

    public record UpdateRequest(string? Status, string? AdminNote, string? ShippingPaidBy, string? NewAwb);

    private static JsonElement Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return default;
        try { return JsonDocument.Parse(json).RootElement.Clone(); } catch { return default; }
    }

    private static string? Str(JsonElement el, string prop)
    {
        if (el.ValueKind != JsonValueKind.Object) return null;
        if (!el.TryGetProperty(prop, out var v)) return null;
        return v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString();
    }

    private int? CallerId()
    {
        var raw = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(raw, out var id) && id > 0 ? id : null;
    }

    private object Dto(ExchangeRequest x) => new
    {
        id = x.Id,
        orderId = x.OrderId,
        customerId = x.CustomerId,
        have = new { productId = x.HaveProductId, name = x.HaveName, size = x.HaveSize, colour = x.HaveColour, price = x.HavePrice },
        want = new { productId = x.WantProductId, name = x.WantName, size = x.WantSize, colour = x.WantColour, price = x.WantPrice },
        priceDifference = x.PriceDifference,
        reason = x.Reason,
        description = x.Description,
        photos = x.Photos,
        shippingPaidBy = x.ShippingPaidBy,
        status = x.Status,
        adminNote = x.AdminNote,
        newAwb = x.NewAwb,
        createdAt = x.CreatedAt,
        updatedAt = x.UpdatedAt,
    };

    // POST /api/exchanges  — the customer asks
    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateRequest req)
    {
        var orderId = (req.OrderId ?? "").Trim();
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order is null)
            return NotFound(new { success = false, message = "We could not find that order." });

        // It has to be the caller's own order. Matched on the id and on the
        // email as well, because an order placed before signing in carries the
        // address but not the id.
        if (!User.HasSectionAccess("orders"))
        {
            var buyer = Parse(order.CustomerJson);
            var callerEmail = (User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? "").Trim().ToLowerInvariant();
            var buyerEmail = (Str(buyer, "email") ?? "").Trim().ToLowerInvariant();
            var callerId = CallerId();
            var owns = (callerId is not null && Str(buyer, "id") == callerId.Value.ToString())
                    || (callerEmail.Length > 0 && callerEmail == buyerEmail);
            if (!owns) return StatusCode(403, new { success = false, message = "That order belongs to a different account." });
        }

        if (order.Status != "Delivered" && order.Status != "Exchange Requested")
            return BadRequest(new { success = false, message = "An exchange can be asked for once the order has been delivered." });

        var deliveredAt = order.DeliveredAt ?? order.UpdatedAt;
        if (DateTimeOffset.UtcNow - deliveredAt > Window)
            return BadRequest(new { success = false, message = "The 7-day exchange window has closed for this order." });

        // The item being sent back has to be one that was actually in the parcel,
        // at the price it was actually billed at.
        var cart = Parse(order.CartJson);
        if (cart.ValueKind != JsonValueKind.Array)
            return BadRequest(new { success = false, message = "That order has no items on it." });

        JsonElement? line = null;
        foreach (var item in cart.EnumerateArray())
        {
            if (Str(item, "id") == req.HaveProductId.ToString()) { line = item; break; }
        }
        if (line is null)
            return BadRequest(new { success = false, message = "That item was not in this order." });

        var havePrice = decimal.TryParse(Str(line.Value, "price"), out var hp) ? hp : 0m;
        var haveName = Str(line.Value, "name") ?? "";

        var want = await _db.Products.FirstOrDefaultAsync(p => p.Id == req.WantProductId);
        if (want is null)
            return BadRequest(new { success = false, message = "The item you want is no longer in the catalogue." });

        if (ProductQualityGate.HiddenStatuses.Contains(want.StockStatus) || want.StockStatus == "Out of Stock")
            return BadRequest(new { success = false, message = $"\"{want.Name}\" is not available at the moment. Please pick something else." });

        // What the shop would charge for it today, shipping left out of it: the
        // courier is settled separately and the rule for it is below.
        var wantPrice = want.DiscountPrice is > 0 ? want.DiscountPrice.Value : want.Price;

        var reason = (req.Reason ?? "").Trim();
        if (reason.Length == 0)
            return BadRequest(new { success = false, message = "Please say why you would like to exchange it." });

        // One open request per item per order. A second one is not a mistake to
        // swallow - the customer should be told the first is already with us.
        var openStates = new[] { "Requested", "Approved", "Picked Up", "Sent" };
        var already = await _db.ExchangeRequests.AnyAsync(x =>
            x.OrderId == orderId && x.HaveProductId == req.HaveProductId && openStates.Contains(x.Status));
        if (already)
            return Conflict(new { success = false, message = "An exchange for this item is already with us. We will be in touch." });

        var photos = (req.Photos ?? new List<string>())
            .Where(u => !string.IsNullOrWhiteSpace(u) && u.StartsWith("/api/orders/", StringComparison.Ordinal))
            .Distinct().Take(4).ToList();

        var ours = OurFault.Any(f => reason.Contains(f, StringComparison.OrdinalIgnoreCase));

        var ex = new ExchangeRequest
        {
            OrderId = orderId,
            CustomerId = CallerId(),
            HaveProductId = req.HaveProductId,
            HaveName = haveName,
            HaveSize = req.HaveSize?.Trim(),
            HaveColour = req.HaveColour?.Trim(),
            HavePrice = havePrice,
            WantProductId = want.Id,
            WantName = want.Name,
            WantSize = req.WantSize?.Trim(),
            WantColour = req.WantColour?.Trim(),
            WantPrice = wantPrice,
            PriceDifference = wantPrice - havePrice,
            Reason = reason,
            Description = req.Description?.Trim(),
            Photos = photos.Count > 0 ? JsonSerializer.Serialize(photos) : null,
            ShippingPaidBy = ours ? "shop" : "customer",
            Status = "Requested",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };
        _db.ExchangeRequests.Add(ex);

        order.Status = "Exchange Requested";
        order.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        try
        {
            var diff = ex.PriceDifference == 0
                ? "no difference in price"
                : ex.PriceDifference > 0
                    ? $"customer owes Rs. {ex.PriceDifference:0}"
                    : $"shop owes Rs. {-ex.PriceDifference:0}";
            await _notify.NotifyAsync($"Exchange asked for - {orderId}",
                AdminNotifier.Wrap("Exchange request", $@"
                    <p><strong>Order:</strong> {System.Net.WebUtility.HtmlEncode(orderId)}</p>
                    <p><strong>Has:</strong> {System.Net.WebUtility.HtmlEncode(ex.HaveName)}
                       ({System.Net.WebUtility.HtmlEncode(ex.HaveSize ?? "-")} / {System.Net.WebUtility.HtmlEncode(ex.HaveColour ?? "-")})
                       &mdash; Rs. {ex.HavePrice:0}</p>
                    <p><strong>Wants:</strong> {System.Net.WebUtility.HtmlEncode(ex.WantName)}
                       ({System.Net.WebUtility.HtmlEncode(ex.WantSize ?? "-")} / {System.Net.WebUtility.HtmlEncode(ex.WantColour ?? "-")})
                       &mdash; Rs. {ex.WantPrice:0}</p>
                    <p><strong>Money:</strong> {diff}</p>
                    <p><strong>Reason:</strong> {System.Net.WebUtility.HtmlEncode(ex.Reason)}</p>
                    <p><strong>Courier paid by:</strong> {ex.ShippingPaidBy}</p>
                    <p>{System.Net.WebUtility.HtmlEncode(ex.Description ?? "")}</p>"));
        }
        catch (Exception e) { _log.LogError(e, "Exchange alert could not be sent for {OrderId}", orderId); }

        return Ok(new { success = true, exchange = Dto(ex) });
    }

    // GET /api/exchanges/mine — what this customer has asked for
    [HttpGet("mine")]
    [Authorize]
    public async Task<IActionResult> Mine([FromQuery] string? orderId)
    {
        var id = CallerId();
        if (id is null) return Ok(new { success = true, exchanges = Array.Empty<object>() });

        var q = _db.ExchangeRequests.Where(x => x.CustomerId == id);
        if (!string.IsNullOrWhiteSpace(orderId)) q = q.Where(x => x.OrderId == orderId);

        var rows = await q.OrderByDescending(x => x.CreatedAt).ToListAsync();
        return Ok(new { success = true, exchanges = rows.Select(Dto) });
    }

    // GET /api/exchanges — the shop's list
    [HttpGet]
    [Authorize]
    [RequirePerm("orders")]
    public async Task<IActionResult> All([FromQuery] string? status)
    {
        var q = _db.ExchangeRequests.AsQueryable();
        if (!string.IsNullOrWhiteSpace(status) && Statuses.Contains(status))
            q = q.Where(x => x.Status == status);

        var rows = await q.OrderByDescending(x => x.CreatedAt).Take(500).ToListAsync();

        // The buyer's name and number, so the shop can pick up the phone without
        // opening the order first.
        var ids = rows.Select(r => r.OrderId).Distinct().ToList();
        var orders = await _db.SiteOrders.Where(o => ids.Contains(o.OrderId))
            .Select(o => new { o.OrderId, o.CustomerJson, o.Awb, o.Status }).ToListAsync();

        var byOrder = orders.ToDictionary(o => o.OrderId, o =>
        {
            var c = Parse(o.CustomerJson);
            return new { name = Str(c, "name"), phone = Str(c, "phone"), email = Str(c, "email"), awb = o.Awb, orderStatus = o.Status };
        });

        return Ok(new
        {
            success = true,
            exchanges = rows.Select(r => new
            {
                exchange = Dto(r),
                customer = byOrder.TryGetValue(r.OrderId, out var c) ? c : null,
            }),
        });
    }

    // PATCH /api/exchanges/{id} — the shop moves it along
    [HttpPatch("{id:int}")]
    [Authorize]
    [RequirePerm("orders")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateRequest req)
    {
        var ex = await _db.ExchangeRequests.FirstOrDefaultAsync(x => x.Id == id);
        if (ex is null) return NotFound(new { success = false, message = "That request no longer exists." });

        if (!string.IsNullOrWhiteSpace(req.Status))
        {
            if (!Statuses.Contains(req.Status))
                return BadRequest(new { success = false, message = "That is not one of the exchange states." });
            ex.Status = req.Status;
        }

        if (req.AdminNote is not null) ex.AdminNote = req.AdminNote.Trim();
        if (req.NewAwb is not null) ex.NewAwb = req.NewAwb.Trim();

        if (!string.IsNullOrWhiteSpace(req.ShippingPaidBy))
        {
            var who = req.ShippingPaidBy.Trim().ToLowerInvariant();
            if (who != "shop" && who != "customer")
                return BadRequest(new { success = false, message = "The courier is paid by the shop or by the customer." });
            ex.ShippingPaidBy = who;
        }

        ex.UpdatedAt = DateTimeOffset.UtcNow;

        // The order follows the request, so the Orders screen tells the same
        // story. Finished or refused, it goes back to Delivered: the parcel was
        // delivered, and that is still the true state of the original order.
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == ex.OrderId);
        if (order is not null)
        {
            var stillOpen = await _db.ExchangeRequests.AnyAsync(x =>
                x.OrderId == ex.OrderId && x.Id != ex.Id &&
                (x.Status == "Requested" || x.Status == "Approved" || x.Status == "Picked Up" || x.Status == "Sent"));

            order.Status = ex.Status switch
            {
                "Picked Up" => "Exchange Transit",
                "Sent" => "Exchange Transit",
                "Completed" => stillOpen ? "Exchange Requested" : "Delivered",
                "Rejected" => stillOpen ? "Exchange Requested" : "Delivered",
                _ => "Exchange Requested",
            };
            order.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync();
        return Ok(new { success = true, exchange = Dto(ex) });
    }
}
