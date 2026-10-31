using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// Auto-syncs order status from Delhivery tracking, so the website reflects the
/// real shipment state without the admin updating it manually:
///   Delhivery "Picked / In Transit / Dispatched / Reached ..." → site "Transit"
///   Delhivery "Delivered"                                      → site "Delivered" (+DeliveredAt)
///   Delhivery "Out for Return / RTO"                           → site "Return Transit"
///   Delhivery "RTO Delivered"                                  → site "Return" (+ refund opened)
/// Statuses only move FORWARD (never Delivered → Transit).
///
/// RTO used to be the one thing this deliberately did not do - "left alone for
/// manual handling" - and nothing ever handled it. A parcel nobody could
/// deliver turns around and comes home on the same waybill, while its scans go
/// on reading "Vehicle Departed" and "Trip Arrived" exactly as on the way out.
/// So the order sat in Transit, stayed in the Orders tab, never reached
/// Returns, and the money the customer had already paid was owed to them with
/// nothing anywhere saying so. Runs shortly after startup, then every 3 hours.
/// </summary>
public class DelhiveryTrackingSyncService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DelhiveryTrackingSyncService> _log;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(3);

    // Orders in these states are checked against Delhivery.
    //
    // "Return Transit" is in the list because a parcel coming back is still
    // moving, and the sweep is what notices it arrive. Left out, an RTO would
    // be spotted once and then never followed home.
    private static readonly string[] ActiveStatuses =
        ["Order Packed", "Ready for Shipping", "Shipped", "Transit", "Return Transit"];

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
        var notify = scope.ServiceProvider.GetService<AdminNotifier>();
        await SyncOnceAsync(db, delhivery, _log, ct, notify);
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
        AppDbContext db, DelhiveryService delhivery, ILogger? log = null, CancellationToken ct = default,
        AdminNotifier? notify = null)
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
        // Orders whose parcel has just come home. Collected rather than
        // handled inline because opening a refund saves the context, and
        // saving halfway through a chunk would write some status changes and
        // not others if the next call threw.
        var backAgain = new List<Models.SiteOrder>();

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

                // Written down on every pass, whatever else changes. The
                // follow-up lists on the dashboard are built from these two,
                // and a status that is three hours old is fine; one that was
                // only recorded when the ORDER status happened to change would
                // be weeks old on a parcel that sat in transit.
                var note = (line.Instruction ?? "").Trim();
                if (note.Length > 250) note = note.Substring(0, 250);
                var courierStatus = (line.Status ?? "").Trim();
                if (courierStatus.Length > 120) courierStatus = courierStatus.Substring(0, 120);

                if (order.CourierStatus != courierStatus || order.CourierNote != (note.Length > 0 ? note : null))
                {
                    order.CourierStatus = courierStatus;
                    order.CourierNote = note.Length > 0 ? note : null;
                    updated++;
                }
                // Touched every pass, so the screen can say how fresh this is
                // rather than leaving the owner to guess.
                order.CourierSeenAt = DateTimeOffset.UtcNow;

                var returning = DelhiveryService.IsReturnLeg(line.Status, line.StatusType);

                if (returning)
                {
                    // Coming home. Which half of the journey it is on decides
                    // everything below, so it is asked first - before the
                    // delivered and transit tests, both of which would
                    // otherwise match a returning parcel and say the opposite
                    // of what is happening.
                    if (DelhiveryService.IsBackWithUs(line.Status, line.StatusType))
                    {
                        if (order.Status != "Return")
                        {
                            order.Status = "Return";
                            order.UpdatedAt = DateTimeOffset.UtcNow;
                            updated++;

                            // The goods are back, so whatever the customer paid
                            // online is owed. Opened as pending - never paid
                            // here - so it lands on the Refunds screen for the
                            // owner to send to the bank or the wallet. A COD
                            // order with no advance owes nothing and opens
                            // nothing; RefundOpener decides that, in the one
                            // place that rule lives.
                            backAgain.Add(order);
                        }
                    }
                    else if (order.Status != "Return Transit" && order.Status != "Return")
                    {
                        order.Status = "Return Transit";
                        order.UpdatedAt = DateTimeOffset.UtcNow;
                        updated++;
                    }
                }
                else if (s.Contains("delivered") && !s.Contains("undelivered"))
                {
                    // The "rto" guard that used to sit here is gone because
                    // `returning` above now covers it, and covers more: a
                    // status reading "Return Delivered" carries no "rto" at
                    // all, so it used to land here and mark the order
                    // Delivered - telling the shop the customer had received a
                    // parcel that was at that moment back on their own shelf.
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

        // After the statuses are saved, so a refund row never exists against
        // an order still recorded as in transit.
        foreach (var order in backAgain)
        {
            try { await RefundOpener.OpenAsync(db, order, log, notify, ct); }
            catch (Exception ex)
            {
                // A refund that could not be opened must not stop the sweep
                // finishing the other parcels. It is said loudly instead: this
                // is money owed to somebody.
                log?.LogError(ex, "Order {Order} came back but its refund could not be opened.", order.OrderId);
            }
        }

        // Logged every pass, not only the ones that changed something.
        log?.LogInformation(
            "Delhivery tracking sync: {Checked} order(s) checked, {Updated} updated.",
            active.Count, updated);

        return (active.Count, updated);
    }
}
