using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;
using MahalaxmiApi.Authorization;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/feedback")]
public class FeedbackController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AdminNotifier _notify;

    public FeedbackController(AppDbContext db, AdminNotifier notify)
    {
        _db = db;
        _notify = notify;
    }

    private static string Digits(string? s) => new((s ?? "").Where(char.IsDigit).ToArray());
    private static string Clip(string? s, int max) =>
        string.IsNullOrWhiteSpace(s) ? "" : (s.Trim().Length <= max ? s.Trim() : s.Trim()[..max]);

    private static readonly HashSet<string> Topics = new(StringComparer.OrdinalIgnoreCase)
        { "website", "product", "delivery", "payment", "idea", "other" };

    // POST /api/feedback — public. Anyone may say something; no account needed,
    // because the people most worth hearing from are the ones who did not buy.
    [HttpPost]
    public async Task<IActionResult> Submit([FromBody] FeedbackRequest req)
    {
        var message = Clip(req.Message, 4000);
        if (message.Length < 4)
            return BadRequest(new { success = false, message = "Please write a little more." });

        // The honeypot is a field no human ever sees. Anything in it is a bot,
        // and a bot is told everything went fine rather than taught what failed.
        if (!string.IsNullOrWhiteSpace(req.Website))
            return Ok(new { success = true });

        // Same person, same words, twice in ten minutes: a double-tap on a slow
        // connection, not two opinions.
        var since = DateTimeOffset.UtcNow.AddMinutes(-10);
        var phone = Digits(req.Phone);
        var email = Clip(req.Email, 160).ToLowerInvariant();
        var dupe = await _db.Feedbacks.AnyAsync(f =>
            f.CreatedAt >= since && f.Message == message &&
            ((phone != "" && f.Phone == phone) || (email != "" && f.Email == email)));
        if (dupe) return Ok(new { success = true, duplicate = true });

        var row = new Feedback
        {
            Name    = Clip(req.Name, 120),
            Email   = email,
            Phone   = phone,
            Topic   = Topics.Contains(req.Topic ?? "") ? req.Topic!.ToLowerInvariant() : "other",
            Rating  = req.Rating is >= 1 and <= 5 ? req.Rating : 0,
            Message = message,
            PageUrl = Clip(req.PageUrl, 500),
        };

        // Only trust a customer id that came with a real token - a number in the
        // body is whatever the sender felt like typing. The token carries it as
        // "sub", which ASP.NET usually remaps to NameIdentifier; both are read
        // rather than betting on which mapping is in force.
        if (User?.Identity?.IsAuthenticated == true)
        {
            var sub = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                   ?? User.FindFirst("sub")?.Value;
            if (int.TryParse(sub, out var cid)) row.CustomerId = cid;
        }

        _db.Feedbacks.Add(row);
        await _db.SaveChangesAsync();

        // A complaint that sits unread for a week is worse than no complaint box
        // at all, so this one goes out by email the moment it lands. The pieces
        // are built as plain locals first - an interpolated string holding three
        // conditionals and its own escaped quotes is a thing nobody can read, and
        // the compiler is the only one who ever notices the missing bracket.
        static string enc(string? x) => System.Net.WebUtility.HtmlEncode(x ?? "");
        var stars = row.Rating > 0 ? $"{row.Rating}/5" : "not rated";
        var who = enc(string.IsNullOrWhiteSpace(row.Name) ? "Anonymous" : row.Name);
        if (!string.IsNullOrWhiteSpace(row.Phone)) who += " &nbsp;|&nbsp; " + enc(row.Phone);
        if (!string.IsNullOrWhiteSpace(row.Email)) who += " &nbsp;|&nbsp; " + enc(row.Email);
        var pageLine = string.IsNullOrWhiteSpace(row.PageUrl)
            ? ""
            : "<p style='color:#888;font-size:12px'>Page: " + enc(row.PageUrl) + "</p>";

        await _notify.NotifyAsync(
            $"Feedback ({row.Topic}, {stars})",
            AdminNotifier.Wrap("New Feedback", $@"
                <p><strong>Topic:</strong> {enc(row.Topic)} &nbsp;|&nbsp; <strong>Rating:</strong> {stars}</p>
                <p><strong>From:</strong> {who}</p>
                <p style='background:#faf6f2;padding:12px;border-radius:8px;white-space:pre-wrap'>{enc(row.Message)}</p>
                {pageLine}"));

        return Ok(new { success = true, id = row.Id });
    }

    // GET /api/feedback — the shop's own list.
    [HttpGet]
    [Authorize]
    [RequirePerm("reports")]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int limit = 100)
    {
        page = Math.Max(1, page);
        limit = Math.Clamp(limit, 1, 500);

        var query = _db.Feedbacks.OrderByDescending(f => f.CreatedAt);
        var total = await query.CountAsync();
        var rows = await query.Skip((page - 1) * limit).Take(limit)
            .Select(f => new
            {
                f.Id, f.Name, f.Email, f.Phone, f.Topic, f.Rating, f.Message,
                f.PageUrl, f.CustomerId, f.IsHandled, f.AdminNote, f.CreatedAt,
            })
            .ToListAsync();

        return Ok(new { success = true, total, feedback = rows });
    }

    // PATCH /api/feedback/5 — tick it off, or keep a note against it.
    [HttpPatch("{id:int}")]
    [Authorize]
    [RequirePerm("reports")]
    public async Task<IActionResult> Update(int id, [FromBody] FeedbackUpdateRequest req)
    {
        var row = await _db.Feedbacks.FirstOrDefaultAsync(f => f.Id == id);
        if (row is null) return NotFound(new { success = false, message = "Not found." });

        if (req.IsHandled is not null) row.IsHandled = req.IsHandled.Value;
        if (req.AdminNote is not null) row.AdminNote = Clip(req.AdminNote, 2000);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    // ── Feedback about a product -> a review on the product page ──────────
    //
    // Customers who liked what they bought sometimes write on the Feedback
    // page instead of the review form. Feedback never shows on the website,
    // so the shop can publish it as a review of the product they bought.

    private static string Ten(string? p)
    {
        var d = new string((p ?? "").Where(char.IsDigit).ToArray());
        return d.Length >= 10 ? d[^10..] : "";
    }

    private async Task<(Customer? Cust, List<(string OrderId, DateTimeOffset At, string Status, string? Cart)> Orders)> BuyerAsync(Feedback f)
    {
        var ten = Ten(f.Phone);
        var mail = (f.Email ?? "").Trim().ToLowerInvariant();
        Customer? cust = null;
        if (f.CustomerId is int cid) cust = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == cid);
        if (cust is null && ten.Length == 10) cust = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Phone10 == ten);
        if (cust is null && mail.Length > 0) cust = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Email != null && c.Email.ToLower() == mail);
        var cTen = Ten(cust?.Phone);
        var cMail = (cust?.Email ?? "").Trim().ToLowerInvariant();

        var since = DateTimeOffset.UtcNow.AddDays(-365);
        var all = await _db.SiteOrders.AsNoTracking()
            .Where(o => o.CreatedAt >= since)
            .Select(o => new { o.OrderId, o.CreatedAt, o.Status, o.CustomerJson, o.ShippingJson, o.CartJson })
            .ToListAsync();
        var mine = all.Where(o =>
        {
            var p = Ten(OrderMessenger.Field(o.CustomerJson, "phone") ?? OrderMessenger.Field(o.ShippingJson, "phone"));
            var e = (OrderMessenger.Field(o.CustomerJson, "email") ?? "").Trim().ToLowerInvariant();
            return (p.Length == 10 && (p == ten || p == cTen)) || (e.Length > 0 && (e == mail || e == cMail));
        })
        .OrderByDescending(o => o.CreatedAt)
        .Select(o => (o.OrderId, o.CreatedAt, o.Status, o.CartJson))
        .ToList();
        return (cust, mine);
    }

    // GET /api/feedback/5/products - what this person bought, to pick from.
    [HttpGet("{id:int}/products")]
    [Authorize]
    [RequirePerm("reports")]
    public async Task<IActionResult> Products(int id)
    {
        var f = await _db.Feedbacks.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (f is null) return NotFound(new { success = false, message = "Not found." });
        var (cust, orders) = await BuyerAsync(f);

        var lines = new List<(string OrderId, DateTimeOffset At, string Status, string Sku, string Name)>();
        foreach (var o in orders)
        {
            if (string.IsNullOrWhiteSpace(o.Cart)) continue;
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(o.Cart);
                if (doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Array) continue;
                foreach (var line in doc.RootElement.EnumerateArray())
                {
                    string sku = "", name = "";
                    foreach (var p in line.EnumerateObject())
                    {
                        if (p.Name.Equals("sku", StringComparison.OrdinalIgnoreCase) && p.Value.ValueKind == System.Text.Json.JsonValueKind.String) sku = p.Value.GetString() ?? "";
                        if (p.Name.Equals("name", StringComparison.OrdinalIgnoreCase) && p.Value.ValueKind == System.Text.Json.JsonValueKind.String) name = p.Value.GetString() ?? "";
                    }
                    if (sku.Trim().Length > 0) lines.Add((o.OrderId, o.At, o.Status, sku.Trim(), name.Trim()));
                }
            }
            catch { }
        }
        var skus = lines.Select(l => l.Sku.ToLower()).Distinct().ToList();
        var products = await _db.Products.AsNoTracking()
            .Where(p => p.Sku != null && skus.Contains(p.Sku.ToLower()))
            .Select(p => new { p.Id, p.Name, p.Sku }).ToListAsync();
        var bySku = products.GroupBy(p => p.Sku!.ToLowerInvariant()).ToDictionary(g => g.Key, g => g.First());
        var orderIds = lines.Select(l => l.OrderId).Distinct().ToList();
        var done = await _db.Reviews.AsNoTracking().Where(r => r.OrderId != null && orderIds.Contains(r.OrderId))
            .Select(r => new { r.OrderId, r.ProductId }).ToListAsync();

        var items = lines
            .Where(l => bySku.ContainsKey(l.Sku.ToLowerInvariant()))
            .Select(l =>
            {
                var p = bySku[l.Sku.ToLowerInvariant()];
                return new
                {
                    productId = p.Id, name = p.Name, sku = p.Sku, orderId = l.OrderId, orderedAt = l.At, status = l.Status,
                    reviewed = done.Any(d => d.OrderId == l.OrderId && d.ProductId == p.Id),
                };
            })
            .GroupBy(x => (x.orderId, x.productId)).Select(g => g.First())
            .ToList();

        return Ok(new
        {
            success = true,
            customer = cust is null ? null : new { cust.Id, name = $"{cust.FirstName} {cust.LastName}".Trim() },
            items,
        });
    }

    public record ToReviewRequest(int ProductId, string? OrderId);

    // POST /api/feedback/5/to-review  { productId, orderId }
    [HttpPost("{id:int}/to-review")]
    [Authorize]
    [RequirePerm("reports")]
    public async Task<IActionResult> ToReview(int id, [FromBody] ToReviewRequest req)
    {
        var f = await _db.Feedbacks.FirstOrDefaultAsync(x => x.Id == id);
        if (f is null) return NotFound(new { success = false, message = "Not found." });
        if (f.Rating is < 1 or > 5) return BadRequest(new { success = false, message = "This feedback has no star rating, so it cannot be a review." });
        if (string.IsNullOrWhiteSpace(f.Message)) return BadRequest(new { success = false, message = "The feedback has no words to publish." });
        var product = await _db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == req.ProductId);
        if (product is null) return BadRequest(new { success = false, message = "Choose the product." });

        var (cust, orders) = await BuyerAsync(f);
        var orderId = (req.OrderId ?? "").Trim();
        // Only an order of this customer - a review says "verified buyer".
        if (orderId.Length > 0 && !orders.Any(o => o.OrderId == orderId))
            return BadRequest(new { success = false, message = "That order is not this customer's." });
        if (orderId.Length > 0 && await _db.Reviews.AnyAsync(r => r.OrderId == orderId && r.ProductId == product.Id))
            return BadRequest(new { success = false, message = "There is already a review for this product on that order." });

        var review = new Review
        {
            ProductId = product.Id,
            CustomerId = cust?.Id,
            Rating = (short)f.Rating,
            Body = f.Message.Trim(),
            OrderId = orderId.Length > 0 ? orderId : null,
            Status = "approved",
        };
        _db.Reviews.Add(review);
        f.IsHandled = true;
        var note = $"Published as a review of {product.Name} ({DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(5.5)):dd MMM yyyy}).";
        f.AdminNote = string.IsNullOrWhiteSpace(f.AdminNote) ? note : Clip(f.AdminNote + "\n" + note, 2000);
        await _db.SaveChangesAsync();
        return Ok(new { success = true, reviewId = review.Id });
    }

    [HttpDelete("{id:int}")]
    [Authorize]
    [RequirePerm("reports")]
    public async Task<IActionResult> Delete(int id)
    {
        var row = await _db.Feedbacks.FirstOrDefaultAsync(f => f.Id == id);
        if (row is null) return NotFound(new { success = false, message = "Not found." });
        _db.Feedbacks.Remove(row);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }
}

public class FeedbackRequest
{
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Topic { get; set; }
    public int Rating { get; set; }
    public string? Message { get; set; }
    public string? PageUrl { get; set; }
    /// <summary>Honeypot. Hidden from people, filled in by bots.</summary>
    public string? Website { get; set; }
}

public class FeedbackUpdateRequest
{
    public bool? IsHandled { get; set; }
    public string? AdminNote { get; set; }
}
