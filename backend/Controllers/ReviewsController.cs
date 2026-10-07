using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

using MahalaxmiApi.Authorization;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReviewsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public ReviewsController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    // Deploy-safe uploads root: /var/www/mahalaxmi-uploads/reviews (outside repo & publish dir).
    private string ReviewImagesRoot() =>
        Path.GetFullPath(Path.Combine(_env.ContentRootPath, "..", "mahalaxmi-uploads", "reviews"));

    // POST /api/reviews/upload — upload ONE review photo, returns its URL. Called per file.
    [HttpPost("upload")]
    [Authorize]
    [RequestSizeLimit(9_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 9_000_000)]
    public async Task<IActionResult> UploadImage([FromForm] IFormFile? file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { success = false, message = "No file received." });
        if (!(file.ContentType ?? "").StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { success = false, message = "Only image files are allowed." });
        if (file.Length > 8L * 1024 * 1024)
            return BadRequest(new { success = false, message = "Image too large (max 8 MB)." });

        var ext = Path.GetExtension(file.FileName ?? "");
        ext = new string(ext.Where(c => char.IsLetterOrDigit(c) || c == '.').ToArray()).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(ext) || ext.Length > 6) ext = ".jpg";

        Directory.CreateDirectory(ReviewImagesRoot());
        var name = $"rev_{Guid.NewGuid():N}{ext}";
        await using (var fs = System.IO.File.Create(Path.Combine(ReviewImagesRoot(), name)))
            await file.CopyToAsync(fs);

        return Ok(new { success = true, url = $"/api/reviews/image/{name}" });
    }

    // GET /api/reviews/image/{file} — stream a stored review photo. Filenames are unguessable GUIDs.
    [HttpGet("image/{file}")]
    [AllowAnonymous]
    public IActionResult GetImage(string file)
    {
        var safe = new string((file ?? "").Where(c => char.IsLetterOrDigit(c) || c == '_' || c == '.' || c == '-').ToArray());
        if (string.IsNullOrEmpty(safe) || safe.Contains(".."))
            return NotFound();
        var full = Path.Combine(ReviewImagesRoot(), safe);
        if (!System.IO.File.Exists(full))
            return NotFound();
        var mime = Path.GetExtension(full).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => "image/jpeg"
        };
        return File(System.IO.File.OpenRead(full), mime, enableRangeProcessing: true);
    }

    // GET /api/reviews/pending
    [HttpGet("pending")]
    [Authorize]
    [RequirePerm("reviews")]
    public async Task<IActionResult> GetPending()
    {
        // PERF-7: Select projection — only fetch needed columns, no unnecessary joins
        var reviews = await _db.Reviews
            .Where(r => r.Status == "pending")
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new {
                id = r.Id,
                productId = r.ProductId,
                productName = r.Product != null ? r.Product.Name : null,
                customerId = r.CustomerId,
                customerName = r.Customer != null ? r.Customer.FirstName + " " + r.Customer.LastName : null,
                rating = r.Rating,
                text = r.Body ?? "",
                status = r.Status,
                // BUG-5: OrderId stored in OrderId column (falls back to Title for legacy data)
                orderId = r.OrderId ?? r.Title,
                imageUrls = r.ImageUrls,
                createdAt = r.CreatedAt
            })
            .ToListAsync();

        return Ok(new { success = true, reviews });
    }

    /// <summary>
    /// Approved reviews across the whole catalogue, newest first — for the public
    /// reviews page and the homepage strip.
    ///
    /// Only approved ones, and only the fields a visitor's page shows. The
    /// customer's surname is cut to an initial: a review is public, a full name
    /// on a public page is not something a shopper agreed to when they wrote it.
    /// </summary>
    // GET /api/reviews/recent?take=24
    [HttpGet("recent")]
    public async Task<IActionResult> GetRecent([FromQuery] int take = 24)
    {
        take = Math.Clamp(take, 1, 100);

        var rows = await _db.Reviews
            .Where(r => r.Status == "approved")
            .OrderByDescending(r => r.CreatedAt)
            .Take(take)
            .Select(r => new {
                id = r.Id,
                productId = r.ProductId,
                productName = r.Product != null ? r.Product.Name : null,
                productImage = r.Product != null ? r.Product.Image : null,
                first = r.Customer != null ? r.Customer.FirstName : null,
                last = r.Customer != null ? r.Customer.LastName : null,
                rating = r.Rating,
                text = r.Body ?? "",
                imageUrls = r.ImageUrls,
                createdAt = r.CreatedAt,
            })
            .ToListAsync();

        var total = await _db.Reviews.CountAsync(r => r.Status == "approved");

        var reviews = rows.Select(r => new {
            r.id, r.productId, r.productName, r.productImage,
            customerName = MaskedName(r.first, r.last),
            r.rating, r.text, r.imageUrls, r.createdAt,
        });

        return Ok(new { success = true, total, reviews });
    }

    /// <summary>
    /// "Yogita" -> "Y***a". The review is public; the name of the person who
    /// wrote it is not something they agreed to publish, and a first name plus a
    /// town is enough to find someone. Enough is left that a shopper reads it as
    /// a person rather than a blank.
    /// </summary>
    private static string MaskedName(string? first, string? last)
    {
        var n = (first ?? "").Trim();
        if (n.Length == 0) n = (last ?? "").Trim();
        if (n.Length == 0) return "Verified buyer";
        if (n.Length <= 2) return $"{n[0]}***";
        return $"{n[0]}***{n[^1]}";
    }

    // GET /api/reviews/product/{productId}
    [HttpGet("product/{productId:int}")]
    public async Task<IActionResult> GetByProduct(int productId)
    {
        // PERF-7: Select projection — only fetch needed columns
        var reviews = await _db.Reviews
            .Where(r => r.ProductId == productId && r.Status == "approved")
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new {
                id = r.Id,
                productId = r.ProductId,
                customerId = r.CustomerId,
                customerName = r.Customer != null ? r.Customer.FirstName + " " + r.Customer.LastName : null,
                rating = r.Rating,
                text = r.Body ?? "",
                status = r.Status,
                orderId = r.OrderId ?? r.Title,
                imageUrls = r.ImageUrls,
                createdAt = r.CreatedAt
            })
            .ToListAsync();

        return Ok(new { success = true, reviews });
    }

    // POST /api/reviews
    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Submit([FromBody] ReviewSubmitRequest req)
    {
        var product = await _db.Products.FindAsync(req.ProductId);
        if (product is null)
            return NotFound(new { success = false, message = "Product not found." });

        if (req.Rating < 1 || req.Rating > 5)
            return BadRequest(new { success = false, message = "Rating must be between 1 and 5." });

        if (string.IsNullOrWhiteSpace(req.Text))
            return BadRequest(new { success = false, message = "Review text is required." });

        int? customerId = null;
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub");
        if (int.TryParse(userId, out var parsedId) && parsedId > 0)
            customerId = parsedId;

        // A review has to come from an order that was actually received.
        //
        // Until now the order id was taken from the request and never looked
        // at: anyone signed in could review anything, under any order number,
        // as many times as they liked, and the "verified purchase" the shop
        // shows beside a review meant nothing at all. The form already offers
        // only delivered orders and only the items inside them, so nothing a
        // real customer can do is blocked here — this just makes the server
        // insist on what the page already shows.
        var orderId = (req.OrderId ?? "").Trim();
        if (orderId.Length == 0)
            return BadRequest(new { success = false, message = "Please choose which order this is about." });

        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order is null)
            return BadRequest(new { success = false, message = "We could not find that order." });

        if (order.Status != "Delivered")
            return BadRequest(new { success = false, message = "You can write a review once the order has been delivered." });

        // It has to be the caller's own order. Matched on the customer id, and
        // on the email as well, because orders placed before signing in carry
        // the address but not the id.
        var callerEmail = (User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? "").Trim().ToLowerInvariant();
        var buyer = ParseJson(order.CustomerJson);
        var buyerId = JsonStr(buyer, "id");
        var buyerEmail = (JsonStr(buyer, "email") ?? "").Trim().ToLowerInvariant();

        var ownsIt = (customerId is not null && buyerId == customerId.Value.ToString())
                  || (callerEmail.Length > 0 && callerEmail == buyerEmail);
        if (!ownsIt)
            return BadRequest(new { success = false, message = "That order belongs to a different account." });

        // And the order has to contain this product. Otherwise one delivered
        // order would unlock a review on all one hundred and sixty-five.
        if (!OrderHasProduct(order.CartJson, req.ProductId))
            return BadRequest(new { success = false, message = "That product was not in this order." });

        // One review per product per order. A second one is not a mistake to
        // swallow quietly — the customer should be told it is already there.
        var already = await _db.Reviews.AnyAsync(r => r.OrderId == orderId && r.ProductId == req.ProductId);
        if (already)
            return Conflict(new { success = false, message = "You have already reviewed this product for this order." });

        // Only accept photo URLs that we issued ourselves (from /api/reviews/upload) — max 3.
        var images = (req.Images ?? new List<string>())
            .Where(u => !string.IsNullOrWhiteSpace(u) && u.StartsWith("/api/reviews/image/", StringComparison.Ordinal))
            .Distinct()
            .Take(3)
            .ToList();

        _db.Reviews.Add(new Review
        {
            ProductId = req.ProductId,
            CustomerId = customerId,
            Rating = (short)req.Rating,
            Body = req.Text.Trim(),
            // BUG-5: Store OrderId in dedicated column; Title kept null
            OrderId = orderId,
            ImageUrls = images.Count > 0 ? System.Text.Json.JsonSerializer.Serialize(images) : null,
            Status = "pending",
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await _db.SaveChangesAsync();

        return Ok(new { success = true, message = "Review submitted for approval." });
    }

    // GET /api/reviews/mine?productId=12
    //
    // What this customer has already written about this product, whatever its
    // state. The public list only carries approved reviews, so without this the
    // form has no way of knowing a review is already there - which is how the
    // product page came to offer "Write a Review" to somebody who had written
    // one an hour earlier and was waiting for it to be approved.
    [HttpGet("mine")]
    [Authorize]
    public async Task<IActionResult> Mine([FromQuery] int productId)
    {
        var customerId = CallerCustomerId();
        if (customerId is null) return Ok(new { success = true, reviews = Array.Empty<object>() });

        var mine = await _db.Reviews
            .Where(r => r.ProductId == productId && r.CustomerId == customerId)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new {
                id = r.Id,
                orderId = r.OrderId ?? r.Title,
                rating = r.Rating,
                text = r.Body ?? "",
                status = r.Status,
                imageUrls = r.ImageUrls,
                createdAt = r.CreatedAt,
                updatedAt = r.UpdatedAt,
            })
            .ToListAsync();

        return Ok(new { success = true, reviews = mine });
    }

    // PUT /api/reviews/{id}
    //
    // A review can be changed; it cannot be doubled. One order and one product
    // give the customer one review, and if they want to say something else they
    // say it in that same review rather than beside it. The alternative - a
    // second review from the same purchase - is how a product page fills up with
    // one person's second thoughts.
    //
    // An edited review goes back into the approval queue. It has to: the words
    // the shop approved are not the words that would now be on the page, and a
    // one-star rewrite of an approved five-star review must not slip past
    // unseen.
    [HttpPut("{id:int}")]
    [Authorize]
    public async Task<IActionResult> Update(int id, [FromBody] ReviewUpdateRequest req)
    {
        var customerId = CallerCustomerId();
        if (customerId is null)
            return Unauthorized(new { success = false, message = "Please sign in again." });

        var review = await _db.Reviews.FirstOrDefaultAsync(r => r.Id == id);
        if (review is null)
            return NotFound(new { success = false, message = "That review no longer exists." });

        if (review.CustomerId != customerId)
            return StatusCode(403, new { success = false, message = "That review belongs to somebody else." });

        if (req.Rating < 1 || req.Rating > 5)
            return BadRequest(new { success = false, message = "Rating must be between 1 and 5." });

        if (string.IsNullOrWhiteSpace(req.Text))
            return BadRequest(new { success = false, message = "Review text is required." });

        // Photos the caller sends replace the ones that were there. Only paths
        // this server issued are accepted, exactly as on the way in.
        var images = (req.Images ?? new List<string>())
            .Where(u => !string.IsNullOrWhiteSpace(u) && u.StartsWith("/api/reviews/image/", StringComparison.Ordinal))
            .Distinct()
            .Take(3)
            .ToList();

        review.Rating = (short)req.Rating;
        review.Body = req.Text.Trim();
        review.ImageUrls = images.Count > 0 ? System.Text.Json.JsonSerializer.Serialize(images) : null;
        review.Status = "pending";
        review.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, message = "Your review has been updated and sent for approval." });
    }

    /// <summary>The signed-in customer, from whichever claim carries the id.</summary>
    private int? CallerCustomerId()
    {
        var raw = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub");
        return int.TryParse(raw, out var id) && id > 0 ? id : null;
    }

    // PATCH /api/reviews/{id}/approve
    [HttpPatch("{id:int}/approve")]
    [Authorize]
    [RequirePerm("reviews")]
    public Task<IActionResult> Approve(int id) => SetStatus(id, "approved");

    // PATCH /api/reviews/{id}/reject
    [HttpPatch("{id:int}/reject")]
    [Authorize]
    [RequirePerm("reviews")]
    public Task<IActionResult> Reject(int id) => SetStatus(id, "rejected");

    // DELETE /api/reviews/{id}
    [HttpDelete("{id:int}")]
    [Authorize]
    [RequirePerm("reviews")]
    public async Task<IActionResult> Delete(int id)
    {
        var review = await _db.Reviews.FindAsync(id);
        if (review is null) return NotFound();

        _db.Reviews.Remove(review);
        await _db.SaveChangesAsync();
        ProductsController.BustCache();   // product rating/count is computed from reviews → refresh listings
        return Ok(new { success = true });
    }

    private async Task<IActionResult> SetStatus(int id, string status)
    {
        var review = await _db.Reviews.FindAsync(id);
        if (review is null) return NotFound();

        review.Status = status;
        await _db.SaveChangesAsync();
        ProductsController.BustCache();   // approving/rejecting changes the product's avg rating → refresh listings
        return Ok(new { success = true, review = ToDto(review) });
    }

    private static object ToDto(Review r) => new
    {
        id = r.Id,
        productId = r.ProductId,
        productName = r.Product?.Name,
        customerId = r.CustomerId,
        customerName = r.Customer is null
            ? null
            : string.Join(" ", new[] { r.Customer.FirstName, r.Customer.LastName }.Where(x => !string.IsNullOrWhiteSpace(x))),
        rating = r.Rating,
        text = r.Body ?? "",
        status = r.Status,
        // BUG-5: Use OrderId column; fall back to Title for legacy records
        orderId = r.OrderId ?? r.Title,
        createdAt = r.CreatedAt
    };

    private static JsonElement? ParseJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<JsonElement>(json); } catch { return null; }
    }

    private static string? JsonStr(JsonElement? el, string key)
    {
        if (el is null || !el.Value.TryGetProperty(key, out var v)) return null;
        return v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString();
    }

    /// Was this product one of the lines on that order? The cart is stored as
    /// the browser sent it, where a line's id is a string, so it is compared
    /// as one rather than parsed and hoped over.
    private static bool OrderHasProduct(string? cartJson, int productId)
    {
        var want = productId.ToString();
        try
        {
            var lines = JsonSerializer.Deserialize<List<JsonElement>>(cartJson ?? "[]") ?? new();
            foreach (var l in lines)
            {
                if (!l.TryGetProperty("id", out var idEl)) continue;
                var id = idEl.ValueKind == JsonValueKind.String ? idEl.GetString() : idEl.ToString();
                if (id == want) return true;
            }
        }
        catch { /* an unreadable cart is not a licence to review anything */ }
        return false;
    }

}

public record ReviewSubmitRequest(int ProductId, int Rating, string Text, string? OrderId, List<string>? Images = null);

// No order id here: which purchase the review belongs to was settled when it
// was written, and an edit must not be able to move it to a different one.
public record ReviewUpdateRequest(int Rating, string Text, List<string>? Images = null);
