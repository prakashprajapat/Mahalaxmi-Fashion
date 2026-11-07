using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// Google Ads purchases from the server ("offline click conversions").
///
/// The browser tag tells Google Ads about a sale only when the shopper's
/// browser lets it - an ad blocker, a UPI app that never returns, or an order
/// typed in by hand and Google never hears. Here every order that came from a
/// Google Ads click (its gclid / gbraid / wbraid, kept on the order at
/// checkout) is uploaded to Google Ads by the server, every 30 minutes, once.
///
/// Uses the Google Ads connection that already exists (Settings -> Google Ads:
/// googleClientId / googleClientSecret / googleAdsRefreshToken /
/// googleAdsCustomerId) plus:
///   googleAdsConversionActionId   the "Website purchase (server)" conversion
///                                 action, type Import from clicks. Tracking ->
///                                 Google Ads -> "Create it for me" makes it.
///   googleAdsServerConversions    "off" stops the uploads.
/// </summary>
public class GoogleAdsConversions : BackgroundService
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(30) };
    private const string DefaultApiVersion = "v25";
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<GoogleAdsConversions> _log;

    public GoogleAdsConversions(IServiceScopeFactory scopes, ILogger<GoogleAdsConversions> log)
    {
        _scopes = scopes; _log = log;
    }

    /// The click id from the shopper's cookies: the site's own mfh_gclid
    /// (written on landing), else Google's conversion-linker cookies.
    public static string? ClickFromCookies(IRequestCookieCollection cookies)
    {
        static string? Clean(string? v)
        {
            v = (v ?? "").Trim();
            return v.Length is > 10 and < 280 && v.All(c => char.IsLetterOrDigit(c) || c is '-' or '_') ? v : null;
        }
        var own = cookies["mfh_gclid"];
        if (!string.IsNullOrWhiteSpace(own))
        {
            var i = own.IndexOf(':');
            if (i > 0)
            {
                var kind = own[..i].ToLowerInvariant();
                var val = Clean(Uri.UnescapeDataString(own[(i + 1)..]));
                if (val is not null && kind is "gclid" or "gbraid" or "wbraid") return $"{kind}:{val}";
            }
        }
        // _gcl_aw = "GCL.<seconds>.<gclid>", _gcl_gb = "GCL.<seconds>.<gbraid>"
        foreach (var (name, kind) in new[] { ("_gcl_aw", "gclid"), ("_gcl_gb", "gbraid") })
        {
            var raw = cookies[name];
            if (string.IsNullOrWhiteSpace(raw)) continue;
            var parts = raw.Split('.', 3);
            var val = Clean(parts.Length == 3 ? parts[2] : null);
            if (val is not null) return $"{kind}:{val}";
        }
        return null;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(4), ct); } catch (OperationCanceledException) { return; }
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await RunOnceAsync(db, ct);
            }
            catch (Exception ex) { _log.LogWarning(ex, "Google Ads conversion upload failed."); }
            try { await Task.Delay(TimeSpan.FromMinutes(30), ct); } catch (OperationCanceledException) { return; }
        }
    }

    private static async Task<string> Get(AppDbContext db, string key) =>
        (await db.SiteSettings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync() ?? "").Trim();

    private static async Task Set(AppDbContext db, string key, string value)
    {
        var row = await db.SiteSettings.FirstOrDefaultAsync(s => s.Key == key);
        if (row is null) db.SiteSettings.Add(new SiteSetting { Key = key, Value = value });
        else row.Value = value;
    }

    private static string Digits(string? s) => new((s ?? "").Where(char.IsDigit).ToArray());

    public static async Task<(string? Token, string? Error)> AccessTokenAsync(AppDbContext db)
    {
        var clientId = await Get(db, "googleClientId");
        var secret = await Get(db, "googleClientSecret");
        var refresh = await Get(db, "googleAdsRefreshToken");
        if (clientId.Length == 0 || secret.Length == 0) return (null, "Google OAuth Client ID / Secret are not set in Settings.");
        if (refresh.Length == 0) return (null, "Google Ads is not connected. Admin -> Google Ads -> Connect Google Ads.");
        using var res = await Http.PostAsync("https://oauth2.googleapis.com/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = clientId, ["client_secret"] = secret, ["refresh_token"] = refresh, ["grant_type"] = "refresh_token",
        }));
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            return (null, body.Contains("invalid_grant") ? "Google revoked the connection. Connect Google Ads again." : "Could not refresh the Google token.");
        using var d = JsonDocument.Parse(body);
        return (d.RootElement.TryGetProperty("access_token", out var at) ? at.GetString() : null, null);
    }

    /// One POST to the Google Ads REST API (customers/{id}{suffix}).
    public static async Task<(bool Ok, string Body)> PostAsync(AppDbContext db, string token, string customerId, string suffix, object payload)
    {
        var version = await Get(db, "googleAdsApiVersion");
        if (version.Length == 0) version = DefaultApiVersion;
        using var req = new HttpRequestMessage(HttpMethod.Post, $"https://googleads.googleapis.com/{version}/customers/{customerId}{suffix}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var login = Digits(await Get(db, "googleAdsLoginCustomerId"));
        if (login.Length >= 10) req.Headers.Add("login-customer-id", login);
        req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        using var res = await Http.SendAsync(req);
        return (res.IsSuccessStatusCode, await res.Content.ReadAsStringAsync());
    }

    private static string Short(string s) => s.Length > 480 ? s[..480] : s;

    public async Task RunOnceAsync(AppDbContext db, CancellationToken ct)
    {
        if (string.Equals(await Get(db, "googleAdsServerConversions"), "off", StringComparison.OrdinalIgnoreCase)) return;
        var actionId = Digits(await Get(db, "googleAdsConversionActionId"));
        var customerId = Digits(await Get(db, "googleAdsCustomerId"));
        if (actionId.Length == 0 || customerId.Length < 10) return;

        // Orders from a Google Ads click, not cancelled, not sent yet. Waits ten
        // minutes so a payment still going through is settled; Google takes
        // clicks up to 90 days old.
        var now = DateTimeOffset.UtcNow;
        var settled = now.AddMinutes(-10);
        var oldest = now.AddDays(-88);
        var orders = await db.SiteOrders
            .Where(o => o.GadsClick != null && o.GadsSentAt == null
                     && o.CreatedAt <= settled && o.CreatedAt >= oldest
                     && o.Status != "Cancelled")
            .OrderBy(o => o.CreatedAt).Take(200).ToListAsync(ct);
        if (orders.Count == 0) return;

        var (token, err) = await AccessTokenAsync(db);
        if (token is null)
        {
            await Set(db, "gadsLastUpload", $"{now:o}|{err}");
            await db.SaveChangesAsync(ct);
            return;
        }

        var action = $"customers/{customerId}/conversionActions/{actionId}";
        var conversions = orders.Select(o =>
        {
            var i = o.GadsClick!.IndexOf(':');
            var kind = o.GadsClick[..i];
            var id = o.GadsClick[(i + 1)..];
            var at = (o.PlacedAt ?? o.CreatedAt).ToOffset(TimeSpan.FromHours(5.5)).ToString("yyyy-MM-dd HH:mm:ss") + "+05:30";
            var c = new Dictionary<string, object>
            {
                [kind] = id, ["conversionAction"] = action, ["conversionDateTime"] = at,
                ["conversionValue"] = (double)o.Total, ["currencyCode"] = "INR", ["orderId"] = o.OrderId,
            };
            return c;
        }).ToList();

        var (ok, body) = await PostAsync(db, token, customerId, ":uploadClickConversions",
            new { conversions, partialFailure = true });

        if (!ok)
        {
            // The whole call refused: nothing marked, tried again next round.
            await Set(db, "gadsLastUpload", $"{now:o}|{Short(body)}");
            await db.SaveChangesAsync(ct);
            _log.LogWarning("Google Ads upload refused: {Body}", Short(body));
            return;
        }

        // partialFailureError names the rows Google did not take, by index.
        var failed = new Dictionary<int, string>();
        try
        {
            using var d = JsonDocument.Parse(body);
            if (d.RootElement.TryGetProperty("partialFailureError", out var pfe)
                && pfe.TryGetProperty("details", out var details) && details.ValueKind == JsonValueKind.Array)
                foreach (var det in details.EnumerateArray())
                    if (det.TryGetProperty("errors", out var errors) && errors.ValueKind == JsonValueKind.Array)
                        foreach (var e in errors.EnumerateArray())
                        {
                            var msg = e.TryGetProperty("message", out var m) ? m.GetString() ?? "refused" : "refused";
                            if (e.TryGetProperty("location", out var loc) && loc.TryGetProperty("fieldPathElements", out var fpe))
                                foreach (var el in fpe.EnumerateArray())
                                    if (el.TryGetProperty("index", out var ix) && ix.TryGetInt32(out var n)) { failed[n] = msg; break; }
                        }
        }
        catch { }

        for (var i = 0; i < orders.Count; i++)
        {
            orders[i].GadsSentAt = now;
            orders[i].GadsResult = failed.TryGetValue(i, out var why) ? Short(why) : "ok";
        }
        await Set(db, "gadsLastUpload", $"{now:o}|{orders.Count - failed.Count} accepted, {failed.Count} refused" +
            (failed.Count > 0 ? ": " + Short(failed.Values.First()) : ""));
        if (failed.Count < orders.Count) await Set(db, "gadsLastOkAt", now.ToString("o"));
        await db.SaveChangesAsync(ct);
    }
}
