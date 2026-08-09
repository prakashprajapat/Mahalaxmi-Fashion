using System.Text;
using System.Text.Json;

namespace MahalaxmiApi.Services;

// Server-side GA4 tracking via the Measurement Protocol.
//
// Why: the client-side gtag 'purchase' event depends on the shopper's browser — it is
// silently dropped when they use an ad-blocker / data-saver, complete payment through the
// app or a UPI redirect, or the order is created manually in the admin. That is why GA4
// can show "Purchases 0" even though real orders came in. Firing the same 'purchase' event
// from the backend on every saved order guarantees it is counted. GA4 de-duplicates purchase
// events by transaction_id, so sending from both the browser and the server never
// double-counts — whichever arrives is kept once.
//
// Safe by design: does nothing until an API secret is configured in Settings, and every
// failure is swallowed so it can never break order placement.
public static class Ga4Mp
{
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(5) };

    public static async Task SendPurchaseAsync(
        string measurementId,
        string apiSecret,
        string? clientId,
        string transactionId,
        decimal value,
        string currency,
        IEnumerable<(string id, string name, int qty, decimal price)> items)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(measurementId) || string.IsNullOrWhiteSpace(apiSecret))
                return; // not configured yet — no-op

            var itemArr = items.Select(i => new Dictionary<string, object?>
            {
                ["item_id"]   = string.IsNullOrWhiteSpace(i.id) ? i.name : i.id,
                ["item_name"] = i.name,
                ["quantity"]  = i.qty,
                ["price"]     = i.price,
            }).ToList();

            var payload = new Dictionary<string, object?>
            {
                // A client_id is mandatory. Use the shopper's real GA client id when we have it
                // (correct attribution); otherwise fall back to the order id so the purchase is
                // still recorded.
                ["client_id"] = string.IsNullOrWhiteSpace(clientId) ? transactionId : clientId,
                ["events"] = new[]
                {
                    new Dictionary<string, object?>
                    {
                        ["name"] = "purchase",
                        ["params"] = new Dictionary<string, object?>
                        {
                            ["transaction_id"] = transactionId,
                            ["currency"]       = currency,
                            ["value"]          = value,
                            ["items"]          = itemArr,
                        },
                    },
                },
            };

            var json = JsonSerializer.Serialize(payload);
            var url = "https://www.google-analytics.com/mp/collect"
                + $"?measurement_id={Uri.EscapeDataString(measurementId)}"
                + $"&api_secret={Uri.EscapeDataString(apiSecret)}";

            using var content = new StringContent(json, Encoding.UTF8, "application/json");
            await _http.PostAsync(url, content);
        }
        catch
        {
            // analytics is best-effort — never break checkout because of it
        }
    }
}
