using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace MahalaxmiApi.Services;

// Server-side Purchase to Meta, through the Conversions API.
//
// The same reasoning as Ga4Mp next door. The browser's fbq('track','Purchase')
// is dropped whenever the shopper has an ad blocker, pays through the app or a
// UPI redirect, or the order is entered by hand in the admin — and Meta's ads
// bid on purchases, so a sale it never hears about is a sale it cannot learn
// from. Sending the same event from here means every order counts.
//
// This is deliberately NOT Meta's Conversions API Gateway, which is a server the
// shop would have to run, and pay for, in its own cloud account. This is one
// HTTPS call from the backend that already exists.
//
// Counted once: the order id goes out as event_id, and the browser sends the
// same id, so Meta collapses the pair. Without that every sale would show twice.
//
// Safe by design: does nothing until the access token is set in Settings, and
// every failure is swallowed so it can never break order placement.
public static class MetaCapi
{
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(5) };

    /// <summary>Confirmed current when this was written (Graph API v25.0, February 2026).</summary>
    private const string ApiVersion = "v25.0";

    /// <summary>
    /// Meta requires the customer's details hashed, never in the clear — lower-cased
    /// and trimmed first, or the hash will not match anything on their side.
    /// </summary>
    private static string? Sha256(string? raw)
    {
        var s = (raw ?? "").Trim().ToLowerInvariant();
        if (s.Length == 0) return null;
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(s));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    /// <summary>Digits only, with India's country code, which is the shape Meta hashes.</summary>
    private static string? HashPhone(string? raw)
    {
        var digits = new string((raw ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length == 0) return null;
        if (digits.Length == 10) digits = "91" + digits;
        return Sha256(digits);
    }

    public static async Task SendPurchaseAsync(
        string pixelId,
        string accessToken,
        string orderId,
        decimal value,
        string currency,
        string? email,
        string? phone,
        string? eventSourceUrl,
        IEnumerable<(string id, string name, int qty, decimal price)> items)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(pixelId) || string.IsNullOrWhiteSpace(accessToken))
                return; // not configured yet — no-op

            var userData = new Dictionary<string, object?>();
            var em = Sha256(email);
            var ph = HashPhone(phone);
            if (em is not null) userData["em"] = new[] { em };
            if (ph is not null) userData["ph"] = new[] { ph };
            if (userData.Count == 0) return;   // Meta rejects an event with nothing to match on

            var contents = items.Select(i => new Dictionary<string, object?>
            {
                ["id"]         = string.IsNullOrWhiteSpace(i.id) ? i.name : i.id,
                ["quantity"]   = Math.Max(1, i.qty),
                ["item_price"] = i.price,
            }).ToList();

            var ev = new Dictionary<string, object?>
            {
                ["event_name"]    = "Purchase",
                ["event_time"]    = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                ["event_id"]      = orderId,      // the pair with the browser's event
                ["action_source"] = "website",
                ["user_data"]     = userData,
                ["custom_data"]   = new Dictionary<string, object?>
                {
                    ["currency"]     = currency,
                    ["value"]        = value,
                    ["order_id"]     = orderId,
                    ["content_type"] = "product",
                    ["contents"]     = contents,
                },
            };
            if (!string.IsNullOrWhiteSpace(eventSourceUrl)) ev["event_source_url"] = eventSourceUrl;

            var payload = new Dictionary<string, object?> { ["data"] = new[] { ev } };

            var json = JsonSerializer.Serialize(payload);
            var url = $"https://graph.facebook.com/{ApiVersion}/{Uri.EscapeDataString(pixelId)}/events"
                + $"?access_token={Uri.EscapeDataString(accessToken)}";

            using var content = new StringContent(json, Encoding.UTF8, "application/json");
            await _http.PostAsync(url, content);
        }
        catch
        {
            // analytics is best-effort — never break checkout because of it
        }
    }
}
