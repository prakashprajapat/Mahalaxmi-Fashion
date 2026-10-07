using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// The admin side of the homepage's Instagram strip: is it connected, what
/// happened last time, and pull it again now.
///
/// Deliberately small. Everything that does the work is in
/// InstagramSyncService, which the six-hourly background job and the button on
/// this screen both call - so what the owner sees when he presses Fetch now is
/// exactly what will happen on its own at four in the morning, and not a
/// second code path that behaves slightly differently.
///
/// Nothing here hands the access token back out. The status says whether there
/// is one and when it was last renewed, which is all anybody needs to know to
/// tell a working connection from a lapsed one.
/// </summary>
[ApiController]
[Route("api/instagram")]
[Authorize]
[RequirePerm("settings")]
public class InstagramController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly InstagramSyncService _sync;

    public InstagramController(AppDbContext db, IMemoryCache cache, InstagramSyncService sync)
    {
        _db = db;
        _cache = cache;
        _sync = sync;
    }

    // GET /api/instagram/status
    [HttpGet("status")]
    public async Task<IActionResult> Status()
    {
        var token = (await Get(InstagramSyncService.TokenKey) ?? "").Trim();
        var refreshed = await Get(InstagramSyncService.RefreshedKey);

        return Ok(new
        {
            success = true,
            connected = token.Length > 0,
            handle = await Get(InstagramSyncService.HandleKey) ?? "",
            auto = (await Get(InstagramSyncService.AutoKey) ?? "").Trim() == "true",
            count = int.TryParse(await Get(InstagramSyncService.CountKey) ?? "", out var c) ? c : 6,
            tokenRenewedAt = refreshed,
            // 60 days from the last renewal. Shown so a connection that has
            // gone quiet is visible as a date rather than as an empty strip.
            tokenExpiresAt = DateTimeOffset.TryParse(refreshed ?? "", out var r)
                ? r.AddDays(60).ToString("o") : null,
            lastSyncAt = await Get(InstagramSyncService.LastSyncKey),
            lastResult = await Get(InstagramSyncService.LastResultKey),
        });
    }

    // POST /api/instagram/sync — pull now.
    [HttpPost("sync")]
    public async Task<IActionResult> Sync(CancellationToken ct)
    {
        var outcome = await _sync.SyncAsync(_db, _cache, ct);
        return Ok(new
        {
            success = outcome.Ok,
            message = outcome.Message,
            reels = outcome.Reels,
            clips = outcome.Clips,
            notes = outcome.Notes,
        });
    }

    private async Task<string?> Get(string key) =>
        (await _db.SiteSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Key == key))?.Value;
}
