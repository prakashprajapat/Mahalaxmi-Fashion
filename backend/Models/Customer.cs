using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

[Table("customers")]
public class Customer
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Required]
    [Column("customer_code")]
    public string CustomerCode { get; set; } = string.Empty;

    [Column("first_name")]
    public string FirstName { get; set; } = string.Empty;

    [Column("last_name")]
    public string LastName { get; set; } = string.Empty;

    [Column("gender")]
    public string Gender { get; set; } = string.Empty;

    [Column("email")]
    public string? Email { get; set; }

    [Column("phone")]
    public string Phone { get; set; } = string.Empty;

    [Column("date_of_birth")]
    public DateOnly? DateOfBirth { get; set; }

    [Column("marriage_date")]
    public DateOnly? MarriageDate { get; set; }

    // True once the customer has redeemed a birthday / anniversary coupon. The matching
    // date then locks (until then the customer may still edit it).
    [Column("birthday_offer_used")]
    public bool BirthdayOfferUsed { get; set; }

    [Column("anniversary_offer_used")]
    public bool AnniversaryOfferUsed { get; set; }

    [Column("addr_line1")]
    public string AddrLine1 { get; set; } = string.Empty;

    [Column("addr_line2")]
    public string AddrLine2 { get; set; } = string.Empty;

    [Column("pincode")]
    public string Pincode { get; set; } = string.Empty;

    [Column("post_office")]
    public string PostOffice { get; set; } = string.Empty;

    [Column("state")]
    public string State { get; set; } = string.Empty;

    [Column("district")]
    public string District { get; set; } = string.Empty;

    [Column("address_text")]
    public string? AddressText { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("marketing_consent")]
    public bool MarketingConsent { get; set; }

    [Column("submitted_at")]
    public string SubmittedAt { get; set; } = string.Empty;

    [Column("profile_status")]
    public string ProfileStatus { get; set; } = "Approved";

    [Column("contact_status")]
    public string ContactStatus { get; set; } = "Ready For Support";

    [Column("password_hash")]
    public string PasswordHash { get; set; } = string.Empty;

    [Column("password_salt")]
    public string PasswordSalt { get; set; } = string.Empty;

    [Column("account_status")]
    public string AccountStatus { get; set; } = "active";

    [Column("pan_number")]
    public string PanNumber { get; set; } = string.Empty;

    [Column("pan_name")]
    public string PanName { get; set; } = string.Empty;

    [Column("pan_image")]
    public string? PanImage { get; set; }

    [Column("pan_status")]
    public string PanStatus { get; set; } = "Pending Verification";

    [Column("email_verified")]
    public bool EmailVerified { get; set; }

    [Column("phone_verified")]
    public bool PhoneVerified { get; set; }

    [Column("deactivated_at")]
    public DateTimeOffset? DeactivatedAt { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
