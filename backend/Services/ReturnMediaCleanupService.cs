using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Controllers;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// Auto-deletes return media for REJECTED returns once their 30-day retention window
/// (returnMediaPurgeAt, stamped when the return was rejected) has passed. Runs shortly
/// after startup and then every 12 hours. Approved returns have their media deleted
/// immediately at decision time, so they never reach this service.
/// </summary>
public class ReturnMediaCleanupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<ReturnMediaCleanupService> _log;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(12);

    public ReturnMediaCleanupService(
        IServiceScopeFactory scopeFactory,
        IWebHostEnvironment env,
        ILogger<ReturnMediaCleanupService> log)
    {
        _scopeFactory = scopeFactory;
        _env = env;
        _log = log;
    }

    // Same location the OrdersController writes to: /var/www/mahalaxmi-uploads/returns
    private string ReturnsRoot() =>
        Path.GetFullPath(Path.Combine(_env.ContentRootPath, "..", "mahalaxmi-uploads", "returns"));

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Small delay so the app finishes starting before the first sweep.
        try { await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await PurgeExpiredAsync(stoppingToken); }
            catch (Exception ex) { _log.LogError(ex, "Return media cleanup sweep failed."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task PurgeExpiredAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Only orders that carry a purge marker are candidates. The column is jsonb,
        // so it must be cast to text before LIKE — a plain string Contains() made EF
        // emit `jsonb ~~ text`, which Postgres rejects (SqlState 42883).
        var candidates = await db.SiteOrders
            .FromSqlRaw("SELECT * FROM site_orders WHERE raw_json IS NOT NULL AND raw_json::text LIKE '%returnMediaPurgeAt%'")
            .ToListAsync(ct);

        var now = DateTimeOffset.UtcNow;
        var root = ReturnsRoot();
        int purged = 0;

        foreach (var order in candidates)
        {
            if (JsonNode.Parse(order.RawJson!) is not JsonObject obj) continue;

            var alreadyDeleted = obj["returnMediaDeleted"]?.GetValue<bool>() ?? false;
            if (alreadyDeleted) continue;

            var purgeAtStr = obj["returnMediaPurgeAt"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(purgeAtStr)) continue;
            if (!DateTimeOffset.TryParse(purgeAtStr, out var purgeAt)) continue;
            if (purgeAt > now) continue;   // still within the 30-day window

            OrdersController.PurgeReturnMediaDir(root, order.OrderId);

            obj["returnMedia"] = new JsonObject
            {
                ["openingVideo"]  = "",
                ["closingVideo"]  = "",
                ["openingPhotos"] = new JsonArray(),
                ["closingPhotos"] = new JsonArray(),
            };
            obj["returnMediaDeleted"] = true;
            order.RawJson = obj.ToJsonString();
            order.UpdatedAt = now;
            purged++;
        }

        if (purged > 0)
        {
            await db.SaveChangesAsync(ct);
            _log.LogInformation("Return media cleanup: purged {Count} expired rejected return(s).", purged);
        }
    }
}
