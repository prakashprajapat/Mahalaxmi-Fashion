using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// <summary>
/// What a customer thinks of the shop, said from inside the app.
///
/// Deliberately NOT a row in `reviews`. A product review is guarded by a
/// delivered order, ownership of that order, and the product having been on
/// it - that is what makes the "verified purchase" badge mean something, and
/// bending it to accept a review with no product and no order would quietly
/// weaken every product review on the site.
///
/// This is a different thing: a rating of the shop as a whole, from anyone
/// using the app, moderated before it appears anywhere.
/// </summary>
[Table("app_reviews")]
public class AppReview
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    /// Null when the rating came from someone who was not signed in.
    [Column("customer_id")]
    public int? CustomerId { get; set; }

    /// Whose name goes on it once published. Taken from the account when there
    /// is one, asked for when there is not.
    [Column("name")]
    public string? Name { get; set; }

    [Column("rating")]
    public short Rating { get; set; }

    [Column("body")]
    public string? Body { get; set; }

    /// pending until the shop looks at it, then approved or rejected. Nothing
    /// reaches the website on any other value.
    [Column("status")]
    public string Status { get; set; } = "pending";

    /// app or web. Worth keeping apart: a rating left by someone who installed
    /// the app is not the same signal as one left in a browser tab.
    [Column("source")]
    public string Source { get; set; } = "app";

    /// When the customer was invited to put this on the Play Store, so they
    /// are invited once rather than at every launch. Null means not yet.
    [Column("play_invited_at")]
    public DateTimeOffset? PlayInvitedAt { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// Set when the customer rewrites their rating; the original date stays on
    /// created_at, exactly as a product review does.
    [Column("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }

    public Customer? Customer { get; set; }
}
