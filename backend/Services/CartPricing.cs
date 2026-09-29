using System.Text.Json;
using MahalaxmiApi.Data;
using Microsoft.EntityFrameworkCore;

namespace MahalaxmiApi.Services;

// What a stored cart is worth, priced from our own catalogue.
//
// PlaceOrder already refuses to believe the browser about money: it looks every
// line up by SKU (or product id) and adds up OUR prices, and a prepaid order is
// rejected unless the amount captured covers that figure. That gate is sound.
//
// The Razorpay webhook walks around it. When a browser closes after paying but
// before PlaceOrder runs, the webhook builds the order itself so the payment is
// never lost — and it built it from the amount the browser had asked for, with
// no gate at all. Tamper the amount, pay it, close the tab: an order appears,
// marked paid, holding a full cart. The one path that skips the gate is the one
// an attacker only has to close a window to reach.
//
// This gives the webhook the same footing: the catalogue's own value for the
// cart it stored. It is a FLOOR, deliberately conservative — per-product
// shipping is left out, because whether an order carries it depends on the
// address, and a floor that is too high would hold back honest orders.
public static class CartPricing
{
    /// <summary>
    /// What the lines in this stored cart are worth at our own prices, or null
    /// when that cannot be established — an unknown SKU, an unparseable cart, a
    /// line naming no product. Null means "do not conclude it was paid for".
    /// </summary>
    public static async Task<decimal?> ItemValueAsync(AppDbContext db, string? cartJson)
    {
        if (string.IsNullOrWhiteSpace(cartJson)) return null;

        List<JsonElement> lines;
        try
        {
            var root = JsonSerializer.Deserialize<JsonElement>(cartJson);
            if (root.ValueKind != JsonValueKind.Array) return null;
            lines = root.EnumerateArray().ToList();
        }
        catch { return null; }

        if (lines.Count == 0) return null;

        static string Str(JsonElement e, string name) =>
            e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
                ? (v.GetString() ?? "").Trim() : "";

        // TryGetInt32 throws when the element is not a number, so the kind is
        // checked first; a quantity that arrives as "2" is read as text instead.
        static int Qty(JsonElement e)
        {
            if (!e.TryGetProperty("quantity", out var v)) return 1;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n)) return Math.Max(1, n);
            if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var m)) return Math.Max(1, m);
            return 1;
        }

        var skus = lines.Select(l => Str(l, "sku")).Where(s => s.Length > 0)
                        .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var ids = lines.Where(l => Str(l, "sku").Length == 0)
                       .Select(l => int.TryParse(Str(l, "id"), out var n) ? n : 0)
                       .Where(n => n > 0).Distinct().ToList();

        var bySku = new Dictionary<string, Models.Product>(StringComparer.OrdinalIgnoreCase);
        if (skus.Count > 0)
            foreach (var p in await db.Products.Where(p => p.Sku != null && skus.Contains(p.Sku)).ToListAsync())
                if (!string.IsNullOrWhiteSpace(p.Sku)) bySku[p.Sku.Trim()] = p;

        var byId = ids.Count == 0
            ? new Dictionary<int, Models.Product>()
            : (await db.Products.Where(p => ids.Contains(p.Id)).ToListAsync()).ToDictionary(p => p.Id);

        decimal total = 0m;
        foreach (var line in lines)
        {
            var sku = Str(line, "sku");
            Models.Product? prod = null;
            if (sku.Length > 0) bySku.TryGetValue(sku, out prod);
            else if (int.TryParse(Str(line, "id"), out var pid)) byId.TryGetValue(pid, out prod);

            // A line we cannot price is not a line worth nothing — it is a line
            // we know nothing about, and saying "nothing" is how the browser
            // would like this read.
            if (prod is null) return null;

            var unit = prod.DiscountPrice.HasValue && prod.DiscountPrice.Value > 0
                ? prod.DiscountPrice.Value : prod.Price;
            total += unit * Qty(line);
        }
        return total;
    }
}
