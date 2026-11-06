using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// What an Interakt webhook event means for the shop.
///
///   message_api_* / message_campaign_*  -> wa_messages (sent, delivered, read, clicked, failed)
///   a cart from the WhatsApp catalogue  -> wa_carts (follow up, becomes an order)
///   a payment confirmation              -> wa_events "payment", matched to an MFH order id
///   account / template / quality alerts -> wa_events "alert"
///
/// Interakt documents the message events but not the cart and payment bodies,
/// so those are read by shape: anything carrying product_retailer_id is a
/// cart, anything about a payment carries an amount and a status. Every event
/// is also kept raw in wa_events, so a body this code did not foresee can be
/// read in Admin -> WhatsApp Activity -> All events and handled later.
///
/// Settings (all optional):
///   waNotifyCarts     "off" = no email to the admin for a new WhatsApp cart
///   waNotifyPayments  "off" = no email for a payment confirmation
///   waNotifyAlerts    "off" = no email for account / template / quality alerts
/// </summary>
public class InteraktEvents
{
    private readonly AppDbContext _db;
    private readonly AdminNotifier _notify;
    private readonly ILogger<InteraktEvents> _log;
    private const string Site = "https://www.mahalaxmifashionhub.com";

    public InteraktEvents(AppDbContext db, AdminNotifier notify, ILogger<InteraktEvents> log)
    {
        _db = db; _notify = notify; _log = log;
    }

    private async Task<bool> OnAsync(string key) =>
        !string.Equals((await _db.SiteSettings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync() ?? "").Trim(),
            "off", StringComparison.OrdinalIgnoreCase);

    public static string Ten(string? raw)
    {
        var d = new string((raw ?? "").Where(char.IsDigit).ToArray());
        return d.Length >= 10 ? d[^10..] : d;
    }

    private static string? Str(JsonElement e, params string[] keys)
    {
        if (e.ValueKind != JsonValueKind.Object) return null;
        foreach (var k in keys)
            foreach (var p in e.EnumerateObject())
                if (p.Name.Equals(k, StringComparison.OrdinalIgnoreCase) && p.Value.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined))
                {
                    var v = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() : p.Value.ToString();
                    if (!string.IsNullOrWhiteSpace(v)) return v.Trim();
                }
        return null;
    }

    private static DateTimeOffset? When(string? s) =>
        DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var d) ? d.ToUniversalTime() : null;

    /// Every object anywhere in the tree (strings that hold JSON are opened too).
    private static IEnumerable<JsonElement> Walk(JsonElement e, int depth = 0)
    {
        if (depth > 12) yield break;
        if (e.ValueKind == JsonValueKind.Object)
        {
            yield return e;
            foreach (var p in e.EnumerateObject())
                foreach (var x in Walk(p.Value, depth + 1)) yield return x;
        }
        else if (e.ValueKind == JsonValueKind.Array)
        {
            foreach (var v in e.EnumerateArray())
                foreach (var x in Walk(v, depth + 1)) yield return x;
        }
        else if (e.ValueKind == JsonValueKind.String)
        {
            var s = e.GetString() ?? "";
            if (s.Length > 1 && (s.TrimStart().StartsWith('{') || s.TrimStart().StartsWith('[')))
            {
                JsonDocument? doc = null;
                try { doc = JsonDocument.Parse(s); } catch { }
                if (doc is not null)
                    foreach (var x in Walk(doc.RootElement.Clone(), depth + 1)) yield return x;
                doc?.Dispose();
            }
        }
    }

    public async Task HandleAsync(string type, JsonElement root, string raw)
    {
        var data = root.TryGetProperty("data", out var d) ? d : root;
        var cust = data.ValueKind == JsonValueKind.Object && data.TryGetProperty("customer", out var c) ? c : default;
        var msg = data.ValueKind == JsonValueKind.Object && data.TryGetProperty("message", out var m) ? m : default;
        var phone = Ten(cust.ValueKind == JsonValueKind.Object ? Str(cust, "channel_phone_number", "phone_number") : null);
        string? name = null;
        if (cust.ValueKind == JsonValueKind.Object && cust.TryGetProperty("traits", out var tr)) name = Str(tr, "name");

        var t = type.ToLowerInvariant();
        var items = Walk(root).Where(o => Str(o, "product_retailer_id", "retailer_id") is not null).ToList();

        string category = t == "message_received" ? "lead" : "other";
        if (t.StartsWith("message_api_") || t.StartsWith("message_campaign_")) category = "status";
        if (items.Count > 0 || t.Contains("cart") || t.Contains("order")) category = "cart";
        if (t.Contains("payment")) category = "payment";
        if (t.Contains("alert") || t.Contains("account") || t.Contains("template") || t.Contains("quality") || t.Contains("capability") || t.Contains("review"))
            if (category == "other") category = "alert";

        var ev = new WaEvent
        {
            Type = type.Length > 60 ? type[..60] : type, Category = category, Phone = phone.Length > 0 ? phone : null,
            Raw = raw.Length > 20000 ? raw[..20000] : raw,
        };
        _db.WaEvents.Add(ev);
        await _db.SaveChangesAsync();

        try
        {
            switch (category)
            {
                case "status": await StatusAsync(ev, t, msg, phone); break;
                case "cart": await CartAsync(ev, items, root, phone, name); break;
                case "payment": await PaymentAsync(ev, root, phone); break;
                case "alert": await AlertAsync(ev, type, root); break;
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Interakt event {Type} could not be read fully.", type);
        }
    }

    private async Task StatusAsync(WaEvent ev, string t, JsonElement msg, string phone)
    {
        if (msg.ValueKind != JsonValueKind.Object) return;
        var id = Str(msg, "id");
        if (string.IsNullOrEmpty(id)) return;
        var row = await _db.WaMessages.FirstOrDefaultAsync(x => x.MessageId == id);
        if (row is null)
        {
            row = new WaMessage { MessageId = id.Length > 120 ? id[..120] : id };
            _db.WaMessages.Add(row);
        }
        row.Source = t.StartsWith("message_campaign_") ? "campaign" : "api";
        if (phone.Length > 0) row.Phone = phone;
        row.CampaignId ??= Str(msg, "campaign_id");
        if (row.Template is null)
        {
            var rt = Str(msg, "raw_template");
            if (rt is not null)
                try { using var doc = JsonDocument.Parse(rt); row.Template = Str(doc.RootElement, "name"); } catch { }
            row.Template ??= Str(msg, "template_name");
        }
        var now = DateTimeOffset.UtcNow;
        row.SentAt ??= When(Str(msg, "received_at_utc", "sent_at_utc")) ?? now;
        if (t.EndsWith("_delivered")) row.DeliveredAt ??= When(Str(msg, "delivered_at_utc")) ?? now;
        if (t.EndsWith("_read")) { row.ReadAt ??= When(Str(msg, "seen_at_utc")) ?? now; row.DeliveredAt ??= row.ReadAt; }
        if (t.EndsWith("_clicked")) row.ClickedAt ??= now;
        if (t.EndsWith("_failed"))
        {
            row.FailedAt ??= now;
            var reason = Str(msg, "channel_failure_reason", "failure_reason");
            var code = Str(msg, "channel_error_code");
            row.FailureReason = (reason ?? "Failed") + (code is null ? "" : $" ({code})");
            if (row.FailureReason.Length > 500) row.FailureReason = row.FailureReason[..500];
        }
        // The furthest it got, never moving backwards on a late event.
        row.Status = row.FailedAt is not null && row.DeliveredAt is null ? "Failed"
            : row.ClickedAt is not null ? "Clicked"
            : row.ReadAt is not null ? "Read"
            : row.DeliveredAt is not null ? "Delivered" : "Sent";
        row.UpdatedAt = now;
        ev.Ref = row.MessageId; ev.Status = row.Status;
        ev.Summary = $"{row.Template ?? "template"} -> {row.Status}" + (row.FailureReason is null ? "" : $": {row.FailureReason}");
        await _db.SaveChangesAsync();
    }

    private record CartItem(string RetailerId, int? ProductId, string Name, string Sku, string Variant, int Qty, decimal Price, string Link);

    private static string Slug(string name)
    {
        var s = Regex.Replace(name.ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
        if (s.Length > 60) s = s[..60].TrimEnd('-');
        return s;
    }

    private async Task CartAsync(WaEvent ev, List<JsonElement> items, JsonElement root, string phone, string? name)
    {
        // Website feed ids are SKU, or SKU-size-colour, or MFH-<id>.
        var retailerIds = items.Select(i => Str(i, "product_retailer_id", "retailer_id")!).ToList();
        // Every SKU the id could start with: "mfh1225-xl-red" -> mfh1225-xl-red, mfh1225-xl, mfh1225
        var cands = new HashSet<string>();
        foreach (var r in retailerIds.Select(x => x.ToLowerInvariant()))
        {
            cands.Add(r);
            for (var i = r.IndexOf('-'); i > 0; i = r.IndexOf('-', i + 1)) cands.Add(r[..i]);
        }
        var candList = cands.ToList();
        var products = await _db.Products.AsNoTracking()
            .Where(p => p.Sku != null && candList.Contains(p.Sku.ToLower()))
            .Select(p => new { p.Id, p.Name, p.Sku }).ToListAsync();

        var list = new List<CartItem>();
        decimal total = 0;
        string? currency = null;
        foreach (var it in items)
        {
            var rid = Str(it, "product_retailer_id", "retailer_id")!;
            var r = rid.ToLowerInvariant();
            var p = products.Where(x => r == x.Sku!.ToLower() || r.StartsWith(x.Sku!.ToLower() + "-"))
                            .OrderByDescending(x => x.Sku!.Length).FirstOrDefault();
            int? pid = p?.Id;
            if (pid is null)
            {
                var mm = Regex.Match(r, @"^mfh-(\d+)");
                if (mm.Success && int.TryParse(mm.Groups[1].Value, out var dbId))
                {
                    var byId = await _db.Products.AsNoTracking().Where(x => x.Id == dbId).Select(x => new { x.Id, x.Name, x.Sku }).FirstOrDefaultAsync();
                    if (byId is not null) { pid = byId.Id; p = byId; }
                }
            }
            var variant = p?.Sku is { Length: > 0 } sku && r.StartsWith(sku.ToLowerInvariant() + "-") ? rid[(sku.Length + 1)..].Replace('-', ' ') : "";
            int.TryParse(Str(it, "quantity", "qty"), out var qty);
            if (qty <= 0) qty = 1;
            decimal.TryParse(Str(it, "item_price", "price", "amount"), NumberStyles.Any, CultureInfo.InvariantCulture, out var price);
            currency ??= Str(it, "currency");
            total += price * qty;
            var link = p is null ? "" : $"{Site}/products/{(Slug(p.Name) is { Length: > 0 } sl ? sl + "-" : "")}{p.Id}";
            list.Add(new CartItem(rid, pid, p?.Name ?? rid, p?.Sku ?? "", variant, qty, price, link));
        }

        var note = Walk(root).Select(o => Str(o, "text")).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x));
        var cart = new WaCart
        {
            EventId = ev.Id, Phone = phone.Length > 0 ? phone : null, Name = name,
            ItemsJson = JsonSerializer.Serialize(list, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }),
            Total = total, Currency = currency ?? "INR", CustomerNote = note,
        };
        _db.WaCarts.Add(cart);
        ev.Ref = cart.Id.ToString(); ev.Status = "new";
        ev.Summary = $"{list.Count} item(s), Rs.{total:0}";
        await _db.SaveChangesAsync();
        ev.Ref = cart.Id.ToString();
        await _db.SaveChangesAsync();

        if (await OnAsync("waNotifyCarts"))
        {
            var rows = string.Join("", list.Select(i =>
                $"<li>{System.Net.WebUtility.HtmlEncode(i.Name)}{(i.Variant.Length > 0 ? " (" + System.Net.WebUtility.HtmlEncode(i.Variant) + ")" : "")} x{i.Qty} - Rs.{i.Price:0}</li>"));
            await _notify.NotifyAsync($"New WhatsApp cart - Rs.{total:0} from {phone}",
                AdminNotifier.Wrap("New cart on WhatsApp", $@"
                    <p><b>{System.Net.WebUtility.HtmlEncode(name ?? "Customer")}</b> ({phone}) sent a cart from your WhatsApp catalogue.</p>
                    <ul>{rows}</ul><p>Total: <b>Rs.{total:0}</b></p>
                    <p>It has no delivery address yet. Open Admin &rarr; WhatsApp Activity &rarr; Carts to reply and turn it into an order.</p>"));
        }
    }

    private async Task PaymentAsync(WaEvent ev, JsonElement root, string phone)
    {
        string? amount = null, status = null, reference = null;
        foreach (var o in Walk(root))
        {
            amount ??= Str(o, "amount", "total_amount", "value");
            status ??= Str(o, "payment_status", "status");
            reference ??= Str(o, "reference_id", "order_id", "payment_id", "transaction_id", "id");
        }
        var orderId = Regex.Match(ev.Raw ?? "", @"MFH\d{8,}").Value;
        ev.Ref = orderId.Length > 0 ? orderId : reference;
        ev.Status = status;
        ev.Summary = $"Payment {status ?? ""} {(amount is null ? "" : "Rs." + amount)}{(orderId.Length > 0 ? " for " + orderId : "")}".Trim();
        await _db.SaveChangesAsync();
        if (await OnAsync("waNotifyPayments"))
            await _notify.NotifyAsync($"WhatsApp payment: {ev.Summary}",
                AdminNotifier.Wrap("WhatsApp payment update", $"<p>{System.Net.WebUtility.HtmlEncode(ev.Summary)}</p><p>Customer: {phone}</p><p>Details in Admin &rarr; WhatsApp Activity &rarr; Payments.</p>"));
    }

    private async Task AlertAsync(WaEvent ev, string type, JsonElement root)
    {
        string? what = null;
        foreach (var o in Walk(root))
        {
            what ??= Str(o, "event", "alert_description", "description", "reason", "status", "current_limit", "quality_score");
            if (what is not null) break;
        }
        ev.Status = what;
        ev.Summary = $"{type}: {what ?? "see details"}";
        if (ev.Summary.Length > 500) ev.Summary = ev.Summary[..500];
        await _db.SaveChangesAsync();
        if (await OnAsync("waNotifyAlerts"))
            await _notify.NotifyAsync($"WhatsApp alert: {type}",
                AdminNotifier.Wrap("WhatsApp account alert", $"<p>{System.Net.WebUtility.HtmlEncode(ev.Summary)}</p><p>Details in Admin &rarr; WhatsApp Activity &rarr; Alerts.</p>"));
    }
}
