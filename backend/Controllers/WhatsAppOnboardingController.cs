using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Connect the shop's WhatsApp Business app number to the Cloud API without
/// taking it off the phone ("coexistence"), through Meta's Embedded Signup.
///
/// Meta only allows this for a Tech Provider app, so it works once the shop's
/// Meta app has been through Tech Provider onboarding (business verification
/// + App Review). Then: the admin presses Connect, Meta's window walks the
/// owner through it on the phone, and this controller
///   1. swaps the code Meta returns for a business token,
///   2. subscribes the app to the WhatsApp account (so webhooks flow),
///   3. starts the contacts sync and the chat history sync - Meta allows each
///      only once, and only within 24 hours of connecting.
/// The numbers then arrive at WhatsAppWebhookController and become leads.
/// Docs: developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
/// </summary>
[ApiController]
[Route("api/whatsapp/onboard")]
[Authorize]
[RequirePerm("settings")]
public class WhatsAppOnboardingController : ControllerBase
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly AppDbContext _db;
    private readonly ILogger<WhatsAppOnboardingController> _log;

    public WhatsAppOnboardingController(AppDbContext db, ILogger<WhatsAppOnboardingController> log)
    {
        _db = db;
        _log = log;
    }

    private async Task<string> Setting(string key) =>
        (await _db.SiteSettings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync() ?? "").Trim();

    private async Task Save(string key, string value)
    {
        var row = await _db.SiteSettings.FirstOrDefaultAsync(s => s.Key == key);
        if (row is null) _db.SiteSettings.Add(new SiteSetting { Key = key, Value = value });
        else { row.Value = value; row.UpdatedAt = DateTimeOffset.UtcNow; }
    }

    private async Task<string> Version()
    {
        var v = await Setting("waGraphVersion");
        return v.Length > 0 ? v : "v26.0";
    }

    // GET /api/whatsapp/onboard/config - what the Connect page needs (no secrets).
    [HttpGet("config")]
    public async Task<IActionResult> Config()
    {
        var appId = await Setting("waAppId");
        if (appId.Length == 0) appId = await Setting("facebookAppId");
        var secretSet = (await Setting("waAppSecret")).Length > 0 || (await Setting("facebookAppSecret")).Length > 0;
        return Ok(new
        {
            success = true,
            appId,
            configId = await Setting("waConfigId"),
            graphVersion = await Version(),
            secretSet,
            verifyTokenSet = (await Setting("waWebhookVerifyToken")).Length > 0,
            wabaId = await Setting("waWabaId"),
            phoneNumberId = await Setting("waPhoneNumberId"),
            connectedAt = await Setting("waConnectedAt"),
            tokenSaved = (await Setting("waBusinessToken")).Length > 0,
            contactsSyncAt = await Setting("waContactsSyncAt"),
            historySyncAt = await Setting("waHistorySyncAt"),
            // Interakt route (the number is connected through Interakt).
            interaktSecretSet = (await Setting("interaktWebhookSecret")).Length > 0,
            interaktLastEventAt = await Setting("interaktLastEventAt"),
            whatsappLeads = await _db.PopupLeads.CountAsync(l => l.Source == "whatsapp"),
        });
    }

    public record CompleteRequest(string? Code, string? WabaId, string? PhoneNumberId);

    // POST /api/whatsapp/onboard/complete - right after Meta's window closes.
    [HttpPost("complete")]
    public async Task<IActionResult> Complete([FromBody] CompleteRequest req)
    {
        var steps = new List<object>();
        var ver = await Version();
        var appId = await Setting("waAppId");
        if (appId.Length == 0) appId = await Setting("facebookAppId");
        var secret = await Setting("waAppSecret");
        if (secret.Length == 0) secret = await Setting("facebookAppSecret");
        if (appId.Length == 0 || secret.Length == 0)
            return BadRequest(new { success = false, message = "Set the WhatsApp App ID and App Secret in Settings first." });
        if (string.IsNullOrWhiteSpace(req.Code))
            return BadRequest(new { success = false, message = "Meta did not return a code. Run Connect again." });

        // 1. code -> business token
        var tokenUrl = $"https://graph.facebook.com/{ver}/oauth/access_token?client_id={Uri.EscapeDataString(appId)}"
                     + $"&client_secret={Uri.EscapeDataString(secret)}&code={Uri.EscapeDataString(req.Code.Trim())}";
        var (tokOk, tokBody) = await Call(HttpMethod.Get, tokenUrl, null, null);
        string? token = null;
        if (tokOk) { try { using var d = JsonDocument.Parse(tokBody); token = d.RootElement.TryGetProperty("access_token", out var a) ? a.GetString() : null; } catch { } }
        steps.Add(new { step = "Get business token", ok = token != null, detail = token != null ? "ok" : Short(tokBody) });
        if (token is null) return Ok(new { success = false, steps, message = "Meta did not give a token. See the step details." });

        await Save("waBusinessToken", token);
        var waba = (req.WabaId ?? "").Trim();
        var phoneId = (req.PhoneNumberId ?? "").Trim();

        // phone number id, when the window did not send it
        if (phoneId.Length == 0 && waba.Length > 0)
        {
            var (ok, body) = await Call(HttpMethod.Get, $"https://graph.facebook.com/{ver}/{waba}/phone_numbers", token, null);
            if (ok) { try { using var d = JsonDocument.Parse(body); if (d.RootElement.TryGetProperty("data", out var arr) && arr.GetArrayLength() > 0) phoneId = arr[0].GetProperty("id").GetString() ?? ""; } catch { } }
            steps.Add(new { step = "Find phone number id", ok = phoneId.Length > 0, detail = phoneId.Length > 0 ? phoneId : Short(body) });
        }
        if (waba.Length > 0) await Save("waWabaId", waba);
        if (phoneId.Length > 0) await Save("waPhoneNumberId", phoneId);
        await Save("waConnectedAt", DateTimeOffset.UtcNow.ToString("o"));
        await _db.SaveChangesAsync();

        // 2. subscribe this app to the WhatsApp account, so its events reach our webhook
        if (waba.Length > 0)
        {
            var (ok, body) = await Call(HttpMethod.Post, $"https://graph.facebook.com/{ver}/{waba}/subscribed_apps", token, null);
            steps.Add(new { step = "Subscribe app to WhatsApp account", ok, detail = ok ? "ok" : Short(body) });
        }

        // 3. the two one-time syncs
        if (phoneId.Length > 0)
        {
            steps.Add(await SyncAsync(ver, phoneId, token, "smb_app_state_sync", "waContactsSyncAt", "Start contacts sync"));
            steps.Add(await SyncAsync(ver, phoneId, token, "history", "waHistorySyncAt", "Start chat history sync"));
            var (ok, body) = await Call(HttpMethod.Get, $"https://graph.facebook.com/{ver}/{phoneId}?fields=is_on_biz_app,platform_type,display_phone_number", token, null);
            steps.Add(new { step = "Check: number on app + Cloud API", ok, detail = Short(body) });
        }
        await _db.SaveChangesAsync();
        return Ok(new { success = true, steps });
    }

    // POST /api/whatsapp/onboard/sync - retry the syncs (Meta: once each, within 24h of connecting).
    [HttpPost("sync")]
    public async Task<IActionResult> Sync()
    {
        var ver = await Version();
        var token = await Setting("waBusinessToken");
        var phoneId = await Setting("waPhoneNumberId");
        if (token.Length == 0 || phoneId.Length == 0)
            return BadRequest(new { success = false, message = "Not connected yet." });
        var steps = new List<object>
        {
            await SyncAsync(ver, phoneId, token, "smb_app_state_sync", "waContactsSyncAt", "Start contacts sync"),
            await SyncAsync(ver, phoneId, token, "history", "waHistorySyncAt", "Start chat history sync"),
        };
        await _db.SaveChangesAsync();
        return Ok(new { success = true, steps });
    }

    private async Task<object> SyncAsync(string ver, string phoneId, string token, string type, string key, string label)
    {
        var body = JsonSerializer.Serialize(new { messaging_product = "whatsapp", sync_type = type });
        var (ok, res) = await Call(HttpMethod.Post, $"https://graph.facebook.com/{ver}/{phoneId}/smb_app_data", token, body);
        if (ok) await Save(key, DateTimeOffset.UtcNow.ToString("o"));
        return new { step = label, ok, detail = Short(res) };
    }

    private async Task<(bool Ok, string Body)> Call(HttpMethod method, string url, string? token, string? json)
    {
        try
        {
            using var msg = new HttpRequestMessage(method, url);
            if (token != null) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (json != null) msg.Content = new StringContent(json, Encoding.UTF8, "application/json");
            using var res = await Http.SendAsync(msg);
            var body = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
                _log.LogWarning("WhatsApp onboarding call failed ({Status}) {Path}: {Body}", (int)res.StatusCode,
                    new Uri(url).AbsolutePath, LogSafe.Body(body));
            return (res.IsSuccessStatusCode, body);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "WhatsApp onboarding call threw for {Path}", new Uri(url).AbsolutePath);
            return (false, "Could not reach Meta.");
        }
    }

    // Never echo a token back to the browser.
    private static string Short(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        if (s.Contains("access_token", StringComparison.OrdinalIgnoreCase)) return "(token received)";
        return s.Length > 300 ? s[..300] : s;
    }
}
