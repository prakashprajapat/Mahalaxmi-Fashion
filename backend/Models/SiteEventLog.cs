using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// A shopper's step through the shop, kept so the owner can see WHERE people
/// stop — not who they are.
///
/// These events were already being sent to Meta, and nowhere else. So the one
/// question worth asking after a day of advertising — "four hundred came, how
/// far did they get?" — had no answer in this panel at all, and Google
/// Analytics throws its copy away after fourteen months.
///
/// Deliberately thin: the step, when, and how much the basket was worth. No
/// name, no email, no phone, no IP, no cookie. A count of steps answers the
/// question; a trail of people is a liability that does not.
[Table("site_event_log")]
public class SiteEventLog
{
    [Key]
    [Column("id")]
    public long Id { get; set; }

    /// Meta's spelling, because that is what the browser already sends:
    /// ViewContent, AddToCart, InitiateCheckout, and so on.
    [Column("event_name")]
    public string EventName { get; set; } = "";

    /// Basket value where the step has one. Null, not zero, when it does not —
    /// a wishlist add is worth nothing in a way that averages must not count.
    [Column("value")]
    public decimal? Value { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
