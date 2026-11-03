using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Campaigns -> SMS Logs. Every SMS the site sent, with the full text (built
/// from the DLT template text the admin pastes once per template), so it can
/// be copied to WhatsApp - and deleted when it is not worth keeping.
/// </summary>
[ApiController]
[Route("api/sms-logs")]
[Authorize]
[RequirePerm("campaigns")]
public class SmsLogsController : ControllerBase
{
    // { "<template id>": { "name": "...", "text": "Dear {#var#}, ..." } }
    public const string TemplateTextsKey = "smsTemplateTexts";

    // Friendly names for the template ids already set in Settings.
    private static readonly Dictionary<string, string> SettingNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["msg91SmsTemplateId"] = "OTP",
        ["msg91OrderTemplateId"] = "Order received",
        ["msg91AlertTemplateId"] = "Website alert",
        ["msg91TplTracking"] = "Shipped / tracking",
        ["msg91TplOutForDelivery"] = "Out for delivery",
        ["msg91TplDelivered"] = "Delivered",
        ["msg91TplRefund"] = "Refund",
        ["msg91TplReview"] = "Review ask",
        ["msg91TplNewCollection"] = "New collection offer",
        ["msg91TplUserDropped"] = "Payment not finished",
        ["msg91TplLoginHelp"] = "Login help",
        ["msg91TplWrongPassword"] = "Wrong password",
    };

    private readonly AppDbContext _db;
    public SmsLogsController(AppDbContext db) => _db = db;

    public record TemplateText(string? Name, string? Text);

    private async Task<Dictionary<string, TemplateText>> LoadTextsAsync()
    {
        var raw = await _db.SiteSettings.Where(s => s.Key == TemplateTextsKey).Select(s => s.Value).FirstOrDefaultAsync();
        if (string.IsNullOrWhiteSpace(raw)) return new(StringComparer.OrdinalIgnoreCase);
        try
        {
            return new Dictionary<string, TemplateText>(
                JsonSerializer.Deserialize<Dictionary<string, TemplateText>>(raw,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new(),
                StringComparer.OrdinalIgnoreCase);
        }
        catch { return new(StringComparer.OrdinalIgnoreCase); }
    }

    /// <summary>template id -> name, from Settings (the ids in use) and the saved texts.</summary>
    private async Task<Dictionary<string, string>> NamesAsync(Dictionary<string, TemplateText> texts)
    {
        var names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var keys = SettingNames.Keys.ToList();
        var rows = await _db.SiteSettings.Where(s => keys.Contains(s.Key)).Select(s => new { s.Key, s.Value }).ToListAsync();
        foreach (var r in rows)
            if (!string.IsNullOrWhiteSpace(r.Value)) names[r.Value.Trim()] = SettingNames[r.Key];
        foreach (var kv in texts)
            if (!string.IsNullOrWhiteSpace(kv.Value.Name)) names[kv.Key] = kv.Value.Name!.Trim();
        return names;
    }

    private static readonly Regex VarSlot = new(@"\{#var#\}", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex NamedSlot = new(@"##([A-Za-z0-9_]+)##", RegexOptions.Compiled);

    /// <summary>The message as the customer read it, or null when the template text is not saved.</summary>
    private static string? Render(string? template, string? varsJson)
    {
        if (string.IsNullOrWhiteSpace(template)) return null;
        var vars = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(varsJson))
        {
            try
            {
                foreach (var kv in JsonSerializer.Deserialize<Dictionary<string, string>>(varsJson) ?? new())
                    vars[kv.Key] = kv.Value;
            }
            catch { }
        }
        var n = 0;
        var text = VarSlot.Replace(template, _ => { n++; return vars.TryGetValue($"var{n}", out var v) ? v : "{#var#}"; });
        text = NamedSlot.Replace(text, m => vars.TryGetValue(m.Groups[1].Value, out var v) ? v
                                     : vars.TryGetValue(m.Groups[1].Value.Replace("_", ""), out v) ? v : m.Value);
        return text;
    }

    // GET /api/sms-logs?q=&status=&templateId=&kind=&from=&to=&page=1&limit=100
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? q, [FromQuery] string? status, [FromQuery] string? templateId,
        [FromQuery] string? kind, [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int page = 1, [FromQuery] int limit = 100)
    {
        page = Math.Clamp(page, 1, 100_000);
        limit = Math.Clamp(limit, 1, 500);
        var query = _db.SmsLogs.AsNoTracking().AsQueryable();

        if (status is "sent" or "failed") query = query.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(templateId)) { var t = templateId.Trim(); query = query.Where(x => x.TemplateId == t); }
        if (!string.IsNullOrWhiteSpace(kind)) { var k = kind.Trim(); query = query.Where(x => x.Kind == k); }
        var ist = TimeSpan.FromHours(5.5);
        if (from is { } f) { var a = new DateTimeOffset(DateTime.SpecifyKind(f.Date, DateTimeKind.Unspecified), ist).ToUniversalTime(); query = query.Where(x => x.SentAt >= a); }
        if (to is { } tt) { var b = new DateTimeOffset(DateTime.SpecifyKind(tt.Date.AddDays(1), DateTimeKind.Unspecified), ist).ToUniversalTime(); query = query.Where(x => x.SentAt < b); }
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            var digits = new string(term.Where(char.IsDigit).ToArray());
            var like = "%" + term.Replace("%", "").Replace("_", "") + "%";
            query = query.Where(x => (digits.Length >= 4 && x.Phone.Contains(digits))
                                  || (x.VarsJson != null && EF.Functions.ILike(x.VarsJson, like))
                                  || (x.RequestId != null && x.RequestId == term));
        }

        var total = await query.CountAsync();
        var sent = await query.CountAsync(x => x.Status == "sent");
        var rows = await query.OrderByDescending(x => x.SentAt).ThenByDescending(x => x.Id)
            .Skip((page - 1) * limit).Take(limit).ToListAsync();

        var texts = await LoadTextsAsync();
        var names = await NamesAsync(texts);

        return Ok(new
        {
            success = true, total, sent, failed = total - sent, page,
            logs = rows.Select(r => new
            {
                r.Id, r.SentAt, r.Phone, r.TemplateId, r.Kind, r.Status, r.Detail, r.RequestId,
                templateName = names.TryGetValue(r.TemplateId, out var nm) ? nm : null,
                vars = r.VarsJson,
                message = Render(texts.TryGetValue(r.TemplateId, out var tx) ? tx.Text : null, r.VarsJson),
            }),
        });
    }

    public record DeleteRequest(List<long>? Ids, DateTime? OlderThan);

    // POST /api/sms-logs/delete  { ids: [..] }  or  { olderThan: "2026-10-01" }
    [HttpPost("delete")]
    public async Task<IActionResult> Delete([FromBody] DeleteRequest req)
    {
        int n = 0;
        if (req.Ids is { Count: > 0 })
        {
            var ids = req.Ids.Distinct().Take(5000).ToList();
            n = await _db.SmsLogs.Where(x => ids.Contains(x.Id)).ExecuteDeleteAsync();
        }
        else if (req.OlderThan is { } before)
        {
            var cut = new DateTimeOffset(DateTime.SpecifyKind(before.Date, DateTimeKind.Unspecified), TimeSpan.FromHours(5.5)).ToUniversalTime();
            n = await _db.SmsLogs.Where(x => x.SentAt < cut).ExecuteDeleteAsync();
        }
        else return BadRequest(new { success = false, message = "Nothing selected to delete." });
        return Ok(new { success = true, deleted = n });
    }

    // GET /api/sms-logs/templates - every template id in Settings or in the log, with its saved text.
    [HttpGet("templates")]
    public async Task<IActionResult> Templates()
    {
        var texts = await LoadTextsAsync();
        var names = await NamesAsync(texts);
        var used = await _db.SmsLogs.AsNoTracking().GroupBy(x => x.TemplateId)
            .Select(g => new { Id = g.Key, Count = g.Count() }).ToListAsync();
        var ids = names.Keys.Concat(texts.Keys).Concat(used.Select(u => u.Id))
            .Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase);
        return Ok(new
        {
            success = true,
            templates = ids.Select(id => new
            {
                id,
                name = names.TryGetValue(id, out var nm) ? nm : null,
                text = texts.TryGetValue(id, out var t) ? t.Text : null,
                sent = used.FirstOrDefault(u => string.Equals(u.Id, id, StringComparison.OrdinalIgnoreCase))?.Count ?? 0,
            }).OrderBy(t => t.name ?? "~").ToList(),
        });
    }

    public record SaveTemplateRequest(string Id, string? Name, string? Text);

    // PUT /api/sms-logs/templates  { id, name, text } - the DLT text with {#var#} slots.
    [HttpPut("templates")]
    public async Task<IActionResult> SaveTemplate([FromBody] SaveTemplateRequest req)
    {
        var id = (req.Id ?? "").Trim();
        if (id.Length == 0 || id.Length > 64) return BadRequest(new { success = false, message = "Template id is required." });
        var texts = await LoadTextsAsync();
        var name = (req.Name ?? "").Trim();
        var text = (req.Text ?? "").Trim();
        if (name.Length > 80) name = name[..80];
        if (text.Length > 2000) text = text[..2000];
        if (name.Length == 0 && text.Length == 0) texts.Remove(id);
        else texts[id] = new TemplateText(name.Length > 0 ? name : null, text.Length > 0 ? text : null);

        var json = JsonSerializer.Serialize(texts);
        var row = await _db.SiteSettings.FirstOrDefaultAsync(s => s.Key == TemplateTextsKey);
        if (row is null) _db.SiteSettings.Add(new SiteSetting { Key = TemplateTextsKey, Value = json });
        else { row.Value = json; row.UpdatedAt = DateTimeOffset.UtcNow; }
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }
}
