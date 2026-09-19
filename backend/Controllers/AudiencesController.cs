using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Audiences — take a list of people the shop already knows (its own customers,
/// the Meta ad leads, the Google ad leads, the popup leads, or a CSV) and hand
/// it to Meta and Google
/// so the ads chase those people instead of strangers. The same list downloads
/// as a CSV.
///
/// Nothing leaves this server in the clear. Every phone number and email is
/// SHA-256 hashed here first; Meta and Google only ever see the hash, which is
/// how both of them require it. The CSV download is the one place raw details
/// appear, and that is a signed-in admin asking for their own data.
/// </summary>
[ApiController]
[Route("api/audiences")]
[Authorize]
[RequirePerm("settings")]
public class AudiencesController : ControllerBase
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(60) };

    private readonly AppDbContext _db;
    private readonly ILogger<AudiencesController> _log;

    public AudiencesController(AppDbContext db, ILogger<AudiencesController> log)
    {
        _db = db;
        _log = log;
    }

    private Task<string?> Get(string key) =>
        _db.SiteSettings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync();

    // Both platforms cap a single upload at 10,000 people.
    private const int BatchSize = 10_000;

    // ── one row, in the shape of the CSV the owner already knows ─────────────

    private sealed class Person
    {
        public string Id = "";
        public string Name = "";
        public string Phone = "";
        public string Email = "";
        public string City = "";
        public string Campaign = "";
        public string Status = "";
        public string Date = "";
    }

    // ── normalising and hashing ──────────────────────────────────────────────

    private static string Sha256Hex(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static string NormEmail(string? e)
    {
        var v = (e ?? "").Trim().ToLowerInvariant();
        return v.Contains('@') && v.Length > 4 ? v : "";
    }

    /// Digits only, with the country code in front. An Indian mobile typed as
    /// 98765 43210, +91-9876543210 or 09876543210 all end up as 919876543210.
    private static string NormPhone(string? p)
    {
        var d = new string((p ?? "").Where(char.IsDigit).ToArray());
        if (d.Length > 10 && d.StartsWith("0", StringComparison.Ordinal)) d = d.TrimStart('0');
        if (d.Length == 10) d = "91" + d;
        if (d.Length == 11 && d.StartsWith("0", StringComparison.Ordinal)) d = "91" + d[1..];
        return d.Length is >= 11 and <= 15 ? d : "";
    }

    private static string NormText(string? t) =>
        new string((t ?? "").Trim().ToLowerInvariant().Where(char.IsLetter).ToArray());

    private static string FirstName(string? full)
    {
        var parts = (full ?? "").Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 0 ? NormText(parts[0]) : "";
    }

    private static string LastName(string? full)
    {
        var parts = (full ?? "").Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 1 ? NormText(parts[^1]) : "";
    }

    private static string HashOrBlank(string normalised) =>
        normalised.Length == 0 ? "" : Sha256Hex(normalised);

    // ── reading the CSV the owner uploads ────────────────────────────────────

    /// A small CSV reader: handles quoted fields and doubled quotes inside them,
    /// which is what a spreadsheet writes when a name has a comma in it.
    private static List<string> SplitCsvLine(string line)
    {
        var cells = new List<string>();
        var sb = new StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < line.Length && line[i + 1] == '"') { sb.Append('"'); i++; }
                    else inQuotes = false;
                }
                else sb.Append(c);
            }
            else if (c == '"') inQuotes = true;
            else if (c == ',') { cells.Add(sb.ToString()); sb.Clear(); }
            else sb.Append(c);
        }
        cells.Add(sb.ToString());
        return cells;
    }

    private static string CsvCell(string? v)
    {
        var s = v ?? "";
        return "\"" + s.Replace("\"", "\"\"") + "\"";
    }

    /// Reads any CSV whose header names the columns. Spelling is forgiving —
    /// "Mobile" works as well as "Phone" — because the file often comes back
    /// from someone else's export rather than ours.
    private static (List<Person> people, string? error) ParseCsv(string csv)
    {
        var lines = csv.Replace("\r\n", "\n").Replace('\r', '\n')
                       .Split('\n', StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length < 2) return (new List<Person>(), "That file has a header but no people in it.");

        var header = SplitCsvLine(lines[0]).Select(h => NormText(h)).ToList();
        int Col(params string[] names)
        {
            foreach (var n in names)
            {
                var i = header.IndexOf(n);
                if (i >= 0) return i;
            }
            return -1;
        }

        var iId = Col("id");
        var iName = Col("name", "fullname", "customername");
        var iPhone = Col("phone", "mobile", "phonenumber", "contact");
        var iEmail = Col("email", "emailaddress", "mail");
        var iCity = Col("city", "town");
        var iCamp = Col("campaign", "source", "form");
        var iStat = Col("status");
        var iDate = Col("date", "createdat", "createddate");

        if (iPhone < 0 && iEmail < 0)
            return (new List<Person>(), "That file has no Phone and no Email column, so there is nobody to match on.");

        string At(List<string> cells, int i) => i >= 0 && i < cells.Count ? cells[i].Trim() : "";

        var people = new List<Person>();
        foreach (var line in lines.Skip(1))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var c = SplitCsvLine(line);
            people.Add(new Person
            {
                Id = At(c, iId),
                Name = At(c, iName),
                Phone = At(c, iPhone),
                Email = At(c, iEmail),
                City = At(c, iCity),
                Campaign = At(c, iCamp),
                Status = At(c, iStat),
                Date = At(c, iDate),
            });
        }
        return (people, null);
    }

    // ── where the people come from ───────────────────────────────────────────

    /// Phones that have actually placed an order, with the date of the last one.
    private async Task<Dictionary<string, DateTimeOffset>> BuyerPhones()
    {
        var rows = await _db.SiteOrders
            .Where(o => o.CustomerJson != null)
            .Select(o => new { o.CustomerJson, o.PlacedAt, o.CreatedAt })
            .ToListAsync();

        var last = new Dictionary<string, DateTimeOffset>();
        foreach (var r in rows)
        {
            var phone = NormPhone(JsonStr(r.CustomerJson, "phone"));
            if (phone.Length == 0) continue;
            var when = r.PlacedAt ?? r.CreatedAt;
            if (!last.TryGetValue(phone, out var prev) || when > prev) last[phone] = when;
        }
        return last;
    }

    private static string JsonStr(string? json, string prop)
    {
        if (string.IsNullOrWhiteSpace(json)) return "";
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind == JsonValueKind.Object &&
                doc.RootElement.TryGetProperty(prop, out var el) &&
                el.ValueKind == JsonValueKind.String)
                return el.GetString() ?? "";
        }
        catch { /* a malformed order is not worth failing the whole export for */ }
        return "";
    }

    /// <param name="filter">
    /// all | consent | buyers | lapsed — who out of the shop's own customers.
    /// </param>
    private async Task<List<Person>> LoadPeople(string source, string filter, int days)
    {
        switch (source.ToLowerInvariant())
        {
            case "metaleads":
            {
                var rows = await _db.MetaLeads.OrderByDescending(l => l.CreatedAt).ToListAsync();
                return rows.Select(l => new Person
                {
                    Id = l.Id.ToString(),
                    Name = l.FullName ?? "",
                    Phone = l.Phone ?? "",
                    Email = l.Email ?? "",
                    City = l.City ?? "",
                    Campaign = l.CampaignName ?? l.FormName ?? "",
                    Status = l.IsRead ? "Read" : "New",
                    Date = l.CreatedAt.ToString("yyyy-MM-dd"),
                }).ToList();
            }

            case "googleleads":
            {
                var rows = await _db.GoogleLeads.OrderByDescending(l => l.SubmittedAt).ToListAsync();
                return rows.Select(l => new Person
                {
                    Id = l.Id.ToString(),
                    Name = l.FullName ?? "",
                    Phone = l.Phone ?? "",
                    Email = l.Email ?? "",
                    City = l.City ?? "",
                    Campaign = l.CampaignName ?? l.AssetName ?? "",
                    Status = l.IsRead ? "Read" : "New",
                    Date = l.SubmittedAt.ToString("yyyy-MM-dd"),
                }).ToList();
            }

            case "popupleads":
            {
                var rows = await _db.PopupLeads.OrderByDescending(l => l.CreatedAt).ToListAsync();
                return rows.Select(l => new Person
                {
                    Id = l.Id.ToString(),
                    Name = l.Name ?? "",
                    Phone = l.Phone ?? "",
                    Email = l.Email ?? "",
                    City = "",
                    Campaign = l.Source,
                    Status = "Lead",
                    Date = l.CreatedAt.ToString("yyyy-MM-dd"),
                }).ToList();
            }

            default:
            {
                var q = _db.Customers.AsQueryable();
                if (filter == "consent") q = q.Where(c => c.MarketingConsent);
                var customers = await q.ToListAsync();

                if (filter is "buyers" or "lapsed")
                {
                    var buyers = await BuyerPhones();
                    var cutoff = DateTimeOffset.UtcNow.AddDays(-Math.Clamp(days, 1, 3650));
                    customers = customers.Where(c =>
                    {
                        var phone = NormPhone(c.Phone);
                        if (!buyers.TryGetValue(phone, out var lastOrder)) return false;
                        return filter == "buyers" || lastOrder < cutoff;
                    }).ToList();
                }

                return customers.Select(c => new Person
                {
                    Id = string.IsNullOrWhiteSpace(c.CustomerCode) ? c.Id.ToString() : c.CustomerCode,
                    Name = (c.FirstName + " " + c.LastName).Trim(),
                    Phone = c.Phone,
                    Email = c.Email ?? "",
                    City = string.IsNullOrWhiteSpace(c.District) ? c.State : c.District,
                    Campaign = "Store",
                    Status = c.MarketingConsent ? "Consented" : "Customer",
                    Date = c.SubmittedAt,
                }).ToList();
            }
        }
    }

    /// Two rows for the same person are one person to an ad platform, so they
    /// are one row here too — matched on phone first, then email.
    private static List<Person> Dedupe(IEnumerable<Person> people)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var outp = new List<Person>();
        foreach (var p in people)
        {
            var phone = NormPhone(p.Phone);
            var email = NormEmail(p.Email);
            if (phone.Length == 0 && email.Length == 0) continue;   // nothing to match on
            var key = phone.Length > 0 ? "p:" + phone : "e:" + email;
            if (seen.Add(key)) outp.Add(p);
        }
        return outp;
    }

    // ── what is available, and how many ──────────────────────────────────────

    [HttpGet("sources")]
    public async Task<IActionResult> Sources()
    {
        var customers = await _db.Customers.CountAsync();
        var consented = await _db.Customers.CountAsync(c => c.MarketingConsent);
        var metaLeads = await _db.MetaLeads.CountAsync();
        var popupLeads = await _db.PopupLeads.CountAsync();
        var googleLeads = await _db.GoogleLeads.CountAsync();

        return Ok(new
        {
            success = true,
            customers,
            consented,
            metaLeads,
            googleLeads,
            popupLeads,
            metaReady = !string.IsNullOrWhiteSpace(await Get("metaAdsAccessToken"))
                     && !string.IsNullOrWhiteSpace(await Get("metaAdsAccountId")),
            googleReady = !string.IsNullOrWhiteSpace(await Get("googleAdsRefreshToken"))
                       && !string.IsNullOrWhiteSpace(await Get("googleAdsCustomerId")),
        });
    }

    // ── download ─────────────────────────────────────────────────────────────

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string source = "customers",
        [FromQuery] string filter = "all",
        [FromQuery] int days = 60)
    {
        var people = Dedupe(await LoadPeople(source, filter, days));

        var sb = new StringBuilder();
        sb.Append("﻿");   // so Excel opens Hindi names and ₹ correctly
        sb.AppendLine("\"ID\",\"Name\",\"Phone\",\"Email\",\"City\",\"Campaign\",\"Status\",\"Date\"");
        foreach (var p in people)
            sb.AppendLine(string.Join(",", new[]
            {
                CsvCell(p.Id), CsvCell(p.Name), CsvCell(p.Phone), CsvCell(p.Email),
                CsvCell(p.City), CsvCell(p.Campaign), CsvCell(p.Status), CsvCell(p.Date),
            }));

        var name = $"{source}-{DateTime.UtcNow:yyyy-MM-dd}.csv";
        return File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv", name);
    }

    // ── Meta: create the audience, then feed it ──────────────────────────────

    private async Task<(bool ok, string body, string? error)> MetaCall(string path, IEnumerable<KeyValuePair<string, string>> form)
    {
        var token = await Get("metaAdsAccessToken");
        if (string.IsNullOrWhiteSpace(token))
            return (false, "", "Meta is not connected. Paste a System User token in Settings → Meta Ads.");

        var version = await Get("metaAdsApiVersion");
        if (string.IsNullOrWhiteSpace(version)) version = "v25.0";

        using var req = new HttpRequestMessage(HttpMethod.Post, $"https://graph.facebook.com/{version.Trim()}/{path}")
        {
            Content = new FormUrlEncodedContent(form),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        try
        {
            using var res = await Http.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();
            if (res.IsSuccessStatusCode) return (true, body, null);

            _log.LogError("Meta audience call {Path} failed ({Status}): {Body}", path, (int)res.StatusCode, body);
            var msg = "Meta refused the request.";
            try
            {
                var j = JsonSerializer.Deserialize<JsonElement>(body);
                if (j.TryGetProperty("error", out var e) && e.TryGetProperty("message", out var m))
                    msg = "Meta said: " + (m.GetString() ?? msg);
            }
            catch { /* the generic line will do */ }
            return (false, body, msg);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Meta audience call {Path} could not be sent", path);
            return (false, "", "Could not reach Meta just now.");
        }
    }

    private async Task<(bool ok, string? audienceId, int added, string? error)> PushToMeta(
        List<Person> people, string name, string? existingId)
    {
        var account = new string((await Get("metaAdsAccountId") ?? "").Where(char.IsDigit).ToArray());
        if (account.Length < 5)
            return (false, null, 0, "Meta Ad Account ID is missing in Settings → Meta Ads.");

        var audienceId = (existingId ?? "").Trim();
        if (audienceId.Length == 0)
        {
            var (ok, body, err) = await MetaCall($"act_{account}/customaudiences", new[]
            {
                new KeyValuePair<string, string>("name", name),
                new KeyValuePair<string, string>("subtype", "CUSTOM"),
                new KeyValuePair<string, string>("description", "Uploaded from the Mahalaxmi admin panel"),
                new KeyValuePair<string, string>("customer_file_source", "USER_PROVIDED_ONLY"),
            });
            if (!ok) return (false, null, 0, err);
            try
            {
                var j = JsonSerializer.Deserialize<JsonElement>(body);
                audienceId = j.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";
            }
            catch { /* handled just below */ }
            if (audienceId.Length == 0)
                return (false, null, 0, "Meta created the audience but did not return its id.");
        }

        // Meta wants every row to carry the same columns in the same order.
        var schema = new[] { "EMAIL", "PHONE", "FN", "LN", "CT", "COUNTRY" };
        var sessionId = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var batches = people.Chunk(BatchSize).ToList();
        var added = 0;

        for (var i = 0; i < batches.Count; i++)
        {
            var data = batches[i].Select(p => new[]
            {
                HashOrBlank(NormEmail(p.Email)),
                HashOrBlank(NormPhone(p.Phone)),
                HashOrBlank(FirstName(p.Name)),
                HashOrBlank(LastName(p.Name)),
                HashOrBlank(NormText(p.City)),
                HashOrBlank("in"),
            }).ToArray();

            var payload = JsonSerializer.Serialize(new { schema, data });
            var session = JsonSerializer.Serialize(new
            {
                session_id = sessionId,
                batch_seq = i + 1,
                last_batch_flag = i == batches.Count - 1,
            });

            var (ok, _, err) = await MetaCall($"{audienceId}/users", new[]
            {
                new KeyValuePair<string, string>("payload", payload),
                new KeyValuePair<string, string>("session", session),
            });
            if (!ok) return (false, audienceId, added, err);
            added += data.Length;
        }

        _log.LogWarning("Pushed {Count} people to Meta audience {Audience} from admin", added, audienceId);
        return (true, audienceId, added, null);
    }

    // ── Google: Data Manager API ─────────────────────────────────────────────
    //
    // Not the Google Ads API. From 1 April 2026 Google stopped letting new
    // developer tokens upload Customer Match through the Ads API — a fresh
    // token gets CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE — and points new
    // work at the Data Manager API instead. That is a different host, a
    // different scope (datamanager) and its own terms to accept.

    private async Task<(string? token, string? error)> GoogleToken()
    {
        var clientId = await Get("googleClientId");
        var clientSecret = await Get("googleClientSecret");
        var refresh = await Get("googleAdsRefreshToken");

        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            return (null, "Google OAuth Client ID / Secret are not set in Settings.");
        if (string.IsNullOrWhiteSpace(refresh))
            return (null, "Google is not connected. Press Connect Google Ads on the Google Ads page.");

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

    private async Task<(bool ok, string body, string? error)> DataManagerCall(string url, object payload, string token)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        try
        {
            using var res = await Http.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();
            if (res.IsSuccessStatusCode) return (true, body, null);

            _log.LogError("Data Manager call failed ({Status}) {Url}: {Body}", (int)res.StatusCode, url, body);
            var msg = $"Google refused the request (HTTP {(int)res.StatusCode}).";
            try
            {
                var j = JsonSerializer.Deserialize<JsonElement>(body);
                if (j.TryGetProperty("error", out var e) && e.TryGetProperty("message", out var m))
                    msg = "Google said: " + (m.GetString() ?? msg);
            }
            catch { /* the generic line will do */ }
            return (false, body, msg);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Data Manager call could not be sent");
            return (false, "", "Could not reach Google just now.");
        }
    }

    private async Task<(bool ok, string? listId, int added, string? error)> PushToGoogle(
        List<Person> people, string name, string? existingListId)
    {
        var customerId = new string((await Get("googleAdsCustomerId") ?? "").Where(char.IsDigit).ToArray());
        if (customerId.Length < 10)
            return (false, null, 0, "Google Ads Customer ID is missing in Settings → Google Ads.");

        var (token, tokenErr) = await GoogleToken();
        if (token is null) return (false, null, 0, tokenErr);

        var listId = (existingListId ?? "").Trim();
        if (listId.Length == 0)
        {
            var (ok, body, err) = await DataManagerCall(
                $"https://datamanager.googleapis.com/v1/accountTypes/GOOGLE_ADS/accounts/{customerId}/userLists",
                new
                {
                    displayName = name,
                    description = "Uploaded from the Mahalaxmi admin panel",
                    membershipDurationDays = 540,
                    ingestedUserListInfo = new
                    {
                        uploadKeyType = "CONTACT_ID",
                        contactIdInfo = new { dataSourceType = "DATA_SOURCE_TYPE_FIRST_PARTY" },
                    },
                }, token);
            if (!ok) return (false, null, 0, err);
            try
            {
                var j = JsonSerializer.Deserialize<JsonElement>(body);
                listId = j.TryGetProperty("id", out var idEl)
                    ? (idEl.ValueKind == JsonValueKind.String ? idEl.GetString() ?? "" : idEl.ToString())
                    : "";
            }
            catch { /* handled just below */ }
            if (listId.Length == 0)
                return (false, null, 0, "Google created the list but did not return its id.");
        }

        var loginId = new string((await Get("googleAdsLoginCustomerId") ?? "").Where(char.IsDigit).ToArray());
        var added = 0;

        foreach (var batch in people.Chunk(BatchSize))
        {
            var members = batch.Select(p =>
            {
                var ids = new List<object>();
                var email = NormEmail(p.Email);
                var phone = NormPhone(p.Phone);
                if (email.Length > 0) ids.Add(new { emailAddress = Sha256Hex(email) });
                // Google wants E.164 — the + stays on before hashing.
                if (phone.Length > 0) ids.Add(new { phoneNumber = Sha256Hex("+" + phone) });
                return new { compositeData = new { userData = new { userIdentifiers = ids } } };
            }).ToArray();

            object destination = loginId.Length >= 10
                ? new
                {
                    operatingAccount = new { accountType = "GOOGLE_ADS", accountId = customerId },
                    loginAccount = new { accountType = "GOOGLE_ADS", accountId = loginId },
                    productDestinationId = listId,
                }
                : new
                {
                    operatingAccount = new { accountType = "GOOGLE_ADS", accountId = customerId },
                    productDestinationId = listId,
                };

            var (ok, _, err) = await DataManagerCall(
                "https://datamanager.googleapis.com/v1/audienceMembers:ingest",
                new
                {
                    destinations = new[] { destination },
                    audienceMembers = members,
                    encoding = "HEX",
                    consent = new { adUserData = "CONSENT_GRANTED", adPersonalization = "CONSENT_GRANTED" },
                    termsOfService = new { customerMatchTermsOfServiceStatus = "ACCEPTED" },
                }, token);
            if (!ok) return (false, listId, added, err);
            added += members.Length;
        }

        _log.LogWarning("Pushed {Count} people to Google user list {List} from admin", added, listId);
        return (true, listId, added, null);
    }

    // ── upload ───────────────────────────────────────────────────────────────

    public record PushRequest(
        string? Source,          // customers | metaleads | popupleads | csv
        string? Filter,          // all | consent | buyers | lapsed
        int Days,
        string? Csv,
        string? Name,
        bool Meta,
        bool Google,
        string? MetaAudienceId,
        string? GoogleUserListId);

    [HttpPost("push")]
    public async Task<IActionResult> Push([FromBody] PushRequest req)
    {
        var source = (req.Source ?? "customers").Trim().ToLowerInvariant();
        var filter = (req.Filter ?? "all").Trim().ToLowerInvariant();
        var name = (req.Name ?? "").Trim();
        if (name.Length == 0) name = $"Mahalaxmi {source} {DateTime.UtcNow:dd MMM yyyy}";
        if (name.Length > 100) name = name[..100];

        if (!req.Meta && !req.Google)
            return BadRequest(new { success = false, message = "Choose at least one of Meta or Google." });

        List<Person> people;
        if (source == "csv")
        {
            if (string.IsNullOrWhiteSpace(req.Csv))
                return BadRequest(new { success = false, message = "No file was read. Pick a CSV first." });
            var (parsed, parseErr) = ParseCsv(req.Csv);
            if (parseErr is not null) return BadRequest(new { success = false, message = parseErr });
            people = parsed;
        }
        else people = await LoadPeople(source, filter, req.Days <= 0 ? 60 : req.Days);

        people = Dedupe(people);
        if (people.Count == 0)
            return BadRequest(new { success = false, message = "Nobody in that list has a usable phone number or email." });

        string? metaError = null, googleError = null, metaId = null, googleId = null;
        int metaAdded = 0, googleAdded = 0;

        if (req.Meta)
        {
            var (ok, id, added, err) = await PushToMeta(people, name, req.MetaAudienceId);
            metaId = id; metaAdded = added; metaError = ok ? null : err;
        }

        if (req.Google)
        {
            var (ok, id, added, err) = await PushToGoogle(people, name, req.GoogleUserListId);
            googleId = id; googleAdded = added; googleError = ok ? null : err;
        }

        return Ok(new
        {
            success = metaError is null && googleError is null,
            people = people.Count,
            withPhone = people.Count(p => NormPhone(p.Phone).Length > 0),
            withEmail = people.Count(p => NormEmail(p.Email).Length > 0),
            meta = req.Meta ? new { audienceId = metaId, added = metaAdded, error = metaError } : null,
            google = req.Google ? new { userListId = googleId, added = googleAdded, error = googleError } : null,
        });
    }

    /// A dry run: how many people the chosen source gives, and how many of them
    /// carry something an ad platform can actually match on. Nothing is sent.
    public record PreviewRequest(string? Source, string? Filter, int Days, string? Csv);

    [HttpPost("preview")]
    public async Task<IActionResult> Preview([FromBody] PreviewRequest req)
    {
        var source = (req.Source ?? "customers").Trim().ToLowerInvariant();
        List<Person> people;

        if (source == "csv")
        {
            if (string.IsNullOrWhiteSpace(req.Csv))
                return BadRequest(new { success = false, message = "No file was read. Pick a CSV first." });
            var (parsed, parseErr) = ParseCsv(req.Csv);
            if (parseErr is not null) return BadRequest(new { success = false, message = parseErr });
            people = parsed;
        }
        else people = await LoadPeople(source, (req.Filter ?? "all").Trim().ToLowerInvariant(), req.Days <= 0 ? 60 : req.Days);

        var raw = people.Count;
        people = Dedupe(people);

        return Ok(new
        {
            success = true,
            raw,
            usable = people.Count,
            duplicates = raw - people.Count,
            withPhone = people.Count(p => NormPhone(p.Phone).Length > 0),
            withEmail = people.Count(p => NormEmail(p.Email).Length > 0),
        });
    }
}
