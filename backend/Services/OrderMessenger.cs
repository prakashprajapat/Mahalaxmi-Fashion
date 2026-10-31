using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// The messages a customer gets about their own order.
///
/// Seven DLT templates, each with a trigger:
///
///   OrderConfirm    the order is placed
///   Tracking        a waybill is generated
///   OutForDelivery  the courier says it is on a van today
///   Delivered       the courier says it arrived
///   Refund          it came back instead, and money is owed
///   Review          an hour after delivery, then twice more
///   UserDropped     somebody reached the payment page and did not pay
///
/// Every send goes through SendOnceAsync, which writes a row first and sends
/// second. That order matters more than it looks. The tracking sweep runs
/// every three hours and re-reads the same courier status each time; the
/// review reminders run on a timer. Without the row, a parcel out for
/// delivery all day tells the customer so eight times, and a delivered order
/// asks for a review every three hours until somebody notices. A duplicate
/// SMS is not a cosmetic fault - it is the shop annoying the customer it was
/// trying to keep, in its own name, automatically.
///
/// Nothing here throws. A message that cannot be sent must never take down
/// the order it belongs to: the parcel still has to ship.
/// </summary>
public class OrderMessenger
{
    private readonly AppDbContext _db;
    private readonly SmsService _sms;
    private readonly ILogger<OrderMessenger> _log;

    public OrderMessenger(AppDbContext db, SmsService sms, ILogger<OrderMessenger> log)
    {
        _db = db;
        _sms = sms;
        _log = log;
    }

    // The shop's own name for each message, and the Settings key holding the
    // MSG91 id for it. The DLT ids in his spreadsheet are NOT these: MSG91
    // gives a flow its own id, and hard-coding either would mean a deploy
    // every time a template is re-approved.
    public const string OrderConfirm   = "OrderConfirm";
    public const string Tracking       = "Tracking";
    public const string OutForDelivery = "OutForDelivery";
    public const string Delivered      = "Delivered";
    public const string Refund         = "Refund";
    public const string Review         = "Review";
    public const string UserDropped    = "UserDropped";

    private static string SettingKeyFor(string template) => template switch
    {
        OrderConfirm   => "msg91TplOrderConfirm",
        Tracking       => "msg91TplTracking",
        OutForDelivery => "msg91TplOutForDelivery",
        Delivered      => "msg91TplDelivered",
        Refund         => "msg91TplRefund",
        Review         => "msg91TplReview",
        UserDropped    => "msg91TplUserDropped",
        _              => "",
    };

    /// How many times the review reminder may go, counting the first.
    public const int ReviewAttempts = 3;
    /// The first one, after delivery.
    public static readonly TimeSpan ReviewFirstDelay = TimeSpan.FromHours(1);
    /// And the gap between the rest.
    public static readonly TimeSpan ReviewGap = TimeSpan.FromHours(48);
    /// How long a payment gets to finish before it counts as abandoned. Someone
    /// who steps away and pays ten minutes later must not be told their payment
    /// failed - that message is worse than no message.
    public static readonly TimeSpan DroppedDelay = TimeSpan.FromHours(1);

    // ── the one way anything is sent ────────────────────────────────────────

    /// <summary>
    /// Send one template once, for one order, and write down that it went.
    ///
    /// The row is written BEFORE the send and the unique index is what
    /// enforces "once" - not a read-then-write, which two sweeps running
    /// together would both pass. If the send then fails, the row is updated to
    /// say so rather than deleted: a number MSG91 refuses is refused every
    /// time, and retrying for ever is how a bad number becomes a daily error.
    /// </summary>
    public async Task<bool> SendOnceAsync(
        string orderId, string template, string? phone,
        IReadOnlyList<string> values, IReadOnlyDictionary<string, string>? named = null,
        short attempt = 1, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(orderId)) return false;

        var row = new MessageSend
        {
            OrderId = orderId,
            Template = template,
            Attempt = attempt,
            Phone = phone,
            Status = "sending",
            SentAt = DateTimeOffset.UtcNow,
        };

        try
        {
            _db.MessageSends.Add(row);
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Somebody else got there first. That is the index doing its job,
            // and it is not an error worth logging loudly.
            _db.Entry(row).State = EntityState.Detached;
            return false;
        }

        var templateId = await _sms.SettingAsync(SettingKeyFor(template));
        if (string.IsNullOrWhiteSpace(templateId))
        {
            // Not set up yet is the normal state until he pastes the ids in.
            // Recorded as skipped so it is visible, and so the row is not
            // retried every three hours for ever.
            row.Status = "skipped";
            row.Detail = "No MSG91 template id in Settings for this message.";
            await SaveQuietly(ct);
            return false;
        }

        var (ok, detail) = await _sms.SendTemplateAsync(phone, templateId, values, named);
        row.Status = ok ? "sent" : "failed";
        row.Detail = detail.Length > 250 ? detail.Substring(0, 250) : detail;
        await SaveQuietly(ct);

        if (!ok)
            _log.LogWarning("Customer message {Template} for {Order} did not go: {Detail}",
                template, orderId, row.Detail);

        return ok;
    }

    private async Task SaveQuietly(CancellationToken ct)
    {
        try { await _db.SaveChangesAsync(ct); }
        catch (Exception ex) { _log.LogError(ex, "Could not record a customer message."); }
    }

    /// Has this message already gone (or been tried) for this order?
    public Task<bool> AlreadySentAsync(string orderId, string template, short attempt = 1, CancellationToken ct = default)
        => _db.MessageSends.AnyAsync(m => m.OrderId == orderId && m.Template == template && m.Attempt == attempt, ct);

    // ── the seven messages ──────────────────────────────────────────────────

    public Task<bool> OrderConfirmAsync(SiteOrder o, CancellationToken ct = default)
        => SendOnceAsync(o.OrderId, OrderConfirm, PhoneOf(o),
            new[] { NameOf(o), o.OrderId },
            new Dictionary<string, string> { ["name"] = NameOf(o), ["order_id"] = o.OrderId },
            1, ct);

    public Task<bool> TrackingAsync(SiteOrder o, CancellationToken ct = default)
        => SendOnceAsync(o.OrderId, Tracking, PhoneOf(o),
            new[] { NameOf(o), o.OrderId, o.Awb ?? "" },
            new Dictionary<string, string> { ["name"] = NameOf(o), ["order_id"] = o.OrderId, ["awb"] = o.Awb ?? "" },
            1, ct);

    public Task<bool> OutForDeliveryAsync(SiteOrder o, CancellationToken ct = default)
        => SendOnceAsync(o.OrderId, OutForDelivery, PhoneOf(o),
            new[] { NameOf(o), o.OrderId },
            new Dictionary<string, string> { ["name"] = NameOf(o), ["order_id"] = o.OrderId },
            1, ct);

    public Task<bool> DeliveredAsync(SiteOrder o, CancellationToken ct = default)
        => SendOnceAsync(o.OrderId, Delivered, PhoneOf(o),
            new[] { NameOf(o), o.OrderId },
            new Dictionary<string, string> { ["name"] = NameOf(o), ["order_id"] = o.OrderId },
            1, ct);

    /// The amount is what the customer actually paid online - the same figure
    /// the refund row carries - not the order total. Telling somebody they
    /// will get back more than they paid is a promise the shop then has to
    /// break.
    public Task<bool> RefundAsync(SiteOrder o, decimal amount, CancellationToken ct = default)
        => SendOnceAsync(o.OrderId, Refund, PhoneOf(o),
            new[] { NameOf(o), o.OrderId, amount.ToString("0") },
            new Dictionary<string, string>
            {
                ["name"] = NameOf(o), ["order_id"] = o.OrderId, ["amount"] = amount.ToString("0"),
            },
            1, ct);

    public async Task<bool> ReviewAsync(SiteOrder o, short attempt, CancellationToken ct = default)
    {
        var callback = (await _sms.SettingAsync("phone") ?? "").Trim();
        return await SendOnceAsync(o.OrderId, Review, PhoneOf(o),
            new[] { NameOf(o), o.OrderId, callback },
            new Dictionary<string, string>
            {
                ["name"] = NameOf(o), ["order_id"] = o.OrderId, ["number"] = callback,
            },
            attempt, ct);
    }

    /// Nobody's order exists here - the customer never got that far - so the
    /// details come off the abandoned checkout row instead.
    public Task<bool> UserDroppedAsync(CashfreeOrder cf, string? phone, CancellationToken ct = default)
    {
        var amount = (cf.AmountPaise / 100m).ToString("0");
        var date = cf.CreatedAt.ToOffset(TimeSpan.FromHours(5.5)).ToString("dd MMM yyyy");
        return SendOnceAsync(cf.LocalOrderId, UserDropped, phone,
            new[] { cf.LocalOrderId, date, amount },
            new Dictionary<string, string>
            {
                ["order_id"] = cf.LocalOrderId, ["date"] = date, ["amount"] = amount,
            },
            1, ct);
    }

    // ── who the customer is ─────────────────────────────────────────────────

    /// The buyer's name, from wherever this order happens to carry it. A
    /// webhook-written order keeps it in the shipping block and not the
    /// customer block, and a message opening "Hello ," reads as a broken shop.
    public static string NameOf(SiteOrder o)
    {
        var name = Field(o.CustomerJson, "name") ?? Field(o.ShippingJson, "name") ?? "";
        name = name.Trim();
        if (name.Length == 0) return "Customer";
        // DLT templates take the name as a single variable; a very long one
        // pushes the message into a second SMS segment for no gain.
        return name.Length > 30 ? name.Substring(0, 30).Trim() : name;
    }

    public static string? PhoneOf(SiteOrder o)
        => Field(o.CustomerJson, "phone") ?? Field(o.ShippingJson, "phone");

    public static string? Field(string? json, string key)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            var el = JsonSerializer.Deserialize<JsonElement>(json);
            if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(key, out var v)) return null;
            var s = v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString();
            return string.IsNullOrWhiteSpace(s) ? null : s;
        }
        catch { return null; }
    }
}
