using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReviewsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ReviewsController(AppDbContext db) => _db = db;

    // GET /api/reviews/pending
    [HttpGet("pending")]
    [Authorize(Policy = "AdminOnly")]
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
                createdAt = r.CreatedAt
            })
            .ToListAsync();

        return Ok(new { success = true, reviews });
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

        _db.Reviews.Add(new Review
        {
            ProductId = req.ProductId,
            CustomerId = customerId,
            Rating = (short)req.Rating,
            Body = req.Text.Trim(),
            // BUG-5: Store OrderId in dedicated column; Title kept null
            OrderId = req.OrderId,
            Status = "pending",
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await _db.SaveChangesAsync();

        return Ok(new { success = true, message = "Review submitted for approval." });
    }

    // PATCH /api/reviews/{id}/approve
    [HttpPatch("{id:int}/approve")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> Approve(int id) => SetStatus(id, "approved");

    // PATCH /api/reviews/{id}/reject
    [HttpPatch("{id:int}/reject")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> Reject(int id) => SetStatus(id, "rejected");

    // DELETE /api/reviews/{id}
    [HttpDelete("{id:int}")]
    [Authorize(Policy = "AdminOnly")]
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
}

public record ReviewSubmitRequest(int ProductId, int Rating, string Text, string? OrderId);
