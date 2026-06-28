using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

[Table("admin_tokens")]
public class AdminToken
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Required]
    [Column("email")]
    public string Email { get; set; } = string.Empty;

    [Required]
    [Column("token_hash")]
    public string TokenHash { get; set; } = string.Empty;

    [Column("role")]
    public string Role { get; set; } = "admin";

    [Column("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

[Table("otp_tokens")]
public class OtpToken
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("phone")]
    public string? Phone { get; set; }

    [Column("email")]
    public string? Email { get; set; }

    [Required]
    [Column("otp_hash")]
    public string OtpHash { get; set; } = string.Empty;

    [Column("purpose")]
    public string Purpose { get; set; } = "login";

    [Column("attempts")]
    public int Attempts { get; set; }

    [Column("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }

    [Column("used")]
    public bool Used { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

[Table("site_settings")]
public class SiteSetting
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Required]
    [Column("setting_key")]
    public string Key { get; set; } = string.Empty;

    [Required]
    [Column("setting_val")]
    public string Value { get; set; } = string.Empty;

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
