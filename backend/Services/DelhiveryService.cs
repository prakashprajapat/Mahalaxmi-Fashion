using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// Creates a Delhivery REVERSE pickup (courier collects the item from the customer and
/// brings it back to the seller warehouse). Config is read from SiteSettings so no code
/// change is needed to go live. Any missing config or API error returns a clear message
/// and the caller falls back to manual AWB entry.
/// </summary>
public class DelhiveryService
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _http;

    // Delhivery Create (CMU) endpoint — same endpoint handles reverse via payment_mode=Pickup.
    private const string CreateUrl = "https://track.delhivery.com/api/cmu/create.json";

    public DelhiveryService(AppDbContext db, IHttpClientFactory http)
    {
        _db = db;
        _http = http;
    }

    public record PickupAddress(string Name, string Address, string Pincode, string City, string State, string Phone);
    public record ReverseResult(bool Success, string? Awb, string? Error);

    private async Task<Dictionary<string, string>> SettingsAsync() =>
        await _db.SiteSettings.ToDictionaryAsync(s => s.Key, s => s.Value);

    /// <param name="from">The customer address the courier picks up FROM.</param>
    public async Task<ReverseResult> CreateReversePickupAsync(string orderId, PickupAddress from, string productDesc)
    {
        var cfg = await SettingsAsync();
        string Get(string k) => cfg.TryGetValue(k, out var v) ? (v ?? "").Trim() : "";

        var token       = Get("delhivery_token");
        var pickupName  = Get("delhivery_pickup_name"); // registered Delhivery warehouse name
        if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(pickupName))
            return new(false, null, "Delhivery is not configured. Add 'delhivery_token' and 'delhivery_pickup_name' (your registered warehouse) in Settings, or enter the AWB manually.");

        if (string.IsNullOrWhiteSpace(from.Pincode) || string.IsNullOrWhiteSpace(from.Address))
            return new(false, null, "Customer pickup address is incomplete on this order; enter the return AWB manually.");

        // Seller return address (where the item comes back to).
        var payload = new
        {
            pickup_location = new { name = pickupName },
            shipments = new[]
            {
                new
                {
                    name          = from.Name,
                    add           = from.Address,
                    pin           = from.Pincode,
                    city          = from.City,
                    state         = from.State,
                    country       = "India",
                    phone         = from.Phone,
                    order         = $"{orderId}-R",
                    payment_mode  = "Pickup",           // Pickup = reverse shipment
                    products_desc = productDesc,
                    quantity      = "1",
                    return_add    = Get("store_address"),
                    return_pin    = Get("store_pincode"),
                    return_city   = Get("store_city"),
                    return_state  = Get("store_state"),
                    return_country= "India",
                    return_phone  = Get("store_phone"),
                }
            }
        };

        try
        {
            var json = JsonSerializer.Serialize(payload);
            var body = $"format=json&data={Uri.EscapeDataString(json)}";
            var client = _http.CreateClient("delhivery");
            using var reqMsg = new HttpRequestMessage(HttpMethod.Post, CreateUrl)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/x-www-form-urlencoded")
            };
            reqMsg.Headers.TryAddWithoutValidation("Authorization", $"Token {token}");
            reqMsg.Headers.TryAddWithoutValidation("Accept", "application/json");

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var resp = await client.SendAsync(reqMsg, cts.Token);
            var text = await resp.Content.ReadAsStringAsync(cts.Token);

            using var doc = JsonDocument.Parse(text);
            var root = doc.RootElement;

            // Success shape: { success:true, packages:[ { waybill:"...", status:"Success" } ] }
            if (root.TryGetProperty("packages", out var pkgs) && pkgs.ValueKind == JsonValueKind.Array && pkgs.GetArrayLength() > 0)
            {
                var pkg = pkgs[0];
                var awb = pkg.TryGetProperty("waybill", out var wb) ? wb.GetString() : null;
                var status = pkg.TryGetProperty("status", out var st) ? st.GetString() : null;
                if (!string.IsNullOrWhiteSpace(awb) && !string.Equals(status, "Fail", StringComparison.OrdinalIgnoreCase))
                    return new(true, awb, null);

                var remark = pkg.TryGetProperty("remarks", out var rm) ? rm.ToString() : status;
                return new(false, null, $"Delhivery rejected the reverse pickup: {remark}");
            }

            var rmk = root.TryGetProperty("rmk", out var r) ? r.GetString()
                    : root.TryGetProperty("error", out var e) ? e.ToString()
                    : text;
            return new(false, null, $"Delhivery error: {Trim(rmk, 300)}");
        }
        catch (Exception ex)
        {
            return new(false, null, $"Could not reach Delhivery ({ex.Message}). Enter the AWB manually.");
        }
    }

    private static string Trim(string? s, int n) =>
        string.IsNullOrEmpty(s) ? "" : (s.Length <= n ? s : s[..n]);
}
