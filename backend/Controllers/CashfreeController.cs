using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

// Cashfree Payment Gateway (primary online gateway).
// Config (appsettings.json):
//   "Cashfree": { "AppId": "...", "SecretKey": "...", "Mode": "production" }  // ya "sandbox"
// Dashboard me webhook URL: https://mahalaxmifashionhub.com/api/cashfree/webhook
[ApiController]
[Route("api/[controller]")]
public class CashfreeController : ControllerBase
{
    private const string ApiVersion = "2023-08-01";

    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly HttpClient _http;
    private readonly ILogger<CashfreeController> _logger;

    public CashfreeController(AppDbContext db, IConfiguration config, IHttpClientFactory httpFactory, ILogger<CashfreeController> logger)
    {
        _db = db;
        _config = config;
        _http = httpFactory.CreateClient("cashfree");
        _logger = logger;
    }

    private (string appId, string secret, string mode, string baseUrl) Creds()
    {
        var appId  = _config["Cashfree:AppId"] ?? "";
        var secret = _config["Cashfree:SecretKey"] ?? "";
        var mode   = (_config["Cashfree:Mode"] ?? "production").ToLowerInvariant();
        var baseUrl = mode == "sandbox" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
        return (appId, secret, mode, baseUrl);
    }

    private HttpRequestMessage CfRequest(HttpMethod method, string url, string appId, string secret, string? jsonBody = null)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Add("x-client-id", appId);
        req.Headers.Add("x-client-secret", secret);
        req.Headers.Add("x-api-version", ApiVersion);
        req.Headers.Add("accept", "application/json");
        if (jsonBody is not null)
            req.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
        return req;
    }

    // POST /api/cashfree/create-order
    // Creates a Cashfree PG order and returns the payment_session_id for the JS SDK modal.
    [HttpPost("create-order")]
    public async Task<IActionResult> CreateOrder([FromBody] CreateCfOrderRequest req)
    {
        var (appId, secret, mode, baseUrl) = Creds();
        if (string.IsNullOrEmpty(appId) || string.IsNullOrEmpty(secret))
            return StatusCode(500, new { success = false, setupRequired = true, message = "Cashfree not configured." });

        var phone = new string((req.CustomerPhone ?? "").Where(char.IsDigit).ToArray());
        if (phone.Length > 10) phone = phone[^10..];
        if (phone.Length != 10)
            return BadRequest(new { success = false, message = "A valid 10-digit phone number is required for online payment." });

        var amountPaise = (int)Math.Round(req.Amount * 100m, MidpointRounding.AwayFromZero);
        var localOrderId = $"MFH{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";

        var body = JsonSerializer.Serialize(new
        {
            order_id = localOrderId,
            order_amount = Math.Round(req.Amount, 2),
            order_currency = req.Currency ?? "INR",
            customer_details = new
            {
                customer_id = string.IsNullOrWhiteSpace(req.CustomerId) || req.CustomerId == "0"
                    ? $"guest_{phone}" : $"cust_{req.CustomerId}",
                customer_name = req.CustomerName ?? "",
                customer_email = string.IsNullOrWhiteSpace(req.CustomerEmail) ? "orders@mahalaxmifashionhub.com" : req.CustomerEmail,
                customer_phone = phone,
            },
            order_meta = new
            {
                notify_url = "https://mahalaxmifashionhub.com/api/cashfree/webhook",
            },
            order_note = "Mahalaxmi Fashion Hub online order",
        });

        using var httpReq = CfRequest(HttpMethod.Post, $"{baseUrl}/orders", appId, secret, body);
        using var response = await _http.SendAsync(httpReq);
        var rawJson = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Cashfree create-order failed ({Status}): {Body}", (int)response.StatusCode, rawJson);
            return StatusCode(502, new { success = false, message = "Payment gateway error. Please try again." });
        }

        var cf = JsonSerializer.Deserialize<JsonElement>(rawJson);
        var sessionId = cf.TryGetProperty("payment_session_id", out var ps) ? ps.GetString() : null;
        var cfOrderId = cf.TryGetProperty("cf_order_id", out var co) ? co.ToString() : null;
        if (string.IsNullOrEmpty(sessionId))
            return StatusCode(502, new { success = false, message = "Payment gateway did not return a session. Please try again." });

        _db.CashfreeOrders.Add(new CashfreeOrder
        {
            LocalOrderId     = localOrderId,
            CfOrderId        = cfOrderId,
            PaymentSessionId = sessionId,
            AmountPaise      = amountPaise,
            Currency         = req.Currency ?? "INR",
            Status           = "created",
            CartJson         = JsonSerializer.Serialize(req.Cart),
            CustomerJson     = JsonSerializer.Serialize(req.Customer),
            ShippingJson     = JsonSerializer.Serialize(req.Shipping),
            RawOrderJson     = rawJson,
        });
        await _db.SaveChangesAsync();

        return Ok(new { success = true, paymentSessionId = sessionId, localOrderId, mode });
    }

    // POST /api/cashfree/verify  { localOrderId }
    // Server-to-server status check (never trust the browser callback alone).
    [HttpPost("verify")]
    public async Task<IActionResult> Verify([FromBody] VerifyCfRequest req)
    {
        var (appId, secret, _, baseUrl) = Creds();
        if (string.IsNullOrEmpty(appId) || string.IsNullOrEmpty(secret))
            return StatusCode(500, new { success = false, message = "Cashfree not configured." });

        var localId = new string((req.LocalOrderId ?? "").Where(char.IsLetterOrDigit).ToArray());
        if (string.IsNullOrEmpty(localId))
            return BadRequest(new { success = false, message = "Order id required." });

        var order = await _db.CashfreeOrders.FirstOrDefaultAsync(o => o.LocalOrderId == localId);
        if (order is null)
            return NotFound(new { success = false, message = "Order not found." });

        using var httpReq = CfRequest(HttpMethod.Get, $"{baseUrl}/orders/{localId}", appId, secret);
        using var response = await _http.SendAsync(httpReq);
        var rawJson = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Cashfree verify failed ({Status}): {Body}", (int)response.StatusCode, rawJson);
            return StatusCode(502, new { success = false, message = "Could not verify payment. Please contact support." });
        }

        var cf = JsonSerializer.Deserialize<JsonElement>(rawJson);
        var status = cf.TryGetProperty("order_status", out var st) ? st.GetString() : "";
        var paid = string.Equals(status, "PAID", StringComparison.OrdinalIgnoreCase);

        string? paymentId = null;
        if (paid)
        {
            // Fetch the successful payment's id for reconciliation.
            try
            {
                using var payReq = CfRequest(HttpMethod.Get, $"{baseUrl}/orders/{localId}/payments", appId, secret);
                using var payRes = await _http.SendAsync(payReq);
                if (payRes.IsSuccessStatusCode)
                {
                    var payments = JsonSerializer.Deserialize<JsonElement>(await payRes.Content.ReadAsStringAsync());
                    foreach (var p in payments.EnumerateArray())
                    {
                        var pStatus = p.TryGetProperty("payment_status", out var pst) ? pst.GetString() : "";
                        if (string.Equals(pStatus, "SUCCESS", StringComparison.OrdinalIgnoreCase))
                        {
                            paymentId = p.TryGetProperty("cf_payment_id", out var pid) ? pid.ToString() : null;
                            break;
                        }
                    }
                }
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Cashfree payments fetch failed for {Order}", localId); }

            if (order.Status != "paid")
            {
                order.Status = "paid";
                order.CfPaymentId = paymentId;
                order.PaidAt = DateTimeOffset.UtcNow;
                order.RawVerifyJson = rawJson;
                await _db.SaveChangesAsync();
            }
            paymentId ??= order.CfPaymentId;
        }

        return Ok(new { success = true, verified = paid, orderStatus = status, paymentId });
    }

    // POST /api/cashfree/webhook — server-to-server payment confirmation.
    // Signature: Base64( HMACSHA256( timestamp + rawBody, SecretKey ) )
    // Marks the order paid AND creates a recovery site_order if the customer's
    // browser closed before PlaceOrder (same safety net as the Razorpay webhook).
    [HttpPost("webhook")]
    public async Task<IActionResult> Webhook()
    {
        var (_, secret, _, _) = Creds();

        string body;
        using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
            body = await reader.ReadToEndAsync();

        var signature = Request.Headers["x-webhook-signature"].ToString();
        var timestamp = Request.Headers["x-webhook-timestamp"].ToString();
        if (string.IsNullOrEmpty(secret) || string.IsNullOrEmpty(signature) || string.IsNullOrEmpty(timestamp))
            return Unauthorized(new { success = false });

        using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret)))
        {
            var expected = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(timestamp + body)));
            if (!string.Equals(expected, signature, StringComparison.Ordinal))
                return Unauthorized(new { success = false, message = "Invalid webhook signature." });
        }

        try
        {
            var evt = JsonSerializer.Deserialize<JsonElement>(body);
            var type = evt.TryGetProperty("type", out var t) ? t.GetString() : "";
            if (!string.Equals(type, "PAYMENT_SUCCESS_WEBHOOK", StringComparison.OrdinalIgnoreCase))
                return Ok(new { success = true }); // ignore other events

            string? localId = null, cfPaymentId = null;
            if (evt.TryGetProperty("data", out var data))
            {
                if (data.TryGetProperty("order", out var o) && o.TryGetProperty("order_id", out var oid))
                    localId = oid.GetString();
                if (data.TryGetProperty("payment", out var p) && p.TryGetProperty("cf_payment_id", out var pid))
                    cfPaymentId = pid.ToString();
            }
            if (string.IsNullOrEmpty(localId)) return Ok(new { success = true });

            var order = await _db.CashfreeOrders.FirstOrDefaultAsync(c => c.LocalOrderId == localId);
            if (order is not null && order.Status != "paid")
            {
                order.Status = "paid";
                order.CfPaymentId = cfPaymentId;
                order.PaidAt = DateTimeOffset.UtcNow;
                order.RawVerifyJson = body;
                await _db.SaveChangesAsync();
            }

            // ── ORDER RECOVERY: money captured but no site_order (browser closed
            // before PlaceOrder). Create a "Paid" placeholder that the customer's
            // real PlaceOrder call completes via the webhook_recovery marker.
            if (order is not null)
            {
                var alreadyExists = await _db.SiteOrders.AnyAsync(s =>
                    s.OrderId == localId
                    || (cfPaymentId != null && s.PaymentId == cfPaymentId));
                if (!alreadyExists)
                {
                    _db.SiteOrders.Add(new SiteOrder
                    {
                        OrderId      = localId,
                        Method       = "cashfree",
                        Status       = "Paid",
                        PaymentId    = cfPaymentId,
                        Subtotal     = order.AmountPaise / 100m,
                        ShippingCost = 0m,
                        CodFee       = 0m,
                        Total        = order.AmountPaise / 100m,
                        CartJson     = order.CartJson,
                        CustomerJson = order.CustomerJson,
                        ShippingJson = order.ShippingJson,
                        RawJson      = "{\"source\":\"webhook_recovery\"}",
                        PlacedAt     = DateTimeOffset.UtcNow,
                    });
                    await _db.SaveChangesAsync();
                }
            }
        }
        catch (Exception ex)
        {
            // Malformed payload — log it but return 200 so Cashfree doesn't retry endlessly.
            _logger.LogError(ex, "Cashfree webhook processing failed.");
        }

        return Ok(new { success = true });
    }
}

public record CreateCfOrderRequest(
    decimal Amount,
    string? Currency,
    object? Cart,
    object? Customer,
    object? Shipping,
    string? CustomerId,
    string? CustomerName,
    string? CustomerEmail,
    string? CustomerPhone
);

public record VerifyCfRequest(string? LocalOrderId);
