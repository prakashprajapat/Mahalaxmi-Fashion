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

    private const string Scope = "https://www.googleapis.com/auth/adwords";
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

        using var req = new HttpRequestMessage(HttpMethod.Post,
            $"https://googleads.googleapis.com/{version}/customers/{customerId}/googleAds:searchStream");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Only needed when the account sits under a manager (MCC) account.
        var loginCustomerId = Digits(await Get("googleAdsLoginCustomerId"));
        if (loginCustomerId.Length >= 10) req.Headers.Add("login-customer-id", loginCustomerId);

        req.Content = new StringContent(JsonSerializer.Serialize(new { query = gaql }),
            System.Text.Encoding.UTF8, "application/json");

        string body;
        try
        {
            using var res = await Http.SendAsync(req);
            body = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
            {
                _log.LogError("Google Ads report failed ({Status}): {Body}", (int)res.StatusCode, body);
                return BadRequest(new { success = false, message = FriendlyApiError(body, (int)res.StatusCode) });
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Google Ads report request failed");
            return StatusCode(502, new { success = false, message = "Could not reach Google Ads just now." });
        }

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
