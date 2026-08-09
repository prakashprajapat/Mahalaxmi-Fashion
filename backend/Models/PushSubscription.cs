using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

// One browser/device push subscription. Mirrors the `push_subscriptions` table
// created in Program.cs. Each customer who allows notifications gets one row per
// device (unique by endpoint). Used to deliver Web Push offers/updates.
[Table("push_subscriptions")]
public class PushSubscription
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("endpoint")]
    public string Endpoint { get; set; } = "";

    [Column("p256dh")]
    public string P256dh { get; set; } = "";

    [Column("auth")]
    public string Auth { get; set; } = "";

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
