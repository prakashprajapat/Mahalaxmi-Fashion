using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Authorization;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Is anyone being told when a sale happens?
///
/// The shop spent about Rs. 2,250 across Meta and Google, took an order, and both
/// dashboards showed zero purchases. Nothing was broken in a way anybody could
/// see: the Conversions API token was simply never set, and the code that sends
/// the event does nothing at all without one - silently, by design, so that a
/// missing token can never break a checkout.
///
/// That silence is the problem this page exists to end. It says, in plain words,
/// what is connected and what is not, and what the outside world said the last
/// time we tried to tell it something.
/// </summary>
[ApiController]
[Route("api/tracking-health")]
[Authorize]
[RequirePerm("reports")]
public class TrackingHealthController : ControllerBase
{
    private readonly AppDbContext _db;
    public TrackingHealthController(AppDbContext db) { _db = db; }

    private async Task<Dictionary<string, string>> SettingsAsync(params string[] keys) =>
        await _db.SiteSettings.Where(s => keys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, s => s.Value ?? "");

    private static string Get(Dictionary<string, string> d, string k) =>
        d.TryGetValue(k, out var v) ? (v ?? "").Trim() : "";

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var s = await SettingsAsync(
            "facebookPixelId", "metaCapiAccessToken",
            "metaCapiLastResult", "metaCapiLastSentAt", "metaCapiLastOkAt",
            "ga4ApiSecret", "ga4MeasurementId");

        var pixel     = Get(s, "facebookPixelId");
        var capiToken = Get(s, "metaCapiAccessToken");
        var lastResult = Get(s, "metaCapiLastResult");
        var lastSentAt = Get(s, "metaCapiLastSentAt");
        var lastOkAt   = Get(s, "metaCapiLastOkAt");
        var ga4Secret  = Get(s, "ga4ApiSecret");

        // Orders the shop actually took in the last 30 Indian days. If this is
        // above zero while Meta has never accepted a purchase, the gap is the
        // whole story.
        var from = Services.IndiaTime.DayStartUtc(Services.IndiaTime.Today.AddDays(-29));
        var orders30 = await _db.SiteOrders.CountAsync(o => o.CreatedAt >= from);

        var metaOk = pixel.Length > 0 && capiToken.Length > 0 && lastOkAt.Length > 0;

        string metaVerdict;
        if (capiToken.Length == 0)
            metaVerdict = "Meta is NOT being told about your sales. The Conversions API token is empty, "
                        + "and that is the only way a purchase can reach Meta - the browser pixel never sends one, on purpose, "
                        + "so that a sale is not counted twice.";
        else if (pixel.Length == 0)
            metaVerdict = "A token is set but no Pixel ID is, so there is nowhere to send the event.";
        else if (lastSentAt.Length == 0)
            metaVerdict = "Set up, but nothing has been sent yet. Press \"Send a test event\" below, or wait for the next order.";
        else if (lastOkAt.Length == 0)
            metaVerdict = "Every attempt so far has been refused by Meta. The reason is printed below, word for word.";
        else if (lastResult.StartsWith("failed", StringComparison.OrdinalIgnoreCase))
            metaVerdict = "It worked before, but the last attempt was refused. The reason is printed below.";
        else
            metaVerdict = "Working. Meta accepted the last purchase that was sent.";

        return Ok(new
        {
            success = true,
            ordersLast30Days = orders30,
            meta = new
            {
                ok = metaOk,
                pixelConfigured = pixel.Length > 0,
                tokenConfigured = capiToken.Length > 0,
                lastResult,
                lastSentAt,
                lastOkAt,
                verdict = metaVerdict,
            },
            ga4 = new
            {
                ok = ga4Secret.Length > 0,
                measurementId = Get(s, "ga4MeasurementId"),
                verdict = ga4Secret.Length > 0
                    ? "Working. Every order is sent to Google Analytics from the server as well as the browser."
                    : "Orders reach Google Analytics only from the browser. One paid through a UPI redirect, "
                    + "or by anyone with an ad blocker, is not counted. Set the GA4 API secret in Settings to close that gap.",
            },
            googleAds = new
            {
                // The Ads conversion is fired by the browser at checkout and
                // nowhere else, so it has exactly the weaknesses the browser has.
                ok = (bool?)null,
                verdict = "The Google Ads conversion is sent by the shopper's browser at the end of checkout. "
                        + "If they paid through a UPI or card redirect and never came back to the success page, "
                        + "or if they block ad scripts, Google never hears about that sale. "
                        + "This is the likeliest reason Google Ads shows no conversions while orders exist.",
            },
        });
    }

    /// <summary>
    /// Prove the token works, without waiting for a real sale and without
    /// inventing one. A PageView is sent, not a Purchase: a fake purchase would
    /// teach Meta's bidding something untrue and inflate the shop's own numbers.
    /// </summary>
    [HttpPost("test-meta")]
    public async Task<IActionResult> TestMeta()
    {
        var s = await SettingsAsync("facebookPixelId", "metaCapiAccessToken", "admin_email");
        var pixel = Get(s, "facebookPixelId");
        var token = Get(s, "metaCapiAccessToken");

        if (token.Length == 0)
            return Ok(new { success = false, message = "No Conversions API token is set in Settings yet." });
        if (pixel.Length == 0)
            return Ok(new { success = false, message = "No Facebook Pixel ID is set in Settings yet." });

        // Meta drops an event with nobody to match on, so the shop's own address
        // is used. It is hashed before it leaves this server, like any other.
        var who = Get(s, "admin_email");
        if (who.Length == 0) who = "test@mahalaxmifashionhub.com";

        var result = await Services.MetaCapi.SendEventAsync(
            pixel, token, "PageView",
            "health-check-" + DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            null, "INR", who, null, null, null,
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            Request.Headers.UserAgent.ToString(),
            "https://www.mahalaxmifashionhub.com/", null, null,
            Array.Empty<(string, string, int, decimal)>());

        var now = DateTimeOffset.UtcNow.ToString("o");
        await RememberAsync("metaCapiLastResult", (result.Ok ? "ok: " : "failed: ") + result.Detail);
        await RememberAsync("metaCapiLastSentAt", now);
        if (result.Ok) await RememberAsync("metaCapiLastOkAt", now);

        return Ok(new
        {
            success = result.Ok,
            message = result.Ok
                ? "Meta accepted the test event. Purchases will reach it from the next order onwards."
                : result.Detail,
        });
    }

    private async Task RememberAsync(string key, string value)
    {
        try
        {
            var row = await _db.SiteSettings.FirstOrDefaultAsync(x => x.Key == key);
            if (row is null) _db.SiteSettings.Add(new Models.SiteSetting { Key = key, Value = value });
            else row.Value = value;
            await _db.SaveChangesAsync();
        }
        catch { /* best-effort note */ }
    }
}
