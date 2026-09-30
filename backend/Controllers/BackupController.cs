using MahalaxmiApi.Authorization;
using MahalaxmiApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// A button for the nightly backup. Without it the only way to know the
/// backup works is to wait until midnight and hope, which is a poor way to
/// find out that pg_dump is not installed.
/// </summary>
[ApiController]
[Route("api/backup")]
[Authorize]
[RequirePerm("settings")]
public class BackupController : ControllerBase
{
    private readonly BackupService _backup;

    public BackupController(BackupService backup) => _backup = backup;

    /// <summary>Take a backup right now and email it, exactly as the schedule would.</summary>
    [HttpPost("run")]
    public async Task<IActionResult> RunNow(CancellationToken ct)
    {
        var r = await _backup.RunAsync(ct);
        var ok = r.DatabaseError is null && r.PhotoError is null && r.Sent;
        return Ok(new
        {
            success = ok,
            sent = r.Sent,
            recipients = r.Recipients,
            databaseKb = r.DatabaseBytes / 1024,
            databaseError = r.DatabaseError,
            photoCount = r.PhotoCount,
            photoKb = r.PhotoBytes / 1024,
            photosWaiting = r.PhotosLeftForNextRun,
            photoError = r.PhotoError,
            message = ok
                ? "Backup taken and emailed."
                : r.DatabaseError is not null
                    ? "The database dump failed — see databaseError. On the server: apt-get install -y postgresql-client"
                    : !r.Sent
                        ? "The backup was taken but the email did not go out. Check the Email settings."
                        : "Finished with a problem — see the fields above.",
        });
    }

    /// <summary>When the backup last ran, and when it runs next.</summary>
    [HttpGet("status")]
    public async Task<IActionResult> Status()
    {
        var ist = TimeSpan.FromHours(5.5);
        var nowIst = DateTimeOffset.UtcNow.ToOffset(ist);
        var next = BackupService.NextRunUtc(nowIst);

        // Agli baar kab chalega, ye to ginti hai — usse kuch sabit nahi hota.
        // Asli sawal hamesha yahi hota hai ki pichhli baar chala tha ya nahi.
        var last = await _backup.LastRunUtcAsync();

        return Ok(new
        {
            success = true,
            nowIst = nowIst.ToString("yyyy-MM-dd HH:mm"),
            lastRunIst = last?.ToOffset(ist).ToString("yyyy-MM-dd HH:mm"),
            hoursSinceLastRun = last is null ? (double?)null
                : Math.Round((DateTimeOffset.UtcNow - last.Value).TotalHours, 1),
            nextRunIst = next.ToOffset(ist).ToString("yyyy-MM-dd HH:mm"),
            hoursAway = Math.Round((next - DateTimeOffset.UtcNow).TotalHours, 1),
        });
    }
}
