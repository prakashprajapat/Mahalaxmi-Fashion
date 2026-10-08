using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// <summary>
/// One line of one delivered order, and what it owes the shop that supplied it.
///
/// A ledger row, not a calculation. The figures are COPIED in when the parcel is
/// delivered and never read from the product again, because a settlement that
/// recomputes itself is a settlement that can change after it was agreed: raise
/// a vendor's price in December and every order he was already paid for in
/// August would quietly be owed more. What a shop was owed for a sale is a fact
/// about that sale, and this row is where it stops moving.
///
/// It is written by a sweep rather than at the moment of delivery, on purpose.
/// Three different paths mark an order delivered - the admin screen, the
/// Delhivery tracking sync, and the COD flow - and a bookkeeping feature has no
/// business being wired into all three. The sweep looks for delivered orders
/// with no rows yet, so it catches every path, picks up orders delivered before
/// this existed, and can be run twice without paying anybody twice.
/// </summary>
[Table("staff_payouts")]
public class StaffPayout
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("order_id")]
    public string OrderId { get; set; } = string.Empty;

    /// <summary>Which line of that order. With order_id it is what makes a row unique.</summary>
    [Column("line_index")]
    public int LineIndex { get; set; }

    /// <summary>The shop as it was on the product when the parcel arrived.</summary>
    [Column("shop_name")]
    public string ShopName { get; set; } = string.Empty;

    [Column("product_id")]
    public int? ProductId { get; set; }

    [Column("sku")]
    public string? Sku { get; set; }

    [Column("product_name")]
    public string ProductName { get; set; } = string.Empty;

    [Column("qty")]
    public int Qty { get; set; }

    /// <summary>What the customer actually paid for one piece, off the order line.</summary>
    [Column("sold_unit")]
    public decimal SoldUnit { get; set; }

    /// <summary>What the shop asked for one piece.</summary>
    [Column("staff_unit")]
    public decimal StaffUnit { get; set; }

    /// <summary>staff_unit x qty. What is owed.</summary>
    [Column("staff_amount")]
    public decimal StaffAmount { get; set; }

    /// <summary>
    /// What is left over: (sold_unit - staff_unit) x qty.
    ///
    /// Not the platform fee that was typed on the product - what the fee turned
    /// out to be. Sell at a discount and this shrinks; sell below the shop's own
    /// price and it goes NEGATIVE, which is a real loss and is shown as one
    /// rather than clamped to zero. The shop still gets its full amount either
    /// way: that was the arrangement.
    /// </summary>
    [Column("platform_amount")]
    public decimal PlatformAmount { get; set; }

    [Column("delivered_at")]
    public DateTimeOffset DeliveredAt { get; set; }

    /// <summary>Delivered plus the return window. Before this the money is not owed yet.</summary>
    [Column("payable_at")]
    public DateTimeOffset PayableAt { get; set; }

    // pending | paid | cancelled
    //
    // "payable" is NOT a stored status - it is payable_at having passed, worked
    // out when the screen is read. A stored one would need a job to flip it and
    // would be wrong for as long as that job was late.
    [Column("status")]
    public string Status { get; set; } = "pending";

    [Column("paid_at")]
    public DateTimeOffset? PaidAt { get; set; }

    [Column("paid_note")]
    public string? PaidNote { get; set; }

    /// <summary>Why a cancelled row was cancelled - usually that the order came back.</summary>
    [Column("cancel_reason")]
    public string? CancelReason { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
