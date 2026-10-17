using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

// Money owed back to a customer on a returned or cancelled order.
//
// The wallet part of an order is already returned on its own the moment the
// order turns Return/Cancelled (OrdersController.RefundWalletForOrderAsync).
// This row is about the OTHER money: what the customer actually paid online --
// the prepaid total, or the advance on a COD order. That money leaves the
// business, so it is never moved silently: a row is created as pending, an
// owner decides the amount and where it goes, and only then is it paid.
//
// One row per payout. An order can have more than one if an earlier attempt
// failed and was retried, so the screens look at the newest open row.
[Table("order_refunds")]
public class OrderRefund
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Required]
    [Column("order_id")]
    public string OrderId { get; set; } = string.Empty;

    // What the system worked out was owed when the return was accepted. Kept
    // beside the paid amount on purpose: if an owner pays less, the pair is the
    // record of the deduction, and nobody has to remember why.
    [Column("suggested_amount")]
    public decimal SuggestedAmount { get; set; }

    // What was actually paid. Zero until the refund is settled.
    [Column("amount")]
    public decimal Amount { get; set; }

    // Where the money went: gateway (back to the card or UPI it came from) or
    // wallet (store credit). Empty while the row is still pending, because
    // that choice is the owner's to make at payout time.
    [Column("method")]
    public string Method { get; set; } = string.Empty;

    // razorpay or cashfree -- which gateway took the original payment.
    // Recorded when the row is created, while the order is still in hand.
    [Column("gateway")]
    public string? Gateway { get; set; }

    // The gateway's own id for the refund, so a figure on this screen can be
    // matched against the gateway's statement without guessing.
    [Column("gateway_refund_id")]
    public string? GatewayRefundId { get; set; }

    // pending, paid, failed or cancelled.
    [Column("status")]
    public string Status { get; set; } = "pending";

    // Why the amount differs from the suggestion, or why the refund was
    // cancelled. Shown to the owner, never to the customer.
    [Column("note")]
    public string? Note { get; set; }

    // The gateway's refusal, kept verbatim. A failed refund is money still
    // owed, and the reason is what decides whether to retry or pay by hand.
    [Column("failure_reason")]
    public string? FailureReason { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    [Column("settled_at")]
    public DateTimeOffset? SettledAt { get; set; }

    [Column("settled_by")]
    public string? SettledBy { get; set; }
}
