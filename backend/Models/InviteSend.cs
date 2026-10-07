using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

// One row every time the "come and have a look" message actually goes out.
//
// The tick used to live in the page's own memory. It survived until the admin
// logged out, and then every customer looked unwritten-to again — so the same
// person could be mailed twice on Tuesday and twice more on Wednesday, and the
// shop had no way of knowing it had happened. A message sent from the phone was
// invisible to the laptop for the same reason.
//
// celebration_sends already learned this lesson for the birthday offers. This is
// the same lesson for the invite, and the same answer: one row in the database,
// one truth for every device.
//
// Kept separate from celebration_sends rather than folded into it, because this
// goes to leads as well as customers, and a table whose customer_id sometimes
// means a lead is a table that will be read wrong one day.
[Table("invite_sends")]
public class InviteSend
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    // customer | lead — which list the person is on. The two numbering schemes
    // overlap, so the id alone says nothing.
    [Column("audience")]
    public string Audience { get; set; } = "customer";

    [Column("person_id")]
    public int PersonId { get; set; }

    // email | whatsapp. Both are recorded, because "I have written to them"
    // and "I have mailed them" are different answers to the same question.
    [Column("channel")]
    public string Channel { get; set; } = "email";

    [Column("sent_by")]
    public string? SentBy { get; set; }

    [Column("sent_at")]
    public DateTimeOffset SentAt { get; set; } = DateTimeOffset.UtcNow;
}
