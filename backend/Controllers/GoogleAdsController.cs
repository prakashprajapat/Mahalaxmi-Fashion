using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Reads spend and sales back out of Google Ads so the admin can see what the
/// advertising actually returned, next to the orders it produced.
///
/// It reuses the SAME OAuth client the storefront already uses for "Sign in with
/// Google" (googleClientId / googleClientSecret), so there is no second secret to
/// create, store or lose. Only the Customer ID is new.
/// </summary>
[ApiController]
[Route("api/googleads")]
public class GoogleAdsController : ControllerBase
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(30) };

    private readonly AppDbContext _db;
    private readonly ILogger<GoogleAdsController> _log;

    public GoogleAdsController(AppDbContext db, ILogger<GoogleAdsController> log)
    {
        _db = db;
        _log = log;
    }

    // adwords = read the figures and run the campaigns. datamanager = push a
    // Customer Match list (Audiences). Asking for both in one consent screen
    // saves the owner a second round trip; an account that never uses
    // Audiences is not harmed by the extra scope sitting unused.
    private const string Scope =
        "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/datamanager";
    private const string DefaultSite = "https://www.mahalaxmifashionhub.com";

    // Google sunsets an API version roughly a year after release, so this is a
    // setting rather than a constant: when v25 goes, change it in admin instead
    // of waiting for a deploy.
    private const string DefaultApiVersion = "v25";

    private const string AdminPage = "/admin/google-ads";

    // ── settings helpers ──────────────────────────────────────────────────────

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

    private async Task<string> RedirectUri()
    {
        var site = (await Get("siteUrl"))?.TrimEnd('/');
        if (string.IsNullOrWhiteSpace(site)) site = DefaultSite;
        return site + "/api/googleads/oauth/callback";
    }

    // ── 1. start the consent flow ─────────────────────────────────────────────

    [HttpGet("oauth/start")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> Start()
    {
        var clientId = await Get("googleClientId");
        if (string.IsNullOrWhiteSpace(clientId))
            return BadRequest(new { success = false, message = "Google OAuth Client ID is empty. Fill it in Settings → Social Login Options first." });

        // One-time value tying the callback back to this admin's click. The
        // callback cannot be [Authorize]d — Google's redirect carries no session.
        var state = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
        await Set("googleAdsOauthState", state);

        var url = "https://accounts.google.com/o/oauth2/v2/auth"
                + "?client_id=" + Uri.EscapeDataString(clientId)
                + "&redirect_uri=" + Uri.EscapeDataString(await RedirectUri())
                + "&response_type=code"
                + "&scope=" + Uri.EscapeDataString(Scope)
                + "&access_type=offline"      // we need a refresh token, not just an hour
                + "&prompt=consent"           // force one, even if they granted before
                + "&include_granted_scopes=false"
                + "&state=" + state;

        return Ok(new { success = true, url });
    }

    // ── 2. Google sends the customer back here ────────────────────────────────

    [HttpGet("oauth/callback")]
    public async Task<IActionResult> Callback([FromQuery] string? code, [FromQuery] string? state, [FromQuery] string? error)
    {
        if (!string.IsNullOrWhiteSpace(error))
            return Redirect($"{AdminPage}?error={Uri.EscapeDataString(error)}");

        var expected = await Get("googleAdsOauthState");
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(state)
            || string.IsNullOrWhiteSpace(expected) || !string.Equals(state, expected, StringComparison.Ordinal))
            return Redirect($"{AdminPage}?error=state_mismatch");

        await Set("googleAdsOauthState", "");   // single use

        var clientId = await Get("googleClientId");
        var clientSecret = await Get("googleClientSecret");
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            return Redirect($"{AdminPage}?error=oauth_not_configured");

        try
        {
            using var res = await Http.PostAsync("https://oauth2.googleapis.com/token",
                new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["code"] = code,
                    ["client_id"] = clientId,
                    ["client_secret"] = clientSecret,
                    ["redirect_uri"] = await RedirectUri(),
                    ["grant_type"] = "authorization_code",
                }));

            var body = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
            {
                _log.LogError("Google Ads token exchange failed ({Status}): {Body}", (int)res.StatusCode, body);
                return Redirect($"{AdminPage}?error=token_exchange_failed");
            }

            var json = JsonSerializer.Deserialize<JsonElement>(body);
            var refresh = json.TryGetProperty("refresh_token", out var rt) ? rt.GetString() : null;
            if (string.IsNullOrWhiteSpace(refresh))
                return Redirect($"{AdminPage}?error=no_refresh_token");

            await Set("googleAdsRefreshToken", refresh);
            return Redirect($"{AdminPage}?connected=1");
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Google Ads OAuth callback failed");
            return Redirect($"{AdminPage}?error=callback_exception");
        }
    }

    // ── 3. a fresh access token from the stored refresh token ─────────────────

    private async Task<(string? token, string? error)> AccessToken()
    {
        var clientId = await Get("googleClientId");
        var clientSecret = await Get("googleClientSecret");
        var refresh = await Get("googleAdsRefreshToken");

        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            return (null, "Google OAuth Client ID / Secret are not set in Settings.");
        if (string.IsNullOrWhiteSpace(refresh))
            return (null, "Google Ads is not connected yet. Press Connect Google Ads.");

        using var res = await Http.PostAsync("https://oauth2.googleapis.com/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["refresh_token"] = refresh,
                ["grant_type"] = "refresh_token",
            }));

        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
        {
            _log.LogError("Google Ads token refresh failed ({Status}): {Body}", (int)res.StatusCode, body);
            // A revoked or expired grant is the one the admin can actually fix.
            if (body.Contains("invalid_grant", StringComparison.OrdinalIgnoreCase))
                return (null, "Google has revoked the connection. Press Connect Google Ads again.");
            return (null, "Could not refresh the Google access token.");
        }

        var json = JsonSerializer.Deserialize<JsonElement>(body);
        return (json.TryGetProperty("access_token", out var at) ? at.GetString() : null, null);
    }

    // ── 4. is it connected? ───────────────────────────────────────────────────

    [HttpGet("status")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> Status() => Ok(new
    {
        success = true,
        connected = !string.IsNullOrWhiteSpace(await Get("googleAdsRefreshToken")),
        customerId = Digits(await Get("googleAdsCustomerId")),
        hasOauthClient = !string.IsNullOrWhiteSpace(await Get("googleClientId"))
                      && !string.IsNullOrWhiteSpace(await Get("googleClientSecret")),
        redirectUri = await RedirectUri(),
        apiVersion = string.IsNullOrWhiteSpace(await Get("googleAdsApiVersion")) ? DefaultApiVersion : await Get("googleAdsApiVersion"),
    });

    [HttpPost("disconnect")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> Disconnect()
    {
        await Set("googleAdsRefreshToken", "");
        return Ok(new { success = true });
    }

    // ── 5. the numbers ────────────────────────────────────────────────────────

    [HttpGet("stats")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> Stats([FromQuery] int days = 30)
    {
        days = Math.Clamp(days, 1, 180);

        var customerId = Digits(await Get("googleAdsCustomerId"));
        if (customerId.Length < 10)
            return BadRequest(new { success = false, message = "Google Ads Customer ID is missing. It is the 10-digit number at the top right of Google Ads." });

        var (token, err) = await AccessToken();
        if (token is null) return BadRequest(new { success = false, message = err });

        var version = await Get("googleAdsApiVersion");
        if (string.IsNullOrWhiteSpace(version)) version = DefaultApiVersion;

        // Google Ads reports in the account's own timezone; asking for "today"
        // back is normal and simply returns partial numbers.
        var to = DateTime.UtcNow.Date;
        var from = to.AddDays(-(days - 1));
        var gaql =
            "SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, " +
            "metrics.conversions, metrics.conversions_value FROM customer " +
            $"WHERE segments.date BETWEEN '{from:yyyy-MM-dd}' AND '{to:yyyy-MM-dd}' " +
            "ORDER BY segments.date";

        var (ok, body, apiErr) = await CallAds(token, version, customerId, "googleAds:searchStream", new { query = gaql });
        if (!ok) return BadRequest(new { success = false, message = apiErr });

        var rows = new List<object>();
        long impressions = 0, clicks = 0, costMicros = 0;
        double conversions = 0, conversionValue = 0;

        try
        {
            // searchStream answers with an ARRAY of chunks, each holding "results".
            var chunks = JsonSerializer.Deserialize<JsonElement>(body);
            if (chunks.ValueKind == JsonValueKind.Array)
            {
                foreach (var chunk in chunks.EnumerateArray())
                {
                    if (!chunk.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array) continue;
                    foreach (var r in results.EnumerateArray())
                    {
                        var date = r.TryGetProperty("segments", out var seg) && seg.TryGetProperty("date", out var d)
                            ? d.GetString() ?? "" : "";
                        r.TryGetProperty("metrics", out var m);

                        var imp = ReadLong(m, "impressions");
                        var clk = ReadLong(m, "clicks");
                        var cost = ReadLong(m, "costMicros");
                        var conv = ReadDouble(m, "conversions");
                        var convVal = ReadDouble(m, "conversionsValue");

                        impressions += imp; clicks += clk; costMicros += cost;
                        conversions += conv; conversionValue += convVal;

                        rows.Add(new
                        {
                            date,
                            impressions = imp,
                            clicks = clk,
                            cost = Math.Round(cost / 1_000_000m, 2),
                            conversions = Math.Round(conv, 2),
                            conversionValue = Math.Round(convVal, 2),
                        });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Could not read the Google Ads response");
            return StatusCode(502, new { success = false, message = "Google Ads answered in a shape we could not read." });
        }

        var spend = Math.Round(costMicros / 1_000_000m, 2);
        return Ok(new
        {
            success = true,
            from = from.ToString("yyyy-MM-dd"),
            to = to.ToString("yyyy-MM-dd"),
            rows,
            totals = new
            {
                impressions,
                clicks,
                spend,
                conversions = Math.Round(conversions, 2),
                conversionValue = Math.Round(conversionValue, 2),
                // ₹ back per ₹ spent. Null rather than 0 when nothing was spent —
                // "0x return" on zero spend would be a lie.
                roas = spend > 0 ? Math.Round((decimal)conversionValue / spend, 2) : (decimal?)null,
                costPerClick = clicks > 0 ? Math.Round(spend / clicks, 2) : (decimal?)null,
                costPerConversion = conversions > 0 ? Math.Round(spend / (decimal)conversions, 2) : (decimal?)null,
            },
        });
    }


    // ── shared: one authenticated POST to the Google Ads REST API ────────────

    private async Task<(bool ok, string body, string? error)> CallAds(
        string token, string version, string customerId, string path, object payload)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post,
            $"https://googleads.googleapis.com/{version}/customers/{customerId}/{path}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Only needed when the account sits under a manager (MCC) account.
        var loginCustomerId = Digits(await Get("googleAdsLoginCustomerId"));
        if (loginCustomerId.Length >= 10) req.Headers.Add("login-customer-id", loginCustomerId);

        req.Content = new StringContent(JsonSerializer.Serialize(payload),
            System.Text.Encoding.UTF8, "application/json");

        try
        {
            using var res = await Http.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
            {
                _log.LogError("Google Ads {Path} failed ({Status}): {Body}", path, (int)res.StatusCode, body);
                return (false, body, FriendlyApiError(body, (int)res.StatusCode));
            }
            return (true, body, null);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Google Ads {Path} request failed", path);
            return (false, "", "Could not reach Google Ads just now.");
        }
    }

    /// Walks every result row of a searchStream answer.
    private static IEnumerable<JsonElement> StreamRows(string body)
    {
        JsonElement chunks;
        try { chunks = JsonSerializer.Deserialize<JsonElement>(body); }
        catch { yield break; }
        if (chunks.ValueKind != JsonValueKind.Array) yield break;
        foreach (var chunk in chunks.EnumerateArray())
        {
            if (!chunk.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array) continue;
            foreach (var r in results.EnumerateArray()) yield return r;
        }
    }

    private static string Str(JsonElement parent, string child)
    {
        if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(child, out var v)) return "";
        return v.ValueKind == JsonValueKind.String ? (v.GetString() ?? "") : v.ToString();
    }

    private sealed class CampaignRow
    {
        public string Id = "";
        public string Name = "";
        public string Status = "";
        public string Channel = "";
        public string BudgetResource = "";
        public decimal DailyBudget;
        public long Impressions;
        public long Clicks;
        public decimal Spend;
        public double Conversions;
        public double ConversionValue;
    }

    // ── 6. one line per campaign, with its budget ────────────────────────────

    [HttpGet("campaigns")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> Campaigns([FromQuery] int days = 30)
    {
        days = Math.Clamp(days, 1, 180);

        var customerId = Digits(await Get("googleAdsCustomerId"));
        if (customerId.Length < 10)
            return BadRequest(new { success = false, message = "Google Ads Customer ID is missing." });

        var (token, err) = await AccessToken();
        if (token is null) return BadRequest(new { success = false, message = err });

        var version = await Get("googleAdsApiVersion");
        if (string.IsNullOrWhiteSpace(version)) version = DefaultApiVersion;

        // Two queries on purpose. The metrics query only returns campaigns that
        // had activity in the window, and a paused campaign with no spend is
        // exactly the one the shop owner came here to switch back on.
        var listQuery =
            "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, " +
            "campaign_budget.resource_name, campaign_budget.amount_micros " +
            "FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.name";

        var (ok1, listBody, e1) = await CallAds(token, version, customerId, "googleAds:searchStream", new { query = listQuery });
        if (!ok1) return BadRequest(new { success = false, message = e1 });

        var byId = new Dictionary<string, CampaignRow>();
        foreach (var r in StreamRows(listBody))
        {
            r.TryGetProperty("campaign", out var c);
            r.TryGetProperty("campaignBudget", out var b);
            var id = Str(c, "id");
            if (string.IsNullOrEmpty(id)) continue;
            byId[id] = new CampaignRow
            {
                Id = id,
                Name = Str(c, "name"),
                Status = Str(c, "status"),
                Channel = Str(c, "advertisingChannelType"),
                BudgetResource = Str(b, "resourceName"),
                DailyBudget = Math.Round(ReadLong(b, "amountMicros") / 1_000_000m, 2),
            };
        }

        var to = DateTime.UtcNow.Date;
        var from = to.AddDays(-(days - 1));
        var metricsQuery =
            "SELECT campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros, " +
            "metrics.conversions, metrics.conversions_value FROM campaign " +
            $"WHERE segments.date BETWEEN '{from:yyyy-MM-dd}' AND '{to:yyyy-MM-dd}'";

        var (ok2, metricsBody, e2) = await CallAds(token, version, customerId, "googleAds:searchStream", new { query = metricsQuery });
        if (!ok2) return BadRequest(new { success = false, message = e2 });

        foreach (var r in StreamRows(metricsBody))
        {
            r.TryGetProperty("campaign", out var c);
            var id = Str(c, "id");
            if (!byId.TryGetValue(id, out var row)) continue;
            r.TryGetProperty("metrics", out var m);
            row.Impressions += ReadLong(m, "impressions");
            row.Clicks += ReadLong(m, "clicks");
            row.Spend += Math.Round(ReadLong(m, "costMicros") / 1_000_000m, 2);
            row.Conversions += ReadDouble(m, "conversions");
            row.ConversionValue += ReadDouble(m, "conversionsValue");
        }

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
                    channel = c.Channel,
                    budgetResource = c.BudgetResource,
                    dailyBudget = c.DailyBudget,
                    impressions = c.Impressions,
                    clicks = c.Clicks,
                    spend = c.Spend,
                    conversions = Math.Round(c.Conversions, 2),
                    conversionValue = Math.Round(c.ConversionValue, 2),
                }),
        });
    }

    /// The ceiling a daily budget may be set to from admin. A typo here spends
    /// real money, so the limit lives on the server, not in the browser.
    private async Task<decimal> MaxDailyBudget()
    {
        var raw = await Get("googleAdsMaxDailyBudget");
        return decimal.TryParse(raw, out var v) && v > 0 ? v : 5000m;
    }

    public record CampaignStatusRequest(string? Status);

    // ── 7. pause / resume ────────────────────────────────────────────────────

    [HttpPost("campaigns/{id}/status")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> SetCampaignStatus(string id, [FromBody] CampaignStatusRequest req)
    {
        var campaignId = Digits(id);
        if (string.IsNullOrEmpty(campaignId))
            return BadRequest(new { success = false, message = "Bad campaign id." });

        var status = (req.Status ?? "").Trim().ToUpperInvariant();
        // Deliberately no REMOVED: deleting a campaign is permanent, and this
        // screen is for day-to-day control, not for destroying history.
        if (status != "ENABLED" && status != "PAUSED")
            return BadRequest(new { success = false, message = "Status must be ENABLED or PAUSED." });

        var customerId = Digits(await Get("googleAdsCustomerId"));
        var (token, err) = await AccessToken();
        if (token is null) return BadRequest(new { success = false, message = err });

        var version = await Get("googleAdsApiVersion");
        if (string.IsNullOrWhiteSpace(version)) version = DefaultApiVersion;

        var payload = new
        {
            operations = new[]
            {
                new
                {
                    update = new { resourceName = $"customers/{customerId}/campaigns/{campaignId}", status },
                    updateMask = "status",
                },
            },
        };

        var (ok, _, apiErr) = await CallAds(token, version, customerId, "campaigns:mutate", payload);
        if (!ok) return BadRequest(new { success = false, message = apiErr });

        _log.LogWarning("Google Ads campaign {Campaign} set to {Status} from admin", campaignId, status);
        return Ok(new { success = true, status });
    }

    public record BudgetRequest(string? BudgetResource, decimal Amount);

    // ── 8. change a daily budget ─────────────────────────────────────────────

    [HttpPost("budget")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> SetBudget([FromBody] BudgetRequest req)
    {
        var resource = (req.BudgetResource ?? "").Trim();
        // Must look exactly like a budget belonging to THIS account, so a crafted
        // request cannot reach into another customer's budgets.
        var customerId = Digits(await Get("googleAdsCustomerId"));
        var expectedPrefix = $"customers/{customerId}/campaignBudgets/";
        if (!resource.StartsWith(expectedPrefix, StringComparison.Ordinal)
            || !resource[expectedPrefix.Length..].All(char.IsDigit)
            || resource.Length == expectedPrefix.Length)
            return BadRequest(new { success = false, message = "That budget does not belong to this account." });

        var amount = Math.Round(req.Amount, 0, MidpointRounding.AwayFromZero);
        if (amount <= 0)
            return BadRequest(new { success = false, message = "Daily budget must be more than ₹0." });

        var cap = await MaxDailyBudget();
        if (amount > cap)
            return BadRequest(new { success = false, message = $"₹{amount:0} is above the ₹{cap:0} daily limit. Raise the limit in Settings → Google Ads if you really mean it." });

        var (token, err) = await AccessToken();
        if (token is null) return BadRequest(new { success = false, message = err });

        var version = await Get("googleAdsApiVersion");
        if (string.IsNullOrWhiteSpace(version)) version = DefaultApiVersion;

        // Google counts money in micros: ₹1 = 1,000,000. Getting this wrong by one
        // zero is the difference between ₹500 and ₹5,000 a day.
        var micros = (long)amount * 1_000_000L;

        var payload = new
        {
            operations = new[]
            {
                new
                {
                    update = new { resourceName = resource, amountMicros = micros.ToString() },
                    updateMask = "amount_micros",
                },
            },
        };

        var (ok, _, apiErr) = await CallAds(token, version, customerId, "campaignBudgets:mutate", payload);
        if (!ok) return BadRequest(new { success = false, message = apiErr });

        _log.LogWarning("Google Ads budget {Budget} set to ₹{Amount}/day from admin", resource, amount);
        return Ok(new { success = true, dailyBudget = amount });
    }

    // REST hands int64 back as strings, and omits a metric that is zero.
    private static long ReadLong(JsonElement parent, string name)
    {
        if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(name, out var v)) return 0;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out var n)) return n;
        return long.TryParse(v.GetString(), out var p) ? p : 0;
    }

    private static double ReadDouble(JsonElement parent, string name)
    {
        if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(name, out var v)) return 0;
        if (v.ValueKind == JsonValueKind.Number) return v.GetDouble();
        return double.TryParse(v.GetString(), System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out var p) ? p : 0;
    }

    /// Turn Google's error blob into something the shop owner can act on.
    private static string FriendlyApiError(string body, int status)
    {
        if (body.Contains("CUSTOMER_NOT_FOUND", StringComparison.OrdinalIgnoreCase)
            || body.Contains("CUSTOMER_NOT_ENABLED", StringComparison.OrdinalIgnoreCase))
            return "Google Ads does not recognise that Customer ID, or the signed-in account cannot see it.";
        if (body.Contains("USER_PERMISSION_DENIED", StringComparison.OrdinalIgnoreCase)
            || body.Contains("NOT_ADS_USER", StringComparison.OrdinalIgnoreCase))
            return "The Google account you connected does not have access to that Google Ads account.";
        if (body.Contains("DEVELOPER_TOKEN", StringComparison.OrdinalIgnoreCase))
            return "Google rejected the developer token. Check the access level in Google Cloud.";
        if (body.Contains("Requested entity was not found", StringComparison.OrdinalIgnoreCase))
            return "That Customer ID was not found. If the account sits under a manager account, fill the Manager (MCC) ID in Settings too.";
        if (status == 404)
            return "This Google Ads API version is no longer served. Update the API version in Settings.";
        return $"Google Ads refused the request (HTTP {status}). The exact reason is in the server log.";
    }
}
