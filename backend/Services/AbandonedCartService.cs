using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// One reminder about a basket somebody left behind.
///
/// This is the most recoverable sale a shop has: the person chose the item,
/// knew the price, and stopped — at a delivery charge, at a payment screen, or
/// because the bus came. Nothing was wrong with the shop, and nobody had to be
/// persuaded of anything. They just need reminding.
///
/// One email, two hours later, and never again for that basket. Two hours
/// because an hour catches people who are still shopping in another tab, and a
/// day is long enough for them to have bought it somewhere else. The row is
/// deleted when they order, so a reminder never reaches someone who already
/// paid — the thing that makes a shop look like it is not paying attention.
/// </summary>
public class AbandonedCartService : BackgroundService
{
    public const string EnabledSettingKey = "abandonedCartEnabled";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AbandonedCartService> _log;

    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan WaitAfterLastChange = TimeSpan.FromHours(2);

    // A basket older than this is not worth a reminder — the moment has gone,
    // and an email about last month's basket reads as a shop rummaging through
    // its records rather than one paying attention.
    private static readonly TimeSpan TooOld = TimeSpan.FromDays(7);

    private const int MaxPerRun = 40;

    public AbandonedCartService(IServiceScopeFactory scopeFactory, ILogger<AbandonedCartService> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(4), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunOnceAsync(stoppingToken); }
            catch (Exception ex) { _log.LogError(ex, "Abandoned cart sweep failed"); }

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
        var ready = now - WaitAfterLastChange;
        var floor = now - TooOld;

        var carts = await db.AbandonedCarts
            .Where(c => c.RemindedAt == null && c.ItemCount > 0 && c.UpdatedAt <= ready && c.UpdatedAt >= floor)
            .OrderBy(c => c.UpdatedAt)
            .Take(MaxPerRun)
            .ToListAsync(ct);

        if (carts.Count == 0) return;

        var ids = carts.Select(c => c.CustomerId).ToList();
        var people = await db.Customers
            .Where(c => ids.Contains(c.Id))
            .Select(c => new { c.Id, c.Name, c.Email })
            .ToListAsync(ct);

        foreach (var cart in carts)
        {
            if (ct.IsCancellationRequested) return;

            var who = people.FirstOrDefault(p => p.Id == cart.CustomerId);

            // Stamped first, and for every basket picked up — including ones
            // whose owner has no email. The stamp means "this basket has had
            // its turn", so a customer with no address is not collected again
            // every half hour forever.
            cart.RemindedAt = now;
            await db.SaveChangesAsync(ct);

            if (string.IsNullOrWhiteSpace(who?.Email)) continue;

            var first = (who.Name ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";
            try
            {
                await email.SendAsync(who.Email!, "You left something in your bag", Body(first, cart));
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Could not send the cart reminder to customer {Id}", cart.CustomerId);
            }
        }

        _log.LogInformation("Cart reminders: {Count} basket(s) handled", carts.Count);
    }

    private static string Body(string name, Models.AbandonedCart cart)
    {
        var hello = string.IsNullOrWhiteSpace(name) ? "Hello" : $"Hello {System.Net.WebUtility.HtmlEncode(name)}";

        var lines = "";
        try
        {
            var items = JsonSerializer.Deserialize<List<JsonElement>>(cart.ItemsJson) ?? new();
            foreach (var it in items.Take(4))
            {
                var n = it.TryGetProperty("name", out var nm) ? nm.GetString() ?? "" : "";
                var q = it.TryGetProperty("qty", out var qt) && qt.TryGetInt32(out var qi) ? qi : 1;
                if (string.IsNullOrWhiteSpace(n)) continue;
                lines += $"<li>{System.Net.WebUtility.HtmlEncode(n)}{(q > 1 ? $" × {q}" : "")}</li>";
            }
        }
        catch { /* the reminder is worth sending even if the list will not parse */ }

        var list = string.IsNullOrEmpty(lines) ? "" : $"<ul style=\"color:#444\">{lines}</ul>";

        // No discount, no countdown, no second email. A shop that offers money
        // off every time someone pauses teaches people to pause — and the ones
        // who were going to buy anyway cost it the difference.
        return AdminNotifier.Wrap("You left something in your bag", $@"
            <p>{hello},</p>
            <p>Your bag is still waiting at Mahalaxmi Fashion Hub.</p>
            {list}
            <p style=""margin:1.4rem 0"">
              <a href=""https://www.mahalaxmifashionhub.com/cart""
                 style=""background:#722f37;color:#fff;padding:.7rem 1.4rem;border-radius:8px;
                        text-decoration:none;font-weight:700"">Finish my order</a>
            </p>
            <p>Cash on Delivery is available — you pay when it reaches you. Free delivery above
               ₹999, and 7 days to return it if it is not right.</p>
            <p>If something held you up — a size, a colour, the price — just reply to this
               email or call <strong>+91 94294 29880</strong>.</p>
            <p style=""color:#777;font-size:.9rem"">— Prakash, Mahalaxmi Fashion Hub, Balotra</p>");
    }
}
