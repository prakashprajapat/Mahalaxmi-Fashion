namespace MahalaxmiApi.DTOs;

public record ProductDto(
    int     DbId,
    string? Sku,
    string  Name,
    string  Category,
    string  Subcategory,
    decimal Price,
    decimal? DiscountPrice,
    decimal? MaxPrice,
    string  Stock,
    string? Description,
    int     Newest,
    string? Image,
    bool    BestSeller,
    string? ExtraJson,
    string? HsnCode,
    decimal? GstRate,
    int?    Qty,
    int?    PackOf
);

public record ProductCreateRequest(
    int?    DbId,
    string? Sku,
    string  Name,
    string  Category,
    string? Subcategory,
    decimal Price,
    decimal? DiscountPrice,
    decimal? MaxPrice,
    string  Stock,
    string? Description,
    int     Newest,
    string? Image,
    bool    BestSeller,
    object? ExtraJson,
    string? HsnCode,
    decimal? GstRate,
    int?    Qty,
    int?    PackOf
);

public record BulkSaveRequest(List<ProductCreateRequest> Products, bool ReplaceAll = false);
