using System.Text.Json.Serialization;

namespace MahalaxmiApi.DTOs;

public record CartLineDto(
    string Id,
    string Name,
    string Sku,
    string Size,
    string Image,
    int    Quantity,
    decimal Price,
    decimal LineTotal,
    string Category,
    string Subcategory,
    decimal GstRate,
    string Hsn,
    // Structured colour info captured at checkout (optional — older orders won't have it)
    string? Color = null,
    string? ColorCode = null,
    string? ColorPhoto = null,
    string? ColorColumn = null
);

public record OrderDto(
    string  Id,
    string? PaymentId,
    string  Method,
    string  Status,
    List<CartLineDto> Cart,
    decimal Subtotal,
    decimal ShippingCost,
    decimal CodFee,
    decimal Total,
    string? Awb,
    string? CustomerId,
    string? CustomerName,
    string? CustomerEmail,
    string? CustomerPhone,
    string? ShippingName,
    string? ShippingAddress,
    string? ShippingCity,
    string? ShippingPincode,
    string? ShippingState,
    DateTimeOffset? PlacedAt,
    DateTimeOffset? DeliveredAt,
    DateTimeOffset  CreatedAt,
    DateTimeOffset  UpdatedAt,
    // MISS-6: PAN fields for high-value orders
    string? PanNumber = null,
    string? PanName = null,
    string? CouponCode = null,
    decimal DiscountAmount = 0,
    string? InvoiceNumber = null,
    string? Courier = null,
    string? ReturnIssue = null,
    string? ReturnReason = null,
    string? ReturnCallback = null
);

public record PlaceOrderRequest(
    string  Id,
    string  Method,
    string? Status,
    string? PaymentId,
    List<CartLineDto> Cart,
    decimal Subtotal,
    decimal ShippingCost,
    decimal CodFee,
    decimal Total,
    string? CustomerId,
    string? CustomerName,
    string? CustomerEmail,
    string? CustomerPhone,
    string? ShippingName,
    string? ShippingAddress,
    string? ShippingCity,
    string? ShippingPincode,
    string? ShippingState,
    DateTimeOffset? PlacedAt,
    // MISS-6: PAN details for high-value order compliance (₹2L+ threshold)
    string? PanNumber = null,
    string? PanName = null,
    string? CouponCode = null,
    decimal DiscountAmount = 0
);

public record AdminUpdateOrderRequest(
    string OrderId,
    string Status,
    string? Awb,
    string? Courier = null
);
