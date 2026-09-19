using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

// A lead from a Google Ads lead form asset. Meta pushes its leads to us by
// webhook; Google does not — the API has to be asked. Google also throws the
// data away after about 60 days, so every sync copies it here and it stays.
[Table("google_leads")]
public class GoogleLead
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    // Google's own id for the submission — how a re-sync avoids duplicating it.
    [Required]
    [Column("submission_id")]
    public string SubmissionId { get; set; } = "";

    [Column("campaign_name")]
    public string? CampaignName { get; set; }

    [Column("asset_name")]
    public string? AssetName { get; set; }

    [Column("full_name")]
    public string? FullName { get; set; }

    [Column("phone")]
    public string? Phone { get; set; }

    [Column("email")]
    public string? Email { get; set; }

    [Column("city")]
    public string? City { get; set; }

    [Column("postal_code")]
    public string? PostalCode { get; set; }

    // Everything Google sent, so a field we did not map is not lost.
    [Column("raw_json")]
    public string? RawJson { get; set; }

    [Column("is_read")]
    public bool IsRead { get; set; }

    // When the shopper submitted it, as Google reports it.
    [Column("submitted_at")]
    public DateTimeOffset SubmittedAt { get; set; } = DateTimeOffset.UtcNow;

    // When we copied it here.
    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
