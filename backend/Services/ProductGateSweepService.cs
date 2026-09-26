using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Controllers;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// Keeps the website honest about what is on it.
///
/// The gate already runs whenever a product is saved: fail it and the product
/// is held back as a draft, and the Stock Manager refuses to push it live. So
/// nothing saved today can be published without passing. What was missing is
/// everything that went live BEFORE the gate existed, and anything that stops
/// passing later — a name edited into a stock code, a colour removed, a rule
/// tightened. Nothing re-checked those, so fifteen products sat on the website
/// and in the Google and Meta feeds that Merchant Center would refuse.
///
/// This sweep closes that. Every hour, every product is checked again and moved
/// to the side of the line it belongs on:
///
///   • on the website but failing  →  Draft. It leaves the website and both
///     feeds at once, because the feeds read the same status.
///   • Draft but now passing       →  back on the website, at the stock status
///     its own quantity says it should have.
///
/// Two things it will not touch. <b>Inactive</b> is a decision the owner made,
/// not a verdict the gate reached, so a passing Inactive product stays off.
/// And it never deletes or edits a product's content — only which side of the
/// line it sits on, which is always reversible by fixing what is missing.
/// </summary>
public class ProductGateSweepService : BackgroundService
{
    /// <summary>Where the last sweep's outcome is kept, so the admin screen can show it.</summary>
    public const string LastSweepSettingKey = "productGateLastSweep";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ProductGateSweepService> _log;

    // Hourly. The gate already catches everything at save time, so this is the
    // safety net rather than the mechanism — often enough that a mistake is off
    // the website within the hour, rare enough to be invisible.
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    public ProductGateSweepService(IServiceScopeFactory scopeFactory, ILogger<ProductGateSweepService> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the app finish starting before the first sweep.
        try { await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunOnceAsync(); }
            catch (Exception ex) { _log.LogError(ex, "Product gate sweep failed."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    /// <summary>One pass over the catalogue. Also called by the admin's "check now" button.</summary>
    public static async Task<SweepResult> SweepAsync(AppDbContext db, ILogger? log = null)
    {
        var products = await db.Products.ToListAsync();

        var takenDown = new List<string>();
        var putBack = new List<string>();

        foreach (var p in products)
        {
            var status = (p.StockStatus ?? "").Trim();

            // The owner switched this off. Not the gate's business, either way.
            if (string.Equals(status, "Inactive", StringComparison.OrdinalIgnoreCase))
                continue;

            var isDraft = string.Equals(status, ProductQualityGate.DraftStatus, StringComparison.OrdinalIgnoreCase);
            var passes = ProductQualityGate.Check(p).Passed;

            if (!isDraft && !passes)
            {
                p.StockStatus = ProductQualityGate.DraftStatus;
                p.UpdatedAt = DateTimeOffset.UtcNow;
                takenDown.Add(Label(p));
            }
            else if (isDraft && passes)
            {
                // Back on at the status its own stock says, so a product with
                // nothing left does not reappear claiming to be in stock.
                p.StockStatus = StockHelper.StatusForStockOnHand(p);
                p.UpdatedAt = DateTimeOffset.UtcNow;
                putBack.Add(Label(p));
            }
        }

        var result = new SweepResult(takenDown, putBack, products.Count, DateTimeOffset.UtcNow);

        if (takenDown.Count > 0 || putBack.Count > 0)
        {
            await db.SaveChangesAsync();
            // Without this the storefront serves the cached list and nothing
            // appears to have happened until the cache expires.
            ProductsController.BustCache();
            if (log is not null)
                log.LogWarning(
                    "Product gate sweep: {Down} taken off the website, {Up} put back on.",
                    takenDown.Count, putBack.Count);
        }

        await RecordAsync(db, result);
        return result;
    }

    private async Task RunOnceAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await SweepAsync(db, _log);
    }

    private static string Label(Product p) =>
        string.IsNullOrWhiteSpace(p.Sku) ? (p.Name ?? $"#{p.Id}") : $"{p.Sku} — {p.Name}";

    /// <summary>
    /// Keeps the outcome where the admin screen can read it. Only the first few
    /// names are stored: the point is to show what happened, not to become a log.
    /// </summary>
    private static async Task RecordAsync(AppDbContext db, SweepResult r)
    {
        var payload = JsonSerializer.Serialize(new
        {
            ranAt = r.RanAt,
            checkedCount = r.Checked,
            takenDown = r.TakenDown.Count,
            putBack = r.PutBack.Count,
            takenDownNames = r.TakenDown.Take(10).ToList(),
            putBackNames = r.PutBack.Take(10).ToList(),
        });

        var row = await db.SiteSettings.FirstOrDefaultAsync(x => x.Key == LastSweepSettingKey);
        if (row is null)
        {
            db.SiteSettings.Add(new SiteSetting { Key = LastSweepSettingKey, Value = payload });
        }
        else
        {
            row.Value = payload;
            row.UpdatedAt = DateTimeOffset.UtcNow;
        }
        await db.SaveChangesAsync();
    }

    public record SweepResult(List<string> TakenDown, List<string> PutBack, int Checked, DateTimeOffset RanAt);
}
