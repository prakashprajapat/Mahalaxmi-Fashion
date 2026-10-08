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

    // Manual per-product shipping, added on top of the (discounted) rate to form the
    // final customer price. Hidden from the customer as a separate line. Default 0.
    [Column("shipping_charge")]
    public decimal ShippingCharge { get; set; }

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

    // Dukaan ka naam, product par hi likha hua - staff ki pankti se juda hua
    // nahi. Jaan-boojh kar: staff hata diya jaye to bhi product par naam bana
    // rehta hai, warna purane orders ka maal kahan se aaya tha yeh pata hi na
    // chalta.
    [Column("shop_name")]
    public string? ShopName { get; set; }

    // ── What the shop that supplied this is owed, and what is kept ──────────
    //
    // The vendor names staff_price; the owner adds platform_fee on top; the two
    // together are what the product is meant to sell for. They are per piece.
    //
    // They are NOT on ProductDto, and that is the whole safeguard. GET
    // /api/products answers anyone on the internet, and ProductDto is what it
    // returns - so a cost put on that record is a cost published to every
    // shopper and every competitor, and it would take one forgotten filter to
    // do it. These two are read back through an admin-only costing endpoint
    // instead, so there is no filter to forget.
    [Column("staff_price")]
    public decimal? StaffPrice { get; set; }

    [Column("platform_fee")]
    public decimal? PlatformFee { get; set; }

    [Column("best_seller")]
    public bool BestSeller { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
