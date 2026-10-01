using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace MahalaxmiApi.Services;

// Server-side events to Meta, through the Conversions API.
//
// The same reasoning as Ga4Mp next door. The browser's fbq() is dropped
// whenever the shopper has an ad blocker, pays through the app or a UPI
// redirect, or the order is entered by hand in the admin — and Meta's ads bid
// on these events, so one it never hears about is one it cannot learn from.
// Sending the same event from here means it counts.
//
// Purchase jata hai OrdersController se, jahan paisa pakka hota hai. Baki
// event (ViewContent, AddToCart, InitiateCheckout) browser se SiteEvents-
// Controller ko aate hain aur wahan se yahan — kyunki server ko apne aap pata
// nahi chalta ki kisne kaun sa product khola.
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

    /// <summary>
    /// Purchase — ab bhi apna naam rakhta hai, kyunki checkout isi ko bulata
    /// hai, par andar wahi aam raasta chalta hai.
    /// </summary>
    public static Task SendPurchaseAsync(
        string pixelId,
        string accessToken,
        string orderId,
        decimal value,
        string currency,
        string? email,
        string? phone,
        string? eventSourceUrl,
        IEnumerable<(string id, string name, int qty, decimal price)> items)
        => SendEventAsync(pixelId, accessToken, "Purchase", orderId, value, currency,
                          email, phone, null, null, null, null, eventSourceUrl,
                          "product", orderId, items);

    /// <summary>
    /// Koi bhi event Meta ko bhejna.
    ///
    /// user_data me kuch na kuch hona hi chahiye, warna Meta event ko girā deta
    /// hai — use milane ko kuch chahiye. Char cheezon me se koi ek kafi hai:
    /// hashed email, hashed phone, ya browser ke _fbp / _fbc cookie. Cookie
    /// wale do rastey logged-out shopper ke liye hi bane hain, aur wahi aam
    /// haalat hai.
    ///
    /// IP aur user-agent sath jate hain: Meta inhi se "event match quality"
    /// ginta hai, aur ye dono server ke paas pehle se hote hain — browser se
    /// poochhne ki zaroorat nahi.
    /// </summary>
    public static async Task SendEventAsync(
        string pixelId,
        string accessToken,
        string eventName,
        string? eventId,
        decimal? value,
        string currency,
        string? email,
        string? phone,
        string? fbp,
        string? fbc,
        string? clientIp,
        string? userAgent,
        string? eventSourceUrl,
        string? contentType,
        string? orderId,
        IEnumerable<(string id, string name, int qty, decimal price)> items)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(pixelId) || string.IsNullOrWhiteSpace(accessToken))
                return; // not configured yet — no-op
            if (string.IsNullOrWhiteSpace(eventName)) return;

            var userData = new Dictionary<string, object?>();
            var em = Sha256(email);
            var ph = HashPhone(phone);
            if (em is not null) userData["em"] = new[] { em };
            if (ph is not null) userData["ph"] = new[] { ph };
            // fbp / fbc hashed NAHI hote — Meta inhe jaise ke taise mangta hai.
            if (!string.IsNullOrWhiteSpace(fbp)) userData["fbp"] = fbp;
            if (!string.IsNullOrWhiteSpace(fbc)) userData["fbc"] = fbc;
            if (userData.Count == 0) return;   // Meta rejects an event with nothing to match on

            if (!string.IsNullOrWhiteSpace(clientIp) && clientIp != "unknown")
                userData["client_ip_address"] = clientIp;
            if (!string.IsNullOrWhiteSpace(userAgent))
                userData["client_user_agent"] = userAgent;

            var contents = items.Select(i => new Dictionary<string, object?>
            {
                ["id"]         = string.IsNullOrWhiteSpace(i.id) ? i.name : i.id,
                ["quantity"]   = Math.Max(1, i.qty),
                ["item_price"] = i.price,
            }).ToList();

            var custom = new Dictionary<string, object?>
            {
                ["currency"] = currency,
            };
            if (value.HasValue) custom["value"] = value.Value;
            if (!string.IsNullOrWhiteSpace(orderId)) custom["order_id"] = orderId;
            if (contents.Count > 0)
            {
                // content_type batata hai ki id poore product ki hai ya feed ki
                // us row ki jisme size aur rang dono tay hain. Galat batane par
                // catalogue me kuch nahi milta — wahi 0% match rate.
                custom["content_type"] = string.IsNullOrWhiteSpace(contentType) ? "product" : contentType;
                custom["contents"]     = contents;
                custom["content_ids"]  = contents.Select(c => c["id"]).ToList();
            }

            var ev = new Dictionary<string, object?>
            {
                ["event_name"]    = eventName,
                ["event_time"]    = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                ["action_source"] = "website",
                ["user_data"]     = userData,
                ["custom_data"]   = custom,
            };
            // event_id browser wale event se milta hai, isliye jodi ek hi bar
            // ginti hai. Iske bina har kaam do baar dikhta.
            if (!string.IsNullOrWhiteSpace(eventId)) ev["event_id"] = eventId;
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
            // analytics is best-effort — never break the page because of it
        }
    }
}
