using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// Has this shopper any room left on this code?
///
/// The per-customer limit used to live in exactly one place: the atomic claim
/// taken while the order is being written. That was enough to stop a COD order
/// - the claim fails, the discount is dropped - and not nearly enough for a
/// prepaid one, where the claim failing deliberately KEEPS the discount on the
/// grounds that she has already paid the discounted amount.
///
/// Which is right for the race it was written for: the whole code hitting its
/// MaxUses ceiling in the seconds between paying and the order being written.
/// It is wrong for a limit she had already used up before she started, because
/// then she should never have been offered the discounted amount at all. The
/// result was that WELCOME10 kept working, order after order, for anyone who
/// paid online.
///
/// So the question is asked EARLIER now, in three places that must agree:
/// the checkout preview, the amount the payment gateway is asked for, and the
/// order itself. This is that question, in one place, so they cannot drift.
///
/// The atomic claim stays exactly where it was. This is a read, and a read can
/// be raced; the claim is what actually reserves the slot. The two do different
/// jobs: this one refuses the ordinary repeat before any money moves, and the
/// claim refuses the once-in-a-blue-moon simultaneous pair.
/// </summary>
public static class CouponLimits
{
    /// <summary>
    /// True when this shopper may still use this code.
    ///
    /// A limit of 0 or less means no limit. A shopper carrying neither a usable
    /// mobile number nor a usable email is let through: a rule that cannot
    /// recognise anybody must not pretend it can, and refusing everyone
    /// anonymous would turn a welcome code into a code nobody can use.
    ///
    /// Either identity being full is enough to refuse, because the claim needs
    /// room on BOTH - an answer of yes here where the claim says no is the one
    /// combination that lets somebody agree to one price and pay another.
    /// </summary>
    public static async Task<bool> HasRoomAsync(
        AppDbContext db, string? code, int perCustomerLimit, string? phone, string? email)
    {
        if (perCustomerLimit <= 0) return true;
        if (string.IsNullOrWhiteSpace(code)) return true;

        var ids = CustomerKeys.Of(phone, email);
        if (ids.Count == 0) return true;

        var codeKey = code.Trim().ToLowerInvariant();
        var phoneKey = ids.FirstOrDefault(i => i.Kind == "phone").Value;
        var emailKey = ids.FirstOrDefault(i => i.Kind == "email").Value;

        var full = await db.CouponRedemptions.AnyAsync(r =>
            r.CodeLower == codeKey
            && r.Uses >= perCustomerLimit
            && ((phoneKey != null && r.IdKind == "phone" && r.IdValue == phoneKey)
             || (emailKey != null && r.IdKind == "email" && r.IdValue == emailKey)));

        return !full;
    }
}
