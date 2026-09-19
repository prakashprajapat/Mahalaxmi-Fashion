using System.Text;
using System.Text.Json;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Leads from Google Ads lead form assets.
///
/// Meta pushes its leads to us the moment someone submits one; Google has no
/// webhook of that kind for us, so the API has to be asked. Google also drops
/// the data after roughly 60 days, which is why every sync copies each lead
/// into our own table — once it is here it stays, and it can be exported or
/// pushed to an audience long after Google has forgotten it.
/// </summary>
[ApiController]
[Route("api/googleleads")]
[Authorize]
[RequirePerm("popup-leads")]
public class GoogleLeadsController : ControllerBase
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(60) };

    private readonly AppDbContext _db;
    private readonly ILogger<GoogleLeadsController> _log;

    public GoogleLeadsController(AppDbContext db, ILogger<GoogleLeadsController> log)
    {
        _db = db;
        _log = log;
    }

    private Task<string?> Get(string key) =>
        _db.SiteSettings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync();

    private static string Digits(string? s) => new((s ?? "").Where(char.IsDigit).ToArray());

    // ── the list on screen ───────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetLeads([FromQuery] int page = 1, [FromQuery] int limit = 50)
    {
        page = Math.Max(1, page);
        limit = Math.Clamp(limit, 1, 200);

        var total = await _db.GoogleLeads.CountAsync();
        var unread = await _db.GoogleLeads.CountAsync(l => !l.IsRead);
        var leads = await _db.GoogleLeads
            .OrderByDescending(l => l.SubmittedAt)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(l => new
            {
                l.Id, l.FullName, l.Phone, l.Email, l.City, l.PostalCode,
                l.CampaignName, l.AssetName, l.IsRead,
                submittedAt = l.SubmittedAt,
                isRegistered = _db.Customers.Any(c =>
                    (l.Email != null && l.Email != "" && c.Email == l.Email) ||
                    (l.Phone != null && l.Phone != "" && c.Phone == l.Phone)),
            })
            .ToListAsync();

        var lastSync = await Get("googleLeadsLastSync");
        return Ok(new { success = true, total, unread, page, limit, leads, lastSync });
    }

    [HttpPost("{id:int}/read")]
    public async Task<IActionResult> MarkRead(int id)
    {
        var lead = await _db.GoogleLeads.FindAsync(id);
        if (lead is null) return NotFound();
        lead.IsRead = true;
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var lead = await _db.GoogleLeads.FindAsync(id);
        if (lead is null) return NotFound();
        _db.GoogleLeads.Remove(lead);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    // ── pulling them out of Google ───────────────────────────────────────────

    private async Task<(string? token, string? error)> AccessToken()
    {
        var clientId = await Get("googleClientId");
        var clientSecret = await Get("googleClientSecret");
        var refresh = await Get("googleAdsRefreshToken");

        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            return (null, "Google OAuth Client ID / Secret are not set in Settings.");
        if (string.IsNullOrWhiteSpace(refresh))
            return (null, "Google Ads is not connected. Press Connect Google Ads on the Google Ads page.");

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
            _log.LogError("Google token refresh failed ({Status}): {Body}", (int)res.StatusCode, body);
            return (null, "Could not refresh the Google access token. Press Connect Google Ads again.");
        }

        var json = JsonSerializer.Deserialize<JsonElement>(body);
        return (json.TryGetProperty("access_token", out var at) ? at.GetString() : null, null);
    }

    private static string Str(JsonElement parent, params string[] path)
    {
        var cur = parent;
        foreach (var p in path)
        {
            if (cur.ValueKind != JsonValueKind.Object || !cur.TryGetProperty(p, out var next)) return "";
            cur = next;
        }
        return cur.ValueKind == JsonValueKind.String ? cur.GetString() ?? "" : cur.ToString();
    }

    /// <summary>
    /// Ask Google for the lead form submissions it still holds and copy any new
    /// ones in. Safe to press as often as you like — a submission already here
    /// is skipped, not duplicated.
    /// </summary>
    [HttpPost("sync")]
    [RequirePerm("settings")]
    public async Task<IActionResult> Sync()
    {
        var customerId = Digits(await Get("googleAdsCustomerId"));
        if (customerId.Length < 10)
            return BadRequest(new { success = false, message = "Google Ads Customer ID is missing. Add it in Settings → Google Ads." });

        var (token, tokenErr) = await AccessToken();
        if (token is null) return BadRequest(new { success = false, message = tokenErr });

        // Must match GoogleAdsController's default. Google retires a version
        // about a year after release - v21 and v22 are already gone - and an
        // old one answers 404, which reads like a broken URL rather than an
        // expired version.
        var version = (await Get("googleAdsApiVersion") ?? "").Trim();
        if (version.Length == 0) version = "v25";
        if (!version.StartsWith("v", StringComparison.OrdinalIgnoreCase)) version = "v" + version;

        // No date filter: Google only keeps this data for about 60 days and
        // returns what it has. Asking for a wider window just gets a complaint.
        const string gaql = """
            SELECT
              lead_form_submission_data.id,
              lead_form_submission_data.campaign,
              lead_form_submission_data.asset,
              lead_form_submission_data.submission_date_time,
              lead_form_submission_data.lead_form_submission_fields,
              campaign.name,
              asset.name
            FROM lead_form_submission_data
            """;

        using var req = new HttpRequestMessage(HttpMethod.Post,
            $"https://googleads.googleapis.com/{version}/customers/{customerId}/googleAds:searchStream")
        {
            Content = new StringContent(JsonSerializer.Serialize(new { query = gaql }), Encoding.UTF8, "application/json"),
        };
        req.Headers.Add("Authorization", "Bearer " + token);
        var loginId = Digits(await Get("googleAdsLoginCustomerId"));
        if (loginId.Length >= 10) req.Headers.Add("login-customer-id", loginId);

        string body;
        try
        {
            using var res = await Http.SendAsync(req);
            body = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
            {
                _log.LogError("Google lead sync failed ({Status}): {Body}", (int)res.StatusCode, body);
                return BadRequest(new { success = false, message = FriendlyError(body, (int)res.StatusCode) });
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Google lead sync could not be sent");
            return BadRequest(new { success = false, message = "Could not reach Google just now." });
        }

        var existing = await _db.GoogleLeads.Select(l => l.SubmissionId).ToListAsync();
        var known = new HashSet<string>(existing, StringComparer.Ordinal);

        int added = 0, seen = 0;
        try
        {
            var root = JsonSerializer.Deserialize<JsonElement>(body);
            // searchStream answers with an array of chunks, each holding results.
            var chunks = root.ValueKind == JsonValueKind.Array
                ? root.EnumerateArray().ToList()
                : new List<JsonElement> { root };

            foreach (var chunk in chunks)
            {
                if (!chunk.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array)
                    continue;

                foreach (var r in results.EnumerateArray())
                {
                    seen++;
                    if (!r.TryGetProperty("leadFormSubmissionData", out var d)) continue;

                    var id = Str(d, "id");
                    if (id.Length == 0 || !known.Add(id)) continue;

                    string name = "", phone = "", email = "", city = "", postal = "";
                    if (d.TryGetProperty("leadFormSubmissionFields", out var fields) &&
                        fields.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var f in fields.EnumerateArray())
                        {
                            var type = Str(f, "fieldType");
                            var value = Str(f, "fieldValue");
                            switch (type)
                            {
                                case "FULL_NAME": case "FIRST_NAME": name = value; break;
                                case "PHONE_NUMBER": phone = value; break;
                                case "EMAIL": email = value; break;
                                case "CITY": city = value; break;
                                case "POSTAL_CODE": postal = value; break;
                            }
                        }
                    }

                    // Nothing to contact them with is not a lead worth a row.
                    if (phone.Length == 0 && email.Length == 0) continue;

                    var whenRaw = Str(d, "submissionDateTime");
                    var when = DateTimeOffset.TryParse(whenRaw, out var parsed) ? parsed : DateTimeOffset.UtcNow;

                    _db.GoogleLeads.Add(new GoogleLead
                    {
                        SubmissionId = id,
                        CampaignName = Str(r, "campaign", "name"),
                        AssetName = Str(r, "asset", "name"),
                        FullName = name,
                        Phone = phone,
                        Email = email,
                        City = city,
                        PostalCode = postal,
                        RawJson = d.ToString(),
                        SubmittedAt = when,
                    });
                    added++;
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Could not read the Google lead response");
            return StatusCode(502, new { success = false, message = "Google answered in a shape we could not read." });
        }

        if (added > 0) await _db.SaveChangesAsync();

        var stamp = DateTimeOffset.UtcNow.ToString("u");
        var row = await _db.SiteSettings.FirstOrDefaultAsync(s => s.Key == "googleLeadsLastSync");
        if (row is null) _db.SiteSettings.Add(new SiteSetting { Key = "googleLeadsLastSync", Value = stamp });
        else { row.Value = stamp; row.UpdatedAt = DateTimeOffset.UtcNow; }
        await _db.SaveChangesAsync();

        _log.LogInformation("Google lead sync: {Seen} seen, {Added} new", seen, added);
        return Ok(new { success = true, seen, added, lastSync = stamp });
    }

    private static string FriendlyError(string body, int status)
    {
        try
        {
            var json = JsonSerializer.Deserialize<JsonElement>(body);
            var arr = json.ValueKind == JsonValueKind.Array ? json[0] : json;
            if (arr.TryGetProperty("error", out var e))
            {
                var msg = e.TryGetProperty("message", out var m) ? m.GetString() ?? "" : "";
                if (msg.Contains("not found", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("USER_PERMISSION_DENIED", StringComparison.OrdinalIgnoreCase))
                    return "That Google account cannot read this Customer ID. Check the ID, and the Manager (MCC) ID if the account sits under one.";
                if (msg.Contains("lead_form_submission_data", StringComparison.OrdinalIgnoreCase))
                    return "Google will not return lead form data for this account. That usually means the account has no lead form asset yet.";
                if (!string.IsNullOrWhiteSpace(msg)) return "Google said: " + msg;
            }
        }
        catch { /* fall through */ }
        if (status == 404)
            return "Google does not know that API version. Clear the API version box in Settings → Google Ads, or set a current one such as v25.";
        return $"Google refused the request (HTTP {status}). The exact reason is in the server log.";
    }
}
