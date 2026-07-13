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
}
