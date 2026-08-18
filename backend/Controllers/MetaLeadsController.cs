using System.Security.Cryptography;
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

// Meta (Facebook / Instagram) Lead Ads → straight into the admin panel.
//
// Flow:
//  1. A shopper submits an instant lead form under one of your Lead Ads.
//  2. Meta immediately POSTs a tiny "leadgen" notification to /api/meta/webhook.
//  3. We verify it's really from Meta (HMAC signature with the app secret), then call the
//     Graph API to pull the full form answers (name, phone, email, city…) for that lead.
//  4. We save one row in meta_leads and email the admin — so the lead shows up in the
//     "Meta Ad Leads" page in the admin panel within seconds, no manual download needed.
//
// Setup (done once in Settings → "Meta Lead Ads"):
//   • facebookAppSecret        — from your Meta app (used to verify the signature)
//   • metaPageAccessToken      — a long-lived Page token with the leads_retrieval permission
//   • metaWebhookVerifyToken   — any secret string you choose; paste the SAME value into the
//                                 Meta webhook "Verify Token" box.
[ApiController]
[Route("api/meta")]
public class MetaLeadsController : ControllerBase
{
    private const string GraphVersion = "v21.0";
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(10) };

    private readonly AppDbContext _db;
    private readonly AdminNotifier _notify;
    private readonly ILogger<MetaLeadsController> _log;

    public MetaLeadsController(AppDbContext db, AdminNotifier notify, ILogger<MetaLeadsController> log)
    {
        _db = db;
        _notify = notify;
        _log = log;
    }

    // ── 1) Webhook verification (Meta calls this once when you save the webhook) ──────────
    // Meta sends ?hub.mode=subscribe&hub.verify_token=XXX&hub.challenge=YYY and expects us to
    // echo back the challenge value as plain text if the token matches.
    [HttpGet("webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> Verify()
    {
        var mode      = Request.Query["hub.mode"].ToString();
        var token     = Request.Query["hub.verify_token"].ToString();
        var challenge = Request.Query["hub.challenge"].ToString();

        var expected = await _db.SiteSettings.Where(s => s.Key == "metaWebhookVerifyToken")
            .Select(s => s.Value).FirstOrDefaultAsync() ?? "";

        if (mode == "subscribe" && !string.IsNullOrEmpty(expected) && token == expected)
            return Content(challenge, "text/plain");

        return StatusCode(403);
    }

    // ── 2) Webhook receiver (Meta POSTs here on every new lead) ──────────────────────────
    [HttpPost("webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> Receive()
    {
        // Read the raw body first — we need the exact bytes to validate Meta's signature.
        string raw;
        using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
            raw = await reader.ReadToEndAsync();

        var appSecret = await _db.SiteSettings.Where(s => s.Key == "facebookAppSecret")
            .Select(s => s.Value).FirstOrDefaultAsync() ?? "";

        // Verify X-Hub-Signature-256 when an app secret is configured. If the signature does
        // not match, reject — someone other than Meta is calling us.
        if (!string.IsNullOrWhiteSpace(appSecret))
        {
            var sigHeader = Request.Headers["X-Hub-Signature-256"].ToString();
            if (!VerifySignature(appSecret, raw, sigHeader))
            {
                _log.LogWarning("Meta webhook: signature mismatch — rejected.");
                return Unauthorized();
            }
        }

        // Always ACK Meta quickly (200) even if a single lead fails, so it doesn't retry forever.
        try
        {
            var pageToken = await _db.SiteSettings.Where(s => s.Key == "metaPageAccessToken")
                .Select(s => s.Value).FirstOrDefaultAsync() ?? "";

            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;

            if (root.TryGetProperty("entry", out var entries) && entries.ValueKind == JsonValueKind.Array)
            {
                foreach (var entry in entries.EnumerateArray())
                {
                    if (!entry.TryGetProperty("changes", out var changes)) continue;
                    foreach (var change in changes.EnumerateArray())
                    {
                        var field = change.TryGetProperty("field", out var f) ? f.GetString() : null;
                        if (field != "leadgen") continue;
                        if (!change.TryGetProperty("value", out var val)) continue;

                        var leadgenId = val.TryGetProperty("leadgen_id", out var lg) ? lg.GetString() : null;
                        if (string.IsNullOrEmpty(leadgenId)) continue;

                        var formId = val.TryGetProperty("form_id", out var fi) ? fi.GetString() : null;
                        var pageId = val.TryGetProperty("page_id", out var pi) ? pi.GetString() : null;
                        var adId   = val.TryGetProperty("ad_id",   out var ai) ? ai.GetString() : null;

                        await SaveLeadAsync(leadgenId!, formId, pageId, adId, pageToken);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Meta webhook: failed to process payload.");
        }

        return Ok(); // ACK
    }

    // Fetch the full lead detail from the Graph API and persist it (de-duped by leadgen_id).
    private async Task SaveLeadAsync(string leadgenId, string? formId, string? pageId, string? adId, string pageToken)
    {
        // Skip if we already stored this lead (Meta can deliver the same event more than once).
        if (await _db.MetaLeads.AnyAsync(l => l.LeadgenId == leadgenId)) return;

        var lead = new MetaLead
        {
            LeadgenId = leadgenId,
            FormId    = formId,
            PageId    = pageId,
            AdId      = adId,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        try
        {
            if (!string.IsNullOrWhiteSpace(pageToken))
            {
                var url = $"https://graph.facebook.com/{GraphVersion}/{leadgenId}" +
                          $"?fields=id,created_time,field_data,form_id,ad_id,campaign_name,campaign_id" +
                          $"&access_token={Uri.EscapeDataString(pageToken)}";

                var resp = await _http.GetAsync(url);
                var body = await resp.Content.ReadAsStringAsync();

                if (resp.IsSuccessStatusCode)
                {
                    lead.RawJson = body;
                    using var ld = JsonDocument.Parse(body);
                    var r = ld.RootElement;

                    if (r.TryGetProperty("campaign_name", out var cn)) lead.CampaignName = cn.GetString();
                    if (r.TryGetProperty("form_id", out var fid) && string.IsNullOrEmpty(lead.FormId)) lead.FormId = fid.GetString();
                    if (r.TryGetProperty("ad_id", out var aid) && string.IsNullOrEmpty(lead.AdId)) lead.AdId = aid.GetString();
                    if (r.TryGetProperty("created_time", out var ct) && ct.GetString() is string cts
                        && DateTimeOffset.TryParse(cts, out var parsed)) lead.CreatedAt = parsed;

                    if (r.TryGetProperty("field_data", out var fd) && fd.ValueKind == JsonValueKind.Array)
                        MapFieldData(fd, lead);
                }
                else
                {
                    // Token invalid/expired or lead not accessible — keep the row anyway so the
                    // admin at least knows a lead came in, with the raw error for debugging.
                    lead.RawJson = body;
                    _log.LogWarning("Meta Graph fetch failed for lead {Id}: {Status}", leadgenId, resp.StatusCode);
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Meta Graph fetch threw for lead {Id}", leadgenId);
        }

        _db.MetaLeads.Add(lead);
        await _db.SaveChangesAsync();

        // Email the admin so they can follow up fast.
        await _notify.NotifyAsync("New Meta Ad lead",
            AdminNotifier.Wrap("New Lead from Meta Ads", $@"
                <p><strong>Name:</strong> {Enc(lead.FullName)}</p>
                <p><strong>Phone:</strong> {Enc(lead.Phone)}</p>
                <p><strong>Email:</strong> {Enc(lead.Email)}</p>
                <p><strong>City:</strong> {Enc(lead.City)}</p>
                <p><strong>Campaign:</strong> {Enc(lead.CampaignName)}</p>
                <p style=""margin-top:14px""><a href=""https://mahalaxmifashionhub.com/admin/meta-leads"" style=""color:#a7354d;font-weight:700"">Open in admin panel →</a></p>"));
    }

    // Map Meta's field_data array ([{ name, values:[...] }, …]) onto our columns.
    private static void MapFieldData(JsonElement fieldData, MetaLead lead)
    {
        string? first = null, last = null;
        foreach (var item in fieldData.EnumerateArray())
        {
            var name = item.TryGetProperty("name", out var n) ? (n.GetString() ?? "") : "";
            string? value = null;
            if (item.TryGetProperty("values", out var vs) && vs.ValueKind == JsonValueKind.Array && vs.GetArrayLength() > 0)
                value = vs[0].GetString();
            if (string.IsNullOrWhiteSpace(value)) continue;

            switch (name.ToLowerInvariant())
            {
                case "full_name":     lead.FullName = value; break;
                case "first_name":    first = value; break;
                case "last_name":     last = value; break;
                case "phone_number":
                case "phone":         lead.Phone = value; break;
                case "email":         lead.Email = value; break;
                case "city":          lead.City = value; break;
                case "state":
                case "province":      lead.State = value; break;
            }
        }
        if (string.IsNullOrWhiteSpace(lead.FullName) && (first != null || last != null))
            lead.FullName = string.Join(" ", new[] { first, last }.Where(s => !string.IsNullOrWhiteSpace(s)));
    }

    private static bool VerifySignature(string appSecret, string rawBody, string signatureHeader)
    {
        if (string.IsNullOrWhiteSpace(signatureHeader)) return false;
        // Header looks like "sha256=abcdef..."
        var idx = signatureHeader.IndexOf('=');
        var provided = idx >= 0 ? signatureHeader[(idx + 1)..] : signatureHeader;

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(appSecret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(rawBody));
        var computed = Convert.ToHexString(hash).ToLowerInvariant();

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(computed),
            Encoding.UTF8.GetBytes(provided.ToLowerInvariant()));
    }

    private static string Enc(string? s) => System.Net.WebUtility.HtmlEncode(s ?? "");

    // ── 3) Admin panel endpoints ──────────────────────────────────────────────────────

    // List leads (newest first).
    [HttpGet("leads")]
    [Authorize]
    [RequirePerm("popup-leads")]
    public async Task<IActionResult> GetLeads([FromQuery] int page = 1, [FromQuery] int limit = 50)
    {
        var total = await _db.MetaLeads.CountAsync();
        var unread = await _db.MetaLeads.CountAsync(l => !l.IsRead);
        var leads = await _db.MetaLeads
            .OrderByDescending(l => l.CreatedAt)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(l => new
            {
                l.Id, l.FullName, l.Phone, l.Email, l.City, l.State,
                l.CampaignName, l.FormName, l.IsRead,
                createdAt = l.CreatedAt,
                isRegistered = _db.Customers.Any(c =>
                    (l.Email != null && l.Email != "" && c.Email == l.Email) ||
                    (l.Phone != null && l.Phone != "" && c.Phone == l.Phone))
            })
            .ToListAsync();

        return Ok(new { total, unread, page, limit, leads });
    }

    // Mark a lead as read (so the unread badge clears).
    [HttpPost("leads/{id:int}/read")]
    [Authorize]
    [RequirePerm("popup-leads")]
    public async Task<IActionResult> MarkRead(int id)
    {
        var lead = await _db.MetaLeads.FindAsync(id);
        if (lead == null) return NotFound();
        lead.IsRead = true;
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    // Delete a lead.
    [HttpDelete("leads/{id:int}")]
    [Authorize]
    [RequirePerm("popup-leads")]
    public async Task<IActionResult> Delete(int id)
    {
        var lead = await _db.MetaLeads.FindAsync(id);
        if (lead == null) return NotFound();
        _db.MetaLeads.Remove(lead);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }
}
