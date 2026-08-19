using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

// Single place that moves money in/out of a customer's loyalty wallet. Every call writes one
// ledger row (wallet_transactions) AND updates the cached balance (customers.wallet_balance)
// in the same save, so the two never drift apart.
public class WalletService
{
    private readonly AppDbContext _db;
    public WalletService(AppDbContext db) => _db = db;

    // Credit (amount > 0) or debit (amount < 0) a wallet. Returns the new balance, or the
    // unchanged balance if the movement was skipped (e.g. earn already recorded for this order,
    // or a debit larger than the balance). `type`: earn | redeem | refund | referral | signup | admin_adjust.
    public async Task<decimal> MoveAsync(int customerId, decimal amount, string type, string? orderId = null, string? note = null)
    {
        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == customerId);
        if (customer is null) return 0m;

        // Idempotency: never award loyalty twice for the same order.
        if (type == "earn" && !string.IsNullOrEmpty(orderId) &&
            await _db.WalletTransactions.AnyAsync(t => t.Type == "earn" && t.OrderId == orderId))
            return customer.WalletBalance;

        // Never let a debit push the balance below zero.
        if (amount < 0 && customer.WalletBalance + amount < 0)
            return customer.WalletBalance;

        amount = Math.Round(amount, 2);
        if (amount == 0) return customer.WalletBalance;

        customer.WalletBalance = Math.Round(customer.WalletBalance + amount, 2);
        customer.UpdatedAt = DateTimeOffset.UtcNow;

        _db.WalletTransactions.Add(new WalletTransaction
        {
            CustomerId   = customerId,
            Amount       = amount,
            Type         = type,
            OrderId      = orderId,
            Note         = note,
            BalanceAfter = customer.WalletBalance,
            CreatedAt    = DateTimeOffset.UtcNow,
        });

        await _db.SaveChangesAsync();
        return customer.WalletBalance;
    }
}
