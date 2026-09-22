using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace MahalaxmiApi.Controllers;

// The SEO content the shop owner writes: blog articles, keyword collection
// pages, and the copy on the category pages.
//
// All three used to live in TypeScript source files, which meant every new
// article and every new keyword page needed a developer and a deploy. For a
// shop whose best chance on Google is answering the questions customers
// actually ask, that is the wrong place for it — writing has to be something
// the owner can do on a Tuesday evening.
//
// It is kept as JSON in site_settings rather than in tables of its own, so that
// putting it live needs no migration on the server. The code files stay where
// they are and act as the seed and the fallback: if these rows are empty, or the
// JSON in one of them is somehow unreadable, the site shows exactly what it
// shows today. Nothing here can make the shop's pages disappear.

[ApiController]
[Route("api/seo-content")]
public class SeoContentController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly ILogger<SeoContentController> _log;

    private const string CacheKey = "seo_content_v1";
    public const string BlogKey = "seoBlog";
    public const string CollectionsKey = "seoCollections";
    public const string CategoriesKey = "seoCategories";

    // Each row is read by the public site, so it has to stay small enough to
    // ship on a page render. 1 MB is roughly 200 full-length articles.
    private const int MaxSectionBytes = 1_000_000;
    private const int MaxContentChars = 200_000;

    private static readonly Regex SlugRe = new("^[a-z0-9][a-z0-9-]{1,80}$", RegexOptions.Compiled);

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public SeoContentController(AppDbContext db, IMemoryCache cache, ILogger<SeoContentController> log)
    {
        _db = db;
        _cache = cache;
        _log = log;
    }

    // ── Shapes ───────────────────────────────────────────────────────────────
    public class Faq
    {
        public string Q { get; set; } = "";
        public string A { get; set; } = "";
    }

    public class BlogPostDto
    {
        public string Slug { get; set; } = "";
        public string Title { get; set; } = "";
        public string Description { get; set; } = "";
        public string Date { get; set; } = "";
        public int ReadMinutes { get; set; } = 3;
        public string Excerpt { get; set; } = "";
        public string Content { get; set; } = "";
        /// <summary>Drafts are saved but never shown on the site or listed in the sitemap.</summary>
        public bool Published { get; set; } = true;
    }

    public class CollectionDto
    {
        public string Slug { get; set; } = "";
        public string Label { get; set; } = "";
        public string Title { get; set; } = "";
        public string Description { get; set; } = "";
        public string Eyebrow { get; set; } = "Collection";
        public string H1 { get; set; } = "";
        public string Sub { get; set; } = "";
        public List<string> Intro { get; set; } = new();
        public List<Faq> Faqs { get; set; } = new();
        public string Subcategory { get; set; } = "";
        public List<string>? Terms { get; set; }
        public decimal? MaxPrice { get; set; }
        public bool Published { get; set; } = true;
    }

    public class CategoryDto
    {
        public string Title { get; set; } = "";
        public string Description { get; set; } = "";
        public string Heading { get; set; } = "";
        public List<string> Intro { get; set; } = new();
        public List<Faq> Faqs { get; set; } = new();
    }

    // ── Read ─────────────────────────────────────────────────────────────────
    // Anonymous on purpose: the store pages render this content for visitors who
    // are not signed in. It is public writing — it is on the website.
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> Get()
    {
        if (_cache.TryGetValue(CacheKey, out object? hit) && hit is not null)
            return Ok(hit);

        var rows = await _db.SiteSettings
            .Where(s => s.Key == BlogKey || s.Key == CollectionsKey || s.Key == CategoriesKey)
            .ToListAsync();

        var payload = new
        {
            success = true,
            blog = Parse<List<BlogPostDto>>(rows, BlogKey) ?? new List<BlogPostDto>(),
            collections = Parse<List<CollectionDto>>(rows, CollectionsKey) ?? new List<CollectionDto>(),
            categories = Parse<Dictionary<string, CategoryDto>>(rows, CategoriesKey)
                         ?? new Dictionary<string, CategoryDto>(),
        };

        _cache.Set(CacheKey, payload, TimeSpan.FromMinutes(5));
        return Ok(payload);
    }

    private T? Parse<T>(List<SiteSetting> rows, string key) where T : class
    {
        var raw = rows.FirstOrDefault(r => r.Key == key)?.Value;
        if (string.IsNullOrWhiteSpace(raw)) return null;
        try
        {
            return JsonSerializer.Deserialize<T>(raw, Json);
        }
        catch (Exception e)
        {
            // Unreadable stored content must never take the site down: fall
            // through to the code defaults and leave a trail explaining why the
            // page looks older than the last edit. The catch is deliberately
            // broad — a malformed row is not worth a 500 on the shop's homepage,
            // whatever shape the malformation takes.
            _log.LogError(e, "SEO content in {Key} could not be read; the site is using its built-in defaults", key);
            return null;
        }
    }

    // ── Write ────────────────────────────────────────────────────────────────
    [HttpPut("blog")]
    [Authorize]
    [RequirePerm("settings")]
    public Task<IActionResult> SaveBlog([FromBody] List<BlogPostDto>? posts) =>
        Save(BlogKey, posts, ValidateBlog, 200);

    [HttpPut("collections")]
    [Authorize]
    [RequirePerm("settings")]
    public Task<IActionResult> SaveCollections([FromBody] List<CollectionDto>? items) =>
        Save(CollectionsKey, items, ValidateCollections, 100);

    [HttpPut("categories")]
    [Authorize]
    [RequirePerm("settings")]
    public async Task<IActionResult> SaveCategories([FromBody] Dictionary<string, CategoryDto>? cats)
    {
        if (cats is null) return BadRequest(new { success = false, message = "Nothing was sent." });
        if (cats.Count > 50) return BadRequest(new { success = false, message = "That is more than 50 categories." });

        foreach (var (key, c) in cats)
        {
            if (!SlugRe.IsMatch(key))
                return BadRequest(new { success = false, message = $"\"{key}\" is not a valid category name — use lowercase letters, numbers and hyphens." });
            if (string.IsNullOrWhiteSpace(c.Title))
                return BadRequest(new { success = false, message = $"The {key} page needs a title." });
            Trim(c);
        }

        return await Persist(CategoriesKey, cats);
    }

    private async Task<IActionResult> Save<T>(string key, List<T>? items, Func<List<T>, string?> validate, int max)
    {
        if (items is null) return BadRequest(new { success = false, message = "Nothing was sent." });
        if (items.Count > max) return BadRequest(new { success = false, message = $"That is more than {max} entries." });

        var problem = validate(items);
        if (problem is not null) return BadRequest(new { success = false, message = problem });

        return await Persist(key, items);
    }

    private async Task<IActionResult> Persist(string key, object value)
    {
        var json = JsonSerializer.Serialize(value, Json);
        if (json.Length > MaxSectionBytes)
            return BadRequest(new { success = false, message = "That is too large to save. Split it into fewer, shorter entries." });

        var row = await _db.SiteSettings.FirstOrDefaultAsync(s => s.Key == key);
        if (row is null)
            _db.SiteSettings.Add(new SiteSetting { Key = key, Value = json, UpdatedAt = DateTimeOffset.UtcNow });
        else
        {
            row.Value = json;
            row.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync();
        _cache.Remove(CacheKey);

        return Ok(new { success = true, savedBytes = json.Length });
    }

    // ── Validation ───────────────────────────────────────────────────────────
    // Every message here is written to be read by the shop owner, not by a
    // developer: it says which entry is wrong and what to do about it.
    private string? ValidateBlog(List<BlogPostDto> posts)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in posts)
        {
            p.Slug = (p.Slug ?? "").Trim().ToLowerInvariant();
            if (!SlugRe.IsMatch(p.Slug))
                return $"\"{p.Slug}\" is not a valid web address. Use lowercase letters, numbers and hyphens — for example cotton-nighty-guide.";
            if (!seen.Add(p.Slug))
                return $"Two articles both use the address \"{p.Slug}\". Each needs its own.";
            if (string.IsNullOrWhiteSpace(p.Title)) return $"The article \"{p.Slug}\" has no title.";
            if (p.Title.Length > 200) return $"The title of \"{p.Slug}\" is too long.";
            if (p.Description?.Length > 400) return $"The description of \"{p.Slug}\" is too long.";
            if (p.Excerpt?.Length > 600) return $"The excerpt of \"{p.Slug}\" is too long.";
            if ((p.Content ?? "").Length > MaxContentChars) return $"The article \"{p.Slug}\" is too long to save.";
            if (!DateTime.TryParse(p.Date, out _))
                return $"The date on \"{p.Slug}\" is not a date we can read. Use the date picker.";

            p.Title = p.Title.Trim();
            p.Description = (p.Description ?? "").Trim();
            p.Excerpt = (p.Excerpt ?? "").Trim();
            p.ReadMinutes = Math.Clamp(p.ReadMinutes <= 0 ? 3 : p.ReadMinutes, 1, 90);
            p.Content = SeoHtmlSanitizer.Clean(p.Content);
        }
        return null;
    }

    private string? ValidateCollections(List<CollectionDto> items)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var c in items)
        {
            c.Slug = (c.Slug ?? "").Trim().ToLowerInvariant();
            if (!SlugRe.IsMatch(c.Slug))
                return $"\"{c.Slug}\" is not a valid web address. Use lowercase letters, numbers and hyphens — for example cotton-nighty.";
            if (!seen.Add(c.Slug))
                return $"Two collections both use the address \"{c.Slug}\". Each needs its own.";
            if (string.IsNullOrWhiteSpace(c.Title)) return $"The collection \"{c.Slug}\" has no title.";
            if (string.IsNullOrWhiteSpace(c.Subcategory))
                return $"The collection \"{c.Slug}\" has no subcategory, so it would match no products at all.";
            if (c.Terms is { Count: > 30 }) return $"The collection \"{c.Slug}\" has too many match words.";
            if (c.MaxPrice is < 0) return $"The maximum price on \"{c.Slug}\" cannot be negative.";

            c.Label = string.IsNullOrWhiteSpace(c.Label) ? c.Title : c.Label.Trim();
            c.H1 = string.IsNullOrWhiteSpace(c.H1) ? c.Title : c.H1.Trim();
            c.Eyebrow = string.IsNullOrWhiteSpace(c.Eyebrow) ? "Collection" : c.Eyebrow.Trim();
            c.Subcategory = c.Subcategory.Trim();
            c.Terms = c.Terms?.Select(t => (t ?? "").Trim()).Where(t => t.Length > 0).ToList();
            if (c.Terms is { Count: 0 }) c.Terms = null;
            c.Intro = Clean(c.Intro, 10, MaxContentChars / 10);
            c.Faqs = Clean(c.Faqs, 20);
        }
        return null;
    }

    private static void Trim(CategoryDto c)
    {
        c.Title = c.Title.Trim();
        c.Description = (c.Description ?? "").Trim();
        c.Heading = (c.Heading ?? "").Trim();
        c.Intro = Clean(c.Intro, 10, 8000);
        c.Faqs = Clean(c.Faqs, 20);
    }

    /// <summary>Intro paragraphs are plain text — they are rendered as text, so they are trimmed, not sanitised.</summary>
    private static List<string> Clean(List<string>? paras, int max, int maxLen) =>
        (paras ?? new List<string>())
            .Select(p => (p ?? "").Trim())
            .Where(p => p.Length > 0)
            .Select(p => p.Length > maxLen ? p[..maxLen] : p)
            .Take(max)
            .ToList();

    private static List<Faq> Clean(List<Faq>? faqs, int max) =>
        (faqs ?? new List<Faq>())
            .Select(f => new Faq { Q = (f.Q ?? "").Trim(), A = (f.A ?? "").Trim() })
            .Where(f => f.Q.Length > 0 && f.A.Length > 0)
            .Take(max)
            .ToList();
}
