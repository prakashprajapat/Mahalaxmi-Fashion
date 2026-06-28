using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

[Table("products")]
public class Product
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("sku")]
    public string? Sku { get; set; }

    [Required]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Required]
    [Column("category")]
    public string Category { get; set; } = string.Empty;

    [Column("subcategory")]
    public string Subcategory { get; set; } = string.Empty;

    [Column("price")]
    public decimal Price { get; set; }

    [Column("discount_price")]
    public decimal? DiscountPrice { get; set; }

    [Column("max_price")]
    public decimal? MaxPrice { get; set; }

    [Column("stock_status")]
    public string StockStatus { get; set; } = "In Stock";

    [Column("description")]
    public string? Description { get; set; }

    [Column("newest")]
    public int Newest { get; set; }

    [Column("image")]
    public string? Image { get; set; }

    [Column("extra_json", TypeName = "jsonb")]
    public string? ExtraJson { get; set; }

    [Column("best_seller")]
    public bool BestSeller { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
