using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// <summary>
/// One message that went to a customer about one order, written down so it
/// cannot go twice.
///
/// This table is the whole reason the feature is safe. The tracking sweep runs
/// every three hours and re-reads the same courier status each time: without a
/// record, a parcel that stays out for delivery all day would tell the customer
/// so eight times, and a delivered order would ask for a review every three
/// hours for ever. A duplicate SMS is not a cosmetic fault - it is the shop
/// losing the customer it was trying to keep.
///
/// The unique index on (order_id, template, attempt) is what enforces it, not
/// the code. Two sweeps racing each other both see no row and both decide to
/// send; only one of them gets to write.
/// </summary>
[Table("message_sends")]
public class MessageSend
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Required]
    [Column("order_id")]
    public string OrderId { get; set; } = string.Empty;

    /// The shop's own name for the message, matching the DLT template:
    /// OrderConfirm, Tracking, OutForDelivery, Delivered, Refund, Review,
    /// UserDropped.
    [Required]
    [Column("template")]
    public string Template { get; set; } = string.Empty;

    /// 1 for everything except the review reminders, which go up to three
    /// times and need to be told apart.
    [Column("attempt")]
    public short Attempt { get; set; } = 1;

    [Column("phone")]
    public string? Phone { get; set; }

    /// sent, failed or skipped. A failure is recorded too: without it the next
    /// sweep would try again for ever, and a number MSG91 refuses is refused
    /// every time.
    [Column("status")]
    public string Status { get; set; } = "sent";

    /// Why it failed or was skipped. Never the message body.
    [Column("detail")]
    public string? Detail { get; set; }

    [Column("sent_at")]
    public DateTimeOffset SentAt { get; set; } = DateTimeOffset.UtcNow;
}
