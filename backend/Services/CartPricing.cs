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
    /// What a coupon takes off a given amount.
    ///
    /// A percent coupon on a whole-rupee cart still lands on paise: 10% of
    /// Rs.789 is Rs.78.90, and the order came out Rs.760.10. This shop prices
    /// in whole rupees and bills in whole rupees, so the DISCOUNT is rounded
    /// rather than the total — rounding the total instead would leave an
    /// invoice whose own lines no longer add up to it, which on a tax invoice
    /// is worse than the paise.
    ///
    /// It rounds UP, in the customer's favour. A checkout that said "10% off"
    /// must never quietly become less than 10% at the till, and at most 99
    /// paise of goodwill is the cheapest way to be sure of that.
    ///
    /// A flat coupon is left exactly as the shop typed it: if someone sets
    /// Rs.99.50 off, that is a decision, not a rounding error.
    ///
    /// Both the checkout preview (CouponsController) and the order itself
    /// (OrdersController) call this, because a preview that disagrees with the
    /// bill by ten paise is its own kind of bug.
    /// </summary>
    public static decimal CouponDiscount(string? type, decimal value, decimal amount)
    {
        if (amount <= 0m) return 0m;
        var raw = string.Equals(type, "percent", StringComparison.OrdinalIgnoreCase)
            ? Math.Ceiling(amount * value / 100m)
            : value;
        // Never negative, and never more than the goods are worth: a mis-set
        // coupon over 100% must not hand money back.
        return Math.Min(Math.Max(0m, raw), amount);
    }

    /// <summary>
    /// Every line of a stored cart, matched to the product it names.
    ///
    /// Null when the cart cannot be read at all, or when any line names a
    /// product we do not have — the two cases where nothing about the cart can
    /// be concluded. Both callers below treat null as "refuse", never as
    /// "empty".
    /// </summary>
    private static async Task<List<(Models.Product Product, int Qty)>?> ResolveAsync(AppDbContext db, string? cartJson)
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

        var resolved = new List<(Models.Product, int)>();
        foreach (var line in lines)
        {
            var sku = Str(line, "sku");
            Models.Product? prod = null;
            if (sku.Length > 0) bySku.TryGetValue(sku, out prod);
            else if (int.TryParse(Str(line, "id"), out var pid)) byId.TryGetValue(pid, out prod);

            // A line we cannot price is not a line worth nothing - it is a line
            // we know nothing about, and saying "nothing" is how the browser
            // would like this read.
            if (prod is null) return null;
            resolved.Add((prod, Qty(line)));
        }
        return resolved;
    }

    /// <summary>
    /// What the lines in this stored cart are worth at our own prices, or null
    /// when that cannot be established - an unknown SKU, an unparseable cart, a
    /// line naming no product. Null means "do not conclude it was paid for".
    /// </summary>
    public static async Task<decimal?> ItemValueAsync(AppDbContext db, string? cartJson)
    {
        var lines = await ResolveAsync(db, cartJson);
        if (lines is null) return null;

        decimal total = 0m;
        foreach (var (prod, qty) in lines)
        {
            var unit = prod.DiscountPrice.HasValue && prod.DiscountPrice.Value > 0
                ? prod.DiscountPrice.Value : prod.Price;
            total += unit * qty;
        }
        return total;
    }

    /// <summary>
    /// The products in this cart that the shop is not selling right now -
    /// switched off, still a draft, or out of stock. Empty when every line can
    /// be fulfilled.
    ///
    /// PlaceOrder has asked this question since it was written, so a COD order
    /// for a switched-off product is refused. The PREPAID path never asked it.
    /// A cart lives in the browser's own storage under mfh_cart with no expiry
    /// and nothing that re-checks it, so an item added in September is still
    /// sitting there in October after the shop has switched it off - and
    /// create-order priced it, took the money, and the webhook wrote the order.
    /// The shop was then holding payment for something it had deliberately
    /// stopped selling.
    ///
    /// The names are the shop's own product names, so the message a customer
    /// reads names the thing she has to remove.
    /// </summary>
    public static async Task<List<string>> UnavailableAsync(AppDbContext db, string? cartJson)
    {
        var lines = await ResolveAsync(db, cartJson);
        if (lines is null) return new List<string>();

        var names = new List<string>();
        foreach (var (prod, _) in lines)
        {
            var status = prod.StockStatus ?? "";
            var gone = string.Equals(status, "Out of Stock", StringComparison.OrdinalIgnoreCase)
                       || ProductQualityGate.HiddenStatuses.Contains(status, StringComparer.OrdinalIgnoreCase);
            if (gone && !names.Contains(prod.Name))
                names.Add(prod.Name);
        }
        return names;
    }
}
