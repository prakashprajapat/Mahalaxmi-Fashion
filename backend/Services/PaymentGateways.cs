using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// Which gateway took the money for an order, worked out from the payment rows
/// rather than from what the order calls its payment method.
///
/// This exists because guessing got it wrong. A refund row recorded
/// gateway = cashfree for EVERY cod order, on the reasoning that a COD advance
/// is taken through Cashfree - true today, and not a fact about the order, only
/// about which gateway happened to be wired up when it was placed. A COD
/// advance taken through Razorpay would have been sent to Cashfree, which would
/// have answered that it has no such payment, and the owner would have been
/// left looking at a refusal with nothing to do about it.
///
/// The order's own method field cannot answer the question either: it says cod,
/// cashfree, razorpay, online and prepaid in different places, and none of
/// those tell you where the money actually went. The payment rows do, because
/// one of them exists only if that gateway was used.
/// </summary>
public static class PaymentGateways
{
    public const string Cashfree = "cashfree";
    public const string Razorpay = "razorpay";

    /// <summary>
    /// The gateway that holds this order's money, or null if neither does -
    /// a pure cash-on-delivery order with no advance, or an order paid some
    /// other way. Null is an answer, not a failure: it means there is nothing
    /// to send back through a gateway, and the wallet or cash is the way.
    /// </summary>
    public static async Task<string?> ForOrderAsync(AppDbContext db, string orderId, CancellationToken ct = default)
    {
        // Paid first, in both lookups. Taking the newest row instead would aim
        // the refund at an abandoned attempt whenever a customer started
        // checkout again after already paying - the row that matters is the one
        // that went through, not the one that happened last.
        var cf = await db.CashfreeOrders.AsNoTracking()
            .Where(c => c.LocalOrderId == orderId && c.CfOrderId != null)
            .OrderByDescending(c => c.Status == "paid")
            .ThenByDescending(c => c.Id)
            .Select(c => new { c.Status })
            .FirstOrDefaultAsync(ct);

        var rp = await db.RazorpayOrders.AsNoTracking()
            .Where(r => r.LocalOrderId == orderId && r.RazorpayPaymentId != null)
            .OrderByDescending(r => r.Id)
            .Select(r => new { r.RazorpayPaymentId })
            .FirstOrDefaultAsync(ct);

        var cfPaid = cf is not null && cf.Status == "paid";
        var rpPaid = rp is not null;   // a payment id only exists once one was made

        // A paid row beats an unpaid one whichever gateway it is on. Only if
        // neither is paid does the mere existence of an attempt decide it, and
        // that case ends in "nothing to refund here" either way - but it gives
        // the owner the right gateway's own words rather than the wrong one's.
        if (cfPaid) return Cashfree;
        if (rpPaid) return Razorpay;
        if (cf is not null) return Cashfree;
        return null;
    }
}
