using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// <summary>
/// One SMS handed to MSG91 (or refused by it), kept so the admin can see
/// exactly what went to whom, copy the text to WhatsApp, and delete what is
/// not worth keeping. Separate from message_sends on purpose: that table stops
/// a message going twice, and deleting from it would send it again. Deleting
/// from this one only forgets.
/// </summary>
[Table("sms_logs")]
public class SmsLog
{
    [Key][Column("id")] public long Id { get; set; }
    [Column("sent_at")] public DateTimeOffset SentAt { get; set; } = DateTimeOffset.UtcNow;
    /// <summary>Last ten digits.</summary>
    [Column("phone")] public string Phone { get; set; } = "";
    [Column("template_id")] public string TemplateId { get; set; } = "";
    /// <summary>otp | order | template | campaign | alert</summary>
    [Column("kind")] public string Kind { get; set; } = "template";
    /// <summary>The variables sent, as JSON {"var1": "...", "order_id": "..."}. An OTP is stored masked.</summary>
    [Column("vars_json")] public string? VarsJson { get; set; }
    /// <summary>sent | failed</summary>
    [Column("status")] public string Status { get; set; } = "sent";
    [Column("detail")] public string? Detail { get; set; }
    /// <summary>MSG91's request id, to find the same message in their panel.</summary>
    [Column("request_id")] public string? RequestId { get; set; }
    /// <summary>When the admin sent the same message on WhatsApp from SMS Logs (the tick). Null = not yet.</summary>
    [Column("whatsapp_at")] public DateTimeOffset? WhatsAppAt { get; set; }
}
