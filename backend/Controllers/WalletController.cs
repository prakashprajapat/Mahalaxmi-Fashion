using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

// Loyalty wallet — customers see their balance & statement; admins can view and adjust any wallet.
[ApiController]
[Route("api/wallet")]
public class WalletController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly WalletService _wallet;

    public WalletController(AppDbContext db, WalletService wallet)
    {
        _db = db;
        _wallet = wallet;
    }

    // GET /api/wallet — the signed-in customer's own wallet.
    [HttpGet]
    [Authorize]
    public async Task<IActionResult> Mine()
    {
        var idStr = User.FindFirstValue("sub");
        if (!int.TryParse(idStr, out var customerId))
            return Unauthorized();

        return Ok(await BuildWalletAsync(customerId));
    }

    // GET /api/wallet/customer/{id} — admin view of any customer's wallet.
    [HttpGet("customer/{id:int}")]
    [Authorize]
    [RequirePerm("customers")]
    public async Task<IActionResult> ForCustomer(int id)
        => Ok(await BuildWalletAsync(id));

    // POST /api/wallet/adjust — admin manually credits (+) or debits (-) a wallet.
    [HttpPost("adjust")]
    [Authorize]
    [RequirePerm("customers")]
    public async Task<IActionResult> Adjust([FromBody] WalletAdjustRequest req)
    {
        if (req.CustomerId <= 0 || req.Amount == 0)
            return BadRequest(new { success = false, message = "customerId and a non-zero amount are required." });

        var exists = await _db.Customers.AnyAsync(c => c.Id == req.CustomerId);
        if (!exists) return NotFound(new { success = false, message = "Customer not found." });

        var note = string.IsNullOrWhiteSpace(req.Note) ? "Manual adjustment by admin" : req.Note!.Trim();
        var balance = await _wallet.MoveAsync(req.CustomerId, req.Amount, "admin_adjust", null, note);
        return Ok(new { success = true, balance });
    }

    // POST /api/wallet/topup — credit the customer's wallet after they paid to add money.
    // The Razorpay order must be (a) verified paid, (b) tagged as a wallet top-up for THIS
    // customer at create-order time, and (c) not already credited. This makes it impossible to
    // credit a wallet without a real, matching payment.
    [HttpPost("topup")]
    [Authorize]
    public async Task<IActionResult> Topup([FromBody] WalletTopupRequest req)
    {
        var idStr = User.FindFirstValue("sub");
        if (!int.TryParse(idStr, out var customerId)) return Unauthorized();
        if (string.IsNullOrWhiteSpace(req.LocalOrderId))
            return BadRequest(new { success = false, message = "localOrderId is required." });

        var rp = await _db.RazorpayOrders.FirstOrDefaultAsync(r => r.LocalOrderId == req.LocalOrderId);
        if (rp is null || rp.Status != "paid")
            return BadRequest(new { success = false, message = "Payment could not be verified." });

        // Confirm this payment was created as a wallet top-up for the calling customer.
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(rp.CustomerJson) ? "{}" : rp.CustomerJson!);
            var root = doc.RootElement;
            var purpose = root.TryGetProperty("purpose", out var p) ? p.GetString() : null;
            var ownerId = root.TryGetProperty("id", out var i)
                ? (i.ValueKind == JsonValueKind.String ? i.GetString() : i.ToString())
                : null;
            if (purpose != "wallet_topup" || ownerId != customerId.ToString())
                return StatusCode(403, new { success = false, message = "This payment is not a wallet top-up for your account." });
        }
        catch { return BadRequest(new { success = false, message = "Invalid top-up order." }); }

        // Idempotent: one credit per paid order.
        if (await _db.WalletTransactions.AnyAsync(t => t.Type == "topup" && t.OrderId == req.LocalOrderId))
        {
            var bal = await _db.Customers.Where(c => c.Id == customerId).Select(c => c.WalletBalance).FirstOrDefaultAsync();
            return Ok(new { success = true, balance = bal, already = true });
        }

        var amount = rp.AmountPaise / 100m;
        var balance = await _wallet.MoveAsync(customerId, amount, "topup", req.LocalOrderId, "Added money to wallet");
        return Ok(new { success = true, balance });
    }

    private async Task<object> BuildWalletAsync(int customerId)
    {
        var balance = await _db.Customers.Where(c => c.Id == customerId)
            .Select(c => c.WalletBalance).FirstOrDefaultAsync();

        var txns = await _db.WalletTransactions
            .Where(t => t.CustomerId == customerId)
            .OrderByDescending(t => t.CreatedAt)
            .Take(100)
            .Select(t => new { t.Id, t.Amount, t.Type, t.OrderId, t.Note, t.BalanceAfter, createdAt = t.CreatedAt })
            .ToListAsync();

        return new { success = true, balance, transactions = txns };
    }
}

public record WalletAdjustRequest(int CustomerId, decimal Amount, string? Note);
public record WalletTopupRequest(string? LocalOrderId);
