using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

// A delivery address book entry. A customer can keep several (Home, Office, ...) and
// mark one as the default, which is the one checkout pre-selects.
// The single address still on the customers table stays as-is for older accounts; the
// address book is additive and is what checkout reads when it has entries.
[Table("customer_addresses")]
public class CustomerAddress
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("customer_id")]
    public int CustomerId { get; set; }

    // Free text, but the storefront offers Home / Office / Other.
    [Column("label")]
    public string Label { get; set; } = "Home";

    [Column("full_name")]
    public string FullName { get; set; } = string.Empty;

    [Column("phone")]
    public string Phone { get; set; } = string.Empty;

    [Column("addr_line1")]
    public string AddrLine1 { get; set; } = string.Empty;

    [Column("addr_line2")]
    public string AddrLine2 { get; set; } = string.Empty;

    [Column("pincode")]
    public string Pincode { get; set; } = string.Empty;

    [Column("city")]
    public string City { get; set; } = string.Empty;

    [Column("state")]
    public string State { get; set; } = string.Empty;

    // Exactly one row per customer should carry this; the controller enforces it.
    [Column("is_default")]
    public bool IsDefault { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
