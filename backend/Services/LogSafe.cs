using System.Text.RegularExpressions;

namespace MahalaxmiApi.Services;

// What a log line is allowed to say about a person.
//
// A server log is not a private place. It is read over someone's shoulder,
// pasted into a chat while chasing a bug, shipped to whatever collects logs,
// and kept far longer than anyone ever decides to keep it. A customer's phone
// number and email address were going into it on every OTP, every order SMS and
// every email — in plain text, beside the provider's entire reply.
//
// None of that is needed to fix a fault. To know an SMS failed you need the
// status, the order, and the provider's error code. The last four digits are
// enough to match a line to a customer already in front of you, and useless to
// anyone who does not have them.
public static class LogSafe
{
    // 9829112233 -> ******2233.  A country code, when one was given, is kept:
    // "wrong country code" is a real fault, and 91 names nobody.
    public static string Phone(string? value)
    {
        var digits = new string((value ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length == 0) return "(none)";
        if (digits.Length <= 4) return new string('*', digits.Length);
        var cc = digits.Length > 10 ? digits[..(digits.Length - 10)] : "";
        return (cc.Length > 0 ? cc + "-" : "")
             + new string('*', digits.Length - cc.Length - 4)
             + digits[^4..];
    }

    // prakash@gmail.com -> p*****h@gmail.com.  The domain stays: a bounce is
    // nearly always one domain misbehaving, and a domain names no one person.
    public static string Email(string? value)
    {
        var v = (value ?? "").Trim();
        if (v.Length == 0) return "(none)";
        if (v.Contains(','))                      // a list is masked one at a time
            return string.Join(", ", v.Split(',').Select(x => Email(x)));

        var at = v.IndexOf('@');
        if (at <= 0) return "(invalid)";
        var name = v[..at];
        var rest = v[at..];
        if (name.Length <= 2) return new string('*', name.Length) + rest;
        return name[0] + new string('*', name.Length - 2) + name[^1] + rest;
    }

    private static readonly Regex LongDigits = new(@"\d{7,}", RegexOptions.Compiled);
    private static readonly Regex AnyEmail =
        new(@"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", RegexOptions.Compiled);

    // A provider's reply, made safe to keep.
    //
    // MSG91 and the rest echo the request back when they reject it, so the body
    // that explains the failure is also the body carrying the phone numbers.
    // Long digit runs and anything email-shaped are masked, and the result is
    // cut short — what names the fault is always at the front.
    public static string Body(string? value, int max = 400)
    {
        var v = (value ?? "").Trim();
        if (v.Length == 0) return "(empty)";
        v = AnyEmail.Replace(v, m => Email(m.Value));
        v = LongDigits.Replace(v, m => Phone(m.Value));
        return v.Length <= max ? v : v[..max] + "...(cut)";
    }
}
