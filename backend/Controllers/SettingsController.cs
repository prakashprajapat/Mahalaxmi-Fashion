using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

using MahalaxmiApi.Authorization;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly IWebHostEnvironment _env;
    private const string PublicSettingsCacheKey = "public_settings";

    // GET /api/settings has no login on purpose: the navbar, footer, hero and
    // offer banner all read it before anyone signs in. So whatever it returns is
    // readable by anyone on the internet.
    //
    // It used to strip a hand-written list of key names, which meant every NEW
    // secret was public until somebody remembered to add it to that list — the
    // Google OAuth client secret and the Google Ads refresh token had already
    // slipped through exactly that way. A name-shaped rule is safer: a key whose
    // name reads like a credential is private by default, so a secret added next
    // year is covered without anyone remembering anything.
    private static readonly Regex CredentialShapedName = new(
        "secret|token|password|passwd|apikey|api_key|authkey|auth_key|privatekey|private_key|credential|hash",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // Names that read like a credential but are meant to be seen by the browser.
    private static readonly HashSet<string> PublicAnyway = new(StringComparer.OrdinalIgnoreCase)
    {
        "vapidPublicKey",   // Web Push needs this in the browser; it is a public key
        "razorpay_key_id",  // the checkout key id, printed in the payment form anyway
        "cashfree_app_id",
    };

    // Not credential-shaped, but still nobody else's business.
    private static readonly HashSet<string> NeverPublic = new(StringComparer.OrdinalIgnoreCase)
    {
        "admin_email",
        "adminRecoveryPhone",   // the owner's private mobile
        "googleAdsOauthState",
    };

    private static bool IsPublic(string key) =>
        !NeverPublic.Contains(key) && (PublicAnyway.Contains(key) || !CredentialShapedName.IsMatch(key));

    public SettingsController(AppDbContext db, IMemoryCache cache, IWebHostEnvironment env)
    {
        _db = db;
        _cache = cache;
        _env = env;
    }

    // Site images (hero banners etc.) live outside repo & publish dir — survives redeploys.
    private string SiteImagesRoot() =>
        Path.GetFullPath(Path.Combine(_env.ContentRootPath, "..", "mahalaxmi-uploads", "site"));

    // POST /api/settings/upload-image — admin uploads a site image (hero photo etc.), returns URL.
    [HttpPost("upload-image")]
    [Authorize]
    [RequirePerm("settings")]
    [RequestSizeLimit(9_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 9_000_000)]
    public async Task<IActionResult> UploadImage([FromForm] IFormFile? file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { success = false, message = "No file received." });
        if (!(file.ContentType ?? "").StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { success = false, message = "Only image files are allowed." });
        if (file.Length > 8L * 1024 * 1024)
            return BadRequest(new { success = false, message = "Image too large (max 8 MB)." });

        var ext = Path.GetExtension(file.FileName ?? "");
        ext = new string(ext.Where(c => char.IsLetterOrDigit(c) || c == '.').ToArray()).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(ext) || ext.Length > 6) ext = ".jpg";

        Directory.CreateDirectory(SiteImagesRoot());
        var name = $"site_{Guid.NewGuid():N}{ext}";
        await using (var fs = System.IO.File.Create(Path.Combine(SiteImagesRoot(), name)))
            await file.CopyToAsync(fs);

        return Ok(new { success = true, url = $"/api/settings/image/{name}" });
    }

    // GET /api/settings/image/{file} — stream a stored site image (public).
    [HttpGet("image/{file}")]
    [AllowAnonymous]
    public IActionResult GetImage(string file)
    {
        var safe = new string((file ?? "").Where(c => char.IsLetterOrDigit(c) || c == '_' || c == '.' || c == '-').ToArray());
        if (string.IsNullOrEmpty(safe) || safe.Contains(".."))
            return NotFound();
        var full = Path.Combine(SiteImagesRoot(), safe);
        if (!System.IO.File.Exists(full))
            return NotFound();
        var mime = Path.GetExtension(full).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => "image/jpeg"
        };
        return File(System.IO.File.OpenRead(full), mime, enableRangeProcessing: true);
    }

    // GET /api/settings  (Public read)
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        // PERF-2: Cache public settings for 5 minutes
        if (_cache.TryGetValue(PublicSettingsCacheKey, out Dictionary<string, string>? cached) && cached is not null)
            return Ok(new { success = true, settings = cached });

        var settings = await _db.SiteSettings.ToListAsync();
        var dict = settings.Where(x => IsPublic(x.Key)).ToDictionary(x => x.Key, x => x.Value);

        _cache.Set(PublicSettingsCacheKey, dict, TimeSpan.FromMinutes(5));
        return Ok(new { success = true, settings = dict });
    }

    // GET /api/settings/admin — every setting, secrets included, for the admin
    // Settings screen. Separate from the public one above so that hiding a secret
    // from the world does not also blank the box the owner types it into.
    [HttpGet("admin")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> GetAllForAdmin()
    {
        var settings = await _db.SiteSettings.ToListAsync();
        return Ok(new { success = true, settings = settings.ToDictionary(x => x.Key, x => x.Value) });
    }

    // GET /api/settings/{key}
    [HttpGet("{key}")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> Get(string key)
    {
        var s = await _db.SiteSettings.FirstOrDefaultAsync(x => x.Key == key);
        if (s is null) return NotFound();
        return Ok(new { success = true, key = s.Key, value = s.Value });
    }

    // PUT /api/settings/{key}  (Admin only)
    [HttpPut("{key}")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> Upsert(string key, [FromBody] SettingUpsertRequest req)
    {
        var s = await _db.SiteSettings.FirstOrDefaultAsync(x => x.Key == key);
        if (s is null)
        {
            _db.SiteSettings.Add(new SiteSetting { Key = key, Value = req.Value });
        }
        else
        {
            s.Value = req.Value;
            s.UpdatedAt = DateTimeOffset.UtcNow;
        }
        await _db.SaveChangesAsync();
        _cache.Remove(PublicSettingsCacheKey);
        return Ok(new { success = true });
    }

    // POST /api/settings/bulk  (Admin only)
    [HttpPost("bulk")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> BulkUpsert([FromBody] Dictionary<string, string> settings)
    {
        // PERF-3: Fetch all relevant settings in one query instead of N queries
        var keys = settings.Keys.ToList();
        var existing = await _db.SiteSettings.Where(s => keys.Contains(s.Key)).ToListAsync();
        var existingDict = existing.ToDictionary(s => s.Key);

        foreach (var (key, value) in settings)
        {
            if (existingDict.TryGetValue(key, out var s))
            {
                s.Value = value;
                s.UpdatedAt = DateTimeOffset.UtcNow;
            }
            else
                _db.SiteSettings.Add(new SiteSetting { Key = key, Value = value });
        }
        await _db.SaveChangesAsync();

        // PERF-2: Invalidate public settings cache after update
        _cache.Remove(PublicSettingsCacheKey);

        return Ok(new { success = true });
    }
}

public record SettingUpsertRequest(string Value);
