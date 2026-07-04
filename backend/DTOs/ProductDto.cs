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
    int?    PackOf,
    int     ReviewCount = 0,
    double  AvgRating = 0,
    int     SoldCount = 0
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
    // Optional from here on — the Add UI doesn't send every field. Defaults keep
    // ASP.NET model validation from rejecting the request (e.g. missing "newest",
    // which the server fills with a sort-order fallback anyway).
    int     Newest = 0,
    string? Image = null,
    bool    BestSeller = false,
    object? ExtraJson = null,
    string? HsnCode = null,
    decimal? GstRate = null,
    int?    Qty = null,
    int?    PackOf = null
);

public record BulkSaveRequest(List<ProductCreateRequest> Products, bool ReplaceAll = false);
