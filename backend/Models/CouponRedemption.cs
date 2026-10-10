using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// <summary>
/// One identity that has already redeemed one coupon code.
///
/// A shopper leaves two things behind on an order - a mobile number and an
/// email - and either one is enough to recognise her next time. Both are
/// written, so changing one of them and keeping the other does not earn a
/// second discount.
///
/// The uniqueness lives in the database (ux_coupon_redemption), not in the C#:
/// two orders placed in the same second cannot both be told "you have not used
/// this yet", because the second INSERT simply fails.
/// </summary>
[Table("coupon_redemptions")]
public class CouponRedemption
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    /// <summary>The coupon code, lower-cased — codes are matched case-insensitively everywhere.</summary>
    [Required]
    [Column("code_lower")]
    public string CodeLower { get; set; } = string.Empty;

    /// <summary>"phone" or "email".</summary>
    [Required]
    [Column("id_kind")]
    public string IdKind { get; set; } = string.Empty;

    /// <summary>Normalised by CustomerKeys — last ten digits of the number, or the lower-cased email.</summary>
    [Required]
    [Column("id_value")]
    public string IdValue { get; set; } = string.Empty;

    /// <summary>The order this was written for, so a redemption can be undone if the order is not placed.</summary>
    [Column("order_id")]
    public string? OrderId { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
