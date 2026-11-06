using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// <summary>
/// Every event Interakt sends to /api/whatsapp/interakt, as it came (trimmed),
/// with what it was about. The other WhatsApp tables are built from these.
/// category: lead | status | cart | payment | alert | other
/// </summary>
[Table("wa_events")]
public class WaEvent
{
    [Key][Column("id")] public long Id { get; set; }
    [Column("type")] public string Type { get; set; } = "";
    [Column("category")] public string Category { get; set; } = "other";
    [Column("phone")] public string? Phone { get; set; }
    [Column("ref")] public string? Ref { get; set; }
    [Column("status")] public string? Status { get; set; }
    [Column("summary")] public string? Summary { get; set; }
    [Column("raw")] public string? Raw { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>One WhatsApp template message (API or campaign) and how far it got.</summary>
[Table("wa_messages")]
public class WaMessage
{
    [Key][Column("id")] public long Id { get; set; }
    [Column("message_id")] public string MessageId { get; set; } = "";
    /// <summary>api | campaign</summary>
    [Column("source")] public string Source { get; set; } = "api";
    [Column("phone")] public string? Phone { get; set; }
    [Column("template")] public string? Template { get; set; }
    [Column("campaign_id")] public string? CampaignId { get; set; }
    /// <summary>Sent | Delivered | Read | Clicked | Failed</summary>
    [Column("status")] public string Status { get; set; } = "Sent";
    [Column("failure_reason")] public string? FailureReason { get; set; }
    [Column("sent_at")] public DateTimeOffset? SentAt { get; set; }
    [Column("delivered_at")] public DateTimeOffset? DeliveredAt { get; set; }
    [Column("read_at")] public DateTimeOffset? ReadAt { get; set; }
    [Column("clicked_at")] public DateTimeOffset? ClickedAt { get; set; }
    [Column("failed_at")] public DateTimeOffset? FailedAt { get; set; }
    [Column("updated_at")] public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A cart a customer sent from the WhatsApp catalogue. It has no address, so it
/// is not an order yet: the shop follows it up (status) and it is marked
/// "ordered" when the same phone places an order on the website.
/// </summary>
[Table("wa_carts")]
public class WaCart
{
    [Key][Column("id")] public long Id { get; set; }
    [Column("event_id")] public long EventId { get; set; }
    [Column("phone")] public string? Phone { get; set; }
    [Column("name")] public string? Name { get; set; }
    /// <summary>JSON list of { retailerId, productId, name, sku, variant, qty, price, link }</summary>
    [Column("items_json")] public string ItemsJson { get; set; } = "[]";
    [Column("total")] public decimal Total { get; set; }
    [Column("currency")] public string? Currency { get; set; }
    [Column("customer_note")] public string? CustomerNote { get; set; }
    /// <summary>new | contacted | ordered | cancelled</summary>
    [Column("status")] public string Status { get; set; } = "new";
    [Column("order_id")] public string? OrderId { get; set; }
    [Column("note")] public string? Note { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    [Column("updated_at")] public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
