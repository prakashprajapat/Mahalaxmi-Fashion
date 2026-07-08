using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

[Table("reviews")]
public class Review
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("product_id")]
    public int ProductId { get; set; }

    [Column("customer_id")]
    public int? CustomerId { get; set; }

    [Column("rating")]
    public short Rating { get; set; }

    [Column("title")]
    public string? Title { get; set; }  // legacy — OrderId now stored in order_id column

    // BUG-5: Dedicated column for order_id (run migration SQL to add this column)
    [Column("order_id")]
    public string? OrderId { get; set; }

    [Column("body")]
    public string? Body { get; set; }

    // Customer-uploaded review photos, stored as a JSON array of image URLs (up to 3).
    [Column("image_urls")]
    public string? ImageUrls { get; set; }

    [Column("status")]
    public string Status { get; set; } = "pending";

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Product? Product { get; set; }
    public Customer? Customer { get; set; }
}
