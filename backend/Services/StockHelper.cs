using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.DTOs;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

// Variant-level stock tracking lives in products.extra_json → "variantMatrix"
// ({"M|Red": 4, "L|Red": 2} or {"M": 6}). Ye helper order place hone par qty
// ghata deta hai aur cancel/return par wapas jod deta hai. Jin products me
// variantMatrix nahi hai (untracked) unhe chhua nahi jata — sirf StockStatus
// string wala purana behaviour chalta rehta hai.
public static class StockHelper
{
    private static readonly JsonSerializerOptions CaseInsensitive = new() { PropertyNameCaseInsensitive = true };

    // Deducts stock for the given cart lines. MUST be called inside an open DB
    // transaction — product rows are locked with SELECT ... FOR UPDATE so two
    // concurrent checkouts can never both take the last piece.
    // Returns the names of products that had insufficient stock (their qty is
    // clamped at 0; the caller decides whether to reject the order).
    // Caller is responsible for SaveChanges/commit.
    public static async Task<List<string>> DeductAsync(AppDbContext db, IEnumerable<CartLineDto>? lines)
    {
        var insufficient = new List<string>();
        var list = (lines ?? Enumerable.Empty<CartLineDto>())
            .Where(l => !string.IsNullOrWhiteSpace(l.Sku)).ToList();
        if (list.Count == 0) return insufficient;

        var skus = list.Select(l => l.Sku!.Trim()).Distinct().ToList();
        // Row lock — held until the caller's transaction commits/rolls back.
        var prods = await db.Products
            .FromSqlInterpolated($"SELECT * FROM products WHERE sku = ANY({skus}) FOR UPDATE")
            .ToListAsync();
        var bySku = BySku(prods);

        foreach (var line in list)
        {
            if (!bySku.TryGetValue(line.Sku!.Trim(), out var prod)) continue;
            var qty = Math.Max(1, line.Quantity);
            if (ApplyDelta(prod, line.Size, line.Color, -qty, out var wasShort) && wasShort)
                insufficient.Add(prod.Name);
        }
        return insufficient;
    }

    // Adds cart quantities back (order Cancelled / Return). Best-effort: agar
    // cart json parse na ho ya key match na ho to chupchaap skip karta hai.
    public static async Task RestoreAsync(AppDbContext db, string? cartJson)
    {
        List<CartLineDto>? lines;
        try { lines = string.IsNullOrWhiteSpace(cartJson) ? null : JsonSerializer.Deserialize<List<CartLineDto>>(cartJson, CaseInsensitive); }
        catch { return; }
        if (lines is null || lines.Count == 0) return;

        var skus = lines.Where(l => !string.IsNullOrWhiteSpace(l.Sku)).Select(l => l.Sku!.Trim()).Distinct().ToList();
        if (skus.Count == 0) return;
        var prods = await db.Products.Where(p => p.Sku != null && skus.Contains(p.Sku)).ToListAsync();
        var bySku = BySku(prods);

        foreach (var line in lines)
        {
            var sku = line.Sku?.Trim();
            if (string.IsNullOrWhiteSpace(sku) || !bySku.TryGetValue(sku, out var prod)) continue;
            ApplyDelta(prod, line.Size, line.Color, Math.Max(1, line.Quantity), out _);
        }
    }

    private static Dictionary<string, Product> BySku(List<Product> prods) =>
        prods.Where(p => !string.IsNullOrWhiteSpace(p.Sku))
             .GroupBy(p => p.Sku!.Trim(), StringComparer.OrdinalIgnoreCase)
             .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

    // Applies +/- delta to the product's variantMatrix and refreshes StockStatus.
    // Returns false when the product has no variantMatrix (stock not tracked) or
    // no matrix key could be matched — in that case nothing is changed.
    private static bool ApplyDelta(Product prod, string? size, string? color, int delta, out bool insufficient)
    {
        insufficient = false;
        if (string.IsNullOrWhiteSpace(prod.ExtraJson)) return false;

        JsonObject? root;
        try { root = JsonNode.Parse(prod.ExtraJson) as JsonObject; }
        catch { return false; }
        if (root?["variantMatrix"] is not JsonObject matrix || matrix.Count == 0) return false;

        var s = (size ?? "").Trim();
        var c = (color ?? "").Trim();
        var candidates = new[] { $"{s}|{c}", s, c }
            .Where(k => !string.IsNullOrEmpty(k) && k != "|").ToList();

        string? key = null;
        foreach (var cand in candidates)
        {
            key = matrix.Select(kv => kv.Key)
                        .FirstOrDefault(k => string.Equals(k, cand, StringComparison.OrdinalIgnoreCase));
            if (key is not null) break;
        }
        // Single-variant product with a key we couldn't map (naming drift) — use that one key.
        if (key is null && matrix.Count == 1) key = matrix.First().Key;
        if (key is null) return false;

        var current = ReadInt(matrix[key]);
        var next = current + delta;
        if (next < 0) { insufficient = true; next = 0; }
        matrix[key] = next;

        var total = matrix.Sum(kv => ReadInt(kv.Value));
        prod.StockStatus = total <= 0 ? "Out of Stock" : total < 5 ? "Limited Stock" : "In Stock";
        prod.ExtraJson = root.ToJsonString();
        prod.UpdatedAt = DateTimeOffset.UtcNow;
        return true;
    }

    private static int ReadInt(JsonNode? node)
    {
        if (node is null) return 0;
        try { return node.GetValue<int>(); }
        catch
        {
            try { return (int)node.GetValue<double>(); }
            catch { return 0; }
        }
    }
}
