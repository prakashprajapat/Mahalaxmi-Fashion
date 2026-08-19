using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
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
