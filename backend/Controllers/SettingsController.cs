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

        // What Meta last said about our Conversions API call. Operational notes
        // for the shop, and an error body can echo back more than it should -
        // neither belongs in a bundle every visitor downloads.
        "metaCapiLastResult",
        "metaCapiLastSentAt",
        "metaCapiLastOkAt",
        "googleAdsOauthState",

        // What the hourly product-gate sweep last did. Nothing secret in it,
        // but the state of our own catalogue is not the world's business.
        "productGateLastSweep",

        // Public writing, but far too big for this bundle — the navbar and
        // footer read it on every page load. Served by /api/seo-content
        // instead, which is cached separately and fetched only by the pages
        // that actually render it.
        "seoBlog",
        "seoCollections",
        "seoCategories",
        "seoHomeTiles",
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

    // POST /api/settings/upload-media - a short video, or an image, for the
    // homepage Instagram strip.
    //
    // Separate from upload-image above because that one refuses anything whose
    // content type is not image/*, which is correct for a hero photograph and
    // useless for a reel. Same folder, same size envelope, same permission -
    // only the list of what it will accept is wider.
    //
    // The cap is deliberately the same 8 MB as the image path: nginx in front
    // of this is already configured to let a request that big through, and a
    // reel that cannot fit in 8 MB is one nobody on a phone should be asked to
    // download either. A 10-second 720p clip is one to three.
    [HttpPost("upload-media")]
    [Authorize]
    [RequirePerm("settings")]
    [RequestSizeLimit(9_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 9_000_000)]
    public async Task<IActionResult> UploadMedia([FromForm] IFormFile? file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { success = false, message = "No file received." });

        var type = (file.ContentType ?? "").ToLowerInvariant();
        if (!type.StartsWith("image/", StringComparison.Ordinal) && !type.StartsWith("video/", StringComparison.Ordinal))
            return BadRequest(new { success = false, message = "Only an image or a video can be uploaded here." });

        if (file.Length > 8L * 1024 * 1024)
            return BadRequest(new { success = false, message = "File too large (max 8 MB). A 10-second clip at 720p is usually 1-3 MB." });

        // The extension decides how it is served later, so it is checked against
        // a list rather than merely cleaned. An unknown one is refused instead
        // of being renamed to .jpg, which is what the image path does - harmless
        // for a photograph, but a video saved as .jpg will not play anywhere.
        var ext = Path.GetExtension(file.FileName ?? "").ToLowerInvariant();
        string[] allowed = { ".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm", ".mov" };
        if (!allowed.Contains(ext))
            return BadRequest(new { success = false, message = "Use a .jpg, .png, .webp, .mp4 or .webm file." });

        Directory.CreateDirectory(SiteImagesRoot());
        var name = $"site_{Guid.NewGuid():N}{ext}";
        await using (var fs = System.IO.File.Create(Path.Combine(SiteImagesRoot(), name)))
            await file.CopyToAsync(fs);

        return Ok(new { success = true, url = $"/api/settings/media/{name}" });
    }

    // GET /api/settings/media/{file} - stream a stored site image or video (public).
    //
    // Range processing is what makes a video usable: without it the browser can
    // only take the file from the beginning in one piece, so a tile that scrolls
    // into view downloads whole before the first frame appears.
    [HttpGet("media/{file}")]
    [AllowAnonymous]
    public IActionResult GetMedia(string file)
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
            ".mp4" => "video/mp4",
            ".webm" => "video/webm",
            ".mov" => "video/quicktime",
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
