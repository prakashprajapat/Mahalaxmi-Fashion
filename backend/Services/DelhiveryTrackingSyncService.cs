using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// Auto-syncs order status from Delhivery tracking, so the website reflects the
/// real shipment state without the admin updating it manually:
///   Delhivery "Picked / In Transit / Dispatched / Reached ..." → site "Transit"
///   Delhivery "Delivered"                                      → site "Delivered" (+DeliveredAt)
/// Statuses only move FORWARD (never Delivered → Transit), RTO/return flows are
/// left alone for manual handling. Runs shortly after startup, then every 3 hours.
/// </summary>
public class DelhiveryTrackingSyncService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DelhiveryTrackingSyncService> _log;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(3);

    // Orders in these states are checked against Delhivery.
    private static readonly string[] ActiveStatuses =
        ["Order Packed", "Ready for Shipping", "Shipped", "Transit"];

    public DelhiveryTrackingSyncService(IServiceScopeFactory scopeFactory, ILogger<DelhiveryTrackingSyncService> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await SyncAsync(stoppingToken); }
            catch (Exception ex) { _log.LogError(ex, "Delhivery tracking sync failed."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task SyncAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var delhivery = scope.ServiceProvider.GetRequiredService<DelhiveryService>();
        await SyncOnceAsync(db, delhivery, _log, ct);
    }

    /// <summary>
    /// One pass, and it says what it found.
    ///
    /// Split out of the loop above so the admin panel can run it on demand.
    /// Three hours is a long time to wait to learn whether a column is empty
    /// because the courier has no date or because nothing has asked yet, and
    /// until now there was no way to tell those apart from the outside: the
    /// sweep only ever logged when it changed something, so a pass that found
    /// nothing looked exactly like a pass that never happened.
    ///
    /// Returns how many orders were CHECKED as well as how many changed,
    /// because "0 checked" and "7 checked, 0 updated" are different problems.
    /// </summary>
    public static async Task<(int Checked, int Updated)> SyncOnceAsync(
        AppDbContext db, DelhiveryService delhivery, ILogger? log = null, CancellationToken ct = default)
    {
        var active = await db.SiteOrders
            .Where(o => o.Awb != null && o.Awb != "" && ActiveStatuses.Contains(o.Status))
            .ToListAsync(ct);
        if (active.Count == 0)
        {
            log?.LogInformation("Delhivery tracking sync: no order with a waybill is in transit.");
            return (0, 0);
        }

        int updated = 0;
        foreach (var chunk in active.Chunk(40))
        {
            var statuses = await delhivery.TrackAsync(chunk.Select(o => o.Awb!));
            foreach (var order in chunk)
            {
                if (!statuses.TryGetValue(order.Awb!, out var line)) continue;
                var s = line.Status.ToLowerInvariant();

                // The courier's own promise, kept on the order so the orders
                // list can show it without a tracking call per row. It moves:
                // a parcel that misses a connection gets a later date, and the
                // shop should see the later one.
                if (line.Expected is { } eta && order.ExpectedDelivery != eta)
                {
                    order.ExpectedDelivery = eta;
                    order.UpdatedAt = DateTimeOffset.UtcNow;
                    updated++;
                }

                if (s.Contains("delivered") && !s.Contains("undelivered") && !s.Contains("rto"))
                {
                    order.Status = "Delivered";
                    order.DeliveredAt ??= DateTimeOffset.UtcNow;
                    order.UpdatedAt = DateTimeOffset.UtcNow;
                    updated++;
                }
                else if ((s.Contains("picked") || s.Contains("transit") || s.Contains("dispatched") || s.Contains("reached"))
                         && order.Status != "Transit")
                {
                    order.Status = "Transit";
                    order.UpdatedAt = DateTimeOffset.UtcNow;
                    updated++;
                }
            }
        }

        if (updated > 0)
            await db.SaveChangesAsync(ct);

        // Logged every pass, not only the ones that changed something.
        log?.LogInformation(
            "Delhivery tracking sync: {Checked} order(s) checked, {Updated} updated.",
            active.Count, updated);

        return (active.Count, updated);
    }
}
