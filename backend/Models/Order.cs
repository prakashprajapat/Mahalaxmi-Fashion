using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

[Table("site_orders")]
public class SiteOrder
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Required]
    [Column("order_id")]
    public string OrderId { get; set; } = string.Empty;

    [Column("method")]
    public string Method { get; set; } = string.Empty;

    [Column("status")]
    public string Status { get; set; } = string.Empty;

    [Column("payment_id")]
    public string? PaymentId { get; set; }

    [Column("awb")]
    public string? Awb { get; set; }

    [Column("subtotal")]
    public decimal Subtotal { get; set; }

    [Column("shipping_cost")]
    public decimal ShippingCost { get; set; }

    [Column("cod_fee")]
    public decimal CodFee { get; set; }

    [Column("total")]
    public decimal Total { get; set; }

    [Column("cart_json", TypeName = "jsonb")]
    public string? CartJson { get; set; }

    [Column("customer_json", TypeName = "jsonb")]
    public string? CustomerJson { get; set; }

    [Column("shipping_json", TypeName = "jsonb")]
    public string? ShippingJson { get; set; }

    [Column("raw_json", TypeName = "jsonb")]
    public string? RawJson { get; set; }

    [Column("placed_at")]
    public DateTimeOffset? PlacedAt { get; set; }

    // BUG-2: Exact delivery timestamp for accurate 7-day return window
    [Column("delivered_at")]
    public DateTimeOffset? DeliveredAt { get; set; }

    // MISS-6: PAN details for high-value order compliance
    [Column("pan_number")]
    public string? PanNumber { get; set; }

    [Column("pan_name")]
    public string? PanName { get; set; }

    [Column("coupon_code")]
    public string? CouponCode { get; set; }

    [Column("discount_amount")]
    public decimal DiscountAmount { get; set; }

    // Part of the order value paid from the customer's loyalty wallet. The order's sale value
    // (Total, used for GST/invoice) is unchanged; this is just how much of it was settled by
    // wallet instead of gateway/COD. Amount collected externally = Total − WalletUsed.
    [Column("wallet_used")]
    public decimal WalletUsed { get; set; }

    // Cash on Delivery advance: the part of the order the customer already paid online
    // before the order was accepted. The courier collects Total − WalletUsed − AdvancePaid.
    [Column("advance_paid")]
    public decimal AdvancePaid { get; set; }

    // GST invoice number (e.g. M/26-27/001), assigned once when the order is marked Ready for Shipping
    [Column("invoice_number")]
    public string? InvoiceNumber { get; set; }

    // The moment that number was handed out, and therefore the invoice's own
    // date. NOT the date the customer placed the order: the number is issued
    // when the parcel is confirmed for shipping, so numbering by one clock and
    // dating by another puts the series out of order the first time a newer
    // order is packed before an older one. For goods the tax invoice is issued
    // at removal anyway, which is this moment.
    [Column("invoiced_at")]
    public DateTimeOffset? InvoicedAt { get; set; }

    // Delivery partner (Delhivery / India Post / Manual etc.) — set with the AWB
    [Column("courier")]
    public string? Courier { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    // When this order had its turn at being asked for a review — stamped once,
    // whether or not an email could actually be sent, so an order with no
    // address is not picked up again every six hours forever.
    /// <summary>When the last review request went out — not "whether one did".</summary>
    [Column("review_asked_at")]
    public DateTimeOffset? ReviewAskedAt { get; set; }

    /// <summary>
    /// How many review requests this order has had. Capped at three.
    ///
    /// Three because the shop asked for a reminder every 48 hours until a
    /// review arrives, and "until it arrives" has no end for the customer who
    /// is simply never going to write one. Fifteen emails a month gets a
    /// sending domain marked as spam, and the mail that then stops arriving is
    /// the order confirmation and the invoice.
    /// </summary>
    [Column("review_asks_sent")]
    public int ReviewAsksSent { get; set; }
}

[Table("razorpay_orders")]
public class RazorpayOrder
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Required]
    [Column("local_order_id")]
    public string LocalOrderId { get; set; } = string.Empty;

    [Required]
    [Column("razorpay_order_id")]
    public string RazorpayOrderId { get; set; } = string.Empty;

    [Column("amount_paise")]
    public int AmountPaise { get; set; }

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

    [Column("razorpay_payment_id")]
    public string? RazorpayPaymentId { get; set; }

    [Column("razorpay_signature")]
    public string? RazorpaySignature { get; set; }

    [Column("raw_order_json", TypeName = "jsonb")]
    public string? RawOrderJson { get; set; }

    [Column("raw_verify_json", TypeName = "jsonb")]
    public string? RawVerifyJson { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    [Column("paid_at")]
    public DateTimeOffset? PaidAt { get; set; }
}
