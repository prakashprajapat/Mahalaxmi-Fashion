using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// Shiprocket - the second courier, used only where Delhivery does not go
/// (not serviceable, or an embargo on the pincode).
///
/// Settings (admin -> Settings -> Shiprocket):
///   shiprocketEmail / shiprocketPassword   an API user made in Shiprocket
///                                           (Settings -> API -> Create an API User)
///   shiprocketPickupLocation               the pickup location's NAME in Shiprocket (e.g. "Primary")
///   shiprocketPickupPincode                default 344022
///   shiprocketWeightKg                     default 0.5
/// The login token lasts 10 days; it is kept in settings and renewed after 9.
/// API base: https://apiv2.shiprocket.in/v1/external
/// </summary>
public class ShiprocketService
{
    private const string Base = "https://apiv2.shiprocket.in/v1/external";
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(25) };
    private readonly AppDbContext _db;
    private readonly ILogger<ShiprocketService> _log;

    public ShiprocketService(AppDbContext db, ILogger<ShiprocketService> log)
    {
        _db = db;
        _log = log;
    }

    private async Task<string> Setting(string key) =>
        (await _db.SiteSettings.AsNoTracking().Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync() ?? "").Trim();

    private async Task SaveSetting(string key, string value)
    {
        var row = await _db.SiteSettings.FirstOrDefaultAsync(s => s.Key == key);
        if (row is null) _db.SiteSettings.Add(new SiteSetting { Key = key, Value = value });
        else { row.Value = value; row.UpdatedAt = DateTimeOffset.UtcNow; }
        await _db.SaveChangesAsync();
    }

    public async Task<bool> IsConfiguredAsync() =>
        (await Setting("shiprocketEmail")).Length > 0 && (await Setting("shiprocketPassword")).Length > 0;

    private async Task<string?> TokenAsync(bool fresh = false)
    {
        if (!fresh)
        {
            var tok = await Setting("shiprocketToken");
            var at = await Setting("shiprocketTokenAt");
            if (tok.Length > 0 && DateTimeOffset.TryParse(at, out var when) && DateTimeOffset.UtcNow - when < TimeSpan.FromDays(9))
                return tok;
        }
        var email = await Setting("shiprocketEmail");
        var pass = await Setting("shiprocketPassword");
        if (email.Length == 0 || pass.Length == 0) return null;
        var (ok, body) = await SendAsync(HttpMethod.Post, "/auth/login", null, new { email, password = pass });
        if (!ok) { _log.LogWarning("Shiprocket login failed: {Body}", LogSafe.Body(body)); return null; }
        try
        {
            using var d = JsonDocument.Parse(body);
            var t = d.RootElement.TryGetProperty("token", out var x) ? x.GetString() : null;
            if (string.IsNullOrWhiteSpace(t)) return null;
            await SaveSetting("shiprocketToken", t);
            await SaveSetting("shiprocketTokenAt", DateTimeOffset.UtcNow.ToString("o"));
            return t;
        }
        catch { return null; }
    }

    private static async Task<(bool Ok, string Body)> SendAsync(HttpMethod m, string path, string? token, object? body)
    {
        try
        {
            using var req = new HttpRequestMessage(m, Base + path);
            if (token != null) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (body != null) req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            using var res = await Http.SendAsync(req);
            return (res.IsSuccessStatusCode, await res.Content.ReadAsStringAsync());
        }
        catch (Exception ex) { return (false, "Could not reach Shiprocket: " + ex.Message); }
    }

    /// <summary>Calls with the saved token, logging in again once if Shiprocket says it expired.</summary>
    private async Task<(bool Ok, string Body)> CallAsync(HttpMethod m, string path, object? body = null)
    {
        var tok = await TokenAsync();
        if (tok is null) return (false, "Shiprocket is not set up (email / password in Settings).");
        var r = await SendAsync(m, path, tok, body);
        if (!r.Ok && (r.Body.Contains("Unauthenticated", StringComparison.OrdinalIgnoreCase) || r.Body.Contains("token", StringComparison.OrdinalIgnoreCase)))
        {
            tok = await TokenAsync(fresh: true);
            if (tok != null) r = await SendAsync(m, path, tok, body);
        }
        return r;
    }

    public record SrPin(bool Known, bool Serviceable, bool Cod, int? Days, string? Courier);

    /// <summary>Can any Shiprocket courier deliver here, and with COD?</summary>
    public async Task<SrPin> CheckPincodeAsync(string pincode)
    {
        var none = new SrPin(false, false, false, null, null);
        var pin = new string((pincode ?? "").Where(char.IsDigit).ToArray());
        if (pin.Length != 6 || !await IsConfiguredAsync()) return none;
        var from = await Setting("shiprocketPickupPincode"); if (from.Length != 6) from = "344022";
        var kg = await Setting("shiprocketWeightKg"); if (kg.Length == 0) kg = "0.5";

        async Task<(bool any, int? days, string? name)> Ask(int cod)
        {
            var (ok, body) = await CallAsync(HttpMethod.Get,
                $"/courier/serviceability/?pickup_postcode={from}&delivery_postcode={pin}&cod={cod}&weight={Uri.EscapeDataString(kg)}");
            if (!ok) return (false, null, null);
            try
            {
                using var d = JsonDocument.Parse(body);
                if (!d.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object
                    || !data.TryGetProperty("available_courier_companies", out var list) || list.ValueKind != JsonValueKind.Array
                    || list.GetArrayLength() == 0) return (false, null, null);
                int? best = null; string? name = null;
                foreach (var c in list.EnumerateArray())
                {
                    int? days = c.TryGetProperty("estimated_delivery_days", out var e) && int.TryParse(e.ToString(), out var dd) ? dd : null;
                    if (best is null || (days is not null && days < best)) { best = days; name = c.TryGetProperty("courier_name", out var n) ? n.GetString() : null; }
                }
                return (true, best, name);
            }
            catch { return (false, null, null); }
        }

        var prepaid = await Ask(0);
        if (!prepaid.any) return new SrPin(true, false, false, null, null);
        var cod = await Ask(1);
        return new SrPin(true, true, cod.any, prepaid.days, prepaid.name);
    }

    public record SrShipment(bool Success, string? Awb, string? Courier, string? SrOrderId, string? ShipmentId,
                             string? LabelUrl, string? Error, string? PickupMessage);

    public record SrItem(string Name, string Sku, int Units, decimal Price, string? Hsn);

    /// <summary>Creates the order in Shiprocket, gets an AWB, asks for pickup and fetches the label.</summary>
    public async Task<SrShipment> CreateShipmentAsync(string orderId, DelhiveryService.ShipTo to, string? email,
        IReadOnlyList<SrItem> items, bool cod, decimal codCollect)
    {
        if (!await IsConfiguredAsync())
            return new SrShipment(false, null, null, null, null, null, "Shiprocket is not set up in Settings.", null);
        var pickup = await Setting("shiprocketPickupLocation"); if (pickup.Length == 0) pickup = "Primary";
        var kgS = await Setting("shiprocketWeightKg");
        var kg = decimal.TryParse(kgS, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var k) && k > 0 ? k : 0.5m;

        var lines = items.Count > 0 ? items : new List<SrItem> { new("Fashion item", "MFH", 1, Math.Max(1, codCollect), null) };
        var subTotal = lines.Sum(i => i.Price * i.Units);
        // COD: the courier collects sub_total - total_discount, so the discount
        // carries whatever was already paid (advance, wallet, coupon).
        var discount = cod ? Math.Max(0, subTotal - codCollect) : 0m;
        var names = (to.Name ?? "").Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        var phone10 = new string((to.Phone ?? "").Where(char.IsDigit).ToArray());
        if (phone10.Length > 10) phone10 = phone10[^10..];

        var payload = new Dictionary<string, object?>
        {
            ["order_id"] = orderId,
            ["order_date"] = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(5.5)).ToString("yyyy-MM-dd HH:mm"),
            ["pickup_location"] = pickup,
            ["billing_customer_name"] = names.Length > 0 ? names[0] : "Customer",
            ["billing_last_name"] = names.Length > 1 ? names[1] : "",
            ["billing_address"] = to.Address,
            ["billing_city"] = to.City,
            ["billing_pincode"] = to.Pincode,
            ["billing_state"] = to.State,
            ["billing_country"] = "India",
            ["billing_email"] = string.IsNullOrWhiteSpace(email) ? "orders@mahalaxmifashionhub.com" : email,
            ["billing_phone"] = phone10,
            ["shipping_is_billing"] = true,
            ["order_items"] = lines.Select(i => new Dictionary<string, object?>
            {
                ["name"] = i.Name.Length > 200 ? i.Name[..200] : i.Name,
                ["sku"] = string.IsNullOrWhiteSpace(i.Sku) ? "MFH" : i.Sku,
                ["units"] = Math.Max(1, i.Units),
                ["selling_price"] = Math.Round(i.Price, 2),
                ["hsn"] = i.Hsn ?? "",
            }).ToList(),
            ["payment_method"] = cod ? "COD" : "Prepaid",
            ["sub_total"] = Math.Round(subTotal, 2),
            ["total_discount"] = Math.Round(discount, 2),
            ["length"] = 25, ["breadth"] = 20, ["height"] = 5, ["weight"] = kg,
        };

        var (ok, body) = await CallAsync(HttpMethod.Post, "/orders/create/adhoc", payload);

        // "Wrong Pickup location entered" comes back WITH the list of the
        // shop's real pickup locations. When Settings has none (or a stale
        // name), take the shop's location from that list, keep it, and retry -
        // rather than make the owner go and copy a name across by hand.
        if (!ok && body.Contains("pickup location", StringComparison.OrdinalIgnoreCase))
        {
            var known = PickupNames(body);
            var pick = known.FirstOrDefault(n => string.Equals(n, pickup, StringComparison.OrdinalIgnoreCase))
                       ?? (known.Count >= 1 ? known[0] : null);
            if (pick != null && !string.Equals(pick, pickup, StringComparison.Ordinal))
            {
                _log.LogInformation("Shiprocket pickup location '{Old}' not found; using '{New}'.", pickup, pick);
                payload["pickup_location"] = pick;
                await SaveSetting("shiprocketPickupLocation", pick);
                (ok, body) = await CallAsync(HttpMethod.Post, "/orders/create/adhoc", payload);
            }
        }
        string? srOrder = null, shipment = null;
        try
        {
            using var d = JsonDocument.Parse(body);
            srOrder = d.RootElement.TryGetProperty("order_id", out var o) ? o.ToString() : null;
            shipment = d.RootElement.TryGetProperty("shipment_id", out var s) ? s.ToString() : null;
        }
        catch { }
        if (!ok || string.IsNullOrWhiteSpace(shipment))
            return new SrShipment(false, null, null, srOrder, null, null, "Shiprocket did not create the order: " + LogSafe.Body(body), null);

        var (aOk, aBody) = await CallAsync(HttpMethod.Post, "/courier/assign/awb", new { shipment_id = shipment });
        string? awb = null, courier = null;
        try
        {
            using var d = JsonDocument.Parse(aBody);
            if (d.RootElement.TryGetProperty("response", out var r) && r.TryGetProperty("data", out var data))
            {
                awb = data.TryGetProperty("awb_code", out var a) ? a.ToString() : null;
                courier = data.TryGetProperty("courier_name", out var c) ? c.GetString() : null;
            }
        }
        catch { }
        if (!aOk || string.IsNullOrWhiteSpace(awb))
            return new SrShipment(false, null, null, srOrder, shipment, null,
                "Shiprocket order made, but no courier/AWB was assigned: " + LogSafe.Body(aBody), null);

        string? pickupMsg = null;
        var (pOk, pBody) = await CallAsync(HttpMethod.Post, "/courier/generate/pickup", new { shipment_id = new[] { shipment } });
        pickupMsg = pOk ? "Shiprocket pickup requested." : "AWB made; ask for pickup in Shiprocket: " + LogSafe.Body(pBody);

        var label = await LabelUrlAsync(shipment);
        return new SrShipment(true, awb, courier, srOrder, shipment, label, null, pickupMsg);
    }

    private static List<string> PickupNames(string body)
    {
        var names = new List<string>();
        try
        {
            using var d = JsonDocument.Parse(body);
            void Walk(JsonElement e)
            {
                if (e.ValueKind == JsonValueKind.Object)
                {
                    foreach (var p in e.EnumerateObject())
                    {
                        if (p.Name == "pickup_location" && p.Value.ValueKind == JsonValueKind.String
                            && !string.IsNullOrWhiteSpace(p.Value.GetString()))
                            names.Add(p.Value.GetString()!.Trim());
                        else Walk(p.Value);
                    }
                }
                else if (e.ValueKind == JsonValueKind.Array) foreach (var x in e.EnumerateArray()) Walk(x);
            }
            Walk(d.RootElement);
        }
        catch { }
        return names.Distinct().ToList();
    }

    public async Task<string?> LabelUrlAsync(string shipmentId)
    {
        var (ok, body) = await CallAsync(HttpMethod.Post, "/courier/generate/label", new { shipment_id = new[] { shipmentId } });
        if (!ok) return null;
        try
        {
            using var d = JsonDocument.Parse(body);
            return d.RootElement.TryGetProperty("label_url", out var u) ? u.GetString() : null;
        }
        catch { return null; }
    }

    public async Task<(bool Ok, string Message)> CancelAsync(string srOrderId)
    {
        if (!long.TryParse(srOrderId, out var id)) return (false, "No Shiprocket order id on this order.");
        var (ok, body) = await CallAsync(HttpMethod.Post, "/orders/cancel", new { ids = new[] { id } });
        return ok ? (true, "Cancelled in Shiprocket.") : (false, "Shiprocket refused: " + LogSafe.Body(body));
    }

    /// <summary>The customer tracking page's view of one Shiprocket waybill: status, date, scans newest first.</summary>
    public async Task<DelhiveryService.TrackDetail> TrackDetailAsync(string awb)
    {
        var none = new DelhiveryService.TrackDetail(false, null, null, new List<DelhiveryService.TrackScan>());
        if (!await IsConfiguredAsync()) return none;
        var (ok, body) = await CallAsync(HttpMethod.Get, $"/courier/track/awb/{Uri.EscapeDataString(awb)}");
        if (!ok) return none;
        try
        {
            using var d = JsonDocument.Parse(body);
            if (!d.RootElement.TryGetProperty("tracking_data", out var td)) return none;
            string? status = null, edd = null;
            if (td.TryGetProperty("shipment_track", out var st) && st.ValueKind == JsonValueKind.Array && st.GetArrayLength() > 0)
            {
                var s0 = st[0];
                status = s0.TryGetProperty("current_status", out var cs) ? cs.ToString() : null;
                edd = s0.TryGetProperty("edd", out var e) && e.ValueKind != JsonValueKind.Null ? e.ToString() : null;
            }
            if (string.IsNullOrWhiteSpace(edd) && td.TryGetProperty("etd", out var etd) && etd.ValueKind != JsonValueKind.Null)
                edd = etd.ToString();
            var scans = new List<DelhiveryService.TrackScan>();
            if (td.TryGetProperty("shipment_track_activities", out var acts) && acts.ValueKind == JsonValueKind.Array)
                foreach (var a in acts.EnumerateArray())
                    scans.Add(new DelhiveryService.TrackScan(
                        a.TryGetProperty("date", out var dt) ? dt.ToString() : "",
                        a.TryGetProperty("location", out var lo) ? lo.ToString() : "",
                        (a.TryGetProperty("activity", out var ac) ? ac.ToString() : "")
                            .Trim(),
                        a.TryGetProperty("sr-status-label", out var lb) ? lb.ToString() : ""));
            if (string.IsNullOrWhiteSpace(status) && scans.Count == 0)
            {
                // Booked, not yet picked up: Shiprocket has nothing to say yet.
                return new DelhiveryService.TrackDetail(true, "Pickup scheduled", edd, scans);
            }
            var title = System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase((status ?? "").ToLowerInvariant());
            return new DelhiveryService.TrackDetail(true, title, edd, scans);
        }
        catch { return none; }
    }

    /// <summary>
    /// Shiprocket's status words, put into the words the rest of the shop
    /// already reads from Delhivery - so the same sweep, the same dashboard
    /// boxes (Out for delivery, Failed delivery) and the same customer SMS work
    /// for both couriers:
    ///   Status   "In Transit" / "Delivered" / "Not Picked" / "RTO ..." / "Cancelled"
    ///   note     the event: "Out for delivery ...", "Delivery attempted - <reason>" ...
    /// </summary>
    public static (string Status, string Type, string Note) Translate(string current, string lastScan)
    {
        var up = current.Trim().ToUpperInvariant();
        var scan = lastScan.Trim();
        string Note(string head) => scan.Length > 0 && !scan.Contains(head, StringComparison.OrdinalIgnoreCase) ? $"{head} - {scan}" : (scan.Length > 0 ? scan : head);

        if (up.Contains("RTO") || up.Contains("RETURN"))
            return up.Contains("DELIVERED") ? ("RTO - Returned", "RT", Note("RETURN Accepted"))
                                            : ("RTO In Transit", "RT", Note("Out for Return"));
        if (up.Contains("CANCEL")) return ("Cancelled", "CN", Note("Cancelled"));
        if (up == "DELIVERED" || (up.Contains("DELIVERED") && !up.Contains("UNDELIVERED")))
            return ("Delivered", "DL", Note("Delivered"));
        if (up.Contains("OUT FOR DELIVERY"))
            return ("In Transit", "UD", Note("Out for delivery"));
        // Shiprocket's NDR: an attempt that did not deliver. Said in the words
        // the Failed delivery box looks for.
        if (up.Contains("UNDELIVERED") || up.Contains("NDR") || up.Contains("FAILED"))
            return ("In Transit", "UD", Note("Delivery attempted"));
        if (up.Contains("PICKUP") || up.Contains("MANIFEST") || up.Contains("AWB ASSIGNED") || up.Contains("NEW") || up.Contains("READY TO SHIP"))
        {
            // "PICKED UP" is the parcel moving; everything else here is before it.
            if (up.Contains("PICKED UP")) return ("In Transit", "UD", Note("Picked up"));
            return ("Not Picked", "UD", Note(System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase(current.ToLowerInvariant())));
        }
        if (up.Contains("LOST") || up.Contains("DAMAGED") || up.Contains("DESTROYED"))
            return ("In Transit", "UD", Note("On hold - " + current));
        return ("In Transit", "UD", Note(System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase(current.ToLowerInvariant())));
    }

    /// <summary>
    /// Tracking for Shiprocket waybills, in the same shape the Delhivery sweep
    /// reads, so one sweep handles both: "In Transit", "Delivered", and the
    /// return leg as "RTO ..." (status type RT) so IsReturnLeg / IsBackWithUs work.
    /// </summary>
    public async Task<Dictionary<string, DelhiveryService.TrackLine>> TrackAsync(IEnumerable<string> awbs)
    {
        var result = new Dictionary<string, DelhiveryService.TrackLine>();
        if (!await IsConfiguredAsync()) return result;
        foreach (var awb in awbs.Distinct())
        {
            var (ok, body) = await CallAsync(HttpMethod.Get, $"/courier/track/awb/{Uri.EscapeDataString(awb)}");
            if (!ok) continue;
            try
            {
                using var d = JsonDocument.Parse(body);
                if (!d.RootElement.TryGetProperty("tracking_data", out var td)) continue;
                string cur = "";
                DateTimeOffset? eta = null;
                if (td.TryGetProperty("shipment_track", out var st) && st.ValueKind == JsonValueKind.Array && st.GetArrayLength() > 0)
                {
                    var s0 = st[0];
                    cur = s0.TryGetProperty("current_status", out var cs) ? cs.ToString() : "";
                    if (s0.TryGetProperty("edd", out var edd) && DateTimeOffset.TryParse(edd.ToString(), out var e)) eta = e;
                }
                string lastScan = "";
                if (td.TryGetProperty("shipment_track_activities", out var acts) && acts.ValueKind == JsonValueKind.Array && acts.GetArrayLength() > 0)
                {
                    var a0 = acts[0];
                    lastScan = (a0.TryGetProperty("sr-status-label", out var lb) ? lb.ToString() : "")
                             + (a0.TryGetProperty("activity", out var ac) ? " " + ac.ToString() : "");
                }
                if (string.IsNullOrWhiteSpace(cur)) continue;
                var (status, type, note) = Translate(cur, lastScan.Trim());
                result[awb] = new DelhiveryService.TrackLine(status, eta, type, note, note);
            }
            catch { }
        }
        return result;
    }
}
