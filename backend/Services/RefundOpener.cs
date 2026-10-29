using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// Opening the pending refund on an order that came back.
///
/// This used to live as a private method on OrdersController, which was fine
/// while an owner pressing Return was the only way an order could come back.
/// A parcel the courier could not deliver comes back on its own, found by the
/// tracking sweep with no owner and no controller anywhere near it - and the
/// amount rule (prepaid minus the wallet part, or a COD advance, and nothing
/// at all when the customer paid nothing) is the last rule in this codebase
/// that should exist in two copies.
///
/// Nothing is paid here. The row only says "this much is owed, decide what to
/// do"; the amount and the destination stay the owner's call on the Refunds
/// screen, because once money leaves it does not come back.
/// </summary>
public static class RefundOpener
{
    /// What the customer actually paid us online, and so what can be sent
    /// back. Not the order total: the wallet part goes back through the wallet
    /// on its own, and cash a courier collected was never ours to refund
    /// through a gateway.
    ///
    ///   prepaid -> everything except the wallet part
    ///   COD     -> only the advance paid before dispatch
    public static decimal OnlinePaidAmount(SiteOrder order)
    {
        var isCod = string.Equals(order.Method, "cod", StringComparison.OrdinalIgnoreCase);
        var paid = isCod ? order.AdvancePaid : order.Total - order.WalletUsed;
        return paid > 0m ? Math.Round(paid, 2) : 0m;
    }

    /// <returns>true when a row was written.</returns>
    public static async Task<bool> OpenAsync(
        AppDbContext db,
        SiteOrder order,
        ILogger? log = null,
        AdminNotifier? notify = null,
        CancellationToken ct = default)
    {
        var owed = OnlinePaidAmount(order);
        if (owed <= 0m) return false;

        // Already handled, or already being handled. A second save, two admins
        // at once, or the tracking sweep arriving at an order an owner has
        // just returned by hand, must not create a second payout.
        var already = await db.OrderRefunds
            .AnyAsync(r => r.OrderId == order.OrderId && (r.Status == "pending" || r.Status == "paid"), ct);
        if (already) return false;

        var isCod = string.Equals(order.Method, "cod", StringComparison.OrdinalIgnoreCase);

        // Which gateway holds the money, from the payment rows rather than
        // from how the shop happened to be wired that day. Only a hint: the
        // payout re-resolves it.
        var gateway = await PaymentGateways.ForOrderAsync(db, order.OrderId) ?? "";

        db.OrderRefunds.Add(new OrderRefund
        {
            OrderId         = order.OrderId,
            SuggestedAmount = owed,
            Amount          = 0m,
            Method          = "",
            Gateway         = gateway,
            Status          = "pending",
            Note            = isCod
                ? "COD advance paid online before dispatch"
                : "Prepaid order, wallet part returned separately",
            CreatedAt       = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(ct);

        log?.LogWarning("Refund of Rs {Amount} opened for {Status} order {Order}",
            owed, order.Status, order.OrderId);

        if (notify is not null)
        {
            try
            {
                await notify.NotifyAsync($"Refund to pay - {order.OrderId} Rs.{owed:0}",
                    AdminNotifier.Wrap("Refund to pay", $@"
                    <p><strong>Order:</strong> {order.OrderId}</p>
                    <p><strong>Now:</strong> {order.Status}</p>
                    <p><strong>Owed back to the customer:</strong> Rs.{owed:0.00}</p>
                    <p>Pay it from Admin &rarr; Refunds.</p>"));
            }
            catch { /* the row is written; the email is a courtesy */ }
        }

        return true;
    }
}
