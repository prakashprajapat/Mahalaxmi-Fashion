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
    public record ShipTo(string Name, string Address, string Pincode, string City, string State, string Phone);
    public record ReverseResult(bool Success, string? Awb, string? Error);

    private async Task<Dictionary<string, string>> SettingsAsync() =>
        await _db.SiteSettings.ToDictionaryAsync(s => s.Key, s => s.Value);

    /// <summary>
    /// Creates a FORWARD Delhivery shipment (from the seller warehouse TO the customer) and
    /// returns the generated AWB / waybill. Config (token + registered pickup warehouse name)
    /// is read from admin Settings; if missing or the API fails, returns a clear message and
    /// the admin can still enter the AWB manually.
    /// </summary>
    public async Task<ReverseResult> CreateForwardShipmentAsync(string orderId, ShipTo to, decimal codAmount, string productDesc)
    {
        var cfg = await SettingsAsync();
        string Get(string k) => cfg.TryGetValue(k, out var v) ? (v ?? "").Trim() : "";

        var token      = Get("delhivery_token");
        var pickupName = Get("delhivery_pickup_name"); // your registered Delhivery warehouse name
        if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(pickupName))
            return new(false, null, "Delhivery not configured. Add 'delhivery_token' and 'delhivery_pickup_name' in Settings, or enter the AWB manually.");

        if (string.IsNullOrWhiteSpace(to.Pincode) || string.IsNullOrWhiteSpace(to.Address))
            return new(false, null, "Shipping address is incomplete on this order; enter the AWB manually.");

        var isCod = codAmount > 0m;
        var payload = new
        {
            pickup_location = new { name = pickupName },
            shipments = new[]
            {
                new
                {
                    name          = to.Name,
                    add           = to.Address,
                    pin           = to.Pincode,
                    city          = to.City,
                    state         = to.State,
                    country       = "India",
                    phone         = to.Phone,
                    order         = orderId,
                    payment_mode  = isCod ? "COD" : "Prepaid",
                    cod_amount    = isCod ? ((int)codAmount).ToString() : "0",
                    total_amount  = ((int)codAmount).ToString(),
                    products_desc = productDesc,
                    quantity      = "1",
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
            if (root.TryGetProperty("packages", out var pkgs) && pkgs.ValueKind == JsonValueKind.Array && pkgs.GetArrayLength() > 0)
            {
                var pkg = pkgs[0];
                var awb = pkg.TryGetProperty("waybill", out var wb) ? wb.GetString() : null;
                var status = pkg.TryGetProperty("status", out var st) ? st.GetString() : null;
                if (!string.IsNullOrWhiteSpace(awb) && !string.Equals(status, "Fail", StringComparison.OrdinalIgnoreCase))
                    return new(true, awb, null);
                var remark = pkg.TryGetProperty("remarks", out var rm) ? rm.ToString() : status;
                return new(false, null, $"Delhivery rejected the shipment: {remark}");
            }
            var rmk = root.TryGetProperty("rmk", out var r) ? r.GetString()
                    : root.TryGetProperty("error", out var e) ? e.ToString() : text;
            return new(false, null, $"Delhivery error: {Trim(rmk, 300)}");
        }
        catch (Exception ex)
        {
            return new(false, null, $"Could not reach Delhivery ({ex.Message}). Enter the AWB manually.");
        }
    }

    public record PickupResult(bool Success, string? Message);

    /// <summary>
    /// Schedules a First-Mile pickup with Delhivery (courier comes to the warehouse to
    /// collect the day's packages) — replaces the manual "Create New Pickup" click on
    /// the Delhivery One website. Runs at most ONCE per pickup date: the scheduled date
    /// is remembered in site_settings (delhivery_last_pickup_date). Before ~1 PM IST the
    /// pickup is booked for today, after that for tomorrow morning.
    /// </summary>
    public async Task<PickupResult> AutoRequestPickupAsync(int expectedPackages = 1)
    {
        var cfg = await SettingsAsync();
        string Get(string k) => cfg.TryGetValue(k, out var v) ? (v ?? "").Trim() : "";

        var token      = Get("delhivery_token");
        var pickupName = Get("delhivery_pickup_name");
        if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(pickupName))
            return new(false, null); // not configured — AWB flow already reported this

        // Before 13:00 IST → today's pickup at 14:00; after → tomorrow at 11:00.
        var ist = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(5.5));
        var pickupDate = (ist.Hour < 13 ? ist.Date : ist.Date.AddDays(1)).ToString("yyyy-MM-dd");
        var pickupTime = ist.Hour < 13 ? "14:00:00" : "11:00:00";

        // Once per date — skip silently if already scheduled.
        if (Get("delhivery_last_pickup_date") == pickupDate)
            return new(true, null);

        var payload = new
        {
            pickup_location        = pickupName,
            pickup_date            = pickupDate,
            pickup_time            = pickupTime,
            expected_package_count = expectedPackages,
        };

        try
        {
            var client = _http.CreateClient("delhivery");
            using var reqMsg = new HttpRequestMessage(HttpMethod.Post, "https://track.delhivery.com/fm/request/new/")
            {
                Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
            };
            reqMsg.Headers.TryAddWithoutValidation("Authorization", $"Token {token}");
            reqMsg.Headers.TryAddWithoutValidation("Accept", "application/json");

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var resp = await client.SendAsync(reqMsg, cts.Token);
            var text = await resp.Content.ReadAsStringAsync(cts.Token);

            // Duplicate request for the same date also counts as scheduled.
            var ok = resp.IsSuccessStatusCode || text.Contains("already", StringComparison.OrdinalIgnoreCase);
            if (!ok)
                return new(false, $"Pickup request failed: {Trim(text, 200)}");

            var setting = await _db.SiteSettings.FirstOrDefaultAsync(s => s.Key == "delhivery_last_pickup_date");
            if (setting is null)
                _db.SiteSettings.Add(new Models.SiteSetting { Key = "delhivery_last_pickup_date", Value = pickupDate });
            else
            {
                setting.Value = pickupDate;
                setting.UpdatedAt = DateTimeOffset.UtcNow;
            }
            await _db.SaveChangesAsync();

            return new(true, $"Pickup scheduled for {pickupDate} at {pickupTime[..5]}.");
        }
        catch (Exception ex)
        {
            return new(false, $"Pickup request error: {ex.Message}");
        }
    }

    /// <summary>
    /// Fetches the current Delhivery tracking status for up to ~40 AWBs in one call.
    /// Returns AWB → status text (e.g. "In Transit", "Delivered"). Missing/failed AWBs
    /// are simply absent from the result — callers treat that as "no change".
    /// </summary>
    public async Task<Dictionary<string, string>> TrackAsync(IEnumerable<string> awbs)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var list = awbs.Where(a => !string.IsNullOrWhiteSpace(a)).Distinct().ToList();
        if (list.Count == 0) return result;

        var cfg = await SettingsAsync();
        var token = cfg.TryGetValue("delhivery_token", out var t) ? (t ?? "").Trim() : "";
        if (string.IsNullOrEmpty(token)) return result;

        try
        {
            var url = $"https://track.delhivery.com/api/v1/packages/json/?waybill={Uri.EscapeDataString(string.Join(",", list))}";
            var client = _http.CreateClient("delhivery");
            using var reqMsg = new HttpRequestMessage(HttpMethod.Get, url);
            reqMsg.Headers.TryAddWithoutValidation("Authorization", $"Token {token}");
            reqMsg.Headers.TryAddWithoutValidation("Accept", "application/json");

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var resp = await client.SendAsync(reqMsg, cts.Token);
            if (!resp.IsSuccessStatusCode) return result;
            var text = await resp.Content.ReadAsStringAsync(cts.Token);

            using var doc = JsonDocument.Parse(text);
            if (!doc.RootElement.TryGetProperty("ShipmentData", out var data) || data.ValueKind != JsonValueKind.Array)
                return result;

            foreach (var item in data.EnumerateArray())
            {
                if (!item.TryGetProperty("Shipment", out var ship)) continue;
                var awb = ship.TryGetProperty("AWB", out var a) ? a.GetString() : null;
                var status = ship.TryGetProperty("Status", out var st) && st.TryGetProperty("Status", out var ss)
                    ? ss.GetString() : null;
                if (!string.IsNullOrWhiteSpace(awb) && !string.IsNullOrWhiteSpace(status))
                    result[awb!] = status!;
            }
        }
        catch { /* tracking is best-effort — sync service will retry next cycle */ }
        return result;
    }

    public record PinCheck(bool Known, bool Serviceable, bool Cod, string? City, string? State);

    /// <summary>
    /// Checks whether Delhivery services a pincode (and whether COD is available there).
    /// Known=false means the API/token wasn't available — treat as "couldn't verify",
    /// NOT as "not serviceable".
    /// </summary>
    public async Task<PinCheck> CheckPincodeAsync(string pincode)
    {
        var none = new PinCheck(false, false, false, null, null);
        var pin = new string((pincode ?? "").Where(char.IsDigit).ToArray());
        if (pin.Length != 6) return none;

        var cfg = await SettingsAsync();
        var token = cfg.TryGetValue("delhivery_token", out var t) ? (t ?? "").Trim() : "";
        if (string.IsNullOrEmpty(token)) return none;

        try
        {
            var url = $"https://track.delhivery.com/c/api/pin-codes/json/?filter_codes={pin}";
            var client = _http.CreateClient("delhivery");
            using var reqMsg = new HttpRequestMessage(HttpMethod.Get, url);
            reqMsg.Headers.TryAddWithoutValidation("Authorization", $"Token {token}");
            reqMsg.Headers.TryAddWithoutValidation("Accept", "application/json");

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            var resp = await client.SendAsync(reqMsg, cts.Token);
            if (!resp.IsSuccessStatusCode) return none;
            var text = await resp.Content.ReadAsStringAsync(cts.Token);

            using var doc = JsonDocument.Parse(text);
            if (!doc.RootElement.TryGetProperty("delivery_codes", out var codes)
                || codes.ValueKind != JsonValueKind.Array)
                return none;

            if (codes.GetArrayLength() == 0)
                return new PinCheck(true, false, false, null, null); // verified: NOT serviceable

            var pc = codes[0].TryGetProperty("postal_code", out var p) ? p : codes[0];
            string? GetStr(string key) =>
                pc.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

            var cod = string.Equals(GetStr("cod"), "Y", StringComparison.OrdinalIgnoreCase)
                   || string.Equals(GetStr("cash"), "Y", StringComparison.OrdinalIgnoreCase);
            return new PinCheck(true, true, cod, GetStr("district"), GetStr("state_code"));
        }
        catch { return none; }
    }

    public record TrackScan(string Time, string Location, string Remark);
    public record TrackDetail(bool Success, string? Status, string? ExpectedDate, List<TrackScan> Scans);

    /// <summary>
    /// Full live tracking detail for ONE AWB — current status, expected delivery date and
    /// the scan history (time / location / remark) — used by the customer tracking page
    /// to show a Delhivery-style live timeline on our own site.
    /// </summary>
    public async Task<TrackDetail> TrackDetailAsync(string awb)
    {
        var none = new TrackDetail(false, null, null, new List<TrackScan>());
        if (string.IsNullOrWhiteSpace(awb)) return none;

        var cfg = await SettingsAsync();
        var token = cfg.TryGetValue("delhivery_token", out var t) ? (t ?? "").Trim() : "";
        if (string.IsNullOrEmpty(token)) return none;

        try
        {
            var url = $"https://track.delhivery.com/api/v1/packages/json/?waybill={Uri.EscapeDataString(awb)}";
            var client = _http.CreateClient("delhivery");
            using var reqMsg = new HttpRequestMessage(HttpMethod.Get, url);
            reqMsg.Headers.TryAddWithoutValidation("Authorization", $"Token {token}");
            reqMsg.Headers.TryAddWithoutValidation("Accept", "application/json");

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var resp = await client.SendAsync(reqMsg, cts.Token);
            if (!resp.IsSuccessStatusCode) return none;
            var text = await resp.Content.ReadAsStringAsync(cts.Token);

            using var doc = JsonDocument.Parse(text);
            if (!doc.RootElement.TryGetProperty("ShipmentData", out var data)
                || data.ValueKind != JsonValueKind.Array || data.GetArrayLength() == 0)
                return none;
            if (!data[0].TryGetProperty("Shipment", out var ship)) return none;

            string? GetStr(JsonElement el, string key) =>
                el.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

            var status = ship.TryGetProperty("Status", out var st) ? GetStr(st, "Status") : null;
            var expected = GetStr(ship, "ExpectedDeliveryDate") ?? GetStr(ship, "PromisedDeliveryDate");

            var scans = new List<TrackScan>();
            if (ship.TryGetProperty("Scans", out var scansEl) && scansEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in scansEl.EnumerateArray())
                {
                    var d = item.TryGetProperty("ScanDetail", out var sd) ? sd : item;
                    var remark = GetStr(d, "Instructions") ?? GetStr(d, "Scan") ?? "";
                    scans.Add(new TrackScan(
                        GetStr(d, "ScanDateTime") ?? GetStr(d, "StatusDateTime") ?? "",
                        GetStr(d, "ScannedLocation") ?? "",
                        remark));
                }
            }
            return new TrackDetail(true, status, expected, scans);
        }
        catch { return none; }
    }

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
