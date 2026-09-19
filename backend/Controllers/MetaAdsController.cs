using System.Net.Http.Headers;
using System.Text.Json;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Facebook / Instagram ad spend and sales, and day-to-day control of the
/// campaigns, from the admin panel.
///
/// Unlike Google this does NOT use the OAuth dance. A Meta user token lasts
/// 60 days and ads_management on a public app needs App Review; a System User
/// token from Business Settings never expires and needs neither. So the token
/// is pasted once into settings and lives server-side.
/// </summary>
[ApiController]
[Route("api/metaads")]
public class MetaAdsController : ControllerBase
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(30) };

    private readonly AppDbContext _db;
    private readonly ILogger<MetaAdsController> _log;

    public MetaAdsController(AppDbContext db, ILogger<MetaAdsController> log)
    {
        _db = db;
        _log = log;
    }

    // Meta retires a version about two years after release, so this is a setting.
    private const string DefaultApiVersion = "v25.0";

    private Task<string?> Get(string key) =>
        _db.SiteSettings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync();

    private async Task Set(string key, string value)
    {
        var row = await _db.SiteSettings.FirstOrDefaultAsync(s => s.Key == key);
        if (row is null) _db.SiteSettings.Add(new SiteSetting { Key = key, Value = value });
        else { row.Value = value; row.UpdatedAt = DateTimeOffset.UtcNow; }
        await _db.SaveChangesAsync();
    }

    private static string Digits(string? s) => new((s ?? "").Where(char.IsDigit).ToArray());

    private async Task<string> Version()
    {
        var v = await Get("metaAdsApiVersion");
        return string.IsNullOrWhiteSpace(v) ? DefaultApiVersion : v.Trim();
    }

    /// The ceiling a daily budget may be set to from admin. Server-side on purpose.
    private async Task<decimal> MaxDailyBudget()
    {
        var raw = await Get("metaAdsMaxDailyBudget");
        return decimal.TryParse(raw, out var v) && v > 0 ? v : 5000m;
    }

    // ── shared request plumbing ──────────────────────────────────────────────

    private async Task<(bool ok, string body, string? error)> Call(HttpMethod method, string path,
        IEnumerable<KeyValuePair<string, string>>? form = null)
    {
        var token = await Get("metaAdsAccessToken");
        if (string.IsNullOrWhiteSpace(token))
            return (false, "", "Meta Ads is not connected. Paste a System User access token in Settings → Meta Ads.");

        using var req = new HttpRequestMessage(method, $"https://graph.facebook.com/{await Version()}/{path}");
        // In the header, never the query string — a URL with a token in it ends
        // up in proxy and server logs.
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (form is not null) req.Content = new FormUrlEncodedContent(form);

        try
        {
            using var res = await Http.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
            {
                _log.LogError("Meta Ads {Path} failed ({Status}): {Body}", path, (int)res.StatusCode, body);
                return (false, body, FriendlyError(body, (int)res.StatusCode));
            }
            return (true, body, null);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Meta Ads {Path} request failed", path);
            return (false, "", "Could not reach Meta just now.");
        }
    }

    private static string FriendlyError(string body, int status)
    {
        try
        {
            var json = JsonSerializer.Deserialize<JsonElement>(body);
            if (json.TryGetProperty("error", out var e))
            {
                var code = e.TryGetProperty("code", out var c) && c.TryGetInt32(out var ci) ? ci : 0;
                var msg = e.TryGetProperty("message", out var m) ? m.GetString() ?? "" : "";

                if (code == 190)
                    return "The Meta access token is no longer valid. Create a fresh System User token in Business Settings and paste it in Settings → Meta Ads.";
                if (code == 200 || code == 10 || msg.Contains("permission", StringComparison.OrdinalIgnoreCase))
                    return "That token cannot manage this ad account. It needs ads_management, and the System User must be assigned to the ad account.";
                if (code == 100 && msg.Contains("act_", StringComparison.OrdinalIgnoreCase))
                    return "Meta does not recognise that Ad Account ID. It is the number after act_ in Ads Manager.";
                if (code == 4 || code == 17 || code == 613)
                    return "Meta is rate-limiting this account. Try again in a few minutes.";
                if (!string.IsNullOrWhiteSpace(msg)) return "Meta said: " + msg;
            }
        }
        catch { /* fall through to the generic line */ }
        return $"Meta refused the request (HTTP {status}). The exact reason is in the server log.";
    }

    // ── money: Meta counts in the account currency's minor unit ─────────────
    // For INR that is paise: ₹500 is 50000, NOT 500 and NOT 500000000. Google
    // uses micros, Meta uses paise — mixing the two is the expensive mistake,
    // so both conversions live in one named place each.
    private static decimal PaiseToRupees(string? raw) =>
        long.TryParse(raw, out var p) ? Math.Round(p / 100m, 2) : 0m;

    private static long RupeesToPaise(decimal rupees) => (long)(rupees * 100m);

    private static decimal Dec(JsonElement parent, string name)
    {
        if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(name, out var v)) return 0m;
        if (v.ValueKind == JsonValueKind.Number) return v.GetDecimal();
        return decimal.TryParse(v.GetString(), System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : 0m;
    }

    private static string Str(JsonElement parent, string name)
    {
        if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(name, out var v)) return "";
        return v.ValueKind == JsonValueKind.String ? (v.GetString() ?? "") : v.ToString();
    }

    /// Meta reports conversions as a list of {action_type, value}. A shop wants
    /// purchases; the pixel reports them under either name depending on setup.
    private static decimal ActionTotal(JsonElement row, string field)
    {
        if (!row.TryGetProperty(field, out var arr) || arr.ValueKind != JsonValueKind.Array) return 0m;
        decimal exact = 0m, pixel = 0m;
        foreach (var a in arr.EnumerateArray())
        {
            var type = Str(a, "action_type");
            var val = Dec(a, "value");
            if (type == "purchase") exact += val;
            else if (type == "offsite_conversion.fb_pixel_purchase") pixel += val;
        }
        // Prefer the unified "purchase" figure; it already includes the pixel one.
        return exact > 0 ? exact : pixel;
    }

    private static string Range(int days, out string since, out string until)
    {
        var to = DateTime.UtcNow.Date;
        var from = to.AddDays(-(days - 1));
        since = from.ToString("yyyy-MM-dd");
        until = to.ToString("yyyy-MM-dd");
        return "{\"since\":\"" + since + "\",\"until\":\"" + until + "\"}";
    }

    // ── status ───────────────────────────────────────────────────────────────

    [HttpGet("status")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> Status() => Ok(new
    {
        success = true,
        connected = !string.IsNullOrWhiteSpace(await Get("metaAdsAccessToken")),
        adAccountId = Digits(await Get("metaAdsAccountId")),
        apiVersion = await Version(),
    });

    [HttpPost("disconnect")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> Disconnect()
    {
        await Set("metaAdsAccessToken", "");
        return Ok(new { success = true });
    }

    // ── daily spend and sales ────────────────────────────────────────────────

    [HttpGet("stats")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> Stats([FromQuery] int days = 30)
    {
        days = Math.Clamp(days, 1, 180);

        var account = Digits(await Get("metaAdsAccountId"));
        if (account.Length < 5)
            return BadRequest(new { success = false, message = "Meta Ad Account ID is missing. It is the number after act_ in Ads Manager." });

        var timeRange = Range(days, out var since, out var until);
        var path = $"act_{account}/insights"
                 + "?level=account&time_increment=1"
                 + "&fields=spend,impressions,clicks,actions,action_values"
                 + "&time_range=" + Uri.EscapeDataString(timeRange)
                 + "&limit=200";

        var (ok, body, err) = await Call(HttpMethod.Get, path);
        if (!ok) return BadRequest(new { success = false, message = err });

        var rows = new List<object>();
        decimal spend = 0, purchases = 0, purchaseValue = 0;
        long impressions = 0, clicks = 0;

        try
        {
            var json = JsonSerializer.Deserialize<JsonElement>(body);
            if (json.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
            {
                foreach (var r in data.EnumerateArray())
                {
                    var dSpend = Dec(r, "spend");
                    var dImp = (long)Dec(r, "impressions");
                    var dClicks = (long)Dec(r, "clicks");
                    var dConv = ActionTotal(r, "actions");
                    var dValue = ActionTotal(r, "action_values");

                    spend += dSpend; impressions += dImp; clicks += dClicks;
                    purchases += dConv; purchaseValue += dValue;

                    rows.Add(new
                    {
                        date = Str(r, "date_start"),
                        impressions = dImp,
                        clicks = dClicks,
                        cost = Math.Round(dSpend, 2),
                        conversions = Math.Round(dConv, 2),
                        conversionValue = Math.Round(dValue, 2),
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Could not read the Meta insights response");
            return StatusCode(502, new { success = false, message = "Meta answered in a shape we could not read." });
        }

        spend = Math.Round(spend, 2);
        return Ok(new
        {
            success = true,
            from = since,
            to = until,
            rows,
            totals = new
            {
                impressions,
                clicks,
                spend,
                conversions = Math.Round(purchases, 2),
                conversionValue = Math.Round(purchaseValue, 2),
                roas = spend > 0 ? Math.Round(purchaseValue / spend, 2) : (decimal?)null,
                costPerClick = clicks > 0 ? Math.Round(spend / clicks, 2) : (decimal?)null,
                costPerConversion = purchases > 0 ? Math.Round(spend / purchases, 2) : (decimal?)null,
            },
        });
    }

    // ── campaigns, with their budgets ────────────────────────────────────────

    private sealed class Row
    {
        public string Id = "";
        public string Name = "";
        public string Status = "";
        public string Objective = "";
        public decimal DailyBudget;          // 0 when there is no campaign daily budget
        public bool BudgetOnAdSets;          // true = a daily budget cannot be set here
        public string BudgetNote = "";
        public long Impressions;
        public long Clicks;
        public decimal Spend;
        public decimal Conversions;
        public decimal ConversionValue;
    }

    [HttpGet("campaigns")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> Campaigns([FromQuery] int days = 30)
    {
        days = Math.Clamp(days, 1, 180);

        var account = Digits(await Get("metaAdsAccountId"));
        if (account.Length < 5)
            return BadRequest(new { success = false, message = "Meta Ad Account ID is missing." });

        // Every campaign, including the paused ones with no spend — those are
        // exactly the ones the owner came here to switch back on.
        var listPath = $"act_{account}/campaigns"
                     + "?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget"
                     + "&limit=200";
        var (ok1, listBody, e1) = await Call(HttpMethod.Get, listPath);
        if (!ok1) return BadRequest(new { success = false, message = e1 });

        var byId = new Dictionary<string, Row>();
        try
        {
            var json = JsonSerializer.Deserialize<JsonElement>(listBody);
            if (json.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
            {
                foreach (var c in data.EnumerateArray())
                {
                    var id = Str(c, "id");
                    if (string.IsNullOrEmpty(id)) continue;
                    var daily = PaiseToRupees(Str(c, "daily_budget"));
                    var lifetime = PaiseToRupees(Str(c, "lifetime_budget"));
                    // A daily budget can only be changed here when the campaign
                    // actually has one. Meta also allows the budget to sit on each
                    // ad set, or to be a lifetime budget for the whole run; in both
                    // of those cases writing daily_budget would just be refused, so
                    // the screen says so instead of offering a box that fails.
                    byId[id] = new Row
                    {
                        Id = id,
                        Name = Str(c, "name"),
                        Status = Str(c, "status"),
                        Objective = Str(c, "objective"),
                        DailyBudget = daily,
                        BudgetOnAdSets = daily <= 0,
                        BudgetNote = daily > 0 ? ""
                            : lifetime > 0 ? $"lifetime budget \u20b9{lifetime:0}"
                            : "set on the ad sets",
                    };
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Could not read the Meta campaign list");
            return StatusCode(502, new { success = false, message = "Meta answered in a shape we could not read." });
        }

        var timeRange = Range(days, out _, out _);
        var insightsPath = $"act_{account}/insights"
                         + "?level=campaign"
                         + "&fields=campaign_id,spend,impressions,clicks,actions,action_values"
                         + "&time_range=" + Uri.EscapeDataString(timeRange)
                         + "&limit=200";
        var (ok2, insightsBody, e2) = await Call(HttpMethod.Get, insightsPath);
        if (!ok2) return BadRequest(new { success = false, message = e2 });

        try
        {
            var json = JsonSerializer.Deserialize<JsonElement>(insightsBody);
            if (json.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
            {
                foreach (var r in data.EnumerateArray())
                {
                    var id = Str(r, "campaign_id");
                    if (!byId.TryGetValue(id, out var row)) continue;
                    row.Impressions += (long)Dec(r, "impressions");
                    row.Clicks += (long)Dec(r, "clicks");
                    row.Spend += Dec(r, "spend");
                    row.Conversions += ActionTotal(r, "actions");
                    row.ConversionValue += ActionTotal(r, "action_values");
                }
            }
        }
        catch { /* the list still stands on its own without metrics */ }

        return Ok(new
        {
            success = true,
            maxDailyBudget = await MaxDailyBudget(),
            campaigns = byId.Values
                .OrderByDescending(c => c.Spend).ThenBy(c => c.Name)
                .Select(c => new
                {
                    id = c.Id,
                    name = c.Name,
                    status = c.Status,
                    channel = c.Objective,
                    dailyBudget = c.DailyBudget,
                    budgetOnAdSets = c.BudgetOnAdSets,
                    budgetNote = c.BudgetNote,
                    impressions = c.Impressions,
                    clicks = c.Clicks,
                    spend = Math.Round(c.Spend, 2),
                    conversions = Math.Round(c.Conversions, 2),
                    conversionValue = Math.Round(c.ConversionValue, 2),
                }),
        });
    }

    public record StatusRequest(string? Status);

    [HttpPost("campaigns/{id}/status")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> SetStatus(string id, [FromBody] StatusRequest req)
    {
        var campaignId = Digits(id);
        if (string.IsNullOrEmpty(campaignId))
            return BadRequest(new { success = false, message = "Bad campaign id." });

        var status = (req.Status ?? "").Trim().ToUpperInvariant();
        // No DELETED and no ARCHIVED: this screen is for daily control, and both
        // of those are hard to undo.
        if (status != "ACTIVE" && status != "PAUSED")
            return BadRequest(new { success = false, message = "Status must be ACTIVE or PAUSED." });

        var (ok, _, err) = await Call(HttpMethod.Post, campaignId,
            new[] { new KeyValuePair<string, string>("status", status) });
        if (!ok) return BadRequest(new { success = false, message = err });

        _log.LogWarning("Meta campaign {Campaign} set to {Status} from admin", campaignId, status);
        return Ok(new { success = true, status });
    }

    public record BudgetRequest(string? CampaignId, decimal Amount);

    [HttpPost("budget")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> SetBudget([FromBody] BudgetRequest req)
    {
        var campaignId = Digits(req.CampaignId);
        if (string.IsNullOrEmpty(campaignId))
            return BadRequest(new { success = false, message = "Bad campaign id." });

        var amount = Math.Round(req.Amount, 0, MidpointRounding.AwayFromZero);
        if (amount <= 0)
            return BadRequest(new { success = false, message = "Daily budget must be more than ₹0." });

        var cap = await MaxDailyBudget();
        if (amount > cap)
            return BadRequest(new { success = false, message = $"₹{amount:0} is above the ₹{cap:0} daily limit. Raise the limit in Settings → Meta Ads if you really mean it." });

        var (ok, _, err) = await Call(HttpMethod.Post, campaignId,
            new[] { new KeyValuePair<string, string>("daily_budget", RupeesToPaise(amount).ToString()) });
        if (!ok) return BadRequest(new { success = false, message = err });

        _log.LogWarning("Meta campaign {Campaign} budget set to ₹{Amount}/day from admin", campaignId, amount);
        return Ok(new { success = true, dailyBudget = amount });
    }
}
