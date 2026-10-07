using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// Pulls the shop's own reels off Instagram and keeps the homepage strip filled.
///
/// WHY THE FILES ARE COPIED HERE. Instagram hands back a media_url and a
/// thumbnail_url on its own CDN, and those links expire - hours or days, Meta
/// does not promise a number. A homepage that stored the link would work for a
/// day and then show six broken tiles, and nobody would find out from a log.
/// Pointing at their CDN would also mean opening img-src and media-src in
/// next.config.js to cdninstagram.com, and those lists were narrowed on purpose
/// after the audit. So each reel is downloaded once, kept beside the hero
/// photographs, and served from our own domain. It also means a reel the shop
/// later deletes off Instagram does not vanish from the homepage mid-week.
///
/// WHAT THE SHOP HAS TO DO ONCE. An Instagram professional account (Business or
/// Creator - the switch is free and takes a minute in the app), an app in the
/// Meta developer dashboard, and the long-lived token pasted into the admin
/// screen. No App Review and no business verification: reading your OWN
/// account needs only Standard Access. The token is the single secret, it never
/// passes through anyone's hands but his, and "instagramAccessToken" is
/// credential-shaped so SettingsController keeps it out of the public bundle
/// automatically.
///
/// THE TOKEN WOULD OTHERWISE DIE IN 60 DAYS. Meta's long-lived token lasts 60
/// days and can be refreshed any time after its first 24 hours. This refreshes
/// it on every run, so the clock restarts daily and the shop never has to think
/// about it again - as long as the site is up for 60 consecutive days, which it
/// is. If it does lapse, nothing breaks loudly: the last sync's files stay on
/// the homepage and the admin screen says the connection needs renewing.
/// </summary>
public class InstagramSyncService : BackgroundService
{
    public const string TokenKey      = "instagramAccessToken";
    public const string RefreshedKey  = "instagramTokenRefreshedAt";
    public const string AutoKey       = "instagramAutoSync";
    public const string CountKey      = "instagramSyncCount";
    public const string OverridesKey  = "instagramOverrides";
    public const string LastSyncKey   = "instagramLastSync";
    public const string LastResultKey = "instagramLastResult";
    public const string ReelsKey      = "instagramReels";
    public const string HandleKey     = "instagramHandle";

    /// <summary>
    /// Past this, a clip is left as a still photograph instead.
    ///
    /// Not an arbitrary number: the tile is one of six on a phone, and a reel
    /// that will not fit in twelve megabytes is a minute of video nobody on
    /// mobile data should be handed. The tile still appears, still shows the
    /// cover frame, and the admin screen names the reel and says a shorter cut
    /// would move.
    /// </summary>
    private const long MaxVideoBytes = 12L * 1024 * 1024;

    private const long MaxPosterBytes = 4L * 1024 * 1024;

    /// <summary>Eight tiles is the most the strip renders; see lib/instagramReels.ts.</summary>
    private const int HardMaxReels = 8;

    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    /// <summary>Same key SettingsController caches the public bundle under.</summary>
    private const string PublicSettingsCacheKey = "public_settings";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _http;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<InstagramSyncService> _log;

    public InstagramSyncService(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory http,
        IWebHostEnvironment env,
        ILogger<InstagramSyncService> log)
    {
        _scopeFactory = scopeFactory;
        _http = http;
        _env = env;
        _log = log;
    }

    // The same folder the hero photographs live in, outside the publish
    // directory so a redeploy does not wipe it.
    private string MediaRoot() =>
        Path.GetFullPath(Path.Combine(_env.ContentRootPath, "..", "mahalaxmi-uploads", "site"));

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(3), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var cache = scope.ServiceProvider.GetRequiredService<IMemoryCache>();

                var auto = (await GetAsync(db, AutoKey) ?? "").Trim() == "true";
                if (auto) await SyncAsync(db, cache, stoppingToken);
            }
            catch (Exception ex) { _log.LogError(ex, "Instagram sync failed."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    public record SyncOutcome(bool Ok, string Message, int Reels, int Clips, List<string> Notes);

    /// <summary>One pull. Also what the admin screen's "Fetch now" button calls.</summary>
    public async Task<SyncOutcome> SyncAsync(AppDbContext db, IMemoryCache cache, CancellationToken ct)
    {
        var notes = new List<string>();

        var token = (await GetAsync(db, TokenKey) ?? "").Trim();
        if (token.Length == 0)
            return await FinishAsync(db, cache, new SyncOutcome(false, "Not connected to Instagram yet - paste the access token first.", 0, 0, notes));

        var http = _http.CreateClient("instagram");
        http.Timeout = TimeSpan.FromSeconds(60);

        // ── keep the 60 days rolling ────────────────────────────────────────
        // Meta refuses a refresh inside the token's first 24 hours, which is not
        // an error worth reporting - the token is new, so it has 60 days on it.
        var refreshedAt = DateTimeOffset.TryParse(await GetAsync(db, RefreshedKey) ?? "", out var r) ? r : DateTimeOffset.MinValue;
        if (DateTimeOffset.UtcNow - refreshedAt > TimeSpan.FromHours(24))
        {
            var fresh = await TryRefreshAsync(http, token, ct);
            if (fresh is not null)
            {
                token = fresh;
                await SetAsync(db, TokenKey, token);
                await SetAsync(db, RefreshedKey, DateTimeOffset.UtcNow.ToString("o"));
            }
        }

        // ── who we are ──────────────────────────────────────────────────────
        var me = await GetJsonAsync(http, $"https://graph.instagram.com/v21.0/me?fields=username&access_token={Uri.EscapeDataString(token)}", ct);
        if (me is null)
            return await FinishAsync(db, cache, new SyncOutcome(false, "Instagram did not answer. The token may have expired - reconnect on this screen.", 0, 0, notes));

        var username = Str(me["username"]);
        if (!string.IsNullOrWhiteSpace(username)) await SetAsync(db, HandleKey, username!);

        // ── the posts ───────────────────────────────────────────────────────
        var wanted = int.TryParse(await GetAsync(db, CountKey) ?? "", out var w) ? Math.Clamp(w, 1, HardMaxReels) : 6;

        var feed = await GetJsonAsync(http,
            "https://graph.instagram.com/v21.0/me/media"
            + "?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp"
            + $"&limit=25&access_token={Uri.EscapeDataString(token)}", ct);

        if (feed?["data"] is not JsonArray items)
            return await FinishAsync(db, cache, new SyncOutcome(false, "Instagram answered, but sent no posts. Is this the professional account?", 0, 0, notes));

        // His own choices, kept across every sync: which product a reel opens,
        // and a caption he would rather show than the Instagram one. Keyed by
        // the post's Instagram id, so they survive a reel moving up the row or
        // an older one dropping off the end.
        var overrides = ParseOverrides(await GetAsync(db, OverridesKey));

        Directory.CreateDirectory(MediaRoot());

        var reels = new JsonArray();
        var keep = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var clips = 0;

        foreach (var item in items)
        {
            if (reels.Count >= wanted) break;
            if (item is null) continue;

            var id = Str(item["id"]);
            if (string.IsNullOrWhiteSpace(id)) continue;

            var type = Str(item["media_type"]) ?? "";
            var product = Str(item["media_product_type"]) ?? "";
            var isVideo = type.Equals("VIDEO", StringComparison.OrdinalIgnoreCase)
                       || product.Equals("REELS", StringComparison.OrdinalIgnoreCase);

            // A video's still is thumbnail_url; a photo IS its own still.
            var posterUrl = Str(item["thumbnail_url"]);
            if (string.IsNullOrWhiteSpace(posterUrl) && !isVideo) posterUrl = Str(item["media_url"]);
            if (string.IsNullOrWhiteSpace(posterUrl)) continue;

            var posterName = $"ig_{Safe(id!)}_p.jpg";
            if (!await EnsureFileAsync(http, posterUrl!, posterName, MaxPosterBytes, ct)) continue;
            keep.Add(posterName);

            string? videoName = null;
            if (isVideo)
            {
                var videoUrl = Str(item["media_url"]);
                if (!string.IsNullOrWhiteSpace(videoUrl))
                {
                    var name = $"ig_{Safe(id!)}.mp4";
                    if (await EnsureFileAsync(http, videoUrl!, name, MaxVideoBytes, ct))
                    {
                        videoName = name;
                        keep.Add(name);
                        clips++;
                    }
                    else
                    {
                        notes.Add($"One reel from {Stamp(item)} was over 12 MB, so it shows as a photo. A shorter cut would move.");
                    }
                }
            }

            Override? mine = overrides.TryGetValue(id!, out var ov) ? ov : null;

            var reel = new JsonObject
            {
                ["id"] = id,
                ["poster"] = $"/api/settings/media/{posterName}",
            };
            if (videoName is not null) reel["video"] = $"/api/settings/media/{videoName}";

            var href = mine?.Href?.Trim();
            if (!string.IsNullOrWhiteSpace(href)) reel["href"] = href;

            var caption = !string.IsNullOrWhiteSpace(mine?.Caption)
                ? mine!.Caption!.Trim()
                : FirstLine(Str(item["caption"]));
            if (!string.IsNullOrWhiteSpace(caption)) reel["caption"] = caption;

            reels.Add(reel);
        }

        if (reels.Count == 0)
            return await FinishAsync(db, cache, new SyncOutcome(false, "No posts could be read from that account.", 0, 0, notes));

        await SetAsync(db, ReelsKey, reels.ToJsonString());
        Sweep(keep);

        var msg = $"{reels.Count} posts from Instagram, {clips} of them moving.";
        return await FinishAsync(db, cache, new SyncOutcome(true, msg, reels.Count, clips, notes));
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private record Override(string? Href, string? Caption);

    private static Dictionary<string, Override> ParseOverrides(string? raw)
    {
        var map = new Dictionary<string, Override>(StringComparer.Ordinal);
        if (string.IsNullOrWhiteSpace(raw)) return map;
        try
        {
            if (JsonNode.Parse(raw) is not JsonObject obj) return map;
            foreach (var (key, val) in obj)
            {
                if (val is not JsonObject o) continue;
                map[key] = new Override(Str(o["href"]), Str(o["caption"]));
            }
        }
        catch { /* a malformed note is not worth failing a sync over */ }
        return map;
    }

    /// <summary>
    /// The first line of an Instagram caption, without its hashtags.
    ///
    /// An Instagram caption is a paragraph and then thirty hashtags. Under a
    /// 9:16 tile there is room for one line, and the hashtags are the part that
    /// reads as somebody else's content pasted onto a shop.
    /// </summary>
    private static string FirstLine(string? caption)
    {
        if (string.IsNullOrWhiteSpace(caption)) return "";
        var line = caption.Split('\n', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";
        var words = line.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(x => !x.StartsWith('#') && !x.StartsWith('@'));
        var text = string.Join(' ', words).Trim();
        return text.Length <= 70 ? text : text[..69].TrimEnd() + "…";
    }

    /// <summary>
    /// A string out of a JSON field, whether or not the field is there.
    ///
    /// GetValue&lt;string&gt;() throws on a JSON null, which is not the same thing
    /// as an absent field and which ?. does not protect against. Instagram
    /// omits most fields it has nothing for, but "caption" on a post with no
    /// words, or media_url on a copyrighted clip, is exactly where a null turns
    /// up - and an exception there would take the whole six-hourly pull down
    /// over one post.
    /// </summary>
    private static string? Str(JsonNode? node)
    {
        try { return node?.GetValue<string>(); }
        catch { return null; }
    }

    private static string Safe(string id) =>
        new string(id.Where(char.IsLetterOrDigit).ToArray());

    private static string Stamp(JsonNode item) =>
        DateTimeOffset.TryParse(Str(item["timestamp"]) ?? "", out var t)
            ? t.ToString("d MMM") : "Instagram";

    private async Task<string?> TryRefreshAsync(HttpClient http, string token, CancellationToken ct)
    {
        var node = await GetJsonAsync(http,
            $"https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token={Uri.EscapeDataString(token)}", ct);
        var fresh = Str(node?["access_token"]);
        return string.IsNullOrWhiteSpace(fresh) ? null : fresh;
    }

    private async Task<JsonObject?> GetJsonAsync(HttpClient http, string url, CancellationToken ct)
    {
        try
        {
            using var res = await http.GetAsync(url, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                // The token itself is in the URL, so the URL never goes in a log.
                _log.LogWarning("Instagram replied {Status}: {Body}", (int)res.StatusCode, Trim(body));
                return null;
            }
            return JsonNode.Parse(body) as JsonObject;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Instagram request failed.");
            return null;
        }
    }

    private static string Trim(string s) => s.Length <= 400 ? s : s[..400];

    /// <summary>
    /// Download one file, unless it is already here.
    ///
    /// Instagram gives a post a permanent id, so the file name is settled by the
    /// post rather than by this run. A sync that finds a reel it already has
    /// downloads nothing - which is what makes a six-hourly job cost almost
    /// nothing, and what stops a new copy of the same reel piling up every time.
    /// </summary>
    private async Task<bool> EnsureFileAsync(HttpClient http, string url, string name, long maxBytes, CancellationToken ct)
    {
        var full = Path.Combine(MediaRoot(), name);
        if (File.Exists(full) && new FileInfo(full).Length > 0) return true;

        try
        {
            using var res = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!res.IsSuccessStatusCode) return false;

            var declared = res.Content.Headers.ContentLength;
            if (declared is not null && declared > maxBytes) return false;

            // The length header is advisory, so the stream is counted as it
            // arrives. Without this a server that under-declares could fill the
            // disk, and this folder has the hero photographs in it.
            var tmp = full + ".part";
            await using (var src = await res.Content.ReadAsStreamAsync(ct))
            await using (var dst = File.Create(tmp))
            {
                var buffer = new byte[81920];
                long total = 0;
                int read;
                while ((read = await src.ReadAsync(buffer, ct)) > 0)
                {
                    total += read;
                    if (total > maxBytes)
                    {
                        dst.Close();
                        File.Delete(tmp);
                        return false;
                    }
                    await dst.WriteAsync(buffer.AsMemory(0, read), ct);
                }
            }
            File.Move(tmp, full, overwrite: true);
            return true;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Could not download Instagram media {Name}.", name);
            return false;
        }
    }

    /// <summary>
    /// Throw away the ig_ files no reel points at any more.
    ///
    /// Only files this service named. A hero photograph is "site_...", so it is
    /// not a candidate however old it gets - the sweep cannot reach anything a
    /// person uploaded.
    /// </summary>
    private void Sweep(HashSet<string> keep)
    {
        try
        {
            foreach (var path in Directory.EnumerateFiles(MediaRoot(), "ig_*"))
            {
                var name = Path.GetFileName(path);
                if (keep.Contains(name)) continue;
                try { File.Delete(path); } catch { /* it will be offered again next time */ }
            }
        }
        catch { /* the folder may not exist yet */ }
    }

    private async Task<SyncOutcome> FinishAsync(AppDbContext db, IMemoryCache cache, SyncOutcome outcome)
    {
        await SetAsync(db, LastSyncKey, DateTimeOffset.UtcNow.ToString("o"));
        await SetAsync(db, LastResultKey, (outcome.Ok ? "ok: " : "failed: ") + outcome.Message);
        cache.Remove(PublicSettingsCacheKey);
        return outcome;
    }

    private static async Task<string?> GetAsync(AppDbContext db, string key) =>
        (await db.SiteSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Key == key))?.Value;

    private static async Task SetAsync(AppDbContext db, string key, string value)
    {
        try
        {
            var row = await db.SiteSettings.FirstOrDefaultAsync(x => x.Key == key);
            if (row is null) db.SiteSettings.Add(new SiteSetting { Key = key, Value = value });
            else { row.Value = value; row.UpdatedAt = DateTimeOffset.UtcNow; }
            await db.SaveChangesAsync();
        }
        catch { /* best effort */ }
    }
}
