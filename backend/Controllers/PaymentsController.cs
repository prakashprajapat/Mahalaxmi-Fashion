using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PaymentsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly HttpClient _http;

    public PaymentsController(AppDbContext db, IConfiguration config, IHttpClientFactory httpFactory)
    {
        _db = db;
        _config = config;
        _http = httpFactory.CreateClient("razorpay");
    }

    // POST /api/payments/create-order
    [HttpPost("create-order")]
    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderRequest req)
    {
        var keyId     = _config["Razorpay:KeyId"] ?? "";
        var keySecret = _config["Razorpay:KeySecret"] ?? "";

        if (!keyId.StartsWith("rzp_") || string.IsNullOrEmpty(keySecret))
            return StatusCode(500, new { success = false, setupRequired = true, message = "Razorpay not configured." });

        var amountPaise = (int)(req.Amount * 100);
        var localOrderId = $"MFH{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";

        // BUG-7: Use per-request HttpRequestMessage to avoid DefaultRequestHeaders race condition
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{keyId}:{keySecret}"));

        var body = JsonSerializer.Serialize(new
        {
            amount   = amountPaise,
            currency = req.Currency ?? "INR",
            receipt  = localOrderId,
        });

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.razorpay.com/v1/orders");
        httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", credentials);
        httpRequest.Content = new StringContent(body, Encoding.UTF8, "application/json");

        using var response = await _http.SendAsync(httpRequest);

        if (!response.IsSuccessStatusCode)
            return StatusCode(502, new { success = false, message = "Razorpay API error." });

        var rawJson = await response.Content.ReadAsStringAsync();
        var rpOrder = JsonSerializer.Deserialize<JsonElement>(rawJson);
        var rpOrderId = rpOrder.GetProperty("id").GetString() ?? "";

        _db.RazorpayOrders.Add(new RazorpayOrder
        {
            LocalOrderId    = localOrderId,
            RazorpayOrderId = rpOrderId,
            AmountPaise     = amountPaise,
            Currency        = req.Currency ?? "INR",
            Status          = "created",
            CartJson        = JsonSerializer.Serialize(req.Cart),
            CustomerJson    = JsonSerializer.Serialize(req.Customer),
            ShippingJson    = JsonSerializer.Serialize(req.Shipping),
            RawOrderJson    = rawJson,
        });
        await _db.SaveChangesAsync();

        return Ok(new
        {
            success     = true,
            orderId     = rpOrderId,
            localOrderId,
            keyId,
            amountPaise,
        });
    }

    // POST /api/payments/verify
    [HttpPost("verify")]
    public async Task<IActionResult> VerifyPayment([FromBody] VerifyPaymentRequest req)
    {
        var keySecret = _config["Razorpay:KeySecret"] ?? "";
        var expectedSignature = HMACSHA256Hex(
            $"{req.RazorpayOrderId}|{req.RazorpayPaymentId}", keySecret);

        if (expectedSignature != req.RazorpaySignature)
            return BadRequest(new { success = false, message = "Signature verification failed." });

        var order = await _db.RazorpayOrders
            .FirstOrDefaultAsync(r => r.RazorpayOrderId == req.RazorpayOrderId);

        if (order is not null)
        {
            order.RazorpayPaymentId = req.RazorpayPaymentId;
            order.RazorpaySignature = req.RazorpaySignature;
            order.Status = "paid";
            order.PaidAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync();
        }

        return Ok(new { success = true, verified = true });
    }

    // POST /api/payments/webhook  — Razorpay server-to-server reconciliation.
    // Marks the Razorpay order paid even if the browser closed before /verify was called,
    // so a captured payment is never lost. Configure the URL + secret in the Razorpay dashboard.
    [HttpPost("webhook")]
    public async Task<IActionResult> Webhook()
    {
        var secret = _config["Razorpay:WebhookSecret"] ?? "";

        string body;
        using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
            body = await reader.ReadToEndAsync();

        // Verify the webhook signature (HMAC-SHA256 of the raw body).
        var sigHeader = Request.Headers["X-Razorpay-Signature"].ToString();
        if (string.IsNullOrEmpty(secret) || string.IsNullOrEmpty(sigHeader)
            || !string.Equals(HMACSHA256Hex(body, secret), sigHeader, StringComparison.OrdinalIgnoreCase))
            return Unauthorized(new { success = false, message = "Invalid webhook signature." });

        try
        {
            var evt = JsonSerializer.Deserialize<JsonElement>(body);
            var eventName = evt.TryGetProperty("event", out var en) ? en.GetString() : "";

            string? rpOrderId = null, rpPaymentId = null;
            if (evt.TryGetProperty("payload", out var payload)
                && payload.TryGetProperty("payment", out var pay)
                && pay.TryGetProperty("entity", out var ent))
            {
                rpOrderId   = ent.TryGetProperty("order_id", out var oid) ? oid.GetString() : null;
                rpPaymentId = ent.TryGetProperty("id", out var pid) ? pid.GetString() : null;
            }

            if ((eventName == "payment.captured" || eventName == "order.paid") && !string.IsNullOrEmpty(rpOrderId))
            {
                var order = await _db.RazorpayOrders.FirstOrDefaultAsync(r => r.RazorpayOrderId == rpOrderId);
                if (order is not null && order.Status != "paid")
                {
                    order.RazorpayPaymentId = rpPaymentId;
                    order.Status = "paid";
                    order.PaidAt = DateTimeOffset.UtcNow;
                    order.RawVerifyJson = body;
                    await _db.SaveChangesAsync();
                }
            }
        }
        catch { /* malformed payload — still return 200 so Razorpay doesn't retry endlessly */ }

        return Ok(new { success = true });
    }

    private static string HMACSHA256Hex(string data, string secret)
    {
        var keyBytes = Encoding.UTF8.GetBytes(secret);
        var dataBytes = Encoding.UTF8.GetBytes(data);
        using var hmac = new HMACSHA256(keyBytes);
        return Convert.ToHexString(hmac.ComputeHash(dataBytes)).ToLower();
    }
}

public record CreateOrderRequest(
    decimal Amount,
    string? Currency,
    object? Cart,
    object? Customer,
    object? Shipping
);

public record VerifyPaymentRequest(
    string RazorpayOrderId,
    string RazorpayPaymentId,
    string RazorpaySignature
);
