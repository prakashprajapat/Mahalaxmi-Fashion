using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

// A customer asking to swap one thing they were sent for another.
//
// Its own table rather than a flag on the order, for three reasons. An exchange
// is about ONE line of the order - somebody who ordered three things and wants a
// larger size of one of them should not have to send all three back. It has a
// life of its own afterwards, moving from asked, to agreed, to the parcel coming
// back, to the new one going out, and an order status cannot hold four states at
// once alongside everything else it has to say. And it carries money: what was
// paid, what the new thing costs, and who owes whom the difference.
//
// The order still gets "Exchange Requested" put on it, because that is what the
// shop looks at first. This is where the detail lives.
[Table("exchange_requests")]
public class ExchangeRequest
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("order_id")]
    public string OrderId { get; set; } = string.Empty;

    [Column("customer_id")]
    public int? CustomerId { get; set; }

    // ── what they have ──────────────────────────────────────────────────────
    // The name and the price are copied in rather than looked up later: a
    // product can be renamed or repriced, and neither should change what this
    // customer was actually sent and actually paid.
    [Column("have_product_id")]
    public int HaveProductId { get; set; }

    [Column("have_name")]
    public string HaveName { get; set; } = string.Empty;

    [Column("have_size")]
    public string? HaveSize { get; set; }

    [Column("have_colour")]
    public string? HaveColour { get; set; }

    [Column("have_price")]
    public decimal HavePrice { get; set; }

    // ── what they want instead ──────────────────────────────────────────────
    [Column("want_product_id")]
    public int WantProductId { get; set; }

    [Column("want_name")]
    public string WantName { get; set; } = string.Empty;

    [Column("want_size")]
    public string? WantSize { get; set; }

    [Column("want_colour")]
    public string? WantColour { get; set; }

    [Column("want_price")]
    public decimal WantPrice { get; set; }

    /// <summary>Positive: the customer owes it. Negative: the shop does.</summary>
    [Column("price_difference")]
    public decimal PriceDifference { get; set; }

    // ── why, and who pays the courier ───────────────────────────────────────
    [Column("reason")]
    public string Reason { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    /// <summary>JSON array of photo paths this server issued.</summary>
    [Column("photos")]
    public string? Photos { get; set; }

    // shop | customer. Decided from the reason when the request arrives - a
    // wrong size sent is the shop's mistake, a size that did not suit is not -
    // and the shop can overrule it afterwards.
    [Column("shipping_paid_by")]
    public string ShippingPaidBy { get; set; } = "customer";

    // ── where it has got to ─────────────────────────────────────────────────
    // Requested | Approved | Rejected | Picked Up | Sent | Completed
    [Column("status")]
    public string Status { get; set; } = "Requested";

    [Column("admin_note")]
    public string? AdminNote { get; set; }

    /// <summary>The replacement's own courier number, once it goes out.</summary>
    [Column("new_awb")]
    public string? NewAwb { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
