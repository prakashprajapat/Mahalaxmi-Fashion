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
    private readonly Services.SmsService _sms;
    public SmsLogsController(AppDbContext db, Services.SmsService sms) { _db = db; _sms = sms; }

    private async Task SaveTextsAsync(Dictionary<string, TemplateText> texts)
    {
        var json = JsonSerializer.Serialize(texts);
        var row = await _db.SiteSettings.FirstOrDefaultAsync(s => s.Key == TemplateTextsKey);
        if (row is null) _db.SiteSettings.Add(new SiteSetting { Key = TemplateTextsKey, Value = json });
        else { row.Value = json; row.UpdatedAt = DateTimeOffset.UtcNow; }
        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Reads the wording of every template id given that has none saved yet,
    /// straight from MSG91, and keeps it. A name the admin typed is kept; only
    /// the missing text is filled. At most `max` ids per call, so a page of
    /// logs never waits on a dozen MSG91 round trips.
    /// </summary>
    private async Task<int> FillMissingTextsAsync(Dictionary<string, TemplateText> texts, IEnumerable<string> ids, int max)
    {
        int filled = 0;
        foreach (var id in ids.Where(i => !string.IsNullOrWhiteSpace(i)).Distinct(StringComparer.OrdinalIgnoreCase).Take(max))
        {
            if (texts.TryGetValue(id, out var have) && !string.IsNullOrWhiteSpace(have.Text)) continue;
            var (name, text) = await _sms.FetchTemplateAsync(id);
            if (string.IsNullOrWhiteSpace(text)) continue;
            texts[id] = new TemplateText(have?.Name ?? name, text.Trim());
            filled++;
        }
        if (filled > 0) await SaveTextsAsync(texts);
        return filled;
    }

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

    // {#var#} (DLT) and ##var## (MSG91) both mean "the next value".
    private static readonly Regex VarSlot = new(@"\{#var#\}|##var##", RegexOptions.IgnoreCase | RegexOptions.Compiled);
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
        // The wording is MSG91's; fetch what is missing for this page once, and keep it.
        await FillMissingTextsAsync(texts, rows.Select(r => r.TemplateId)
            .Where(id => !texts.TryGetValue(id, out var t) || string.IsNullOrWhiteSpace(t.Text)), 6);
        var names = await NamesAsync(texts);

        // "Payment not finished": WhatsApp gets the same message plus a link to
        // what they were buying, found from the SKUs of that checkout.
        var droppedTpl = (await _db.SiteSettings.Where(x => x.Key == "msg91TplUserDropped").Select(x => x.Value).FirstOrDefaultAsync() ?? "").Trim();
        var itemLinks = droppedTpl.Length == 0 ? new Dictionary<string, List<string>>()
            : await ItemLinksAsync(rows.Where(r => string.Equals(r.TemplateId, droppedTpl, StringComparison.OrdinalIgnoreCase))
                                       .Select(r => OrderIdOf(r.VarsJson)).Where(x => x != null).Select(x => x!).ToList());

        return Ok(new
        {
            success = true, total, sent, failed = total - sent, page,
            logs = rows.Select(r => new
            {
                r.Id, r.SentAt, r.Phone, r.TemplateId, r.Kind, r.Status, r.Detail, r.RequestId,
                templateName = names.TryGetValue(r.TemplateId, out var nm) ? nm : null,
                vars = r.VarsJson,
                message = Render(texts.TryGetValue(r.TemplateId, out var tx) ? tx.Text : null, r.VarsJson),
                itemLinks = OrderIdOf(r.VarsJson) is { } oid && itemLinks.TryGetValue(oid, out var links)
                    && string.Equals(r.TemplateId, droppedTpl, StringComparison.OrdinalIgnoreCase) ? links : null,
                whatsappText = string.Equals(r.TemplateId, droppedTpl, StringComparison.OrdinalIgnoreCase)
                    ? ForWhatsApp(Render(texts.TryGetValue(r.TemplateId, out var tx2) ? tx2.Text : null, r.VarsJson),
                                  OrderIdOf(r.VarsJson) is { } o2 && itemLinks.TryGetValue(o2, out var l2) ? l2 : null)
                    : null,
            }),
        });
    }

    private static string? OrderIdOf(string? varsJson)
    {
        if (string.IsNullOrWhiteSpace(varsJson)) return null;
        try
        {
            var d = JsonSerializer.Deserialize<Dictionary<string, string>>(varsJson) ?? new();
            if (d.TryGetValue("order_id", out var o) && !string.IsNullOrWhiteSpace(o)) return o.Trim();
            if (d.TryGetValue("var1", out o) && o.StartsWith("MFH", StringComparison.OrdinalIgnoreCase)) return o.Trim();
        }
        catch { }
        return null;
    }

    private static string Slug(string name)
    {
        var s = Regex.Replace(name.ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormKD), "[^a-z0-9]+", "-").Trim('-');
        if (s.Length > 60) s = s[..60].TrimEnd('-');
        return s;
    }

    /// order id -> product page links, from the SKUs in that checkout's cart
    /// (the abandoned Cashfree checkout, or the order if one was made).
    private async Task<Dictionary<string, List<string>>> ItemLinksAsync(List<string> orderIds)
    {
        var result = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        if (orderIds.Count == 0) return result;
        var carts = await _db.CashfreeOrders.AsNoTracking().Where(c => orderIds.Contains(c.LocalOrderId))
            .OrderByDescending(c => c.CreatedAt).Select(c => new { c.LocalOrderId, c.CartJson }).ToListAsync();
        var orderCarts = await _db.SiteOrders.AsNoTracking().Where(o => orderIds.Contains(o.OrderId))
            .Select(o => new { o.OrderId, o.CartJson }).ToListAsync();

        var skusByOrder = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        void Read(string id, string? json)
        {
            if (skusByOrder.ContainsKey(id) || string.IsNullOrWhiteSpace(json)) return;
            try
            {
                using var doc = JsonDocument.Parse(json);
                var list = new List<string>();
                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    foreach (var line in doc.RootElement.EnumerateArray())
                        foreach (var p in line.EnumerateObject())
                            if (p.Name.Equals("sku", StringComparison.OrdinalIgnoreCase) && p.Value.ValueKind == JsonValueKind.String
                                && !string.IsNullOrWhiteSpace(p.Value.GetString()))
                                list.Add(p.Value.GetString()!.Trim());
                if (list.Count > 0) skusByOrder[id] = list.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            }
            catch { }
        }
        foreach (var c in carts) Read(c.LocalOrderId, c.CartJson);
        foreach (var o in orderCarts) Read(o.OrderId, o.CartJson);

        var allSkus = skusByOrder.Values.SelectMany(x => x).Select(x => x.ToLower()).Distinct().ToList();
        if (allSkus.Count == 0) return result;
        var products = await _db.Products.AsNoTracking().Where(p => p.Sku != null && allSkus.Contains(p.Sku.ToLower()))
            .Select(p => new { p.Id, p.Name, p.Sku }).ToListAsync();
        var bySku = products.GroupBy(p => p.Sku!.ToLowerInvariant()).ToDictionary(g => g.Key, g => g.First());

        foreach (var kv in skusByOrder)
        {
            var links = kv.Value.Select(sku => bySku.TryGetValue(sku.ToLowerInvariant(), out var p)
                    ? $"https://www.mahalaxmifashionhub.com/products/{(Slug(p.Name) is { Length: > 0 } sl ? sl + "-" : "")}{p.Id}"
                    : null)
                .Where(x => x != null).Select(x => x!).Distinct().ToList();
            if (links.Count > 0) result[kv.Key] = links;
        }
        return result;
    }

    /// The SMS laid out for WhatsApp - a line per detail - with "Item Details"
    /// put in before the amount. Null when the template text is not known yet.
    private static string? ForWhatsApp(string? sms, List<string>? links)
    {
        if (string.IsNullOrWhiteSpace(sms)) return null;
        var t = Regex.Replace(sms.Trim(), @"\s+", " ");
        // Blank line after the greeting and before / after the body sentences.
        t = Regex.Replace(t, @"^(Dear [^,]{1,40},)\s*", "$1\n\n", RegexOptions.IgnoreCase);
        foreach (var label in new[] { "Order ID:", "Transaction Date:", "Order Amount:" })
            t = Regex.Replace(t, @"\s*(" + Regex.Escape(label) + ")", "\n$1", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"\s*(You can visit)", "\n\n$1", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"\s*(Website:)", "\n\n$1", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"\s*(Thank you)", "\n\n$1", RegexOptions.IgnoreCase);
        // The order block starts after a blank line.
        t = Regex.Replace(t, @"\n(Order ID:)", "\n\n$1", RegexOptions.IgnoreCase);

        if (links is { Count: > 0 })
        {
            var item = "Item Details : " + string.Join("\n", links);
            var at = Regex.Match(t, @"\n(Order Amount:)", RegexOptions.IgnoreCase);
            t = at.Success ? t.Insert(at.Index, "\n" + item) : t + "\n" + item;
        }
        return Regex.Replace(t, @"\n{3,}", "\n\n").Trim();
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

        await SaveTextsAsync(texts);
        return Ok(new { success = true });
    }

    // POST /api/sms-logs/templates/fetch  { ids?: [...], overwrite?: false }
    // Reads the wording of the templates from MSG91 - every template in Settings
    // and in the log when no ids are given.
    public record FetchRequest(List<string>? Ids, bool Overwrite = false);

    [HttpPost("templates/fetch")]
    public async Task<IActionResult> FetchTemplates([FromBody] FetchRequest? req)
    {
        var texts = await LoadTextsAsync();
        var names = await NamesAsync(texts);
        var ids = req?.Ids is { Count: > 0 } ? req.Ids
            : names.Keys.Concat(await _db.SmsLogs.Select(x => x.TemplateId).Distinct().ToListAsync()).ToList();
        if (req?.Overwrite == true)
            foreach (var id in ids)
                if (texts.TryGetValue(id, out var t)) texts[id] = t with { Text = null };
        var filled = await FillMissingTextsAsync(texts, ids, 40);
        var missing = ids.Where(i => !string.IsNullOrWhiteSpace(i)).Distinct(StringComparer.OrdinalIgnoreCase)
            .Count(i => !texts.TryGetValue(i, out var t) || string.IsNullOrWhiteSpace(t.Text));
        return Ok(new { success = true, filled, missing });
    }
}
