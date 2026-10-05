using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// <summary>
/// What a shopper thought, in their own words.
///
/// Separate from reviews on purpose. A review is about one product and only a
/// verified buyer may leave one; this is about the shop - the website was
/// confusing, the parcel arrived late, the size chart was wrong, "do you have
/// this in XXL". Most of it will never come from someone who has bought
/// anything yet, which is exactly why it is worth reading.
/// </summary>
[Table("feedback")]
public class Feedback
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("name")]
    public string? Name { get; set; }

    [Column("email")]
    public string? Email { get; set; }

    [Column("phone")]
    public string? Phone { get; set; }

    /// <summary>"website" | "product" | "delivery" | "payment" | "idea" | "other"</summary>
    [Column("topic")]
    public string Topic { get; set; } = "other";

    /// <summary>1-5 stars. 0 means they did not rate, which is not the same as a 1.</summary>
    [Column("rating")]
    public int Rating { get; set; }

    [Required]
    [Column("message")]
    public string Message { get; set; } = string.Empty;

    /// <summary>Which page they were on. Fills itself in; nobody can be asked to remember.</summary>
    [Column("page_url")]
    public string? PageUrl { get; set; }

    /// <summary>The customer id when they were signed in, so a reply can find them.</summary>
    [Column("customer_id")]
    public int? CustomerId { get; set; }

    /// <summary>Ticked once the shop has dealt with it. Not shown to the sender.</summary>
    [Column("is_handled")]
    public bool IsHandled { get; set; }

    [Column("admin_note")]
    public string? AdminNote { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
