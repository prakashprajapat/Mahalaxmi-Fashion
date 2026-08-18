using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

// A lead captured from a Meta (Facebook / Instagram) Lead Ad. Meta calls our webhook
// the moment a shopper submits an instant lead form; we then pull the full field data
// from the Graph API and store one row here so it shows up in the admin panel instantly.
[Table("meta_leads")]
public class MetaLead
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    // Meta's unique id for this lead submission — used to de-duplicate (webhook can retry).
    [Column("leadgen_id")]
    public string LeadgenId { get; set; } = "";

    [Column("form_id")]
    public string? FormId { get; set; }

    [Column("form_name")]
    public string? FormName { get; set; }

    [Column("page_id")]
    public string? PageId { get; set; }

    [Column("ad_id")]
    public string? AdId { get; set; }

    [Column("campaign_name")]
    public string? CampaignName { get; set; }

    [Column("full_name")]
    public string? FullName { get; set; }

    [Column("phone")]
    public string? Phone { get; set; }

    [Column("email")]
    public string? Email { get; set; }

    [Column("city")]
    public string? City { get; set; }

    [Column("state")]
    public string? State { get; set; }

    // Everything Meta sent, as raw JSON — so no field is ever lost even if the form
    // asks a custom question we don't have a dedicated column for.
    [Column("raw_json")]
    public string? RawJson { get; set; }

    [Column("is_read")]
    public bool IsRead { get; set; } = false;

    // When the shopper actually submitted the form on Meta (from Meta's created_time).
    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
