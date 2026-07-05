using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using System.Text.Json;
using System.Text.Json.Nodes;
using MahalaxmiApi.Data;
using MahalaxmiApi.DTOs;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;
    // Incremented on every write — included in cache key so old entries are ignored instantly
    private static long _cacheVer = 0;

    public ProductsController(AppDbContext db, IMemoryCache cache)
    {
        _db = db;
        _cache = cache;
    }

    /// Call after any write (update/delete/bulk) to bust all product list caches.
    private static void BustCache() =>
        System.Threading.Interlocked.Increment(ref _cacheVer);

    // GET /api/products
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? category,
        [FromQuery] string? subcategory,
        [FromQuery] bool? bestSeller,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var isAdmin = HttpContext.User.Identity?.IsAuthenticated == true;

        // PERF: Cache public product lists for 60 seconds (admin bypasses cache)
        if (!isAdmin)
        {
            var cacheKey = $"products_v{_cacheVer}_{category ?? ""}_{subcategory ?? ""}_{bestSeller}_{page}_{pageSize}";
            if (_cache.TryGetValue(cacheKey, out object? cached) && cached is not null)
                return Ok(cached);

            var query = _db.Products.AsQueryable()
                .Where(p => p.StockStatus != "Inactive");

            if (!string.IsNullOrWhiteSpace(category))
                {
                    var catSearch = category.Replace("-", " ");
                    query = query.Where(p => EF.Functions.ILike(p.Category, catSearch));
                }
            if (!string.IsNullOrWhiteSpace(subcategory))
                query = query.Where(p => EF.Functions.ILike(p.Subcategory, subcategory));

            var sales = await GetSalesCountsAsync();

            List<Product> pageItems;
            int total;
            if (bestSeller == true)
            {
                // Best Sellers = automatically the top-selling products (by quantity
                // sold, from orders) — not a manual flag.
                var ranked = (await query.ToListAsync())
                    .Where(p => sales.GetValueOrDefault(p.Id) > 0)
                    .OrderByDescending(p => sales.GetValueOrDefault(p.Id))
                    .ThenByDescending(p => p.Id)
                    .ToList();
                total = ranked.Count;
                pageItems = ranked.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            }
            else
            {
                total = await query.CountAsync();
                pageItems = await query
                    .OrderByDescending(p => p.Newest)
                    .ThenByDescending(p => p.Id)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .ToListAsync();
            }

            var reviews = await GetReviewAggAsync(pageItems.Select(p => p.Id).ToList());
            var products = pageItems.Select(p =>
            {
                var dto = ToDto(p);
                int rc = 0; double ar = 0;
                if (reviews.TryGetValue(p.Id, out var r)) { rc = r.Count; ar = Math.Round(r.Avg, 1); }
                return dto with { ReviewCount = rc, AvgRating = ar, SoldCount = sales.GetValueOrDefault(p.Id) };
            }).ToList();

            var result = new { success = true, products, total, page, pageSize };
            _cache.Set(cacheKey, (object)result, TimeSpan.FromSeconds(60));
            return Ok(result);
        }

        // Admin: always fresh from DB
        var adminQuery = _db.Products.AsQueryable();

        if (!string.IsNullOrWhiteSpace(category))
            {
                var catSearch2 = category.Replace("-", " ");
                adminQuery = adminQuery.Where(p => EF.Functions.ILike(p.Category, catSearch2));
            }
        if (!string.IsNullOrWhiteSpace(subcategory))
            adminQuery = adminQuery.Where(p => EF.Functions.ILike(p.Subcategory, subcategory));
        if (bestSeller.HasValue)
            adminQuery = adminQuery.Where(p => p.BestSeller == bestSeller.Value);

        var adminTotal = await adminQuery.CountAsync();
        var adminProducts = await adminQuery
            .OrderByDescending(p => p.Newest)
            .ThenByDescending(p => p.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(p => ToDto(p))
            .ToListAsync();

        return Ok(new { success = true, products = adminProducts, total = adminTotal, page, pageSize });
    }

    // GET /api/products/next-sku  (Admin only)
    [HttpGet("next-sku")]
    [Authorize(Policy = "AdminOrStaff")]
    public async Task<IActionResult> GetNextSku()
    {
        var skus = await _db.Products
            .Where(p => p.Sku != null)
            .Select(p => p.Sku!)
            .ToListAsync();

        int max = 1000;
        foreach (var sku in skus)
        {
            if (System.Text.RegularExpressions.Regex.IsMatch(sku, @"^MFH\d{4,5}$"))
            {
                if (int.TryParse(sku.Substring(3), out int n) && n > max)
                    max = n;
            }
        }

        return Ok(new { sku = $"MFH{max + 1}" });
    }

    // GET /api/products/{id}
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var p = await _db.Products.FindAsync(id);
        if (p is null) return NotFound(new { success = false, message = "Product not found." });
        return Ok(new { success = true, product = ToDto(p) });
    }

    // POST /api/products  (Admin only — bulk replace)
    [HttpPost]
    [Authorize(Policy = "AdminOrStaff")]
    public async Task<IActionResult> BulkSave([FromBody] BulkSaveRequest req)
    {
        if (req.Products is null || req.Products.Count == 0)
            return BadRequest(new { success = false, message = "products array required." });

        // BUG-3: Check for duplicate SKUs within the submitted batch BEFORE any DB changes
        var seenSkus = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var dto in req.Products)
        {
            var s = dto.Sku?.Trim();
            if (!string.IsNullOrWhiteSpace(s) && !seenSkus.Add(s))
                return Conflict(new { success = false, message = $"Duplicate SKU '{s}' found in the submitted batch. Each product must have a unique SKU." });
        }

        if (req.ReplaceAll)
        {
            _db.Products.RemoveRange(_db.Products);
            await _db.SaveChangesAsync();
        }

        var created = 0;
        var updated = 0;
        var i = 1;

        foreach (var dto in req.Products)
        {
            // BUG-4: Increment counter before continue so skipped items don't break numbering
            var currentI = i++;

            if (string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.Category))
                continue;

            // Duplicate SKU check — reject if SKU already used by a different product in DB
            var sku = dto.Sku?.Trim();
            if (!string.IsNullOrWhiteSpace(sku) && !req.ReplaceAll)
            {
                var existing = await _db.Products
                    .Where(p => p.Sku == sku && (dto.DbId == null || p.Id != dto.DbId))
                    .FirstOrDefaultAsync();
                if (existing != null)
                    return Conflict(new { success = false, message = $"SKU '{sku}' already exists for product '{existing.Name}'. Please use a unique SKU." });
            }

            var product = await FindUpsertTarget(dto);
            if (product is null)
            {
                product = new Product();
                _db.Products.Add(product);
                created++;
            }
            else
            {
                updated++;
            }

            ApplyProduct(product, dto, currentI);
        }

        await _db.SaveChangesAsync();
        BustCache();
        return Ok(new { success = true, saved = created + updated, created, updated, replaced = req.ReplaceAll });
    }

    // PUT /api/products/{id}  (Admin only)
    [HttpPut("{id:int}")]
    [Authorize(Policy = "AdminOrStaff")]
    public async Task<IActionResult> Update(int id, [FromBody] ProductCreateRequest req)
    {
        var p = await _db.Products.FindAsync(id);
        if (p is null) return NotFound(new { success = false, message = "Not found." });

        // Duplicate SKU check — reject if SKU already used by a different product
        var sku = req.Sku?.Trim();
        if (!string.IsNullOrWhiteSpace(sku))
        {
            var duplicate = await _db.Products
                .Where(x => x.Sku == sku && x.Id != id)
                .FirstOrDefaultAsync();
            if (duplicate != null)
                return Conflict(new { success = false, message = $"SKU '{sku}' is already used by product '{duplicate.Name}'. Please use a unique SKU." });
        }

        ApplyProduct(p, req);

        await _db.SaveChangesAsync();
        BustCache();
        return Ok(new { success = true, product = ToDto(p) });
    }

    // PATCH /api/products/{id}/stock  (Admin/Staff) — update ONLY the stock status.
    // Lightweight so the Stock Manager toggle doesn't need to resend the whole product.
    [HttpPatch("{id:int}/stock")]
    [Authorize(Policy = "AdminOrStaff")]
    public async Task<IActionResult> UpdateStock(int id, [FromBody] StockUpdateRequest req)
    {
        var p = await _db.Products.FindAsync(id);
        if (p is null) return NotFound(new { success = false, message = "Product not found." });

        var status = (req.Stock ?? "").Trim();
        var allowed = new[] { "In Stock", "Out of Stock", "Limited Stock" };
        if (!allowed.Contains(status))
            return BadRequest(new { success = false, message = "Invalid stock status." });

        p.StockStatus = status;
        await _db.SaveChangesAsync();
        BustCache();
        return Ok(new { success = true, product = ToDto(p) });
    }

    // DELETE /api/products/{id}  (Admin only)
    [HttpDelete("{id:int}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Delete(int id)
    {
        var p = await _db.Products.FindAsync(id);
        if (p is null) return NotFound(new { message = "Product not found." });
        try
        {
            _db.Products.Remove(p);
            await _db.SaveChangesAsync();
            BustCache();
            return Ok(new { success = true });
        }
        catch (Microsoft.EntityFrameworkCore.DbUpdateException ex)
        {
            var inner = ex.InnerException?.Message ?? ex.Message;
            if (inner.Contains("foreign key") || inner.Contains("violates"))
                return Conflict(new { message = "Cannot delete: product is linked to existing orders. Mark it Out of Stock instead." });
            return StatusCode(500, new { message = "Delete failed: " + inner });
        }
    }

    private async Task<Product?> FindUpsertTarget(ProductCreateRequest dto)
    {
        if (dto.DbId.GetValueOrDefault() > 0)
            return await _db.Products.FindAsync(dto.DbId!.Value);

        var sku = dto.Sku?.Trim();
        if (!string.IsNullOrWhiteSpace(sku))
        {
            var bySku = await _db.Products.Where(p => p.Sku == sku).Take(2).ToListAsync();
            if (bySku.Count == 1) return bySku[0];
        }

        var name = dto.Name.Trim();
        var category = dto.Category.Trim();
        return await _db.Products.FirstOrDefaultAsync(p => p.Name == name && p.Category == category);
    }

    // Auto-convert base64 image to file on disk; returns file path or original value
    private static string? SaveBase64Image(string? value, string fileNameHint)
    {
        if (string.IsNullOrWhiteSpace(value)) return value;
        var m = System.Text.RegularExpressions.Regex.Match(value, @"^data:image/(\w+);base64,(.+)$");
        if (!m.Success) return value; // already a URL/path — keep as-is

        var ext  = m.Groups[1].Value.ToLower() == "jpeg" ? "jpg" : m.Groups[1].Value.ToLower();
        var dir  = "/var/www/mahalaxmi-nextjs/frontend/public/product-images";
        try
        {
            System.IO.Directory.CreateDirectory(dir);
            var bytes    = Convert.FromBase64String(m.Groups[2].Value);
            var fileName = $"{fileNameHint}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.{ext}";
            var fullPath = System.IO.Path.Combine(dir, fileName);
            System.IO.File.WriteAllBytes(fullPath, bytes);
            return $"/product-images/{fileName}";
        }
        catch
        {
            return value; // fallback: keep base64 if file write fails
        }
    }

    private static void ApplyProduct(Product p, ProductCreateRequest req, int fallbackNewest = 0)
    {
        var sku = req.Sku?.Trim();
        p.Sku           = !string.IsNullOrWhiteSpace(sku)
            ? sku
            : (!string.IsNullOrWhiteSpace(p.Sku) ? p.Sku : GenerateSku());
        p.Name          = req.Name.Trim();
        p.Category      = req.Category.Trim();
        p.Subcategory   = req.Subcategory?.Trim() ?? "";
        p.Price         = req.Price;
        p.DiscountPrice = req.DiscountPrice;
        p.MaxPrice      = req.MaxPrice;
        p.StockStatus   = req.Stock?.Trim() ?? "In Stock";
        p.Description   = req.Description?.Trim();
        p.Newest        = req.Newest > 0 ? req.Newest : (p.Newest > 0 ? p.Newest : fallbackNewest);
        // Auto-save base64 image as file — no more massive DB rows
        p.Image         = SaveBase64Image(req.Image?.Trim(), $"product-img");
        p.BestSeller    = req.BestSeller;
        p.ExtraJson     = BuildExtraJsonWithImages(req);
        p.UpdatedAt     = DateTimeOffset.UtcNow;
    }

    // Recursively find and convert any base64 image string anywhere in a JsonNode tree
    private static JsonNode? FixBase64Recursive(JsonNode? node, ref int counter)
    {
        if (node is null) return null;

        if (node is JsonValue && node.GetValueKind() == System.Text.Json.JsonValueKind.String)
        {
            var str = node.GetValue<string>();
            if (!string.IsNullOrEmpty(str) && str.StartsWith("data:image"))
            {
                counter++;
                return JsonValue.Create(SaveBase64Image(str, $"auto-img-{counter}"));
            }
            return node;
        }

        if (node is JsonArray arr)
        {
            for (int i = 0; i < arr.Count; i++)
            {
                var child = arr[i];
                var result = FixBase64Recursive(child, ref counter);
                if (!ReferenceEquals(result, child))
                    arr[i] = result;
            }
            return arr;
        }

        if (node is JsonObject obj)
        {
            foreach (var key in obj.Select(kv => kv.Key).ToList())
            {
                var child = obj[key];
                var result = FixBase64Recursive(child, ref counter);
                if (!ReferenceEquals(result, child))
                    obj[key] = result;
            }
            return obj;
        }

        return node;
    }

    // Converts ALL base64 images anywhere in extra_json to files (recursive)
    private static string? BuildExtraJsonWithImages(ProductCreateRequest req)
    {
        var root = new JsonObject();

        if (req.ExtraJson is System.Text.Json.JsonElement element)
            root = ExtraToObject(element);
        else if (req.ExtraJson is string raw && !string.IsNullOrWhiteSpace(raw))
            root = JsonNode.Parse(raw)?.AsObject() ?? new JsonObject();

        // Recursively convert ALL base64 images — works for any key at any depth
        var counter = 0;
        root = (FixBase64Recursive(root, ref counter) as JsonObject) ?? root;

        if (!string.IsNullOrWhiteSpace(req.HsnCode))
            root["hsnCode"] = req.HsnCode.Trim();
        if (req.GstRate.HasValue)
            root["gstRate"] = req.GstRate.Value;
        if (req.Qty.HasValue)
            root["qty"] = req.Qty.Value;
        if (req.PackOf.HasValue)
            root["packOf"] = req.PackOf.Value;
        if (req.BestSeller)
            root["bestSeller"] = true;

        return root.Count == 0 ? null : root.ToJsonString();
    }

    private static string GenerateSku()
        => $"MFH{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() % 100000000:D8}{Random.Shared.Next(100, 999)}";

    private static string? BuildExtraJson(ProductCreateRequest req)
    {
        var root = new JsonObject();

        if (req.ExtraJson is JsonElement element)
            root = ExtraToObject(element);
        else if (req.ExtraJson is string raw && !string.IsNullOrWhiteSpace(raw))
            root = JsonNode.Parse(raw)?.AsObject() ?? new JsonObject();

        if (!string.IsNullOrWhiteSpace(req.HsnCode))
            root["hsnCode"] = req.HsnCode.Trim();
        if (req.GstRate.HasValue)
            root["gstRate"] = req.GstRate.Value;
        if (req.Qty.HasValue)
            root["qty"] = req.Qty.Value;
        if (req.PackOf.HasValue)
            root["packOf"] = req.PackOf.Value;
        if (req.BestSeller)
            root["bestSeller"] = true;

        return root.Count == 0 ? null : root.ToJsonString();
    }

    private static JsonObject ExtraToObject(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
            return JsonNode.Parse(element.GetRawText())?.AsObject() ?? new JsonObject();

        if (element.ValueKind == JsonValueKind.String)
        {
            var raw = element.GetString();
            if (!string.IsNullOrWhiteSpace(raw))
                return JsonNode.Parse(raw)?.AsObject() ?? new JsonObject();
        }

        return new JsonObject();
    }

    private static JsonObject? ReadExtra(Product p)
    {
        if (string.IsNullOrWhiteSpace(p.ExtraJson)) return null;
        try { return JsonNode.Parse(p.ExtraJson)?.AsObject(); }
        catch { return null; }
    }

    private static string? ExtraString(JsonObject? extra, string key)
    {
        var node = extra?[key];
        if (node is null) return null;
        try { return node.GetValue<string>(); }
        catch { return node.ToJsonString().Trim('"'); }
    }

    private static decimal? ExtraDecimal(JsonObject? extra, string key)
    {
        var value = ExtraString(extra, key);
        return decimal.TryParse(value, out var n) ? n : null;
    }

    private static int? ExtraInt(JsonObject? extra, string key)
    {
        var value = ExtraString(extra, key);
        return int.TryParse(value, out var n) ? n : null;
    }

    // Approved-review count + average rating per product.
    private async Task<Dictionary<int, (int Count, double Avg)>> GetReviewAggAsync(List<int> ids)
    {
        if (ids.Count == 0) return new();
        var agg = await _db.Reviews
            .Where(r => ids.Contains(r.ProductId) && r.Status == "approved")
            .GroupBy(r => r.ProductId)
            .Select(g => new { Pid = g.Key, Count = g.Count(), Avg = g.Average(x => (double)x.Rating) })
            .ToListAsync();
        return agg.ToDictionary(x => x.Pid, x => (x.Count, x.Avg));
    }

    // Quantity sold per product, parsed from non-cancelled orders' cart JSON.
    private async Task<Dictionary<int, int>> GetSalesCountsAsync()
    {
        var carts = await _db.SiteOrders
            .Where(o => o.Status != "Cancelled" && o.CartJson != null)
            .Select(o => o.CartJson!)
            .ToListAsync();
        var counts = new Dictionary<int, int>();
        foreach (var cj in carts)
        {
            try
            {
                using var doc = JsonDocument.Parse(cj);
                if (doc.RootElement.ValueKind != JsonValueKind.Array) continue;
                foreach (var item in doc.RootElement.EnumerateArray())
                {
                    if (!item.TryGetProperty("id", out var idEl)) continue;
                    int pid;
                    if (idEl.ValueKind == JsonValueKind.String) { if (!int.TryParse(idEl.GetString(), out pid)) continue; }
                    else if (idEl.ValueKind == JsonValueKind.Number) { if (!idEl.TryGetInt32(out pid)) continue; }
                    else continue;
                    int qty = item.TryGetProperty("quantity", out var qEl) && qEl.ValueKind == JsonValueKind.Number && qEl.TryGetInt32(out var q) ? q : 1;
                    counts[pid] = counts.GetValueOrDefault(pid) + qty;
                }
            }
            catch { /* ignore malformed cart json */ }
        }
        return counts;
    }

    private static ProductDto ToDto(Product p)
    {
        var extra = ReadExtra(p);
        return new ProductDto(
            p.Id, p.Sku, p.Name, p.Category, p.Subcategory,
            p.Price, p.DiscountPrice, p.MaxPrice,
            p.StockStatus, p.Description, p.Newest, p.Image, p.BestSeller,
            p.ExtraJson,
            ExtraString(extra, "hsnCode"),
            ExtraDecimal(extra, "gstRate"),
            ExtraInt(extra, "qty"),
            ExtraInt(extra, "packOf")
        );
    }
}
