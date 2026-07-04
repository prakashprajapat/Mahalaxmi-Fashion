using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;
using MahalaxmiApi.Data;
using MahalaxmiApi.DTOs;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions _json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static readonly string[] AllowedStatuses =
    [
        "Order Received", "Pending", "Pending confirmation", "Paid", "On Hold",
        "Order Packed", "Ready for Shipping",
        "Shipped", "Transit", "Delivered", "Return Requested", "Return Transit",
        "Return", "Cancel Requested", "Cancelled"
    ];

    public OrdersController(AppDbContext db) => _db = db;

    // GET /api/orders  (Admin = all paginated; Customer = filtered at DB level)
    [HttpGet]
    [Authorize]
    public async Task<IActionResult> GetOrders(
        [FromQuery] string? customerId,
        [FromQuery] string? email,
        [FromQuery] string? phone,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        bool isAdmin = User.HasClaim("role", "admin");

        // MISS-4 + PERF-1: Admin gets paginated results directly from DB
        if (isAdmin)
        {
            var adminQuery = _db.SiteOrders.OrderByDescending(o => o.PlacedAt ?? o.CreatedAt);
            var total = await adminQuery.CountAsync();
            var orders = await adminQuery
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();
            return Ok(new { success = true, orders = orders.Select(o => MapOrder(o)), total, page, pageSize });
        }

        // PERF-1: Customer — filter at DB level using JSON text search
        var tokenCustomerId = User.FindFirstValue("sub");
        var tokenEmail = User.FindFirstValue("email");
        var customer = int.TryParse(tokenCustomerId, out var cid)
            ? await _db.Customers.FindAsync(cid)
            : null;
        var cleanPhone = new string((customer?.Phone ?? "").Where(char.IsDigit).ToArray());
        if (cleanPhone.Length > 10) cleanPhone = cleanPhone[^10..];

        var customerQuery = _db.SiteOrders.AsQueryable();

        // Match an order to the signed-in customer if ANY reliable identifier matches:
        // the customer id embedded at checkout, their account email, or their verified phone.
        // NOTE: the previous logic required email AND phone together, which hid legitimate
        // orders whenever the checkout email was left blank or differed from the account
        // email (the common case for COD orders) — even though the order was clearly theirs.
        var hasId = cid > 0;
        var hasEmail = !string.IsNullOrEmpty(tokenEmail);
        var hasPhone = !string.IsNullOrEmpty(cleanPhone);
        if (!hasId && !hasEmail && !hasPhone)
            return Ok(new { success = true, orders = Array.Empty<object>() });

        // Trailing quote on the id needle prevents "5" from matching "50", etc.
        var idNeedle    = $"%\"id\":\"{cid}\"%";
        var emailNeedle = $"%{tokenEmail}%";
        var phoneNeedle = $"%{cleanPhone}%";

        customerQuery = customerQuery.Where(o =>
            (hasId    && EF.Functions.ILike(o.CustomerJson!, idNeedle)) ||
            (hasEmail && EF.Functions.ILike(o.CustomerJson!, emailNeedle)) ||
            (hasPhone && EF.Functions.ILike(o.CustomerJson!, phoneNeedle)));

        var filteredList = await customerQuery
            .OrderByDescending(o => o.PlacedAt ?? o.CreatedAt)
            .ToListAsync();

        return Ok(new { success = true, orders = filteredList.Select(o => MapOrder(o)) });
    }

    // GET /api/orders/{orderId}
    [HttpGet("{orderId}")]
    public async Task<IActionResult> GetById(string orderId)
    {
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId || o.Awb == orderId);
        if (order is null) return NotFound(new { success = false, message = "Order not found." });
        return Ok(new { success = true, order = MapOrder(order) });
    }

    // POST /api/orders  (Place order — public)
    [HttpPost]
    public async Task<IActionResult> PlaceOrder([FromBody] PlaceOrderRequest req)
    {
        var orderId = CleanOrderId(req.Id);
        var method = req.Method.ToLower().Trim();
        var status = !string.IsNullOrWhiteSpace(req.Status)
            ? req.Status
            : "Pending";

        // BUG-6: Prefer JWT sub claim over client-supplied customerId — must happen BEFORE building customerJson
        var jwtCustomerId = User.FindFirstValue("sub");
        if (!string.IsNullOrEmpty(jwtCustomerId) && jwtCustomerId != "0")
            req = req with { CustomerId = jwtCustomerId };

        var cart = JsonSerializer.Serialize(req.Cart, _json);
        var customerJson = JsonSerializer.Serialize(new
        {
            id = req.CustomerId ?? "",
            name = req.CustomerName ?? "",
            email = req.CustomerEmail ?? "",
            phone = req.CustomerPhone ?? ""
        }, _json);
        var shippingJson = JsonSerializer.Serialize(new
        {
            name = req.ShippingName ?? "",
            address = req.ShippingAddress ?? "",
            city = req.ShippingCity ?? "",
            pincode = req.ShippingPincode ?? "",
            state = req.ShippingState ?? ""
        }, _json);

        var existing = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (existing is not null)
        {
            // CQ-5: Never re-open a finalized order
            if (existing.Status is "Paid" or "Delivered" or "Cancelled")
                return Conflict(new { success = false, message = $"Order is already {existing.Status} and cannot be modified." });

            existing.Method = method;
            existing.Status = status;
            existing.PaymentId = req.PaymentId;
            existing.Subtotal = req.Subtotal;
            existing.ShippingCost = req.ShippingCost;
            existing.CodFee = req.CodFee;
            existing.Total = req.Total;
            existing.CartJson = cart;
            existing.CustomerJson = customerJson;
            existing.ShippingJson = shippingJson;
            existing.PlacedAt = req.PlacedAt ?? DateTimeOffset.UtcNow;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            _db.SiteOrders.Add(new SiteOrder
            {
                OrderId = orderId,
                Method = method,
                Status = status,
                PaymentId = req.PaymentId,
                Subtotal = req.Subtotal,
                ShippingCost = req.ShippingCost,
                CodFee = req.CodFee,
                Total = req.Total,
                CartJson = cart,
                CustomerJson = customerJson,
                ShippingJson = shippingJson,
                PlacedAt = req.PlacedAt ?? DateTimeOffset.UtcNow,
                // MISS-6: Store PAN details
                PanNumber = req.PanNumber?.Trim().ToUpper(),
                PanName = req.PanName?.Trim(),
                // Coupon
                CouponCode = string.IsNullOrWhiteSpace(req.CouponCode) ? null : req.CouponCode.Trim().ToUpper(),
                DiscountAmount = req.DiscountAmount,
            });
            // Increment coupon used_count
            if (!string.IsNullOrWhiteSpace(req.CouponCode))
            {
                var coupon = await _db.Coupons.FirstOrDefaultAsync(c => c.Code.ToLower() == req.CouponCode.ToLower());
                if (coupon is not null) { coupon.UsedCount++; }
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new { success = true, orderId });
    }

    // PATCH /api/orders/status  (Admin only)
    [HttpPatch("status")]
    [Authorize(Policy = "AdminOrStaff")]
    public async Task<IActionResult> UpdateStatus([FromBody] AdminUpdateOrderRequest req)
    {
        if (!AllowedStatuses.Contains(req.Status))
            return BadRequest(new { success = false, message = "Invalid status." });

        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == req.OrderId);
        if (order is null)
            return NotFound(new { success = false, message = "Order not found." });

        order.Status = req.Status;
        if (req.Awb is not null)
            order.Awb = new string(req.Awb.Where(char.IsLetterOrDigit).ToArray());
        // BUG-2: Record exact delivery time for accurate return window calculation
        if (string.Equals(req.Status, "Delivered", StringComparison.OrdinalIgnoreCase) && order.DeliveredAt is null)
            order.DeliveredAt = DateTimeOffset.UtcNow;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { success = true, order = MapOrder(order) });
    }

    // PATCH /api/orders/{orderId}/cancel  (Customer cancel request, allowed within 12 hours)
    [HttpPatch("{orderId}/cancel")]
    [Authorize]
    public async Task<IActionResult> RequestCancel(string orderId)
    {
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order is null)
            return NotFound(new { success = false, message = "Order not found." });

        // SEC-4 IDOR: verify caller owns this order (admin bypasses)
        if (!User.HasClaim("role", "admin"))
        {
            var callerId = User.FindFirstValue("sub");
            var callerEmail = User.FindFirstValue("email");
            var orderCustomerId = GetJsonStr(ParseJson(order.CustomerJson), "id");
            var orderEmail = GetJsonStr(ParseJson(order.CustomerJson), "email");
            if (callerId != orderCustomerId &&
                !string.Equals(callerEmail, orderEmail, StringComparison.OrdinalIgnoreCase))
                return Forbid();
        }

        if (order.Status == "Cancel Requested")
            return Ok(new { success = true, order = MapOrder(order), message = "Cancel request already submitted." });

        if (!new[] { "Order Received", "Pending", "Pending confirmation" }.Contains(order.Status))
            return BadRequest(new { success = false, message = "This order can no longer be cancelled online." });

        var placedAt = order.PlacedAt ?? order.CreatedAt;
        if (DateTimeOffset.UtcNow - placedAt > TimeSpan.FromHours(12))
            return BadRequest(new { success = false, message = "Orders can be cancelled online only within 12 hours of placement." });

        order.RawJson = JsonSerializer.Serialize(new
        {
            previousStatusBeforeCancel = order.Status,
            cancelRequestedAt = DateTimeOffset.UtcNow
        }, _json);
        order.Status = "Cancel Requested";
        order.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, order = MapOrder(order) });
    }

    // POST /api/orders/{orderId}/return  (Customer return request, allowed within 7 days of delivery)
    [HttpPost("{orderId}/return")]
    [Authorize]
    public async Task<IActionResult> RequestReturn(string orderId, [FromBody] ReturnRequest req)
    {
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order is null)
            return NotFound(new { success = false, message = "Order not found." });

        // SEC-4 IDOR: verify caller owns this order
        if (!User.HasClaim("role", "admin"))
        {
            var callerId = User.FindFirstValue("sub");
            var callerEmail = User.FindFirstValue("email");
            var orderCustomerId = GetJsonStr(ParseJson(order.CustomerJson), "id");
            var orderEmail = GetJsonStr(ParseJson(order.CustomerJson), "email");
            if (callerId != orderCustomerId &&
                !string.Equals(callerEmail, orderEmail, StringComparison.OrdinalIgnoreCase))
                return Forbid();
        }

        if (order.Status == "Return Requested")
            return Ok(new { success = true, order = MapOrder(order), message = "Return request already submitted." });

        if (order.Status != "Delivered")
            return BadRequest(new { success = false, message = "Only delivered orders can be returned." });

        // BUG-2: Use DeliveredAt if recorded, otherwise fall back to UpdatedAt
        var deliveredAt = order.DeliveredAt ?? order.UpdatedAt;
        if (DateTimeOffset.UtcNow - deliveredAt > TimeSpan.FromDays(7))
            return BadRequest(new { success = false, message = "The 7-day return window has expired." });

        order.RawJson = JsonSerializer.Serialize(new
        {
            returnRequestedAt = DateTimeOffset.UtcNow,
            returnReason = req.Reason?.Trim() ?? ""
        }, _json);
        order.Status = "Return Requested";
        order.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, order = MapOrder(order) });
    }

    private static JsonElement ParseJson(string? raw)
    {
        if (string.IsNullOrEmpty(raw)) return new JsonElement();
        try { return JsonSerializer.Deserialize<JsonElement>(raw); }
        catch { return new JsonElement(); }
    }

    private static string? GetJsonStr(JsonElement el, string key) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(key, out var v)
            ? v.GetString() : null;

    private static string CleanOrderId(string? raw)
    {
        var id = new string((raw ?? "").Where(c => char.IsLetterOrDigit(c) || c == '_' || c == '-').ToArray());
        return string.IsNullOrEmpty(id) ? $"MFH{DateTime.UtcNow:yyMMddHHmmssfff}" : id;
    }

    private static OrderDto MapOrder(SiteOrder o)
    {
        var customerJson = string.IsNullOrEmpty(o.CustomerJson)
            ? new JsonElement()
            : JsonSerializer.Deserialize<JsonElement>(o.CustomerJson);
        var shippingJson = string.IsNullOrEmpty(o.ShippingJson)
            ? new JsonElement()
            : JsonSerializer.Deserialize<JsonElement>(o.ShippingJson);
        var cartLines = string.IsNullOrEmpty(o.CartJson)
            ? new List<CartLineDto>()
            : JsonSerializer.Deserialize<List<CartLineDto>>(o.CartJson, _json) ?? [];

        return new OrderDto(
            o.OrderId,
            o.PaymentId,
            o.Method,
            o.Status,
            cartLines,
            o.Subtotal,
            o.ShippingCost,
            o.CodFee,
            o.Total,
            o.Awb,
            GetJsonStr(customerJson, "id"),
            GetJsonStr(customerJson, "name"),
            GetJsonStr(customerJson, "email"),
            GetJsonStr(customerJson, "phone"),
            GetJsonStr(shippingJson, "name"),
            GetJsonStr(shippingJson, "address"),
            GetJsonStr(shippingJson, "city"),
            GetJsonStr(shippingJson, "pincode"),
            GetJsonStr(shippingJson, "state"),
            o.PlacedAt,
            // BUG-2: Use recorded DeliveredAt; fall back to UpdatedAt for legacy orders
            o.DeliveredAt ?? (string.Equals(o.Status, "Delivered", StringComparison.OrdinalIgnoreCase) ? o.UpdatedAt : null),
            o.CreatedAt,
            o.UpdatedAt,
            o.PanNumber,
            o.PanName
        );
    }
}

public record ReturnRequest(string? Reason);
