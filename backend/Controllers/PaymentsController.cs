using Microsoft.AspNetCore.Authorization;
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

                // ── ORDER RECOVERY (Critical fix) ─────────────────────────────────
                // Paisa capture ho gaya par customer ka browser PlaceOrder se pehle
                // band ho gaya → pehle site_order banta hi nahi tha (paisa aaya, order
                // gayab). Ab webhook stored cart/customer/shipping se ek "Paid"
                // placeholder order bana deta hai. Marker (webhook_recovery) ki wajah
                // se customer ka asli PlaceOrder call aane par yahi order complete ho
                // jata hai — duplicate nahi banta (order_id unique constraint bhi hai).
                if (order is not null)
                {
                    var localId = order.LocalOrderId;
                    var alreadyExists = await _db.SiteOrders.AnyAsync(o =>
                        o.OrderId == localId
                        || (rpPaymentId != null && o.PaymentId == rpPaymentId));
                    if (!alreadyExists)
                    {
                        _db.SiteOrders.Add(new SiteOrder
                        {
                            OrderId      = localId,
                            Method       = "online",
                            Status       = "Paid",
                            PaymentId    = rpPaymentId,
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
        }
        catch { /* malformed payload — still return 200 so Razorpay doesn't retry endlessly */ }

        return Ok(new { success = true });
    }

    // GET /api/payments/reconcile?from=2026-07-01&to=2026-07-13  (Admin only)
    // Razorpay payments vs site_orders match — mismatch/missing turant dikhta hai.
    [HttpGet("reconcile")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Reconcile([FromQuery] string? from, [FromQuery] string? to)
    {
        var keyId     = _config["Razorpay:KeyId"] ?? "";
        var keySecret = _config["Razorpay:KeySecret"] ?? "";
        if (!keyId.StartsWith("rzp_") || string.IsNullOrEmpty(keySecret))
            return StatusCode(500, new { success = false, message = "Razorpay not configured." });

        var toDate   = string.IsNullOrWhiteSpace(to)   ? DateTimeOffset.UtcNow : DateTimeOffset.Parse(to).AddDays(1);
        var fromDate = string.IsNullOrWhiteSpace(from) ? toDate.AddDays(-31)   : DateTimeOffset.Parse(from);
        if ((toDate - fromDate).TotalDays > 92)
            return BadRequest(new { success = false, message = "Maximum allowed date range is 92 days." });

        // ── 1. Razorpay se saare payments fetch (paginated) ──────────────────
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{keyId}:{keySecret}"));
        var payments = new List<JsonElement>();
        for (var skip = 0; skip < 10000; skip += 100)
        {
            var url = $"https://api.razorpay.com/v1/payments?from={fromDate.ToUnixTimeSeconds()}&to={toDate.ToUnixTimeSeconds()}&count=100&skip={skip}";
            using var rq = new HttpRequestMessage(HttpMethod.Get, url);
            rq.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", credentials);
            using var rs = await _http.SendAsync(rq);
            if (!rs.IsSuccessStatusCode)
                return StatusCode(502, new { success = false, message = $"Razorpay API error ({(int)rs.StatusCode})." });
            var page = JsonSerializer.Deserialize<JsonElement>(await rs.Content.ReadAsStringAsync());
            var items = page.GetProperty("items").EnumerateArray().ToList();
            payments.AddRange(items);
            if (items.Count < 100) break;
        }

        // ── 2. DB orders (same window, thoda buffer) ─────────────────────────
        var orders = await _db.SiteOrders
            .Where(o => o.PlacedAt >= fromDate.AddDays(-2) && o.PlacedAt <= toDate.AddDays(2))
            .Select(o => new { o.OrderId, o.PaymentId, o.Total, o.Status, o.Method, o.PlacedAt })
            .ToListAsync();
        var ordersByPaymentId = orders
            .Where(o => !string.IsNullOrEmpty(o.PaymentId))
            .GroupBy(o => o.PaymentId!)
            .ToDictionary(g => g.Key, g => g.First());

        // ── 3. Match ──────────────────────────────────────────────────────────
        var rows = new List<object>();
        var matchedPaymentIds = new HashSet<string>();
        int matched = 0, mismatch = 0, paymentNoOrder = 0, refunded = 0, failed = 0;
        decimal capturedTotal = 0, refundedTotal = 0;

        foreach (var p in payments)
        {
            var pid       = p.GetProperty("id").GetString() ?? "";
            var status    = p.GetProperty("status").GetString() ?? "";
            var amount    = p.GetProperty("amount").GetDecimal() / 100m;
            var refundAmt = p.TryGetProperty("amount_refunded", out var ar) ? ar.GetDecimal() / 100m : 0m;
            var email     = p.TryGetProperty("email",   out var em) && em.ValueKind == JsonValueKind.String ? em.GetString() : "";
            var contact   = p.TryGetProperty("contact", out var ct) && ct.ValueKind == JsonValueKind.String ? ct.GetString() : "";
            var createdAt = DateTimeOffset.FromUnixTimeSeconds(p.GetProperty("created_at").GetInt64());

            if (status == "failed") { failed++; continue; }
            if (status is not ("captured" or "refunded")) continue; // authorized/created skip

            if (refundAmt > 0) { refunded++; refundedTotal += refundAmt; }
            capturedTotal += amount;

            ordersByPaymentId.TryGetValue(pid, out var order);
            string category;
            if (order is null) { category = "PAYMENT_NO_ORDER"; paymentNoOrder++; }
            else
            {
                matchedPaymentIds.Add(pid);
                if (Math.Abs(order.Total - amount) > 0.5m) { category = "AMOUNT_MISMATCH"; mismatch++; }
                else { category = "MATCHED"; matched++; }
            }

            rows.Add(new
            {
                category,
                paymentId = pid,
                paymentAmount = amount,
                refundedAmount = refundAmt,
                paymentStatus = status,
                paymentDate = createdAt,
                email, contact,
                orderId = order?.OrderId,
                orderTotal = order?.Total,
                orderStatus = order?.Status,
            });
        }

        // ── 4. Online orders jinke against koi captured payment nahi mila ────
        var orphanOrders = orders
            .Where(o => o.Method != "cod"
                     && o.PlacedAt >= fromDate && o.PlacedAt <= toDate
                     && (string.IsNullOrEmpty(o.PaymentId) || !matchedPaymentIds.Contains(o.PaymentId!))
                     && o.Status is not ("Cancelled" or "Pending" or "Pending confirmation"))
            .ToList();
        foreach (var o in orphanOrders)
            rows.Add(new
            {
                category = "ORDER_NO_PAYMENT",
                paymentId = o.PaymentId,
                paymentAmount = (decimal?)null,
                refundedAmount = 0m,
                paymentStatus = (string?)null,
                paymentDate = (DateTimeOffset?)null,
                email = "", contact = "",
                orderId = (string?)o.OrderId,
                orderTotal = (decimal?)o.Total,
                orderStatus = (string?)o.Status,
            });

        return Ok(new
        {
            success = true,
            from = fromDate, to = toDate,
            summary = new
            {
                totalPayments = payments.Count,
                matched, amountMismatch = mismatch,
                paymentWithoutOrder = paymentNoOrder,
                orderWithoutPayment = orphanOrders.Count,
                refunded, failed,
                capturedTotal, refundedTotal,
            },
            rows,
        });
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
