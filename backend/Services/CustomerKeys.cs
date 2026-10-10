namespace MahalaxmiApi.Services;

/// <summary>
/// Turning what a shopper typed into something two orders can be compared by.
///
/// The same person writes her number as 9079160885, +91 9079160885, 0 9079160885
/// and 91-9079160885, and her email with a capital letter on Monday and without
/// one on Tuesday. Compared raw, those are eight different people, and a
/// once-per-customer rule built on them stops nobody.
/// </summary>
public static class CustomerKeys
{
    /// <summary>
    /// The last ten digits of an Indian mobile number, or null if what was given
    /// cannot be one.
    ///
    /// Ten digits is the part that identifies the phone; 91, +91 and a leading 0
    /// are how it was dialled, not who it belongs to. Anything shorter than ten
    /// digits is a typo rather than a number, and is treated as nothing at all -
    /// better to let a discount through than to block a real customer because
    /// her half-typed number collided with someone else's.
    /// </summary>
    public static string? Phone(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var digits = new string(raw.Where(char.IsDigit).ToArray());
        if (digits.Length > 10) digits = digits[^10..];
        return digits.Length == 10 ? digits : null;
    }

    /// <summary>The email, trimmed and lower-cased, or null if it is not one.</summary>
    public static string? Email(string? raw)
    {
        var e = (raw ?? string.Empty).Trim().ToLowerInvariant();
        if (e.Length < 5 || !e.Contains('@') || !e.Contains('.')) return null;
        return e;
    }

    /// <summary>
    /// Every identity an order carries, as (kind, value) pairs ready for
    /// coupon_redemptions. Empty when the order carries neither - and a rule
    /// that cannot recognise anybody must not pretend it can, so the caller
    /// lets that order through rather than guessing.
    /// </summary>
    public static List<(string Kind, string Value)> Of(string? phone, string? email)
    {
        var list = new List<(string, string)>();
        var p = Phone(phone);
        if (p is not null) list.Add(("phone", p));
        var e = Email(email);
        if (e is not null) list.Add(("email", e));
        return list;
    }
}
