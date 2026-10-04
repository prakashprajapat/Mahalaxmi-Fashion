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
///   • once per order, ever — `review_asked_at` is stamped before the send is
///     attempted, so a crash or a restart cannot turn one ask into two
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

        var ready = DateTimeOffset.UtcNow - WaitAfterDelivery;

        var orders = await db.SiteOrders
            .Where(o => o.Status == "Delivered" && o.ReviewAskedAt == null && o.UpdatedAt <= ready)
            .OrderBy(o => o.UpdatedAt)
            .Take(MaxPerRun)
            .ToListAsync(ct);

        foreach (var o in orders)
        {
            if (ct.IsCancellationRequested) return;

            var (name, to) = Buyer(o.CustomerJson);

            // Stamped FIRST, and for every order including the ones with no
            // email. The stamp means "this order has had its turn", not "an
            // email left the building" — otherwise an order with no address
            // would be picked up again every six hours forever.
            o.ReviewAskedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            if (string.IsNullOrWhiteSpace(to)) continue;

            try
            {
                await email.SendAsync(to, "How was your order?", Body(name, o.OrderId));
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

    private static string Body(string name, string orderId)
    {
        var hello = string.IsNullOrWhiteSpace(name) ? "Hello" : $"Hello {System.Net.WebUtility.HtmlEncode(name)}";
        var id = System.Net.WebUtility.HtmlEncode(orderId);
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
            <p style=""color:#777;font-size:.9rem"">— Prakash, Mahalaxmi Fashion Hub, Balotra</p>");
    }
}
