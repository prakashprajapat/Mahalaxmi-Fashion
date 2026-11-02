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

    public record CancelResult(bool Success, string? Message);

    /// <summary>
    /// Cancels a FORWARD shipment at Delhivery (the same thing as "Cancel" on
    /// Delhivery One). Only works before pickup; after that Delhivery refuses and
    /// the message it gives is passed back unchanged so the shop can read why.
    /// </summary>
    public async Task<CancelResult> CancelShipmentAsync(string awb)
    {
        var cfg = await SettingsAsync();
        var token = cfg.TryGetValue("delhivery_token", out var t) ? (t ?? "").Trim() : "";
        if (string.IsNullOrEmpty(token))
            return new(false, "Delhivery not configured. Add 'delhivery_token' in Settings, or cancel on Delhivery One.");

        try
        {
            var client = _http.CreateClient("delhivery");
            using var reqMsg = new HttpRequestMessage(HttpMethod.Post, "https://track.delhivery.com/api/p/edit");
            reqMsg.Headers.TryAddWithoutValidation("Authorization", $"Token {token}");
            reqMsg.Headers.TryAddWithoutValidation("Accept", "application/json");
            reqMsg.Content = new StringContent(
                JsonSerializer.Serialize(new { waybill = awb, cancellation = "true" }),
                Encoding.UTF8, "application/json");

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var resp = await client.SendAsync(reqMsg, cts.Token);
            var text = await resp.Content.ReadAsStringAsync(cts.Token);

            string? remark = null;
            var ok = false;
            try
            {
                using var doc = JsonDocument.Parse(text);
                var root = doc.RootElement;
                if (root.TryGetProperty("status", out var st))
                    ok = st.ValueKind == JsonValueKind.True
                      || (st.ValueKind == JsonValueKind.String
                          && string.Equals(st.GetString(), "true", StringComparison.OrdinalIgnoreCase));
                remark = root.TryGetProperty("remark", out var rm) ? rm.ToString()
                       : root.TryGetProperty("error", out var er) ? er.ToString()
                       : null;
            }
            catch { remark = text; }

            if (resp.IsSuccessStatusCode && ok)
                return new(true, string.IsNullOrWhiteSpace(remark) ? "Shipment cancelled at Delhivery." : Trim(remark, 300));
            return new(false, $"Delhivery did not cancel it: {Trim(remark ?? text, 300)}");
        }
        catch (Exception ex)
        {
            return new(false, $"Could not reach Delhivery ({ex.Message}). Try again, or cancel on Delhivery One.");
        }
    }

    /// <summary>
    /// Whether Delhivery's own tracking says this waybill is cancelled. This is
    /// what the shop's Delete button trusts, never our own record, so a waybill
    /// still live at Delhivery can never be wiped from an order by mistake.
    /// </summary>
    public static bool IsCancelledAtCourier(string? status, string? statusType, string? instruction = null)
    {
        if ((statusType ?? "").Trim().Equals("CN", StringComparison.OrdinalIgnoreCase)) return true;
        var s = $"{status} {instruction}".ToLowerInvariant();
        return s.Contains("cancel");
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
    /// <summary>What the bulk tracking call says about one parcel.</summary>
    public readonly record struct TrackLine(
        string Status, DateTimeOffset? Expected, string StatusType = "", string Instruction = "",
        // LastScan: the newest SCAN on the waybill - the event, as against
        // Instruction which is the rollup over the leg.
        //
        // "Out for delivery" is a scan at 8:55 this morning. The rollup for the
        // same parcel still reads "In Transit", because that is what a rollup
        // describes. Every dashboard box is counted from the stored columns, so
        // without this the box was counting the leg while the shopkeeper read
        // the event - on the same screen, disagreeing.
        //
        // A plain comment rather than an XML one: /// does not belong inside a
        // parameter list, and there is no C# compiler here to say so.
        string LastScan = "");

    /// <summary>
    /// Is this parcel on its way BACK to us rather than on to the customer?
    ///
    /// A parcel nobody could deliver turns around and comes home, on the same
    /// waybill. Delhivery calls it an RTO, shows it as "Out for Return", and
    /// gives it an Expected Return Date in place of a delivery date - but the
    /// scans in between go on reading "Vehicle Departed" and "Trip Arrived"
    /// exactly as they did on the way out. So a shop watching only the scan
    /// text sees a parcel still travelling, and keeps the order in Transit
    /// while the goods are moving away from the customer.
    ///
    /// StatusType is the courier's own answer and is used whenever it is
    /// there: RT means return leg. The text is the fallback, because the
    /// field is not on every response.
    /// </summary>
    public static bool IsReturnLeg(string? status, string? statusType)
    {
        var t = (statusType ?? "").Trim().ToUpperInvariant();
        if (t == "RT") return true;

        var s = (status ?? "").ToLowerInvariant();
        return s.Contains("rto") || s.Contains("dto") || s.Contains("return");
    }

    /// <summary>
    /// Has it finished coming back - is the parcel with us again?
    ///
    /// Only then is the stock ours and the money owed. "Out for Return" is
    /// still a parcel in a van somewhere in West Bengal.
    ///
    /// This asked for "delivered" or "received" and nothing else, and
    /// Delhivery's own terminal RTO scan says neither. AWB 55746510000464
    /// came home to Balotra and was scanned
    ///
    ///     Dispatched for RTO   1 Nov, 1:42 pm   Balotra_Ward45_D
    ///     RETURN Accepted      1 Nov, 3:41 pm   Balotra_Ward45_D
    ///
    /// - the shop's own town, two hours apart, the second being the shop
    /// taking the parcel back. The order sat in Return Transit with the goods
    /// on the shelf, and no refund was ever owed to anybody.
    ///
    /// "accepted" is safe here because IsReturnLeg has already said this is
    /// the way home on the FORWARD waybill, where the only thing that can be
    /// accepted is the shop accepting its parcel back. A reverse pickup is a
    /// waybill of its own and does not come through this door.
    ///
    /// THE INSTRUCTION, not only the status. Delhivery's panel shows this
    /// waybill as
    ///
    ///     STATUS       RTO - Returned
    ///     LAST UPDATE  RETURN Accepted at Balotra_Ward45_D (Rajasthan)
    ///
    /// and the tracking API splits those across two fields: Status.Status is
    /// the LEG, which reads "RTO" from the moment the parcel turns round until
    /// it is on the shelf, and Status.Instructions is the sentence underneath,
    /// which is where "RETURN Accepted" actually lives. Asking only the status
    /// could never tell the two halves of the way home apart.
    ///
    /// The instruction is only ever CONFIRMATION: IsReturnLeg must already
    /// have said this parcel is coming home, so a sentence can say "it has
    /// arrived" and can never on its own turn a parcel round. That matters -
    /// an out-for-delivery parcel whose note reads "consignee refused, will be
    /// returned" is not a return yet.
    /// </summary>
    public static bool IsBackWithUs(string? status, string? statusType, string? instruction = null)
    {
        if (!IsReturnLeg(status, statusType)) return false;

        // The status is a LABEL - a word or two the courier files the shipment
        // under - so loose matching is safe on it. "RTO - Returned" and a bare
        // "Returned" both say it, and nothing on the way home carries the word:
        // "Out for Return" and "Return Initiated" have no "returned" in them.
        var s = (status ?? "").ToLowerInvariant();
        if (s.Contains("delivered") || s.Contains("received") || s.Contains("accepted")
            || s.Contains("returned") || s.Contains("to origin"))
            return true;

        // The instruction is a SENTENCE, and the same loose matching there is
        // how "Consignee refused, will be returned" - a parcel that has not
        // even turned round yet - would read as one sitting on the shelf. Only
        // the courier's own terminal phrases count here.
        var n = (instruction ?? "").ToLowerInvariant();
        return n.Contains("return accepted")
            || n.Contains("rto delivered")
            || n.Contains("return delivered")
            || n.Contains("returned to origin")
            || n.Contains("received at origin");
    }

    /// <summary>
    /// Delhivery sends its own expected delivery date in the SAME object this
    /// reads the status out of, and it used to be dropped on the floor. Keeping
    /// it costs nothing - no extra call, no extra permission - and it is the
    /// courier's own promise rather than a guess of ours about how long a
    /// parcel takes to reach a pincode.
    /// </summary>
    public async Task<Dictionary<string, TrackLine>> TrackAsync(IEnumerable<string> awbs)
    {
        var result = new Dictionary<string, TrackLine>(StringComparer.OrdinalIgnoreCase);
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
                // The courier's own classification, which is what actually
                // separates a parcel going out from one coming back. Absent on
                // some responses, so everything downstream treats it as a hint
                // that wins when present rather than as a requirement.
                var statusType = st.ValueKind == JsonValueKind.Object
                    && st.TryGetProperty("StatusType", out var stt) && stt.ValueKind == JsonValueKind.String
                    ? (stt.GetString() ?? "") : "";
                // The sentence under the status. "In Transit" is where a parcel
                // is; "Call placed to consignee" and "Out for delivery" are what
                // somebody has to do about it today, and they live here rather
                // than in Status.
                var instruction = st.ValueKind == JsonValueKind.Object
                    && st.TryGetProperty("Instructions", out var ins) && ins.ValueKind == JsonValueKind.String
                    ? (ins.GetString() ?? "") : "";
                var expectedRaw =
                    (ship.TryGetProperty("ExpectedDeliveryDate", out var e1) && e1.ValueKind == JsonValueKind.String
                        ? e1.GetString() : null)
                    ?? (ship.TryGetProperty("PromisedDeliveryDate", out var e2) && e2.ValueKind == JsonValueKind.String
                        ? e2.GetString() : null);

                // The newest scan, which this response has been carrying all
                // along and this method was throwing away. TrackDetailAsync -
                // the modal - reads the same array out of the same payload.
                //
                // Newest by TIME, not by position: Delhivery has sent this
                // array oldest-first and newest-first at different times, which
                // is why SplitLegs below sorts by CourierDate rather than
                // trusting the order. Taking the first or the last element
                // would be right about half the time.
                var lastScan = "";
                if (ship.TryGetProperty("Scans", out var scansEl) && scansEl.ValueKind == JsonValueKind.Array)
                {
                    DateTimeOffset newest = DateTimeOffset.MinValue;
                    foreach (var scanItem in scansEl.EnumerateArray())
                    {
                        var d = scanItem.TryGetProperty("ScanDetail", out var sd) ? sd : scanItem;

                        string? Text(string key) =>
                            d.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String
                                ? v.GetString() : null;

                        var remark = Text("Instructions") ?? Text("Scan") ?? "";
                        if (remark.Trim().Length == 0) continue;

                        var at = CourierDate(Text("ScanDateTime") ?? Text("StatusDateTime"));
                        // A scan with no readable time still beats nothing at
                        // all, but never beats one that is dated.
                        var when = at ?? DateTimeOffset.MinValue;
                        if (lastScan.Length == 0 || when > newest)
                        {
                            newest = when;
                            lastScan = remark.Trim();
                        }
                    }
                }

                if (!string.IsNullOrWhiteSpace(awb) && !string.IsNullOrWhiteSpace(status))
                    result[awb!] = new TrackLine(status!, CourierDate(expectedRaw), statusType, instruction, lastScan);
            }
        }
        catch { /* tracking is best-effort — sync service will retry next cycle */ }
        return result;
    }

    /// <summary>
    /// A date as Delhivery writes it, which is not one thing. Observed shapes
    /// include "2026-10-25", "2026-10-25 20:00:00", "2026-10-25T20:00:00" and
    /// the same with an offset on the end; the field is also sometimes an
    /// empty string, and sometimes missing.
    ///
    /// Anything without an offset is read as INDIAN time, because that is what
    /// an Indian courier means by a delivery date. Read as UTC instead, an
    /// evening slot would show up as the next morning and the whole column
    /// would be a day out for half the orders.
    /// </summary>
    public static DateTimeOffset? CourierDate(string? raw)
    {
        var s = (raw ?? string.Empty).Trim();
        if (s.Length == 0) return null;

        // Always returned in UTC. Same instant, and it is the only shape that
        // can be STORED.
        //
        // Npgsql refuses a DateTimeOffset whose offset is not zero when the
        // column is `timestamp with time zone` - it throws rather than
        // converting. This method used to hand back +05:30, so every single
        // attempt to save an expected delivery date threw, from the day the
        // feature was written. The background sweep caught that and moved on,
        // so expected_delivery was never once populated and the Date column
        // stayed empty with nothing anywhere saying why. The 500 that finally
        // exposed it only appeared because a later change called this on a
        // path that did not swallow exceptions.
        //
        // The offset still matters on the way IN - a bare "2026-10-28" from an
        // Indian courier means an Indian day, and reading it as UTC would put
        // every evening slot on the following date. That is why it is built
        // with IST and converted, rather than parsed as UTC.
        if (DateTimeOffset.TryParse(s, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var withOffset)
            && (s.EndsWith("Z", StringComparison.OrdinalIgnoreCase) || s.Contains('+') || s.LastIndexOf('-') > 7))
            return withOffset.ToUniversalTime();

        if (DateTime.TryParse(s, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var naive))
            return new DateTimeOffset(DateTime.SpecifyKind(naive, DateTimeKind.Unspecified), IndiaTime.Offset)
                .ToUniversalTime();

        return null;
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

    public record TrackScan(string Time, string Location, string Remark, string StatusType = "");
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
                        remark,
                        // Per-scan direction, when the courier sends it. Not
                        // relied on: SplitLegs falls back to the words and
                        // then to showing one timeline, which is what this
                        // screen did before any of it existed.
                        GetStr(d, "StatusType") ?? ""));
                }
            }
            return new TrackDetail(true, status, expected, scans);
        }
        catch { return none; }
    }

    /// <summary>
    /// Which scans belong to the journey out, and which to the journey back.
    ///
    /// An undelivered parcel comes home on the SAME waybill, so one tracking
    /// call returns both halves of its life as one list - and the way back
    /// reads exactly like the way out, "Vehicle Departed" and "Trip Arrived"
    /// all over again. Shown as one timeline, as it was, the shop reads a
    /// parcel that has been in transit for three weeks and cannot tell that
    /// the last two were spent coming back.
    ///
    /// Three answers, in order of how much they can be trusted:
    ///
    ///   1. The courier's own per-scan StatusType. RT is the return leg. Used
    ///      whenever any scan carries one.
    ///   2. The words. The first scan that says the parcel has turned round,
    ///      in time order, and everything after it.
    ///   3. Neither: every scan is the way out, and the screen shows the one
    ///      timeline it always showed. A split nobody can justify is worse
    ///      than no split, because it invents a date the parcel turned round.
    /// </summary>
    public static bool[] SplitLegs(IReadOnlyList<TrackScan> scans)
    {
        var back = new bool[scans.Count];
        if (scans.Count == 0) return back;

        if (scans.Any(s => (s.StatusType ?? "").Trim().ToUpperInvariant() == "RT"))
        {
            for (var i = 0; i < scans.Count; i++)
                back[i] = (scans[i].StatusType ?? "").Trim().ToUpperInvariant() == "RT";
            return back;
        }

        // In time order, whatever order the courier happened to send them in.
        // A scan with an unreadable date keeps its place in the list rather
        // than being thrown to one end, where it would drag the turning point
        // with it.
        var order = Enumerable.Range(0, scans.Count)
            .OrderBy(i => CourierDate(scans[i].Time) ?? DateTimeOffset.MinValue)
            .ThenBy(i => i)
            .ToList();

        var turned = false;
        foreach (var i in order)
        {
            if (!turned && SaysItTurnedRound(scans[i].Remark)) turned = true;
            back[i] = turned;
        }
        return back;
    }

    /// The words a scan uses when the parcel stops going to the customer and
    /// starts coming home. Deliberately narrow: "Undelivered" is not one of
    /// them, because a failed attempt is followed by another attempt far more
    /// often than by a return.
    private static bool SaysItTurnedRound(string? remark)
    {
        var s = (remark ?? "").ToLowerInvariant();
        return s.Contains("rto") || s.Contains("dto")
            || s.Contains("out for return") || s.Contains("return to origin")
            || s.Contains("returned to origin") || s.Contains("return initiated")
            || s.Contains("rts");
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
