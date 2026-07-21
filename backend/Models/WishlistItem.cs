using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

// One saved product per logged-in customer. Mirrors the `wishlists` table in schema.sql
// (UNIQUE(customer_id, product_id)) so a product can only be saved once per customer.
[Table("wishlists")]
public class WishlistItem
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("customer_id")]
    public int CustomerId { get; set; }

    [Column("product_id")]
    public int ProductId { get; set; }

    [Column("added_at")]
    public DateTimeOffset AddedAt { get; set; } = DateTimeOffset.UtcNow;
}
