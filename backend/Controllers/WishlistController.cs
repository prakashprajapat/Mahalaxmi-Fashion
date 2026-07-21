using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.DTOs;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

// Server-synced wishlist for logged-in customers. The storefront keeps a localStorage copy
// for guests; on login it MERGES the local ids up to the server and then hydrates from here,
// so a customer's saved items follow them across devices.
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class WishlistController : ControllerBase
{
    private readonly AppDbContext _db;
    public WishlistController(AppDbContext db) => _db = db;

    private int? CurrentCustomerId()
    {
        var sub = User.FindFirstValue("sub");
        return int.TryParse(sub, out var id) ? id : null;
    }

    // GET /api/wishlist  → the customer's saved products (newest first)
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var customerId = CurrentCustomerId();
        if (customerId is null) return Unauthorized(new { success = false, message = "Not a customer." });

        var productIds = await _db.Wishlists
            .Where(w => w.CustomerId == customerId)
            .OrderByDescending(w => w.AddedAt)
            .Select(w => w.ProductId)
            .ToListAsync();

        var products = await LoadProductsAsync(productIds);
        return Ok(new { success = true, products });
    }

    // POST /api/wishlist/{productId}  → save a product (idempotent)
    [HttpPost("{productId:int}")]
    public async Task<IActionResult> Add(int productId)
    {
        var customerId = CurrentCustomerId();
        if (customerId is null) return Unauthorized(new { success = false, message = "Not a customer." });

        var exists = await _db.Products.AnyAsync(p => p.Id == productId);
        if (!exists) return NotFound(new { success = false, message = "Product not found." });

        var already = await _db.Wishlists.AnyAsync(w => w.CustomerId == customerId && w.ProductId == productId);
        if (!already)
        {
            _db.Wishlists.Add(new WishlistItem { CustomerId = customerId.Value, ProductId = productId });
            await _db.SaveChangesAsync();
        }
        return Ok(new { success = true });
    }

    // DELETE /api/wishlist/{productId}  → remove a saved product
    [HttpDelete("{productId:int}")]
    public async Task<IActionResult> Remove(int productId)
    {
        var customerId = CurrentCustomerId();
        if (customerId is null) return Unauthorized(new { success = false, message = "Not a customer." });

        var row = await _db.Wishlists.FirstOrDefaultAsync(w => w.CustomerId == customerId && w.ProductId == productId);
        if (row != null)
        {
            _db.Wishlists.Remove(row);
            await _db.SaveChangesAsync();
        }
        return Ok(new { success = true });
    }

    // POST /api/wishlist/merge  { productIds: [1,2,3] }  → union guest ids into the account,
    // then return the full merged list. Called once right after login.
    [HttpPost("merge")]
    public async Task<IActionResult> Merge([FromBody] MergeRequest req)
    {
        var customerId = CurrentCustomerId();
        if (customerId is null) return Unauthorized(new { success = false, message = "Not a customer." });

        var incoming = (req?.ProductIds ?? new List<int>()).Where(id => id > 0).Distinct().ToList();
        if (incoming.Count > 0)
        {
            var valid = await _db.Products.Where(p => incoming.Contains(p.Id)).Select(p => p.Id).ToListAsync();
            var existing = await _db.Wishlists
                .Where(w => w.CustomerId == customerId && incoming.Contains(w.ProductId))
                .Select(w => w.ProductId)
                .ToListAsync();
            var toAdd = valid.Except(existing).ToList();
            foreach (var pid in toAdd)
                _db.Wishlists.Add(new WishlistItem { CustomerId = customerId.Value, ProductId = pid });
            if (toAdd.Count > 0) await _db.SaveChangesAsync();
        }

        var productIds = await _db.Wishlists
            .Where(w => w.CustomerId == customerId)
            .OrderByDescending(w => w.AddedAt)
            .Select(w => w.ProductId)
            .ToListAsync();

        var products = await LoadProductsAsync(productIds);
        return Ok(new { success = true, products });
    }

    // Loads full products for the given ids, preserving the incoming order.
    private async Task<List<ProductDto>> LoadProductsAsync(List<int> ids)
    {
        if (ids.Count == 0) return new List<ProductDto>();
        var rows = await _db.Products.Where(p => ids.Contains(p.Id)).ToListAsync();
        var byId = rows.ToDictionary(p => p.Id);
        var ordered = new List<ProductDto>();
        foreach (var id in ids)
            if (byId.TryGetValue(id, out var p))
                ordered.Add(ToDto(p));
        return ordered;
    }

    // Mirror of ProductsController.ToDto (kept local to avoid coupling controllers).
    private static ProductDto ToDto(Product p)
    {
        JsonObject? extra = null;
        if (!string.IsNullOrWhiteSpace(p.ExtraJson))
        {
            try { extra = JsonNode.Parse(p.ExtraJson)?.AsObject(); } catch { extra = null; }
        }
        string? ExtraStr(string key)
        {
            var node = extra?[key];
            if (node is null) return null;
            try { return node.GetValue<string>(); } catch { return node.ToJsonString().Trim('"'); }
        }
        decimal? ExtraDec(string key) => decimal.TryParse(ExtraStr(key), out var n) ? n : null;
        int? ExtraInt(string key) => int.TryParse(ExtraStr(key), out var n) ? n : null;

        return new ProductDto(
            p.Id, p.Sku, p.Name, p.Category, p.Subcategory,
            p.Price, p.DiscountPrice, p.MaxPrice,
            p.StockStatus, p.Description, p.Newest, p.Image, p.BestSeller,
            p.ExtraJson,
            ExtraStr("hsnCode"), ExtraDec("gstRate"), ExtraInt("qty"), ExtraInt("packOf"),
            ShippingCharge: p.ShippingCharge
        );
    }

    public record MergeRequest(List<int>? ProductIds);
}
