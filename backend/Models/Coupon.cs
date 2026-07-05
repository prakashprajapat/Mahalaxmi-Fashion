using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

[Table("coupons")]
public class Coupon
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Required]
    [Column("code")]
    public string Code { get; set; } = string.Empty;

    /// <summary>"percent" = percentage off, "flat" = fixed rupee off</summary>
    [Column("type")]
    public string Type { get; set; } = "flat";

    [Column("value")]
    public decimal Value { get; set; }

    /// <summary>Ties a coupon to a special date: "none" | "birthday" | "anniversary".
    /// Redeeming a birthday/anniversary coupon locks that date on the customer's profile.</summary>
    [Column("occasion")]
    public string Occasion { get; set; } = "none";

    [Column("min_order")]
    public decimal MinOrder { get; set; }

    [Column("max_uses")]
    public int? MaxUses { get; set; }

    [Column("used_count")]
    public int UsedCount { get; set; }

    [Column("expires_at")]
    public DateTimeOffset? ExpiresAt { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
