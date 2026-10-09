using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>Ek kharabi: kaun sa hissa, aur insaan ke padhne layak wajah.</summary>
public record HealthProblem(string Part, string Detail);

/// <summary>
/// Wahi jaanch jo /api/health karta hai aur jo watchdog har paanch minute me
/// dohrata hai. Ek hi jagah likhi hai, taki endpoint aur alert kabhi alag-alag
/// baat na kahein - "site to theek dikh rahi thi" wali uljhan wahin se aati hai.
/// </summary>
public static class HealthChecks
{
    /// <summary>Isse kam disk bache to kharabi mano (bytes).</summary>
    public const long MinFreeDiskBytes = 1L * 1024 * 1024 * 1024;   // 1 GB

    public static async Task<List<HealthProblem>> RunAsync(
        AppDbContext db, IWebHostEnvironment env, CancellationToken ct)
    {
        var problems = new List<HealthProblem>();

        // 1. Database. CanConnectAsync() poora nahi batata - connection pool me
        //    pada hua socket bhi "ha" keh deta hai. Isliye ek asli query.
        try
        {
            using var dbCt = CancellationTokenSource.CreateLinkedTokenSource(ct);
            dbCt.CancelAfter(TimeSpan.FromSeconds(5));
            _ = await db.Database.ExecuteSqlRawAsync("SELECT 1", dbCt.Token);
        }
        catch (Exception ex)
        {
            problems.Add(new HealthProblem("database", Short(ex)));
        }

        // 2. Disk. Disk bharne par sab kuch ek saath girta hai - photo upload,
        //    backup, Postgres ka apna WAL - aur log bhi nahi likh pata, yaani
        //    baad me pata lagana sabse mushkil. Isliye girne se pehle batana.
        try
        {
            var root = Path.GetPathRoot(Path.GetFullPath(env.ContentRootPath));
            if (!string.IsNullOrEmpty(root))
            {
                var free = new DriveInfo(root).AvailableFreeSpace;
                if (free < MinFreeDiskBytes)
                    problems.Add(new HealthProblem("disk", $"sirf {free / (1024 * 1024)} MB bachi hai"));
            }
        }
        catch (Exception ex)
        {
            problems.Add(new HealthProblem("disk", Short(ex)));
        }

        return problems;
    }

    /// <summary>
    /// Exception ki pehli line hi kaafi hai. Poora stack trace mail me daalne
    /// se mail padhi nahi jati, aur /api/health to anonymous hai - wahan andar
    /// ka raasta bahar jana hi nahi chahiye.
    /// </summary>
    private static string Short(Exception ex)
    {
        var msg = (ex.Message ?? ex.GetType().Name).Trim();
        var nl = msg.IndexOf('\n');
        if (nl > 0) msg = msg[..nl].Trim();
        return msg.Length > 160 ? msg[..160] : msg;
    }
}
