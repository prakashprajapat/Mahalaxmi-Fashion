using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// WhatsApp (Meta Cloud API, with the Business app kept on the same number via
/// "coexistence") -> Popup Leads.
///
/// Meta calls this for every WhatsApp event on the shop's number. Every
/// customer number found in it - someone who messaged us, someone we replied
/// to from the app, a chat from the history sync - becomes a popup lead with
/// source "whatsapp", once. Nothing is sent back to anybody.
///
/// Settings (admin -> Settings -> WhatsApp auto leads):
///   waWebhookVerifyToken  any secret string, the same one typed into Meta
///   waAppSecret           the Meta app's App Secret (falls back to facebookAppSecret)
///   waLeadsEnabled        "off" stops adding leads; blank = on
/// Callback URL to give Meta: https://www.mahalaxmifashionhub.com/api/whatsapp/webhook
/// </summary>
[ApiController]
[Route("api/whatsapp")]
public class WhatsAppWebhookController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<WhatsAppWebhookController> _log;

    public WhatsAppWebhookController(AppDbContext db, ILogger<WhatsAppWebhookController> log)
    {
        _db = db;
        _log = log;
    }

    private Task<string?> Setting(string key) =>
        _db.SiteSettings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync();

    // Meta checks the URL once: ?hub.mode=subscribe&hub.verify_token=..&hub.challenge=..
    [HttpGet("webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> Verify()
    {
        var mode = Request.Query["hub.mode"].ToString();
        var token = Request.Query["hub.verify_token"].ToString();
        var challenge = Request.Query["hub.challenge"].ToString();
        var expected = (await Setting("waWebhookVerifyToken") ?? "").Trim();

        if (mode == "subscribe" && expected.Length > 0
            && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(token), Encoding.UTF8.GetBytes(expected)))
            return Content(challenge, "text/plain");
        return StatusCode(403);
    }

    [HttpPost("webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> Receive()
    {
        string raw;
        using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
            raw = await reader.ReadToEndAsync();
        if (raw.Length > 2_000_000) return StatusCode(413);

        // Signed by Meta or refused. Unlike the lead-ads hook, there is no
        // "accept unsigned when no secret is set": without a secret anybody
        // could post numbers into the lead list.
        var secret = (await Setting("waAppSecret") ?? "").Trim();
        if (secret.Length == 0) secret = (await Setting("facebookAppSecret") ?? "").Trim();
        if (secret.Length == 0)
        {
            _log.LogWarning("WhatsApp webhook: no App Secret in Settings - event ignored.");
            return Ok();   // 200 so Meta does not retry for ever; nothing is stored
        }
        if (!Signed(secret, raw, Request.Headers["X-Hub-Signature-256"].ToString()))
        {
            _log.LogWarning("WhatsApp webhook: signature mismatch - rejected.");
            return Unauthorized();
        }

        if (string.Equals((await Setting("waLeadsEnabled") ?? "").Trim(), "off", StringComparison.OrdinalIgnoreCase))
            return Ok();

        try
        {
            using var doc = JsonDocument.Parse(raw);
            var (numbers, names, own) = Collect(doc.RootElement);
            int added = 0;
            foreach (var wa in numbers)
            {
                if (own.Contains(wa)) continue;
                var phone = CustomerKeys.Phone(wa);
                if (phone is null) continue;
                names.TryGetValue(wa, out var name);
                if (await AddLeadAsync(phone, name)) added++;
            }
            if (added > 0) _log.LogInformation("WhatsApp webhook: {Count} new lead(s).", added);
        }
        catch (Exception ex)
        {
            // Always 200: a retry would bring the same body and fail the same way.
            _log.LogWarning(ex, "WhatsApp webhook: could not read the event.");
        }
        return Ok();
    }

    /// <summary>
    /// Every customer number in the event, wherever Meta put it: messages[].from,
    /// contacts[].wa_id, statuses[].recipient_id, message echoes' "to" (a reply
    /// sent from the Business app), and the history sync. The shop's own number
    /// (metadata.display_phone_number) is collected separately so it is never
    /// added as a lead.
    /// </summary>
    private static (HashSet<string> Numbers, Dictionary<string, string> Names, HashSet<string> Own) Collect(JsonElement root)
    {
        var numbers = new HashSet<string>();
        var names = new Dictionary<string, string>();
        var own = new HashSet<string>();

        static string Digits(string? s) => new string((s ?? "").Where(char.IsDigit).ToArray());
        // Indian mobiles only: 91 + 10 digits starting 6-9.
        static bool IndianMobile(string d) => d.Length == 12 && d.StartsWith("91") && d[2] is >= '6' and <= '9';

        void Walk(JsonElement e)
        {
            switch (e.ValueKind)
            {
                case JsonValueKind.Object:
                    if (e.TryGetProperty("display_phone_number", out var dpn))
                    {
                        var d = Digits(dpn.ToString());
                        if (d.Length > 0) own.Add(d.Length == 10 ? "91" + d : d);
                    }
                    if (e.TryGetProperty("wa_id", out var wid) && e.TryGetProperty("profile", out var prof)
                        && prof.ValueKind == JsonValueKind.Object && prof.TryGetProperty("name", out var nm)
                        && nm.ValueKind == JsonValueKind.String)
                    {
                        var d = Digits(wid.ToString());
                        var n = (nm.GetString() ?? "").Trim();
                        if (IndianMobile(d) && n.Length > 0) names[d] = n.Length > 120 ? n[..120] : n;
                    }
                    foreach (var p in e.EnumerateObject())
                    {
                        if (p.Value.ValueKind is JsonValueKind.String or JsonValueKind.Number
                            && p.Name is "from" or "to" or "wa_id" or "recipient_id")
                        {
                            var d = Digits(p.Value.ToString());
                            if (IndianMobile(d)) numbers.Add(d);
                        }
                        else Walk(p.Value);
                    }
                    break;
                case JsonValueKind.Array:
                    foreach (var x in e.EnumerateArray()) Walk(x);
                    break;
            }
        }
        Walk(root);
        return (numbers, names, own);
    }

    /// <summary>Same "one row per person" rule as the popup: a number already on the list is not added again.</summary>
    private async Task<bool> AddLeadAsync(string phone, string? name)
    {
        var existing = await _db.PopupLeads.FirstOrDefaultAsync(l => l.Phone == phone);
        if (existing is not null)
        {
            if (string.IsNullOrWhiteSpace(existing.Name) && !string.IsNullOrWhiteSpace(name))
            {
                existing.Name = name;
                await _db.SaveChangesAsync();
            }
            return false;
        }
        var lead = new PopupLead { Name = name, Phone = phone, Source = "whatsapp", CreatedAt = DateTimeOffset.UtcNow };
        _db.PopupLeads.Add(lead);
        try
        {
            await _db.SaveChangesAsync();
            return true;
        }
        catch (DbUpdateException)
        {
            _db.Entry(lead).State = EntityState.Detached;   // arrived twice at once
            return false;
        }
    }

    private static bool Signed(string appSecret, string rawBody, string header)
    {
        if (string.IsNullOrWhiteSpace(header)) return false;
        var i = header.IndexOf('=');
        var provided = (i >= 0 ? header[(i + 1)..] : header).Trim().ToLowerInvariant();
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(appSecret));
        var computed = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(rawBody))).ToLowerInvariant();
        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(computed), Encoding.UTF8.GetBytes(provided));
    }
}
