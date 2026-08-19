using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

// One row per wallet movement (a ledger). Positive amount = credit (money added to the
// customer's wallet — loyalty points earned, a refund, a referral bonus, or an admin top-up);
// negative amount = debit (wallet used at checkout, or an admin deduction). The customer's
// current balance is kept on customers.wallet_balance and always equals the running sum here.
[Table("wallet_transactions")]
public class WalletTransaction
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("customer_id")]
    public int CustomerId { get; set; }

    // Rupees, signed. e.g. +45.00 (earned) or -100.00 (redeemed).
    [Column("amount")]
    public decimal Amount { get; set; }

    // earn | redeem | refund | referral | signup | admin_adjust
    [Column("type")]
    public string Type { get; set; } = "";

    // The order this movement relates to (for earn/redeem), if any.
    [Column("order_id")]
    public string? OrderId { get; set; }

    [Column("note")]
    public string? Note { get; set; }

    // Wallet balance immediately after this transaction (for a clean statement view).
    [Column("balance_after")]
    public decimal BalanceAfter { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
