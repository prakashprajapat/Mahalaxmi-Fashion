using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Paying customers back after a return or a cancellation.
///
/// A refund row is opened automatically the moment an order turns Return or
/// Cancelled (OrdersController.OpenRefundForOrderAsync), but it is opened as
/// PENDING and nothing moves on its own. Money leaving the business is a
/// decision, not a side effect: the owner picks the amount and where it goes,
/// and only then is a gateway called or a wallet credited.
///
/// Two rails that are not negotiable, because both failures are expensive and
/// neither is visible until the customer complains:
///   1. A refund can never pay out MORE than the customer actually paid
///      online. Less is allowed (damaged goods), more never is.
///   2. A paid refund can never be paid again. The row is marked before the
///      reply is written, and the pending unique index stops two open rows.
/// </summary>
[ApiController]
[Route("api/refunds")]
public class RefundsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpFactory;
    private readonly Services.WalletService _wallet;
    private readonly ILogger<RefundsController> _log;

    public RefundsController(
        AppDbContext db,
        IConfiguration config,
        IHttpClientFactory httpFactory,
        Services.WalletService wallet,
        ILogger<RefundsController> log)
    {
        _db = db;
        _config = config;
        _httpFactory = httpFactory;
        _wallet = wallet;
        _log = log;
    }

    private const string CashfreeApiVersion = "2023-08-01";

    private static JsonElement? ParseJson(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        try { return JsonSerializer.Deserialize<JsonElement>(raw); } catch { return null; }
    }

    private static string JsonStr(JsonElement? parent, string name)
    {
        if (parent is null) return "";
        var p = parent.Value;
        if (p.ValueKind != JsonValueKind.Object) return "";
        if (!p.TryGetProperty(name, out var v)) return "";
        return v.ValueKind == JsonValueKind.String ? (v.GetString() ?? "") : v.ToString();
    }

    private static int CustomerIdOf(SiteOrder order) =>
        int.TryParse(JsonStr(ParseJson(order.CustomerJson), "id"), out var id) && id > 0 ? id : 0;

    private string WhoAmI() =>
        User.FindFirstValue(ClaimTypes.Email)
        ?? User.FindFirstValue("email")
        ?? User.Identity?.Name
        ?? "admin";

    // ── the queue ────────────────────────────────────────────────────────────

    // GET /api/refunds?status=pending|settled|paid|failed|cancelled|all
    [HttpGet]
    [Authorize]
    [RequirePerm("orders", "reconcile", "refunds")]
    public async Task<IActionResult> List([FromQuery] string status = "pending", [FromQuery] int limit = 100)
    {
        limit = Math.Clamp(limit, 1, 500);
        var want = (status ?? "pending").Trim().ToLowerInvariant();

        var q = _db.OrderRefunds.AsNoTracking().AsQueryable();
        if (want == "pending") q = q.Where(r => r.Status == "pending");
        else if (want == "settled") q = q.Where(r => r.Status != "pending");
        else if (want == "paid" || want == "failed" || want == "cancelled") q = q.Where(r => r.Status == want);

        var rows = await q.OrderByDescending(r => r.Id).Take(limit).ToListAsync();

        var orderIds = rows.Select(r => r.OrderId).Distinct().ToList();
        var orders = await _db.SiteOrders.AsNoTracking()
            .Where(o => orderIds.Contains(o.OrderId))
            .ToListAsync();

        var byId = new Dictionary<string, SiteOrder>();
        foreach (var o in orders) byId[o.OrderId] = o;

        var list = new List<object>();
        foreach (var r in rows)
        {
            byId.TryGetValue(r.OrderId, out var o);
            JsonElement? cust = o is null ? null : ParseJson(o.CustomerJson);
            list.Add(new
            {
                id = r.Id,
                orderId = r.OrderId,
                suggestedAmount = r.SuggestedAmount,
                amount = r.Amount,
                method = r.Method,
                gateway = r.Gateway,
                gatewayRefundId = r.GatewayRefundId,
                status = r.Status,
                note = r.Note,
                failureReason = r.FailureReason,
                createdAt = r.CreatedAt,
                settledAt = r.SettledAt,
                settledBy = r.SettledBy,
                orderStatus = o?.Status,
                orderMethod = o?.Method,
                orderTotal = o?.Total ?? 0m,
                walletUsed = o?.WalletUsed ?? 0m,
                advancePaid = o?.AdvancePaid ?? 0m,
                customerName = JsonStr(cust, "name"),
                customerPhone = JsonStr(cust, "phone"),
                hasWallet = o is not null && CustomerIdOf(o) > 0,
            });
        }

        var pendingCount = await _db.OrderRefunds.CountAsync(r => r.Status == "pending");
        var pendingTotal = await _db.OrderRefunds.Where(r => r.Status == "pending")
            .SumAsync(r => (decimal?)r.SuggestedAmount) ?? 0m;

        return Ok(new { success = true, refunds = list, pendingCount, pendingTotal });
    }

    // ── paying one out ───────────────────────────────────────────────────────

    public record PayRequest(decimal Amount, string? Method, string? Note);

    // POST /api/refunds/{id}/pay   { amount, method: gateway|wallet, note }
    //
    // Gated on "reconcile" rather than "orders": this is the money section.
    // Someone who packs parcels should be able to see that a refund is owed
    // without being able to send it.
    [HttpPost("{id:int}/pay")]
    [Authorize]
    [RequirePerm("reconcile", "refunds")]
    public async Task<IActionResult> Pay(int id, [FromBody] PayRequest req)
    {
        var refund = await _db.OrderRefunds.FirstOrDefaultAsync(r => r.Id == id);
        if (refund is null)
            return NotFound(new { success = false, message = "No such refund." });
        if (refund.Status == "paid")
            return BadRequest(new { success = false, message = "This refund has already been paid." });
        if (refund.Status == "cancelled")
            return BadRequest(new { success = false, message = "This refund was cancelled. Open a new one if money is still owed." });

        var amount = Math.Round(req.Amount, 2);
        if (amount <= 0m)
            return BadRequest(new { success = false, message = "The refund amount must be more than Rs.0." });

        // The ceiling is what the customer actually paid online. Paying out
        // more than came in is never a correction, it is a mistake, and a typed
        // extra zero would be gone before anyone noticed.
        if (amount > refund.SuggestedAmount)
            return BadRequest(new
            {
                success = false,
                message = $"Rs.{amount:0.00} is more than the Rs.{refund.SuggestedAmount:0.00} this customer paid online. Refund that much or less."
            });

        var method = (req.Method ?? "").Trim().ToLowerInvariant();
        if (method != "gateway" && method != "wallet")
            return BadRequest(new { success = false, message = "Choose where the money goes: back to the gateway, or into the wallet." });

        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == refund.OrderId);
        if (order is null)
            return BadRequest(new { success = false, message = "The order behind this refund no longer exists." });

        var who = WhoAmI();
        var note = (req.Note ?? "").Trim();

        if (method == "wallet")
        {
            var cid = CustomerIdOf(order);
            if (cid <= 0)
                return BadRequest(new
                {
                    success = false,
                    message = "This order has no customer account, so there is no wallet to credit. Send it back through the gateway instead."
                });

            await _wallet.MoveAsync(cid, amount, "refund", order.OrderId,
                $"Refund for order {order.OrderId}");

            refund.Method = "wallet";
            refund.Amount = amount;
            refund.Status = "paid";
            refund.FailureReason = null;
            refund.SettledAt = DateTimeOffset.UtcNow;
            refund.SettledBy = who;
            if (note.Length > 0) refund.Note = note;
            await _db.SaveChangesAsync();

            _log.LogWarning("Refund {Id}: Rs {Amount} credited to wallet for order {Order} by {Who}",
                refund.Id, amount, order.OrderId, who);

            return Ok(new { success = true, refund = Shape(refund) });
        }

        // Where the money actually is, looked up now rather than trusted from
        // the row. The gateway was recorded when the refund was opened, from
        // the order's payment METHOD - so every COD order was written down as
        // cashfree whether or not that is where the advance went. Resolving it
        // here from the payment rows means the ones already written with the
        // wrong gateway correct themselves at payout, with no data to fix up.
        //
        // The stored value is still the fallback, for an order whose payment
        // rows have since been cleared.
        var stored = (refund.Gateway ?? "").Trim().ToLowerInvariant();
        var gateway = await PaymentGateways.ForOrderAsync(_db, order.OrderId) ?? stored;

        if (gateway != stored && stored.Length > 0)
        {
            _log.LogWarning(
                "Refund {Id} for order {Order} was opened against {Stored} but the payment is on {Actual}; using {Actual}",
                refund.Id, order.OrderId, stored, gateway, gateway);
            refund.Gateway = gateway;
        }

        if (gateway.Length == 0)
            return BadRequest(new
            {
                success = false,
                message = "No online payment is recorded against this order, so there is nothing for a gateway to send back. Credit the wallet instead, or pay the customer by hand.",
            });

        var result = gateway == PaymentGateways.Cashfree
            ? await CashfreeRefundAsync(order, amount, refund.Id)
            : await RazorpayRefundAsync(order, amount);

        if (!result.ok)
        {
            // A failed payout is still money owed, so the row stays open. Only
            // the reason is recorded, so the next attempt starts informed.
            refund.Status = "pending";
            refund.FailureReason = result.error;
            await _db.SaveChangesAsync();

            _log.LogError("Refund {Id} failed on {Gateway} for order {Order}: {Error}",
                refund.Id, gateway, order.OrderId, result.error);

            return BadRequest(new { success = false, message = result.error, refund = Shape(refund) });
        }

        refund.Method = "gateway";
        refund.Amount = amount;
        refund.Status = "paid";
        refund.GatewayRefundId = result.refundId;
        refund.FailureReason = null;
        refund.SettledAt = DateTimeOffset.UtcNow;
        refund.SettledBy = who;
        if (note.Length > 0) refund.Note = note;
        await _db.SaveChangesAsync();

        _log.LogWarning("Refund {Id}: Rs {Amount} sent via {Gateway} for order {Order} by {Who}, ref {Ref}",
            refund.Id, amount, gateway, order.OrderId, who, result.refundId);

        return Ok(new { success = true, refund = Shape(refund) });
    }

    public record CancelRequest(string? Note);

    // POST /api/refunds/{id}/cancel — nothing is owed after all (already paid
    // by hand, goods kept, fraud). The row is closed with a reason rather than
    // deleted, because "why was this never refunded" is asked months later.
    [HttpPost("{id:int}/cancel")]
    [Authorize]
    [RequirePerm("reconcile", "refunds")]
    public async Task<IActionResult> Cancel(int id, [FromBody] CancelRequest req)
    {
        var refund = await _db.OrderRefunds.FirstOrDefaultAsync(r => r.Id == id);
        if (refund is null)
            return NotFound(new { success = false, message = "No such refund." });
        if (refund.Status == "paid")
            return BadRequest(new { success = false, message = "This refund was already paid, so it cannot be cancelled." });

        var note = (req.Note ?? "").Trim();
        if (note.Length < 3)
            return BadRequest(new { success = false, message = "Write a short reason for cancelling the refund." });

        refund.Status = "cancelled";
        refund.Note = note;
        refund.SettledAt = DateTimeOffset.UtcNow;
        refund.SettledBy = WhoAmI();
        await _db.SaveChangesAsync();

        _log.LogWarning("Refund {Id} for order {Order} cancelled by {Who}: {Note}",
            refund.Id, refund.OrderId, refund.SettledBy, note);

        return Ok(new { success = true, refund = Shape(refund) });
    }

    private static object Shape(OrderRefund r) => new
    {
        id = r.Id,
        orderId = r.OrderId,
        suggestedAmount = r.SuggestedAmount,
        amount = r.Amount,
        method = r.Method,
        gateway = r.Gateway,
        gatewayRefundId = r.GatewayRefundId,
        status = r.Status,
        note = r.Note,
        failureReason = r.FailureReason,
        createdAt = r.CreatedAt,
        settledAt = r.SettledAt,
        settledBy = r.SettledBy,
    };

    // ── the gateways ─────────────────────────────────────────────────────────

    // Razorpay: POST /v1/payments/{payment_id}/refund, amount in paise.
    private async Task<(bool ok, string? refundId, string? error)> RazorpayRefundAsync(SiteOrder order, decimal amount)
    {
        var keyId = _config["Razorpay:KeyId"] ?? "";
        var keySecret = _config["Razorpay:KeySecret"] ?? "";
        if (!keyId.StartsWith("rzp_", StringComparison.Ordinal) || keySecret.Length == 0)
            return (false, null, "Razorpay is not configured on the server, so it cannot send the refund.");

        // The payment id, not the order id. It is usually on the order already;
        // older orders only have it on the razorpay_orders row.
        var paymentId = (order.PaymentId ?? "").Trim();
        if (!paymentId.StartsWith("pay_", StringComparison.Ordinal))
        {
            var rp = await _db.RazorpayOrders.AsNoTracking()
                .Where(r => r.LocalOrderId == order.OrderId && r.RazorpayPaymentId != null)
                .OrderByDescending(r => r.Status == "paid")
                .ThenByDescending(r => r.Id)
                .FirstOrDefaultAsync();
            paymentId = (rp?.RazorpayPaymentId ?? "").Trim();
        }
        if (paymentId.Length == 0)
            return (false, null, "No Razorpay payment is recorded against this order, so Razorpay has nothing to refund. Pay the customer by hand, or credit the wallet instead.");

        var body = JsonSerializer.Serialize(new
        {
            amount = (long)Math.Round(amount * 100m, MidpointRounding.AwayFromZero),
            speed = "normal",
        });

        try
        {
            var http = _httpFactory.CreateClient("razorpay");
            var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{keyId}:{keySecret}"));
            using var rq = new HttpRequestMessage(HttpMethod.Post,
                $"https://api.razorpay.com/v1/payments/{paymentId}/refund");
            rq.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);
            rq.Content = new StringContent(body, Encoding.UTF8, "application/json");

            using var res = await http.SendAsync(rq);
            var text = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
                return (false, null, "Razorpay refused the refund: " + GatewayMessage(text, (int)res.StatusCode));

            var j = JsonSerializer.Deserialize<JsonElement>(text);
            var refId = j.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
            return (true, refId, null);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Razorpay refund call failed for order {Order}", order.OrderId);
            return (false, null, "Could not reach Razorpay just now. Nothing was sent; try again.");
        }
    }

    // Cashfree: POST /pg/orders/{order_id}/refunds.
    //
    // {order_id} is OUR order id - the MFH... string sent as order_id when the
    // payment was created - and not cf_order_id, which is Cashfree's own
    // internal handle for the same thing. This sent cf_order_id, and Cashfree
    // answered every refund with
    //
    //     Order Reference Id does not exist (HTTP 404)
    //
    // which reads like the payment is missing and is really the path asking
    // after an id that is not the one it is indexed by. The Cashfree row is
    // still looked up, because its existence is the proof that a Cashfree
    // payment was taken at all - it is the id out of it that was wrong.
    //
    // refund_id is ours and must be unique per order. The refund row id is used
    // so a retry after a timeout reuses the same id: Cashfree then rejects the
    // duplicate instead of quietly paying the customer twice.
    private async Task<(bool ok, string? refundId, string? error)> CashfreeRefundAsync(SiteOrder order, decimal amount, int refundRowId)
    {
        var appId = _config["Cashfree:AppId"] ?? "";
        var secret = _config["Cashfree:SecretKey"] ?? "";
        var mode = (_config["Cashfree:Mode"] ?? "production").ToLowerInvariant();
        var baseUrl = mode == "sandbox" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
        if (appId.Length == 0 || secret.Length == 0)
            return (false, null, "Cashfree is not configured on the server, so it cannot send the refund.");

        // Paid attempts first. Newest-first on its own would aim the refund at
        // an abandoned checkout whenever a customer started again after having
        // already paid.
        var cf = await _db.CashfreeOrders.AsNoTracking()
            .Where(c => c.LocalOrderId == order.OrderId && c.CfOrderId != null)
            .OrderByDescending(c => c.Status == "paid")
            .ThenByDescending(c => c.Id)
            .FirstOrDefaultAsync();
        if (cf is null)
            return (false, null, "No Cashfree payment is recorded against this order, so Cashfree has nothing to refund. Pay the customer by hand, or credit the wallet instead.");

        // The id Cashfree indexes the order by: the one we gave it.
        var merchantOrderId = (cf.LocalOrderId ?? "").Trim();
        if (merchantOrderId.Length == 0)
            return (false, null, "The Cashfree payment on this order has no order number recorded, so it cannot be refunded automatically. Pay the customer by hand, or credit the wallet instead.");

        var body = JsonSerializer.Serialize(new
        {
            refund_amount = Math.Round(amount, 2),
            refund_id = $"RF{refundRowId}",
            refund_note = $"Refund for order {order.OrderId}",
        });

        try
        {
            var http = _httpFactory.CreateClient("cashfree");
            using var rq = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/orders/{merchantOrderId}/refunds");
            rq.Headers.Add("x-client-id", appId);
            rq.Headers.Add("x-client-secret", secret);
            rq.Headers.Add("x-api-version", CashfreeApiVersion);
            rq.Headers.Add("accept", "application/json");
            rq.Content = new StringContent(body, Encoding.UTF8, "application/json");

            using var res = await http.SendAsync(rq);
            var text = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
                return (false, null, "Cashfree refused the refund: " + GatewayMessage(text, (int)res.StatusCode));

            var j = JsonSerializer.Deserialize<JsonElement>(text);
            var refId = j.TryGetProperty("cf_refund_id", out var cfId)
                ? cfId.ToString()
                : (j.TryGetProperty("refund_id", out var rid) ? rid.GetString() : null);
            return (true, refId, null);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Cashfree refund call failed for order {Order}", order.OrderId);
            return (false, null, "Could not reach Cashfree just now. Nothing was sent; try again.");
        }
    }

    // The gateway's own words, kept. A refusal is only actionable if the
    // reason survives the trip to the screen.
    private static string GatewayMessage(string body, int status)
    {
        try
        {
            var j = JsonSerializer.Deserialize<JsonElement>(body);
            if (j.TryGetProperty("error", out var e) && e.TryGetProperty("description", out var d))
                return (d.GetString() ?? "") + $" (HTTP {status})";
            if (j.TryGetProperty("message", out var m))
                return (m.GetString() ?? "") + $" (HTTP {status})";
        }
        catch { /* not JSON, fall through */ }
        return $"HTTP {status}. The full reply is in the server log.";
    }

    // ── what the customer may see ────────────────────────────────────────────

    // GET /api/refunds/mine/{orderId} — the refund line on the customer's own
    // order. No amounts the owner has not settled on, no internal notes, no
    // gateway ids: just whether their money is on its way and where to.
    [HttpGet("mine/{orderId}")]
    [Authorize]
    public async Task<IActionResult> Mine(string orderId)
    {
        var order = await _db.SiteOrders.AsNoTracking().FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order is null) return NotFound(new { success = false, message = "No such order." });

        // Same ownership rule as the order itself: an empty email or id is
        // never an identity, or every phone-only customer would match every
        // guest order.
        if (!User.HasSectionAccess("orders", "reconcile", "refunds"))
        {
            var cust = ParseJson(order.CustomerJson);
            var callerId = User.FindFirstValue("sub");
            var callerEmail = User.FindFirstValue("email");
            var idMatches = !string.IsNullOrEmpty(callerId) && callerId == JsonStr(cust, "id");
            var emailMatches = !string.IsNullOrEmpty(callerEmail)
                && string.Equals(callerEmail, JsonStr(cust, "email"), StringComparison.OrdinalIgnoreCase);
            if (!idMatches && !emailMatches) return Forbid();
        }

        var r = await _db.OrderRefunds.AsNoTracking()
            .Where(x => x.OrderId == orderId && x.Status != "cancelled")
            .OrderByDescending(x => x.Id)
            .FirstOrDefaultAsync();

        if (r is null) return Ok(new { success = true, refund = (object?)null });

        return Ok(new
        {
            success = true,
            refund = new
            {
                status = r.Status == "paid" ? "paid" : "pending",
                amount = r.Status == "paid" ? r.Amount : r.SuggestedAmount,
                method = r.Status == "paid" ? r.Method : "",
                settledAt = r.SettledAt,
            },
        });
    }
}
