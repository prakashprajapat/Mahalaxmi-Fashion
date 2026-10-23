using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// Spending a coupon: the claim, the atomic count, and what the order should
/// say afterwards.
///
/// This lived inside OrdersController, which meant only an order written by
/// PlaceOrder could ever spend a coupon. A prepaid order is often NOT written
/// by PlaceOrder - the Cashfree webhook beats the shopper's phone back to the
/// site and writes it first - and that order went in with no coupon code, no
/// discount recorded and nothing consumed. The same customer could use
/// WELCOME10 on every order he placed, and the invoice showed no discount at
/// all because the row did not carry one.
///
/// So it is here, where both the controller and the webhook can reach it.
/// There is one set of rules, not two.
/// </summary>
public static class CouponConsumer
{
    /// <summary>
    /// Write down that this shopper has used this code, or report that she already had.
    /// </summary>
    /// <remarks>
    /// The rule is enforced by the UNIQUE index on coupon_redemptions, not by a
    /// SELECT before an INSERT: two orders placed in the same second would both
    /// read "not used yet" and both be allowed. Here the second INSERT simply
    /// does nothing, and inserting fewer rows than we tried IS the answer.
    ///
    /// An order carrying neither a usable number nor a usable email is let
    /// through. A rule that cannot recognise anybody must not pretend it can.
    /// </remarks>
    public static async Task<bool> TryClaimAsync(AppDbContext db, string code, string? phone, string? email, string orderId)
    {
        var codeKey = code.Trim().ToLowerInvariant();
        var limit = await db.Coupons
            .Where(c => c.Code.ToLower() == codeKey)
            .Select(c => c.MaxPerCustomer)
            .FirstOrDefaultAsync() ?? 1;
        if (limit <= 0) return true;        // 0 = as often as she likes

        var ids = CustomerKeys.Of(phone, email);
        if (ids.Count == 0) return true;

        var inserted = 0;
        foreach (var (kind, value) in ids)
        {
            // One statement, and the limit is inside it.
            //
            // The row now carries a COUNT, so the rule is no longer "does a row
            // exist" but "has she got room left". Reading the count and then
            // writing it back would let two orders a second apart both read
            // two-of-three and both become the third. DO UPDATE ... WHERE puts
            // the comparison inside the write, where the unique index already
            // serialises them.
            inserted += await db.Database.ExecuteSqlInterpolatedAsync(
                $@"INSERT INTO coupon_redemptions (code_lower, id_kind, id_value, order_id, uses)
                   VALUES ({codeKey}, {kind}, {value}, {orderId}, 1)
                   ON CONFLICT (code_lower, id_kind, id_value)
                   DO UPDATE SET uses = coupon_redemptions.uses + 1, order_id = {orderId}
                   WHERE coupon_redemptions.uses < {limit}");
        }
        if (inserted == ids.Count) return true;

        // One of her two identities had used this code before. Whatever we just
        // wrote belongs to an order that is not getting the discount after all.
        await ReleaseAsync(db, orderId);
        return false;
    }

    /// <summary>Take back the claims written for an order that did not get the discount.</summary>
    /// <remarks>
    /// A decrement, not a delete. The row is now a running count for that
    /// shopper and that code, so deleting it would throw away every earlier
    /// use as well - she would get the offer again from scratch. order_id holds
    /// whichever order last touched the row, which is all this needs: a release
    /// always follows its own failed claim in the same request.
    ///
    /// A row left at zero is correct and is not tidied away. The claim asks
    /// whether uses is below the limit, so zero simply means she has room.
    /// </remarks>
    public static Task ReleaseAsync(AppDbContext db, string orderId) =>
        db.Database.ExecuteSqlInterpolatedAsync(
            $@"UPDATE coupon_redemptions SET uses = uses - 1, order_id = NULL
               WHERE order_id = {orderId} AND uses > 0");

    /// <summary>
    /// Spend the coupon for this order, and report what the order should now say.
    ///
    /// This used to sit inline in PlaceOrder, inside the `else` that runs only when
    /// the order does not exist yet. That was the whole bug: on the Cashfree path
    /// the WEBHOOK often writes a placeholder order first, so by the time the
    /// shopper's browser gets back and calls PlaceOrder, `existing` is not null,
    /// the else never runs, and the coupon is never spent. MaxUses and
    /// once-per-customer quietly stopped applying to every prepaid order.
    ///
    /// Pulled out here so there is ONE implementation and both the fresh-order and
    /// the complete-the-placeholder paths call it. Nothing inside it changed.
    ///
    /// Returns the discount, total and code the order should be written with: a
    /// coupon that turns out to be spent comes back with no discount on a COD
    /// order, and with the discount kept on a prepaid one, because that shopper
    /// has already paid the discounted amount.
    /// </summary>
    public static async Task<(decimal Discount, decimal Total, string? Code)> ConsumeAsync(
        AppDbContext db, AdminNotifier? notify, ILogger? log,
        string orderId, string? code, string method,
        decimal subtotal, decimal shipping, decimal codFee, decimal discount, decimal total,
        string? phone, string? email, string? customerId)
    {
        // Consume the coupon ATOMICALLY before storing the order. This single UPDATE both
        // increments used_count AND re-checks the cap in one statement, so two concurrent
        // orders can never both slip past a MaxUses limit (the old read-then-write could).
        if (!string.IsNullOrWhiteSpace(code))
        {
            // Claim the code for this shopper BEFORE counting it. If she has
            // used it before, the claim fails and the code is treated exactly
            // as a code that has run out - no discount, order still placed.
            var claimed = await TryClaimAsync(db, code!, phone, email, orderId);

            var rows = claimed
                ? await db.Database.ExecuteSqlInterpolatedAsync(
                    $"UPDATE coupons SET used_count = used_count + 1 WHERE lower(code) = lower({code}) AND (max_uses IS NULL OR used_count < max_uses)")
                : 0;

            if (rows == 0)
            {
                // The coupon just hit its usage cap via a concurrent order. For COD we drop the
                // discount (nothing charged yet); for a prepaid order the customer has already
                // paid the discounted amount, so we honour the order as placed.
                if (method == "cod")
                {
                    discount   = 0m;
                    total      = Math.Max(0m, subtotal + shipping + codFee);
                    code = null;
                    // No discount given, so she has not used the code - the claim
                    // goes back. A prepaid order KEEPS its discount, so its claim
                    // stays: she has had the offer, and must not get it twice.
                    await ReleaseAsync(db, orderId);
                }
            }
            else
            {
                await WarnIfNearlySpentAsync(db, notify, log, code!);
                // Coupon consumed. A birthday/anniversary offer also locks that occasion.
                var occasion = await db.Coupons
                    .Where(c => c.Code.ToLower() == code!.ToLower())
                    .Select(c => c.Occasion).FirstOrDefaultAsync();
                if ((occasion == "birthday" || occasion == "anniversary")
                    && int.TryParse(customerId, out var cid) && cid > 0)
                {
                    var buyer = await db.Customers.FindAsync(cid);
                    if (buyer is not null)
                    {
                        if (occasion == "birthday") buyer.BirthdayOfferUsed = true;
                        else buyer.AnniversaryOfferUsed = true;
                        buyer.UpdatedAt = DateTimeOffset.UtcNow;
                    }
                }
            }
        }
        return (discount, total, code);
    }

    /// <summary>
    /// Tell the shop when a code is four-fifths spent, once.
    ///
    /// A ceiling nobody is watching turns into a shopper being told the offer has
    /// reached its limit - which is how this was found in the first place. Fired
    /// on equality, so it is sent on exactly one order and never again.
    /// </summary>
    public static async Task WarnIfNearlySpentAsync(AppDbContext db, AdminNotifier? notify, ILogger? log, string code)
    {
        // The webhook has no notifier. A missing email is not a reason to fail
        // a coupon that has otherwise been spent correctly.
        if (notify is null) return;
        try
        {
            var codeKey = code.Trim().ToLowerInvariant();
            var c = await db.Coupons.AsNoTracking()
                .Where(x => x.Code.ToLower() == codeKey)
                .Select(x => new { x.Code, x.UsedCount, x.MaxUses })
                .FirstOrDefaultAsync();
            if (c?.MaxUses is not int max || max <= 0) return;

            var threshold = (int)Math.Ceiling(max * 0.8);
            if (c.UsedCount != threshold) return;

            var safeCode = System.Net.WebUtility.HtmlEncode(c.Code);
            await notify!.NotifyAsync(
                $"Coupon {c.Code} is almost used up",
                Services.AdminNotifier.Wrap("Coupon almost used up", $@"
                    <p><strong>{safeCode}</strong> has been used <strong>{c.UsedCount}</strong> of <strong>{max}</strong> times.</p>
                    <p>When it reaches {max}, shoppers will be told the offer has reached its limit.</p>
                    <p>Raise the limit in Admin &rarr; Coupons, or leave Max Uses blank for no limit.</p>"));
        }
        catch (Exception ex)
        {
            // A warning that fails must never cost the shop an order.
            log?.LogWarning(ex, "Could not send the coupon-nearly-spent warning for {Code}.", code);
        }
    }
}
