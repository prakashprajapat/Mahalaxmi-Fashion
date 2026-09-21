using System.IO.Compression;
using System.Diagnostics;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using Microsoft.EntityFrameworkCore;

namespace MahalaxmiApi.Services;

/// <summary>
/// Emails a copy of the shop every night at 11:59 PM IST.
///
/// Two things would be painful to lose and are kept in two different places:
/// the database (orders, customers, products, settings) and the product
/// photos, which are files on disk under frontend/public/product-images and
/// are NOT in git — a lost server loses them for good.
///
/// The database is dumped in full every night; it is small and a partial
/// database is worth very little. The photos are 51 MB and counting, far past
/// what an inbox will take, so only the ones added since the last successful
/// run are attached. The watermark only moves past a photo that actually went
/// out, so a night that runs into the size cap sends the rest the next night
/// rather than skipping them.
/// </summary>
public class BackupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<BackupService> _log;

    // Where the shop's product photos are written (see ProductsController).
    private const string PhotoDir = "/var/www/mahalaxmi-nextjs/frontend/public/product-images";

    // Who gets the backup when nothing is set in Settings.
    private static readonly string[] DefaultRecipients =
    {
        "admin@mahalaxmifashionhub.com",
        "prakashprajapat683@gmail.com",
    };

    // Hostinger's SMTP will take more than this, but base64 inflates an
    // attachment by a third and a bounced backup is a backup that did not
    // happen. 18 MB of files leaves comfortable room under a 25 MB ceiling.
    private const long MaxAttachmentBytes = 18L * 1024 * 1024;

    private const string LastPhotoKey = "backupPhotoWatermarkUtc";
    private const string LastRunKey   = "backupLastRunUtc";
    private const string RecipientKey = "backupEmails";

    public BackupService(
        IServiceScopeFactory scopeFactory,
        IConfiguration config,
        ILogger<BackupService> log)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _log = log;
    }

    private static DateTimeOffset NowIst() => DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(5.5));

    /// <summary>The next 23:59 India time, as a UTC instant.</summary>
    internal static DateTimeOffset NextRunUtc(DateTimeOffset nowIst)
    {
        var todayAt2359 = new DateTimeOffset(
            nowIst.Year, nowIst.Month, nowIst.Day, 23, 59, 0, TimeSpan.FromHours(5.5));
        var next = nowIst < todayAt2359 ? todayAt2359 : todayAt2359.AddDays(1);
        return next.ToUniversalTime();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the app finish starting before the first calculation.
        try { await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            var wait = NextRunUtc(NowIst()) - DateTimeOffset.UtcNow;
            if (wait < TimeSpan.Zero) wait = TimeSpan.Zero;
            _log.LogInformation("Next backup in {Hours:0.0} h.", wait.TotalHours);

            try { await Task.Delay(wait, stoppingToken); }
            catch (OperationCanceledException) { break; }

            try { await RunAsync(stoppingToken); }
            catch (Exception ex) { _log.LogError(ex, "Nightly backup failed."); }

            // A tick past the hour so a fast run cannot fire twice for one night.
            try { await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    /// <summary>
    /// Take the backup and email it. Safe to call by hand (the admin endpoint
    /// does) — nothing here depends on the schedule.
    /// </summary>
    public async Task<BackupResult> RunAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email = scope.ServiceProvider.GetRequiredService<EmailService>();

        var result = new BackupResult { StartedUtc = DateTimeOffset.UtcNow };
        var files  = new List<EmailService.Attachment>();
        var stamp  = NowIst().ToString("yyyy-MM-dd");

        // ── the database ─────────────────────────────────────────────────────
        try
        {
            var dump = await DumpDatabaseAsync(ct);
            files.Add(new EmailService.Attachment(
                $"mahalaxmi-db-{stamp}.sql.gz", dump, "application/gzip"));
            result.DatabaseBytes = dump.LongLength;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Database dump failed.");
            result.DatabaseError = ex.Message;
        }

        // ── photos added since the backup that last carried them ─────────────
        // No watermark yet means this is the first ever run, and the photos
        // already on disk have never been backed up anywhere. Starting from the
        // beginning of time picks all of them up; the size cap then sends them
        // a batch a night until the backlog is cleared, which for the current
        // 51 MB is about three nights.
        var watermark = await ReadStampAsync(db, LastPhotoKey) ?? DateTimeOffset.MinValue;
        DateTimeOffset? advanceTo = null;
        try
        {
            var room = MaxAttachmentBytes - files.Sum(f => f.Content.LongLength);
            var (zip, count, newWatermark, leftOver) = ZipPhotosSince(watermark, room);
            if (count > 0)
            {
                files.Add(new EmailService.Attachment(
                    $"mahalaxmi-photos-{stamp}.zip", zip, "application/zip"));
                // Held back until the email is actually accepted. Moving the
                // watermark for a mail that never left would quietly drop those
                // photos out of every future backup.
                advanceTo = newWatermark;
            }
            result.PhotoCount = count;
            result.PhotosLeftForNextRun = leftOver;
            result.PhotoBytes = count > 0 ? zip.LongLength : 0;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Collecting new photos failed.");
            result.PhotoError = ex.Message;
        }

        // Nothing to send and nothing to report would be silence, and silence
        // is indistinguishable from a broken backup. The mail always goes.
        var to = await RecipientsAsync(db);
        result.Recipients = to;
        result.Sent = await email.SendAsync(to, SubjectFor(result, stamp), BodyFor(result, stamp), files);

        if (result.Sent)
        {
            if (advanceTo is not null) await WriteStampAsync(db, LastPhotoKey, advanceTo.Value);
        }
        else
        {
            _log.LogError("Backup was taken but the email did not go out — the same photos will be tried again tomorrow.");
        }
        await WriteStampAsync(db, LastRunKey, DateTimeOffset.UtcNow);

        _log.LogInformation(
            "Backup {Stamp}: db {Db} KB, {Photos} photos, sent={Sent}.",
            stamp, result.DatabaseBytes / 1024, result.PhotoCount, result.Sent);
        return result;
    }

    // ── pieces ───────────────────────────────────────────────────────────────

    /// <summary>
    /// pg_dump straight into gzip. Plain SQL rather than the custom format so
    /// it can be read, and restored, with nothing but psql and gunzip.
    /// </summary>
    private async Task<byte[]> DumpDatabaseAsync(CancellationToken ct)
    {
        var raw = _config.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("No DefaultConnection in configuration.");
        var cs = ParseConnectionString(raw);

        var psi = new ProcessStartInfo("pg_dump")
        {
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
        };
        psi.ArgumentList.Add("--host=" + Field(cs, "host", "localhost"));
        psi.ArgumentList.Add("--port=" + Field(cs, "port", "5432"));
        psi.ArgumentList.Add("--username=" + Field(cs, "username", "postgres"));
        psi.ArgumentList.Add("--dbname=" + Field(cs, "database", ""));
        psi.ArgumentList.Add("--no-owner");
        psi.ArgumentList.Add("--no-privileges");
        psi.Environment["PGPASSWORD"] = Field(cs, "password", "");

        // A missing pg_dump throws Win32Exception, whose message says only that
        // a process could not be started. Said plainly, with the cure.
        Process proc;
        try
        {
            proc = Process.Start(psi)
                ?? throw new InvalidOperationException("pg_dump did not start.");
        }
        catch (System.ComponentModel.Win32Exception)
        {
            throw new InvalidOperationException(
                "pg_dump is not installed on this server. Run: apt-get install -y postgresql-client");
        }
        using var _proc = proc;

        var gzipped = new MemoryStream();
        var stderr  = proc.StandardError.ReadToEndAsync(ct);
        using (var gz = new GZipStream(gzipped, CompressionLevel.Optimal, leaveOpen: true))
            await proc.StandardOutput.BaseStream.CopyToAsync(gz, ct);

        await proc.WaitForExitAsync(ct);
        if (proc.ExitCode != 0)
            throw new InvalidOperationException($"pg_dump exited {proc.ExitCode}: {(await stderr).Trim()}");

        var bytes = gzipped.ToArray();
        if (bytes.LongLength < 200)
            throw new InvalidOperationException("pg_dump produced an empty file.");
        return bytes;
    }

    /// <summary>
    /// Npgsql could parse this for us, but pulling the driver in just to read
    /// five fields is more coupling than a semicolon-separated list deserves.
    /// </summary>
    private static Dictionary<string, string> ParseConnectionString(string raw)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var part in raw.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = part.IndexOf('=');
            if (eq <= 0) continue;
            map[part[..eq].Trim()] = part[(eq + 1)..].Trim();
        }
        return map;
    }

    private static string Field(Dictionary<string, string> cs, string key, string fallback) =>
        cs.TryGetValue(key, out var v) && v.Length > 0 ? v : fallback;

    /// <summary>
    /// Zip the photos written after <paramref name="since"/>, oldest first,
    /// stopping before the size cap. Returns the zip, how many went in, the
    /// timestamp of the newest one included — the new watermark — and how many
    /// were left for the next run.
    /// </summary>
    private static (byte[] Zip, int Count, DateTimeOffset Watermark, int LeftOver) ZipPhotosSince(
        DateTimeOffset since, long budget)
    {
        if (!Directory.Exists(PhotoDir)) return (Array.Empty<byte>(), 0, since, 0);

        var fresh = new DirectoryInfo(PhotoDir)
            .EnumerateFiles()
            .Where(f => f.LastWriteTimeUtc > since.UtcDateTime)
            .OrderBy(f => f.LastWriteTimeUtc)
            .ToList();

        if (fresh.Count == 0) return (Array.Empty<byte>(), 0, since, 0);

        var buffer = new MemoryStream();
        var added = 0;
        var watermark = since;

        using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var f in fresh)
            {
                // Photos are already WebP or JPEG, so zip cannot squeeze them
                // further; the file's own size is a fair estimate of its cost.
                if (buffer.Length + f.Length > budget) break;
                zip.CreateEntryFromFile(f.FullName, f.Name, CompressionLevel.NoCompression);
                watermark = new DateTimeOffset(f.LastWriteTimeUtc, TimeSpan.Zero);
                added++;
            }
        }

        return (buffer.ToArray(), added, watermark, fresh.Count - added);
    }

    private async Task<List<string>> RecipientsAsync(AppDbContext db)
    {
        var configured = await db.SiteSettings
            .Where(s => s.Key == RecipientKey)
            .Select(s => s.Value)
            .FirstOrDefaultAsync();

        var list = (configured ?? "")
            .Split(new[] { ',', ';', ' ', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Trim())
            .Where(x => x.Contains('@'))
            .ToList();

        return list.Count > 0 ? list : DefaultRecipients.ToList();
    }

    private static async Task<DateTimeOffset?> ReadStampAsync(AppDbContext db, string key)
    {
        var raw = await db.SiteSettings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync();
        return DateTimeOffset.TryParse(raw, out var v) ? v.ToUniversalTime() : null;
    }

    private static async Task WriteStampAsync(AppDbContext db, string key, DateTimeOffset value)
    {
        var row = await db.SiteSettings.FirstOrDefaultAsync(s => s.Key == key);
        if (row is null) db.SiteSettings.Add(new SiteSetting { Key = key, Value = value.ToString("u") });
        else { row.Value = value.ToString("u"); row.UpdatedAt = DateTimeOffset.UtcNow; }
        await db.SaveChangesAsync();
    }

    // ── what lands in the inbox ──────────────────────────────────────────────

    private static string SubjectFor(BackupResult r, string stamp) =>
        r.DatabaseError is not null
            ? $"⚠ Mahalaxmi backup {stamp} — DATABASE FAILED"
            : "Mahalaxmi backup " + stamp + " — database + " + r.PhotoCount
              + (r.PhotoCount == 1 ? " new photo" : " new photos");

    private static string BodyFor(BackupResult r, string stamp)
    {
        static string Kb(long b) => b <= 0 ? "—" : $"{b / 1024:N0} KB";
        var rows = new List<string>
        {
            Row("Database", r.DatabaseError is null ? Kb(r.DatabaseBytes) : "FAILED — " + r.DatabaseError),
            Row("New photos", r.PhotoError is null
                ? $"{r.PhotoCount} ({Kb(r.PhotoBytes)})"
                : "FAILED — " + r.PhotoError),
        };
        if (r.PhotosLeftForNextRun > 0)
            rows.Add(Row("Waiting", $"{r.PhotosLeftForNextRun} more photo(s) — too big for one email, they go out tomorrow night"));

        var rowsHtml = string.Concat(rows);
        return $@"
<div style=""font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden"">
  <div style=""background:#fff;padding:18px 22px;border-bottom:3px solid #a7354d"">
    <h2 style=""margin:0;font-size:1.05rem;color:#a7354d"">Nightly backup — {stamp}</h2>
  </div>
  <div style=""padding:18px 22px"">
    <table style=""width:100%;border-collapse:collapse;font-size:.9rem"">{rowsHtml}</table>
    <p style=""margin:18px 0 0;font-size:.82rem;color:#777;line-height:1.7"">
      To restore the database:<br>
      <code style=""background:#f6f6f6;padding:2px 5px;border-radius:4px"">gunzip -c mahalaxmi-db-{stamp}.sql.gz | psql -U postgres -d mahalaxmi_fashionhub</code><br><br>
      The photo zip unpacks into
      <code style=""background:#f6f6f6;padding:2px 5px;border-radius:4px"">frontend/public/product-images</code>.
      Only photos added since the last backup are attached — keep the older emails.
    </p>
  </div>
</div>";

        static string Row(string k, string v) =>
            $@"<tr><td style=""padding:6px 0;color:#666"">{k}</td><td style=""padding:6px 0;text-align:right;font-weight:600"">{v}</td></tr>";
    }

    public class BackupResult
    {
        public DateTimeOffset StartedUtc { get; set; }
        public long DatabaseBytes { get; set; }
        public string? DatabaseError { get; set; }
        public int PhotoCount { get; set; }
        public long PhotoBytes { get; set; }
        public int PhotosLeftForNextRun { get; set; }
        public string? PhotoError { get; set; }
        public List<string> Recipients { get; set; } = new();
        public bool Sent { get; set; }
    }
}
