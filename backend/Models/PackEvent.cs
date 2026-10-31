using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// <summary>
/// What happened at the packing bench, kept.
///
/// Pack and Scan used to remember the last twenty-five parcels in the page's
/// own memory, which is to say it remembered them until somebody pressed F5.
/// That is fine while the packer is standing there and useless for the two
/// questions that actually get asked: which bag did this order go into, and
/// who packed it. Those come up when a customer opens somebody else's parcel,
/// and by then the browser tab has been closed for a week.
///
/// Rows are added, never changed and never deleted - an undo is another row,
/// not the removal of the one it undoes. A history that can be edited is not a
/// history, and the moment anybody has a reason to quietly remove a line is
/// exactly the moment the line matters.
/// </summary>
[Table("pack_events")]
public class PackEvent
{
    [Key]
    [Column("id")]
    public long Id { get; set; }

    [Required]
    [Column("order_id")]
    public string OrderId { get; set; } = string.Empty;

    /// The waybill as it stood at the time. Kept on the row rather than looked
    /// up later, because an order's AWB can be replaced and the history must
    /// still say which label was in the packer's hand.
    [Column("awb")]
    public string? Awb { get; set; }

    /// packed, bag changed, bag cleared, or undone.
    [Required]
    [Column("action")]
    public string Action { get; set; } = string.Empty;

    [Column("bag_barcode")]
    public string? BagBarcode { get; set; }

    /// The bag this one replaced, when a parcel was re-packed.
    [Column("previous_bag")]
    public string? PreviousBag { get; set; }

    /// Where the order stood before and after. The pair is what makes an undo
    /// possible at all: without the first, "put it back" has nowhere to put it.
    [Column("previous_status")]
    public string? PreviousStatus { get; set; }

    [Column("new_status")]
    public string? NewStatus { get; set; }

    /// Whoever was signed in. The email, because that is what a staff member
    /// logs in with and what the owner would recognise.
    [Column("who")]
    public string? Who { get; set; }

    [Column("note")]
    public string? Note { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
