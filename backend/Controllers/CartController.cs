using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

/// Keeps a copy of a signed-in shopper's basket, so a basket left overnight can
/// be mentioned once in the morning. The browser stays in charge of the cart;
/// this is only a copy the shop can see.
[ApiController]
[Route("api/cart")]
public class CartController : ControllerBase
{
    private readonly AppDbContext _db;
    public CartController(AppDbContext db) { _db = db; }

    public record CartLine(int? DbId, string? Name, int? Quantity, decimal? Price, string? Image);
    public record SyncRequest(List<CartLine>? Items, decimal? Value);

    /// The signed-in customer, or null. Staff and admin tokens are not
    /// customers and have no basket to keep.
    private int? CallerCustomerId()
    {
        if (User.Identity?.IsAuthenticated != true) return null;
        if (User.FindFirst("role")?.Value != "customer") return null;
        var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        return int.TryParse(sub, out var id) ? id : null;
    }

    // POST /api/cart/sync
    //
    // Called when the basket changes. An empty basket DELETES the row rather
    // than storing a row of nothing: an emptied cart is not an abandoned one,
    // and reminding someone about a basket they deliberately cleared is the
    // fastest way to be marked as spam.
    [HttpPost("sync")]
    [Authorize]
    [EnableRateLimiting("events")]
    public async Task<IActionResult> Sync([FromBody] SyncRequest? req)
    {
        var customerId = CallerCustomerId();
        if (customerId is null) return Ok(new { success = true, skipped = true });

        var row = await _db.AbandonedCarts.FirstOrDefaultAsync(c => c.CustomerId == customerId);

        var items = (req?.Items ?? new List<CartLine>())
            .Where(i => i.DbId.GetValueOrDefault() > 0)
            .Take(50)
            .Select(i => new
            {
                id = i.DbId!.Value,
                name = (i.Name ?? "").Trim(),
                qty = Math.Clamp(i.Quantity ?? 1, 1, 99),
                price = Math.Max(0m, i.Price ?? 0m),
                image = (i.Image ?? "").Trim(),
            })
            .ToList();

        if (items.Count == 0)
        {
            if (row is not null) { _db.AbandonedCarts.Remove(row); await _db.SaveChangesAsync(); }
            return Ok(new { success = true, cleared = true });
        }

        var count = items.Sum(i => i.qty);
        var value = req?.Value is > 0 ? req.Value.Value : items.Sum(i => i.price * i.qty);
        var json = JsonSerializer.Serialize(items);

        if (row is null)
        {
            _db.AbandonedCarts.Add(new AbandonedCart
            {
                CustomerId = customerId.Value,
                ItemsJson = json, ItemCount = count, Value = value,
            });
        }
        else
        {
            row.ItemsJson = json;
            row.ItemCount = count;
            row.Value = value;
            row.UpdatedAt = DateTimeOffset.UtcNow;
            // A changed basket is a new basket: it has earned its one reminder
            // again. Without this, someone who adds something a week later
            // would never be reminded, because the old stamp is still there.
            row.RemindedAt = null;
        }

        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }
}
