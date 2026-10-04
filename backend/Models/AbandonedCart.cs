using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// A basket somebody filled and walked away from.
///
/// The cart lives in the shopper's own browser, which is right — it must work
/// before anyone signs in, and it must not need the server to add a saree. But
/// it meant a basket left at eleven at night existed nowhere the shop could see
/// it, and the single most recoverable sale in any shop was invisible here.
///
/// One row per customer, overwritten as the basket changes, deleted the moment
/// they order. Only for people who are signed in: a basket with no name on it
/// cannot be reminded about, and following anonymous visitors around to attach
/// one is a different thing entirely, which this shop has not asked for and
/// does not need.
[Table("abandoned_carts")]
public class AbandonedCart
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("customer_id")]
    public int CustomerId { get; set; }

    /// The basket as the browser holds it — enough to name the items in the
    /// reminder, not enough to place an order from. Prices here are only for
    /// the email; a real order is always re-priced from the products table.
    [Column("items_json")]
    public string ItemsJson { get; set; } = "[]";

    [Column("item_count")]
    public int ItemCount { get; set; }

    [Column("value")]
    public decimal Value { get; set; }

    /// Last time the basket changed. The wait before a reminder is measured
    /// from here, so someone still shopping is never interrupted.
    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// Stamped when the one reminder goes out. One per basket, ever.
    [Column("reminded_at")]
    public DateTimeOffset? RemindedAt { get; set; }
}
