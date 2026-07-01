using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
namespace MahalaxmiApi.Models;
[Table("influencers")]
public class Influencer {
    [Key][Column("id")] public int Id { get; set; }
    [Required][Column("name")] public string Name { get; set; } = string.Empty;
    [Required][Column("email")] public string Email { get; set; } = string.Empty;
    [Column("phone")] public string? Phone { get; set; }
    [Column("social_handle")] public string? SocialHandle { get; set; }
    [Column("platform")] public string Platform { get; set; } = "Instagram";
    [Column("followers_count")] public string? FollowersCount { get; set; }
    [Column("category")] public string? Category { get; set; }
    [Column("niche")] public string? Niche { get; set; }
    [Column("status")] public string Status { get; set; } = "pending";
    [Column("coupon_code")] public string? CouponCode { get; set; }
    [Column("password_hash")] public string? PasswordHash { get; set; }
    [Column("reset_requested_at")] public DateTimeOffset? ResetRequestedAt { get; set; }
    [Column("commission_rate")] public decimal CommissionRate { get; set; } = 3m;
    [Column("admin_notes")] public string? AdminNotes { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    [Column("updated_at")] public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
