using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// Turns delivered parcels into money owed to the shops that supplied them.
///
/// The shop that listed a product names its own price; the owner adds a
/// platform fee on top; the two together are what the customer pays. When the
/// parcel is delivered and the return window has run out, the shop's share is
/// paid over and the rest stays here. This writes down the first half of that -
/// what each delivered line owes whom - and the settlement screen does the
/// paying.
///
/// WHY A SWEEP AND NOT A HOOK. Three different paths mark an order delivered:
/// the admin screen, the Delhivery tracking sync, and the COD flow. Wiring
/// bookkeeping into all three means three chances to forget one, and the one
/// forgotten is money quietly never owed to somebody. A sweep asks a different
/// question - which delivered lines have no row yet - and that question has the
/// same answer however the order got there, including for orders delivered
/// before any of this was written.
///
/// WHY THE FIGURES ARE COPIED, NOT LOOKED UP. The row keeps what the customer
/// paid and what the shop asked, as they stood on the day. A settlement that
/// recalculated itself would move: raise a vendor's price in December and every
/// August order he has already been paid for would show a new, larger debt. A
/// sale's arithmetic is a fact about that sale.
///
/// WHAT IT WILL NOT DO. It never pays anything - paying is a person pressing a
/// button. It never touches an order. And it only ever adds rows that are not
/// there: the unique index on (order_id, line_index) means a run that overlaps
/// another, or restarts halfway, cannot owe the same money twice.
/// </summary>
public class StaffPayoutSweepService : BackgroundService
{
    /// <summary>How long after delivery the money becomes payable. Admin-settable.</summary>
    public const string HoldDaysKey = "staffPayoutHoldDays";
    private const int DefaultHoldDays = 7;

    /// <summary>
    /// How far back a first-time sweep will look.
    ///
    /// Not unlimited, on purpose. Without a bound, setting a staff price on an
    /// old product today would conjure up debts for sales made a year ago and
    /// already settled some other way. Ninety days is long enough to cover a
    /// price filled in late and short enough not to reopen history.
    /// </summary>
    private static readonly TimeSpan LookBack = TimeSpan.FromDays(90);

    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    // An order in any of these has come back or never went. Nothing is owed on
    // it, and anything already pending against it is withdrawn.
    private static readonly HashSet<string> Undone = new(StringComparer.OrdinalIgnoreCase)
    {
        "Return Requested", "Return Transit", "Return", "Cancel Requested", "Cancelled",
    };

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<StaffPayoutSweepService> _log;

    public StaffPayoutSweepService(IServiceScopeFactory scopeFactory, ILogger<StaffPayoutSweepService> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(4), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await SweepAsync(db, _log);
            }
            catch (Exception ex) { _log.LogError(ex, "Staff payout sweep failed."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    public record SweepResult(int Added, int Withdrawn, int AlreadyPaidButReturned);

    /// <summary>One pass. Also what the settlement screen's refresh button calls.</summary>
    public static async Task<SweepResult> SweepAsync(AppDbContext db, ILogger? log = null)
    {
        var holdDays = await HoldDaysAsync(db);
        var since = DateTimeOffset.UtcNow - LookBack;

        var delivered = await db.SiteOrders
            .Where(o => o.Status == "Delivered" && o.DeliveredAt != null && o.DeliveredAt >= since)
            .Select(o => new { o.OrderId, o.DeliveredAt, o.CartJson, o.DiscountAmount })
            .ToListAsync();

        var added = 0;

        if (delivered.Count > 0)
        {
            var orderIds = delivered.Select(o => o.OrderId).ToList();

            // Which lines already have a row. Fetched as one set rather than a
            // lookup per line, because a sweep that asks the database once per
            // line is a sweep nobody runs hourly.
            var existing = (await db.StaffPayouts
                    .Where(x => orderIds.Contains(x.OrderId))
                    .Select(x => new { x.OrderId, x.LineIndex })
                    .ToListAsync())
                .Select(x => $"{x.OrderId}#{x.LineIndex}")
                .ToHashSet(StringComparer.Ordinal);

            foreach (var order in delivered)
            {
                var rows = await BuildOrderRowsAsync(
                    db, order.OrderId, order.CartJson, order.DeliveredAt!.Value,
                    order.DiscountAmount, holdDays, existing);

                foreach (var row in rows)
                {
                    db.StaffPayouts.Add(row);
                    added++;
                }
            }

            if (added > 0)
            {
                try { await db.SaveChangesAsync(); }
                catch (DbUpdateException ex)
                {
                    // The unique index did its job: another run got there first.
                    // Not a failure, and not worth a retry - the rows exist.
                    // Spelled out rather than log?.LogInformation(...): the
                    // logging methods are extension methods, and this file
                    // cannot be compiled where it is written, so it does not
                    // take a bet on a null-conditional call it cannot check.
                    if (log is not null)
                        log.LogInformation(ex, "Staff payout sweep: {Added} rows collided and were left to the run that wrote them.", added);
                    added = 0;
                }
            }
        }

        // ── anything that came back ─────────────────────────────────────────
        var openIds = await db.StaffPayouts
            .Where(x => x.Status == "pending")
            .Select(x => x.OrderId)
            .Distinct()
            .ToListAsync();

        var withdrawn = 0;
        var paidButReturned = 0;

        if (openIds.Count > 0)
        {
            var statuses = await db.SiteOrders
                .Where(o => openIds.Contains(o.OrderId))
                .Select(o => new { o.OrderId, o.Status })
                .ToListAsync();

            var gone = statuses
                .Where(o => Undone.Contains(o.Status ?? ""))
                .Select(o => o.OrderId)
                .ToHashSet(StringComparer.Ordinal);

            if (gone.Count > 0)
            {
                var rows = await db.StaffPayouts
                    .Where(x => x.Status == "pending" && gone.Contains(x.OrderId))
                    .ToListAsync();
                foreach (var r in rows)
                {
                    r.Status = "cancelled";
                    r.CancelReason = "The order was returned or cancelled after delivery.";
                    withdrawn++;
                }
                if (withdrawn > 0) await db.SaveChangesAsync();
            }
        }

        // ── and anything that came back AFTER it was paid ───────────────────
        //
        // This one cannot be undone by software - the money has left. The row
        // stays "paid" and is marked instead, so the settlement screen can say
        // out loud that this much needs recovering from the shop's next bill
        // rather than letting it disappear into a total.
        var paidIds = await db.StaffPayouts
            .Where(x => x.Status == "paid" && x.CancelReason == null)
            .Select(x => x.OrderId)
            .Distinct()
            .ToListAsync();

        if (paidIds.Count > 0)
        {
            var backAgain = (await db.SiteOrders
                    .Where(o => paidIds.Contains(o.OrderId))
                    .Select(o => new { o.OrderId, o.Status })
                    .ToListAsync())
                .Where(o => Undone.Contains(o.Status ?? ""))
                .Select(o => o.OrderId)
                .ToHashSet(StringComparer.Ordinal);

            if (backAgain.Count > 0)
            {
                var rows = await db.StaffPayouts
                    .Where(x => x.Status == "paid" && x.CancelReason == null && backAgain.Contains(x.OrderId))
                    .ToListAsync();
                foreach (var r in rows)
                {
                    r.CancelReason = "Returned after this was already paid out - recover it from the next settlement.";
                    paidButReturned++;
                }
                if (paidButReturned > 0) await db.SaveChangesAsync();
            }
        }

        return new SweepResult(added, withdrawn, paidButReturned);
    }

    // ── one order, all its lines ────────────────────────────────────────────

    /// <summary>
    /// The rows a delivered order owes, worked out together rather than line by
    /// line.
    ///
    /// Together, because two of the three numbers cannot be got from one line
    /// on its own:
    ///
    /// SHIPPING. The price stored on a cart line is what the customer was
    /// charged for the piece, and lib/price.ts folds the product's own shipping
    /// charge into that figure. Counting it as takings would hand the owner a
    /// profit he actually paid to a courier, so it comes off first and what is
    /// left is the value of the goods.
    ///
    /// THE COUPON. A discount like WELCOME100 is taken off the ORDER, not off
    /// any one line, so no line knows about it. Ignoring it would overstate
    /// what the owner kept by the whole coupon. It is spread across the lines
    /// in proportion to what each was worth - including lines that owe no shop
    /// anything, because the customer's discount was spread over those too.
    ///
    /// What never moves, through any of this, is what the SHOP is owed: that is
    /// its own price times the quantity, and it is deliberately independent of
    /// everything above. A mistake in this arithmetic can misreport the owner's
    /// margin; it cannot underpay a vendor.
    /// </summary>
    private static async Task<List<StaffPayout>> BuildOrderRowsAsync(
        AppDbContext db, string orderId, string? cartJson, DateTimeOffset deliveredAt,
        decimal orderDiscount, int holdDays, HashSet<string> existing)
    {
        var result = new List<StaffPayout>();
        var lines = ParseCart(cartJson);
        if (lines.Count == 0) return result;

        // Every product on the order, in one round trip.
        var skus = lines.Select(l => Str(l, "sku")).Where(x => x.Length > 0)
                        .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var ids = lines.Select(l => int.TryParse(Str(l, "id"), out var n) ? n : 0)
                       .Where(n => n > 0).Distinct().ToList();

        var bySku = new Dictionary<string, Product>(StringComparer.OrdinalIgnoreCase);
        if (skus.Count > 0)
            foreach (var pr in await db.Products.AsNoTracking().Where(x => x.Sku != null && skus.Contains(x.Sku)).ToListAsync())
                if (!string.IsNullOrWhiteSpace(pr.Sku)) bySku[pr.Sku.Trim()] = pr;

        var byId = ids.Count == 0
            ? new Dictionary<int, Product>()
            : (await db.Products.AsNoTracking().Where(x => ids.Contains(x.Id)).ToListAsync())
                .ToDictionary(x => x.Id);

        Product? Resolve(JsonElement line)
        {
            var sku = Str(line, "sku");
            if (sku.Length > 0 && bySku.TryGetValue(sku, out var bySkuHit)) return bySkuHit;
            if (int.TryParse(Str(line, "id"), out var pid) && byId.TryGetValue(pid, out var byIdHit)) return byIdHit;
            return null;
        }

        // Pass one: what each line's goods were worth, and the order's total.
        var goods = new decimal[lines.Count];
        var qtys = new int[lines.Count];
        decimal orderGoods = 0m;

        for (var i = 0; i < lines.Count; i++)
        {
            var qty = Qty(lines[i]);
            qtys[i] = qty;

            var unit = Money(lines[i], "price");
            if (unit <= 0)
            {
                // Older carts stored only the line total.
                var lineTotal = Money(lines[i], "lineTotal");
                if (lineTotal > 0 && qty > 0) unit = lineTotal / qty;
            }

            var ship = Resolve(lines[i])?.ShippingCharge ?? 0m;
            var goodsUnit = Math.Max(0m, unit - ship);

            goods[i] = goodsUnit * qty;
            orderGoods += goods[i];
        }

        var discount = orderDiscount > 0 && orderDiscount < orderGoods ? orderDiscount : 0m;

        // Pass two: the lines that owe a shop something.
        for (var i = 0; i < lines.Count; i++)
        {
            if (existing.Contains($"{orderId}#{i}")) continue;

            var product = Resolve(lines[i]);

            // No product, no shop, or no agreed price: nothing is owed and
            // nothing is written. Leaving the row out rather than writing a
            // zero matters - a zero would settle the line for good, and all
            // three of these can be put right afterwards. The next sweep looks
            // again and finds it once the price is filled in.
            if (product is null) continue;
            if (string.IsNullOrWhiteSpace(product.ShopName)) continue;

            var staffUnit = product.StaffPrice ?? 0m;
            if (staffUnit <= 0) continue;

            var qty = qtys[i];
            var share = orderGoods > 0 ? Math.Round(discount * (goods[i] / orderGoods), 2) : 0m;
            var net = Math.Round(goods[i] - share, 2);

            var staffAmount = Math.Round(staffUnit * qty, 2);
            var lineName = Str(lines[i], "name");

            result.Add(new StaffPayout
            {
                OrderId = orderId,
                LineIndex = i,
                ShopName = product.ShopName!.Trim(),
                ProductId = product.Id,
                Sku = product.Sku,
                ProductName = lineName.Length > 0 ? lineName : product.Name,
                Qty = qty,
                SoldUnit = qty > 0 ? Math.Round(net / qty, 2) : net,
                StaffUnit = staffUnit,
                StaffAmount = staffAmount,
                PlatformAmount = net - staffAmount,
                DeliveredAt = deliveredAt,
                PayableAt = deliveredAt.AddDays(holdDays),
                Status = "pending",
            });
        }

        return result;
    }

    // ── reading the stored cart ─────────────────────────────────────────────

    private static List<JsonElement> ParseCart(string? cartJson)
    {
        if (string.IsNullOrWhiteSpace(cartJson)) return new List<JsonElement>();
        try
        {
            var root = JsonSerializer.Deserialize<JsonElement>(cartJson);
            return root.ValueKind == JsonValueKind.Array
                ? root.EnumerateArray().ToList()
                : new List<JsonElement>();
        }
        catch { return new List<JsonElement>(); }
    }

    private static string Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? (v.GetString() ?? "").Trim() : "";

    private static int Qty(JsonElement e)
    {
        if (!e.TryGetProperty("quantity", out var v)) return 1;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n)) return Math.Max(1, n);
        if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var m)) return Math.Max(1, m);
        return 1;
    }

    /// <summary>A money field that may have been stored as a number or as text.</summary>
    private static decimal Money(JsonElement e, string name)
    {
        if (!e.TryGetProperty(name, out var v)) return 0m;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d)) return d;
        if (v.ValueKind == JsonValueKind.String && decimal.TryParse(v.GetString(), out var m)) return m;
        return 0m;
    }

    public static async Task<int> HoldDaysAsync(AppDbContext db)
    {
        var raw = (await db.SiteSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Key == HoldDaysKey))?.Value;
        return int.TryParse((raw ?? "").Trim(), out var n) && n >= 0 && n <= 90 ? n : DefaultHoldDays;
    }
}
