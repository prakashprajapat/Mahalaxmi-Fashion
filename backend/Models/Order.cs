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

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
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
