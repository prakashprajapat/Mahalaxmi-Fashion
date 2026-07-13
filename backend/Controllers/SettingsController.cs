using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly IWebHostEnvironment _env;
    private const string PublicSettingsCacheKey = "public_settings";

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
    [Authorize(Policy = "AdminOnly")]
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
        var dict = settings.ToDictionary(s => s.Key, s => s.Value);
        // SEC-6: Remove all sensitive keys from public response
        dict.Remove("razorpay_key_secret");
        dict.Remove("delhivery_token");
        dict.Remove("whatsapp_api_key");
        dict.Remove("admin_password_hash");
        dict.Remove("admin_email");
        dict.Remove("msg91AuthKey");        // secret — never expose publicly
        dict.Remove("adminRecoveryPhone");  // owner's private mobile

        _cache.Set(PublicSettingsCacheKey, dict, TimeSpan.FromMinutes(5));
        return Ok(new { success = true, settings = dict });
    }

    // GET /api/settings/{key}
    [HttpGet("{key}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Get(string key)
    {
        var s = await _db.SiteSettings.FirstOrDefaultAsync(x => x.Key == key);
        if (s is null) return NotFound();
        return Ok(new { success = true, key = s.Key, value = s.Value });
    }

    // PUT /api/settings/{key}  (Admin only)
    [HttpPut("{key}")]
    [Authorize(Policy = "AdminOnly")]
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
    [Authorize(Policy = "AdminOnly")]
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
