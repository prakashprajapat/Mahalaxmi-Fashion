using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

[Table("supplier_applications")]
public class SupplierApplication
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("firm_name")]
    public string FirmName { get; set; } = string.Empty;

    [Column("contact_name")]
    public string ContactName { get; set; } = string.Empty;

    [Column("phone")]
    public string Phone { get; set; } = string.Empty;

    [Column("email")]
    public string? Email { get; set; }

    [Column("gst_number")]
    public string? GstNumber { get; set; }

    [Column("pan_number")]
    public string? PanNumber { get; set; }

    [Column("business_type")]
    public string? BusinessType { get; set; }   // Manufacturer / Wholesaler / Distributor / Other

    [Column("categories")]
    public string? Categories { get; set; }      // what they supply (sarees, nighty, fabric...)

    [Column("address")]
    public string? Address { get; set; }

    [Column("city")]
    public string? City { get; set; }

    [Column("state")]
    public string? State { get; set; }

    [Column("pincode")]
    public string? Pincode { get; set; }

    [Column("website")]
    public string? Website { get; set; }         // website / Instagram / catalogue link

    [Column("years_in_business")]
    public string? YearsInBusiness { get; set; }

    [Column("message")]
    public string? Message { get; set; }         // anything else

    [Column("status")]
    public string Status { get; set; } = "new";

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
