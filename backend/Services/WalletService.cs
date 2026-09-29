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

        amount = Math.Round(amount, 2);
        if (amount == 0) return customer.WalletBalance;

        // The balance is changed by the database, in one statement, with the
        // "never below zero" rule inside the same WHERE that does the changing.
        //
        // Reading the balance and then writing balance + amount lets two
        // requests read ₹1,000 at the same moment, both find ₹700 affordable,
        // and both write ₹300 — ₹1,400 spent from ₹1,000, and a ledger that no
        // longer adds up to the balance beside it. Two taps on a slow phone are
        // enough; nobody has to be trying.
        var rows = await _db.Database.ExecuteSqlInterpolatedAsync($@"
            UPDATE customers
               SET wallet_balance = ROUND(wallet_balance + {amount}, 2),
                   updated_at     = NOW()
             WHERE id = {customerId}
               AND wallet_balance + {amount} >= 0");

        // Nothing changed means the rule stopped it: the balance would have gone
        // below zero. The caller is told the balance is unchanged, as before.
        if (rows == 0)
        {
            await _db.Entry(customer).ReloadAsync();
            return customer.WalletBalance;
        }

        // Read back what the database settled on, so the ledger row records the
        // balance that actually exists rather than the one this request expected.
        await _db.Entry(customer).ReloadAsync();

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
