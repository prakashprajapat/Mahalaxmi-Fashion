using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// Asks the people who already bought what they thought.
///
/// A new shop has the hardest version of the oldest problem: a stranger will
/// not buy where nobody has bought, and nobody buys where nobody has bought.
/// The way out is not to invent the reviews — Merchant Center suspends accounts
/// for that, and the shop's catalogue feed is what pays for its advertising —
/// it is to ask every single real buyer, every time, without the owner having
/// to remember.
///
/// So: three days after an order is marked Delivered, one email goes to the
/// buyer. Three days because the parcel has been opened and worn by then, and
/// because asking the same evening reads as a shop that wants a rating more
/// than it wants the customer to be happy.
///
/// Rules it keeps:
///   • up to THREE asks per order and no more: the first three days after
///     delivery, then one every 48 hours. The shop asked for a reminder every
///     48 hours "until a review arrives", and for the customer who is never
///     going to write one that is fifteen emails a month — which is how a
///     sending domain gets marked as spam, and then the mail that stops
///     arriving is the order confirmation and the invoice
///   • the moment a review exists for the order, the asking stops — checked
///     against reviews.order_id on every sweep, whatever the count says
///   • the count is written BEFORE the send is attempted, so a crash or a
///     restart cannot turn one ask into two
///   • only orders that reached Delivered, and only where there is an email
///   • nothing is asked for in return and no rating is suggested; the link
///     opens the review page and the customer writes whatever is true
///   • `reviewRequestEnabled` = off in Settings stops it entirely
/// </summary>
public class ReviewRequestService : BackgroundService
{
    public const string EnabledSettingKey = "reviewRequestEnabled";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ReviewRequestService> _log;

    // Six-hourly. The wait is measured in days, so checking more often buys
    // nothing; checking daily would make "three days" mean anything up to four.
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    private static readonly TimeSpan WaitAfterDelivery = TimeSpan.FromDays(3);

    /// <summary>The gap between the reminders that follow the first ask.</summary>
    private static readonly TimeSpan GapBetweenAsks = TimeSpan.FromHours(48);

    /// <summary>The first ask plus two reminders. See the note at the top.</summary>
    private const int MaxAsksPerOrder = 3;

    // One batch's worth. A shop that suddenly marks two hundred old orders
    // delivered should not send two hundred emails in one minute — that is how
    // a sending domain gets its reputation burnt.
    private const int MaxPerRun = 40;

    public ReviewRequestService(IServiceScopeFactory scopeFactory, ILogger<ReviewRequestService> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(3), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunOnceAsync(stoppingToken); }
            catch (Exception ex) { _log.LogError(ex, "Review request sweep failed"); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email = scope.ServiceProvider.GetRequiredService<EmailService>();

        var setting = await db.SiteSettings.Where(s => s.Key == EnabledSettingKey)
            .Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "";
        if (setting.Trim().ToLowerInvariant() is "0" or "false" or "no" or "off") return;

        var now = DateTimeOffset.UtcNow;
        var firstAskReady = now - WaitAfterDelivery;
        var reminderReady = now - GapBetweenAsks;

        // Two clocks, not one. An order that has never been asked waits three
        // days from delivery; one that has waits 48 hours from the last ask.
        var orders = await db.SiteOrders
            .Where(o => o.Status == "Delivered"
                     && o.ReviewAsksSent < MaxAsksPerOrder
                     && (o.ReviewAsksSent == 0
                            ? o.UpdatedAt <= firstAskReady
                            : o.ReviewAskedAt != null && o.ReviewAskedAt <= reminderReady))
            .OrderBy(o => o.UpdatedAt)
            .Take(MaxPerRun)
            .ToListAsync(ct);

        // Which of these already have a review. One query for the batch rather
        // than one per order, and it is the real stop condition: a customer who
        // has written her review must not be asked again, whatever the count.
        var ids = orders.Select(o => o.OrderId).ToList();
        var reviewed = ids.Count == 0
            ? new HashSet<string>()
            : (await db.Reviews
                .Where(r => r.OrderId != null && ids.Contains(r.OrderId))
                .Select(r => r.OrderId!)
                .Distinct()
                .ToListAsync(ct)).ToHashSet();

        foreach (var o in orders)
        {
            if (ct.IsCancellationRequested) return;

            // She has written one. Close the order off at the cap so it is never
            // picked up again, and send nothing.
            if (reviewed.Contains(o.OrderId))
            {
                o.ReviewAsksSent = MaxAsksPerOrder;
                await db.SaveChangesAsync(ct);
                continue;
            }

            var (name, to) = Buyer(o.CustomerJson);

            // Counted FIRST, and for every order including the ones with no
            // email. The count means "this order has had its turn", not "an
            // email left the building" — otherwise an order with no address
            // would be picked up again every six hours forever.
            var askNumber = o.ReviewAsksSent + 1;
            o.ReviewAsksSent = askNumber;
            o.ReviewAskedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            if (string.IsNullOrWhiteSpace(to)) continue;

            try
            {
                var subject = askNumber == 1 ? "How was your order?" : "Still hoping to hear from you";
                await email.SendAsync(to, subject, Body(name, o.OrderId, askNumber, MaxAsksPerOrder));
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Could not send the review request for {OrderId}", o.OrderId);
            }
        }

        if (orders.Count > 0)
            _log.LogInformation("Review requests: {Count} order(s) handled", orders.Count);
    }

    private static (string name, string? email) Buyer(string? customerJson)
    {
        if (string.IsNullOrWhiteSpace(customerJson)) return ("", null);
        try
        {
            var j = JsonSerializer.Deserialize<JsonElement>(customerJson);
            var name = j.TryGetProperty("name", out var n) ? (n.GetString() ?? "").Trim() : "";
            var mail = j.TryGetProperty("email", out var e) ? (e.GetString() ?? "").Trim() : "";
            // First name only. "Dear Dinesh Kumar Prajapat," reads like a bill.
            var first = name.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";
            return (first, string.IsNullOrWhiteSpace(mail) ? null : mail);
        }
        catch { return ("", null); }
    }

    private static string Body(string name, string orderId, int askNumber, int maxAsks)
    {
        var hello = string.IsNullOrWhiteSpace(name) ? "Hello" : $"Hello {System.Net.WebUtility.HtmlEncode(name)}";
        var id = System.Net.WebUtility.HtmlEncode(orderId);
        // Built out here, not inside the template. A quoted string inside an
        // interpolation hole of a verbatim string is a trap: the "" reads as an
        // escaped quote rather than the start of a literal.
        var lastWord = askNumber < maxAsks ? "" :
            @"<p style=""color:#777;font-size:.9rem"">This is the last time we will write about
                this order. If you would rather not review it, that is completely fine —
                thank you for shopping with us either way.</p>";
        // Plain, short, and it asks for the truth rather than for stars. A mail
        // that begs for five stars is the one people report as spam.
        return AdminNotifier.Wrap("How was your order?", $@"
            <p>{hello},</p>
            <p>Your order <strong>{id}</strong> was delivered a few days ago. Did it fit?
               Was the colour what you expected?</p>
            <p>If you have two minutes, please write what you thought. New customers read
               those lines before they order, and for a small shop like ours that matters
               more than anything we could say about ourselves.</p>
            <p style=""margin:1.4rem 0"">
              <a href=""https://www.mahalaxmifashionhub.com/reviews""
                 style=""background:#722f37;color:#fff;padding:.7rem 1.4rem;border-radius:8px;
                        text-decoration:none;font-weight:700"">Write a review</a>
            </p>
            <p>And if something was wrong, tell us instead — reply to this email or call
               <strong>+91 94294 29880</strong>. Returns are open for 7 days, no reason needed.</p>
            {lastWord}
            <p style=""color:#777;font-size:.9rem"">— Prakash, Mahalaxmi Fashion Hub, Balotra</p>");
    }
}
