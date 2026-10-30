using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

// Cashfree Payment Gateway order (mirror of RazorpayOrder).
// One row per checkout attempt; status flips to "paid" on verify/webhook.
[Table("cashfree_orders")]
public class CashfreeOrder
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Required]
    [Column("local_order_id")]
    public string LocalOrderId { get; set; } = string.Empty;

    [Column("cf_order_id")]
    public string? CfOrderId { get; set; }

    [Column("payment_session_id")]
    public string? PaymentSessionId { get; set; }

    [Column("amount_paise")]
    public int AmountPaise { get; set; }

    // Loyalty wallet applied to this order (rupees) and the full order value before the wallet
    // was subtracted. AmountPaise is what Cashfree actually charged (full_total − wallet_used).
    [Column("wallet_used")]
    public decimal WalletUsed { get; set; }

    [Column("full_total")]
    public decimal FullTotal { get; set; }

    /// <summary>
    /// The coupon the shopper had applied when the payment was started.
    ///
    /// Kept so the WEBHOOK can spend it. A prepaid order is often written by
    /// the webhook rather than by PlaceOrder - a server-to-server call beats a
    /// phone finishing a redirect - and without the code here that order went
    /// in with no coupon, nothing consumed, and no discount on its invoice.
    /// </summary>
    [Column("coupon_code")]
    public string? CouponCode { get; set; }

    [Column("currency")]
    public string Currency { get; set; } = "INR";

    [Column("status")]
    public string Status { get; set; } = "created";

    [Column("cart_json", TypeName = "jsonb")]
    public string? CartJson { get; set; }

    [Column("shipping_json", TypeName = "jsonb")]
    public string? ShippingJson { get; set; }

    [Column("customer_json", TypeName = "jsonb")]
    public string? CustomerJson { get; set; }

    [Column("cf_payment_id")]
    public string? CfPaymentId { get; set; }

    [Column("raw_order_json", TypeName = "jsonb")]
    public string? RawOrderJson { get; set; }

    [Column("raw_verify_json", TypeName = "jsonb")]
    public string? RawVerifyJson { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    [Column("paid_at")]
    public DateTimeOffset? PaidAt { get; set; }

    /// <summary>
    /// Cashfree's own word for what happened, kept verbatim: SUCCESS,
    /// USER_DROPPED, FAILED, PENDING, CANCELLED - or NOT_ATTEMPTED when the
    /// checkout was opened and no payment was ever started.
    ///
    /// `Status` above is ours and has two values, created and paid. That is
    /// enough to decide whether an order exists, and useless for the question
    /// an owner actually asks: of the people who reached the payment page
    /// yesterday, how many walked away, and with how much. A row sitting at
    /// "created" could be someone who changed their mind, a card that was
    /// declined, or a payment still in flight, and those are three different
    /// things to do something about.
    /// </summary>
    [Column("cf_status")]
    public string? CfStatus { get; set; }

    /// upi, card, netbanking, wallet, app - as Cashfree names it.
    [Column("payment_method")]
    public string? PaymentMethod { get; set; }

    /// When Cashfree was last asked about this row. Null means never, which
    /// is why a screen built on these columns has to say so rather than show
    /// a blank and let it read as "nothing happened".
    [Column("synced_at")]
    public DateTimeOffset? SyncedAt { get; set; }
}
