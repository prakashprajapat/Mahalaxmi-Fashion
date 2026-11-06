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
            // The shop's own numbers from Settings are never leads either.
            var shopPhones = await _db.SiteSettings
                .Where(x => x.Key.ToLower().Contains("phone") || x.Key.ToLower().Contains("whatsapp"))
                .Select(x => x.Value).ToListAsync();
            foreach (var v in shopPhones)
                foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(v ?? "", @"\d[\d\s-]{8,}\d"))
                {
                    var d = new string(m.Value.Where(char.IsDigit).ToArray());
                    if (d.Length >= 10) own.Add("91" + d[^10..]);
                }
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

    // POST /api/whatsapp/interakt
    // The WhatsApp number is connected through Interakt, so Meta sends its
    // events to Interakt, not here. Interakt passes each incoming customer
    // message on (event "message_received", Developer Settings -> Webhook),
    // signed "Interakt-Signature: sha256=<hex HMAC of the body>" with the
    // Secret Key typed into both places. The number goes into Popup Leads
    // exactly as a Meta webhook number would.
    [HttpPost("interakt")]
    [AllowAnonymous]
    public async Task<IActionResult> Interakt()
    {
        string raw;
        using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
            raw = await reader.ReadToEndAsync();
        if (raw.Length > 2_000_000) return StatusCode(413);

        var secret = (await Setting("interaktWebhookSecret") ?? "").Trim();
        if (secret.Length == 0)
        {
            _log.LogWarning("Interakt webhook: no Secret Key in Settings - event ignored.");
            return Ok();
        }
        if (!Signed(secret, raw, Request.Headers["Interakt-Signature"].ToString()))
        {
            _log.LogWarning("Interakt webhook: signature mismatch - rejected.");
            return Unauthorized();
        }
        if (string.Equals((await Setting("waLeadsEnabled") ?? "").Trim(), "off", StringComparison.OrdinalIgnoreCase))
            return Ok();

        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            var type = root.TryGetProperty("type", out var t) ? t.GetString() ?? "" : "";
            // Only a customer writing in is a lead; delivery reports of the
            // shop's own messages are not someone asking about a product.
            if (!type.Equals("message_received", StringComparison.OrdinalIgnoreCase)) return Ok();
            if (!root.TryGetProperty("data", out var data) || !data.TryGetProperty("customer", out var cust)) return Ok();

            var number = cust.TryGetProperty("channel_phone_number", out var cp) ? cp.ToString() : "";
            if (string.IsNullOrWhiteSpace(number) && cust.TryGetProperty("phone_number", out var pn))
                number = (cust.TryGetProperty("country_code", out var cc) ? cc.ToString() : "91") + pn.ToString();
            string? name = null;
            if (cust.TryGetProperty("traits", out var tr) && tr.ValueKind == JsonValueKind.Object
                && tr.TryGetProperty("name", out var nm) && nm.ValueKind == JsonValueKind.String)
                name = nm.GetString()?.Trim();
            if (string.IsNullOrWhiteSpace(name)) name = null;

            var phone = CustomerKeys.Phone(new string(number.Where(char.IsDigit).ToArray()));
            if (phone is null) return Ok();
            // Not the shop's own numbers.
            var shopPhones = await _db.SiteSettings
                .Where(x => x.Key.ToLower().Contains("phone") || x.Key.ToLower().Contains("whatsapp"))
                .Select(x => x.Value).ToListAsync();
            var ten = phone.Length >= 10 ? phone[^10..] : phone;
            if (shopPhones.Any(v => new string((v ?? "").Where(char.IsDigit).ToArray()).Contains(ten))) return Ok();

            if (await AddLeadAsync(phone, name))
                _log.LogInformation("Interakt webhook: new lead {Phone}.", ten);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Interakt webhook: could not read the event.");
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
                    // account_update is about the shop's own account; it carries
                    // the shop's number, never a customer's.
                    if (e.TryGetProperty("field", out var fld) && fld.ValueKind == JsonValueKind.String
                        && fld.GetString() == "account_update") return;
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
                    if (e.TryGetProperty("phone_number", out var pn) && e.TryGetProperty("full_name", out var fnm)
                        && fnm.ValueKind == JsonValueKind.String)
                    {
                        var d = Digits(pn.ToString());
                        if (d.Length == 10) d = "91" + d;
                        var n = (fnm.GetString() ?? "").Trim();
                        if (IndianMobile(d) && n.Length > 0 && !names.ContainsKey(d)) names[d] = n.Length > 120 ? n[..120] : n;
                    }
                    foreach (var p in e.EnumerateObject())
                    {
                        if (p.Value.ValueKind is JsonValueKind.String or JsonValueKind.Number
                            && p.Name is "from" or "to" or "wa_id" or "recipient_id" or "phone_number")
                        {
                            var d = Digits(p.Value.ToString());
                            if (d.Length == 10 && p.Name == "phone_number") d = "91" + d;
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
