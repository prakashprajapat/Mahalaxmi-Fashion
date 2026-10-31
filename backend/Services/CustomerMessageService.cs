using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// The two customer messages that are sent by a clock rather than by an event.
///
/// Five of the seven templates have something happen first - an order is
/// placed, a waybill is generated, a courier scan arrives - and those are sent
/// from the code that handles the event. These two have nothing happen at all:
///
///   Review       an hour after delivery, then twice more, 48 hours apart
///   UserDropped  an hour after somebody reached the payment page and did not pay
///
/// Both are the kind of message that is worse than useless if it goes twice,
/// or late, or to the wrong person, so the care here is mostly about what the
/// sweep refuses to send:
///
///   • a review ask stops the moment a review exists for that order, whatever
///     the count says - the same stop condition ReviewRequestService keeps for
///     the email, because being asked for a review you have already written is
///     how a shop tells a customer nobody is reading
///   • a payment still in flight (Cashfree PENDING) is never called abandoned.
///     Telling somebody their payment failed while their bank is still
///     processing it is worse than saying nothing at all
///   • an abandoned checkout that later became an order - paid by another
///     route, switched to Cash on Delivery, written by the webhook - is skipped
///   • one UserDropped message per phone per day, however many checkouts that
///     person started. Three attempts at the same payment is one person having
///     trouble, not three sales to chase
///   • the floors. A review window closes after a week and an abandoned
///     checkout is stale after a day; without those, the first sweep after a
///     deploy would message every delivery and every dropped payment in the
///     table's history at once
///
/// Every send goes through OrderMessenger.SendOnceAsync, which writes its row
/// before it sends, so a restart in the middle cannot turn one message into
/// two. `customerSmsEnabled` = off in Settings stops both.
/// </summary>
public class CustomerMessageService : BackgroundService
{
    public const string EnabledSettingKey = "customerSmsEnabled";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CustomerMessageService> _log;

    // Hourly, because both delays are measured in hours. The three-hourly
    // tracking sweep would make "an hour after delivery" mean anything up to
    // four, and the point of the first review ask is that it arrives while the
    // parcel is still on the table.
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    /// A delivery older than this has had its three chances. Also what stops
    /// the first sweep after a deploy from working through the whole year.
    private static readonly TimeSpan ReviewWindow = TimeSpan.FromDays(7);

    /// An abandoned checkout older than this is not worth a message - the
    /// moment has gone, and a text about yesterday-but-one reads as a shop
    /// going through its records rather than one paying attention.
    private static readonly TimeSpan DroppedWindow = TimeSpan.FromHours(24);

    /// One person, one nudge a day, however many times they tried to pay.
    private static readonly TimeSpan OnePerPhoneWithin = TimeSpan.FromHours(24);

    private const int MaxPerRun = 25;

    public CustomerMessageService(IServiceScopeFactory scopeFactory, ILogger<CustomerMessageService> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // After the tracking sweep has had its turn. An order that is about to
        // be marked Delivered should be marked first and asked about second.
        try { await Task.Delay(TimeSpan.FromMinutes(6), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunOnceAsync(stoppingToken); }
            catch (Exception ex) { _log.LogError(ex, "Customer message sweep failed."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var msg = scope.ServiceProvider.GetRequiredService<OrderMessenger>();

        if (await OffAsync(db, EnabledSettingKey, ct)) return;

        await ReviewSweepAsync(db, msg, ct);
        await DroppedSweepAsync(db, msg, ct);
    }

    private static async Task<bool> OffAsync(AppDbContext db, string key, CancellationToken ct)
    {
        var v = await db.SiteSettings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "";
        return v.Trim().ToLowerInvariant() is "0" or "false" or "no" or "off";
    }

    // ── the review ask ──────────────────────────────────────────────────────

    private async Task ReviewSweepAsync(AppDbContext db, OrderMessenger msg, CancellationToken ct)
    {
        // The owner's switch for review nagging covers both channels. If he has
        // turned the review emails off, the texts are not a way round that.
        if (await OffAsync(db, ReviewRequestService.EnabledSettingKey, ct)) return;

        var now = DateTimeOffset.UtcNow;
        var firstDue = now - OrderMessenger.ReviewFirstDelay;
        var floor = now - ReviewWindow;

        var gapFloor = now - OrderMessenger.ReviewGap;
        var tpl = OrderMessenger.Review;

        // Every condition is in the query, and that is the point of this shape
        // rather than a simpler one.
        //
        // Filtering after the Take looks equivalent and is not. The batch is 25
        // oldest-first, so on a day with sixty deliveries the first 25 are
        // asked, and then those same 25 fill the batch on every sweep for the
        // next five days - skipped each time, but occupying the room. Customers
        // 26 to 60 are never asked at all, and their review window closes while
        // the sweep reports success. The batch has to be 25 orders that are
        // actually DUE.
        var orders = await db.SiteOrders
            .Where(o => o.Status == "Delivered"
                     && o.DeliveredAt != null
                     && o.DeliveredAt <= firstDue
                     && o.DeliveredAt >= floor
                     // She has written one. Whatever the count says, stop.
                     && !db.Reviews.Any(r => r.OrderId == o.OrderId)
                     // Three and no more.
                     && db.MessageSends.Count(m => m.OrderId == o.OrderId && m.Template == tpl)
                            < OrderMessenger.ReviewAttempts
                     // Nothing in the last 48 hours - which is also true of an
                     // order that has had nothing at all, so this one condition
                     // covers the first ask and the reminders both.
                     && !db.MessageSends.Any(m => m.OrderId == o.OrderId && m.Template == tpl
                                               && m.SentAt > gapFloor))
            .OrderBy(o => o.DeliveredAt)
            .Take(MaxPerRun)
            .ToListAsync(ct);

        if (orders.Count == 0) return;

        // Which attempt each of these is on. Only for the 25 in hand.
        var ids = orders.Select(o => o.OrderId).ToList();
        var counts = (await db.MessageSends
            .Where(m => m.Template == tpl && ids.Contains(m.OrderId))
            .GroupBy(m => m.OrderId)
            .Select(g => new { OrderId = g.Key, Count = g.Count() })
            .ToListAsync(ct))
            .ToDictionary(x => x.OrderId, x => x.Count);

        var sent = 0;
        foreach (var o in orders)
        {
            if (ct.IsCancellationRequested) return;
            var attempt = (short)((counts.TryGetValue(o.OrderId, out var c) ? c : 0) + 1);
            if (attempt > OrderMessenger.ReviewAttempts) continue;
            if (await msg.ReviewAsync(o, attempt, ct)) sent++;
        }

        if (sent > 0) _log.LogInformation("Review texts: {Count} sent.", sent);
    }

    // ── the payment nobody finished ─────────────────────────────────────────

    private async Task DroppedSweepAsync(AppDbContext db, OrderMessenger msg, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var due = now - OrderMessenger.DroppedDelay;
        var floor = now - DroppedWindow;

        // PENDING is deliberately not here. Cashfree uses it while a bank is
        // still deciding, and a text saying the payment did not go through,
        // sent while it is going through, is the one message that loses a sale
        // that was already won.
        var dropTpl = OrderMessenger.UserDropped;

        // Both exclusions are in the query, for the same reason as the review
        // sweep above: 25 rows that have already been dealt with would fill the
        // batch and hide the ones that have not, until their day ran out.
        var drops = await db.CashfreeOrders
            .Where(c => c.CreatedAt <= due
                     && c.CreatedAt >= floor
                     && c.PaidAt == null
                     && c.Status != "paid"
                     && (c.CfStatus == null || (c.CfStatus != "SUCCESS" && c.CfStatus != "PENDING"))
                     // It became an order after all: the webhook wrote it, she
                     // paid on a second attempt, or it was switched to Cash on
                     // Delivery. Whatever the payment row still says, there is
                     // nothing abandoned here.
                     && !db.SiteOrders.Any(o => o.OrderId == c.LocalOrderId)
                     && !db.MessageSends.Any(m => m.OrderId == c.LocalOrderId && m.Template == dropTpl))
            .OrderBy(c => c.CreatedAt)
            .Take(MaxPerRun)
            .ToListAsync(ct);

        if (drops.Count == 0) return;

        // One per phone per day. The unique index cannot catch this: three
        // attempts at the same payment are three rows with three different
        // order ids, and all three would qualify on their own.
        var since = now - OnePerPhoneWithin;
        var recent = (await db.MessageSends
            .Where(m => m.Template == dropTpl && m.SentAt >= since && m.Phone != null)
            .Select(m => m.Phone!)
            .ToListAsync(ct))
            .Select(Last10)
            .Where(p => p.Length > 0)
            .ToHashSet();

        var sent = 0;
        foreach (var cf in drops)
        {
            if (ct.IsCancellationRequested) return;

            var phone = OrderMessenger.Field(cf.CustomerJson, "phone")
                     ?? OrderMessenger.Field(cf.ShippingJson, "phone");
            var key = Last10(phone);

            // No number to text. Recorded as a skip so the row is not picked up
            // again every hour until the window closes.
            if (key.Length == 0)
            {
                await msg.SendOnceAsync(cf.LocalOrderId, OrderMessenger.UserDropped, null,
                    Array.Empty<string>(), null, 1, ct);
                continue;
            }

            if (recent.Contains(key)) continue;

            if (await msg.UserDroppedAsync(cf, phone, ct))
            {
                recent.Add(key);
                sent++;
            }
        }

        if (sent > 0) _log.LogInformation("Abandoned payment texts: {Count} sent.", sent);
    }

    /// The last ten digits, which is the only part of an Indian mobile number
    /// that is written the same way everywhere. +91 93535 68638, 09353568638
    /// and 9353568638 are one person and one message.
    private static string Last10(string? phone)
    {
        var digits = new string((phone ?? "").Where(char.IsDigit).ToArray());
        return digits.Length >= 10 ? digits[^10..] : "";
    }
}
