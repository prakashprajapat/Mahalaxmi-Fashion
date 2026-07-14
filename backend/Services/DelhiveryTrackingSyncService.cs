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

        var active = await db.SiteOrders
            .Where(o => o.Awb != null && o.Awb != "" && ActiveStatuses.Contains(o.Status))
            .ToListAsync(ct);
        if (active.Count == 0) return;

        int updated = 0;
        foreach (var chunk in active.Chunk(40))
        {
            var statuses = await delhivery.TrackAsync(chunk.Select(o => o.Awb!));
            foreach (var order in chunk)
            {
                if (!statuses.TryGetValue(order.Awb!, out var raw)) continue;
                var s = raw.ToLowerInvariant();

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
        {
            await db.SaveChangesAsync(ct);
            _log.LogInformation("Delhivery tracking sync: {Count} order(s) updated.", updated);
        }
    }
}
