using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// <summary>
/// One call (or attempt) to a customer from Customers -> Follow-up Calls:
/// what happened and what was said. Two kinds:
///   review   a delivered order - ref_id is the order id
///   dropped  a payment left unfinished (USER_DROPPED2) - ref_id is the checkout id
/// A row per call, never edited, so the history of every conversation stays.
/// </summary>
[Table("followup_notes")]
public class FollowUpNote
{
    [Key][Column("id")] public long Id { get; set; }
    [Column("kind")] public string Kind { get; set; } = "review";
    [Column("ref_id")] public string RefId { get; set; } = "";
    /// <summary>Last ten digits.</summary>
    [Column("phone")] public string? Phone { get; set; }
    /// <summary>A short fixed word from the page's list (not_picked, will_review, ...).</summary>
    [Column("outcome")] public string Outcome { get; set; } = "";
    [Column("note")] public string? Note { get; set; }
    /// <summary>"Call back on" - set when the customer asked to be called later.</summary>
    [Column("callback_at")] public DateTimeOffset? CallbackAt { get; set; }
    [Column("created_by")] public string? CreatedBy { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
