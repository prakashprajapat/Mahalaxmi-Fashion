using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Controllers;

// Public endpoint that surfaces the store's Google (Maps) rating + latest reviews on the
// website — a strong trust signal that lifts conversions. It reads the Place ID + API key
// from Site Settings (admin-editable, like GA4/Pixel), calls the Google Places Details API
// SERVER-SIDE (the API key never reaches the browser), and caches the result for 6 hours to
// stay comfortably inside Google's free quota.
//
// Setup (one-time, by the owner):
//   1. Google Cloud Console → enable "Places API" → create an API key (restrict to Places API).
//   2. Find the store's Place ID (developers.google.com/maps/documentation/places/web-service/place-id).
//   3. Admin → Settings: googlePlaceId = <place id>, googlePlacesApiKey = <api key>.
[ApiController]
[Route("api/google-reviews")]
public class GoogleReviewsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly IHttpClientFactory _http;
    private const string CacheKey = "google_reviews_v1";

    public GoogleReviewsController(AppDbContext db, IMemoryCache cache, IHttpClientFactory http)
    {
        _db = db;
        _cache = cache;
        _http = http;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        if (_cache.TryGetValue(CacheKey, out object? cached) && cached is not null)
            return Ok(cached);

        var settings = await _db.SiteSettings
            .Where(s => s.Key == "googlePlaceId" || s.Key == "googlePlacesApiKey")
            .ToDictionaryAsync(s => s.Key, s => s.Value);

        settings.TryGetValue("googlePlaceId", out var placeId);
        settings.TryGetValue("googlePlacesApiKey", out var apiKey);

        if (string.IsNullOrWhiteSpace(placeId) || string.IsNullOrWhiteSpace(apiKey))
        {
            var notConfigured = new { success = true, configured = false, placeId = (string?)null, rating = (double?)null, total = 0, reviews = Array.Empty<object>() };
            _cache.Set(CacheKey, notConfigured, TimeSpan.FromMinutes(10));
            return Ok(notConfigured);
        }

        try
        {
            var url = "https://maps.googleapis.com/maps/api/place/details/json"
                    + $"?place_id={Uri.EscapeDataString(placeId)}"
                    + "&fields=rating,user_ratings_total,reviews"
                    + "&reviews_sort=newest&language=en"
                    + $"&key={Uri.EscapeDataString(apiKey)}";

            var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(8);
            var json = await client.GetStringAsync(url);

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var status = root.TryGetProperty("status", out var st) ? st.GetString() : "UNKNOWN";

            if (status != "OK" || !root.TryGetProperty("result", out var result))
            {
                var fail = new { success = true, configured = true, placeId, error = status, rating = (double?)null, total = 0, reviews = Array.Empty<object>() };
                _cache.Set(CacheKey, fail, TimeSpan.FromMinutes(10));
                return Ok(fail);
            }

            double? rating = result.TryGetProperty("rating", out var r) && r.ValueKind == JsonValueKind.Number ? r.GetDouble() : null;
            int total = result.TryGetProperty("user_ratings_total", out var t) && t.ValueKind == JsonValueKind.Number ? t.GetInt32() : 0;

            var reviews = new List<object>();
            if (result.TryGetProperty("reviews", out var revArr) && revArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var rev in revArr.EnumerateArray())
                {
                    reviews.Add(new
                    {
                        author       = rev.TryGetProperty("author_name", out var an) ? an.GetString() : "Google user",
                        profilePhoto = rev.TryGetProperty("profile_photo_url", out var pp) ? pp.GetString() : null,
                        rating       = rev.TryGetProperty("rating", out var rr) && rr.ValueKind == JsonValueKind.Number ? rr.GetInt32() : 5,
                        text         = rev.TryGetProperty("text", out var tx) ? tx.GetString() : "",
                        relativeTime = rev.TryGetProperty("relative_time_description", out var rt) ? rt.GetString() : "",
                    });
                }
            }

            var payload = new { success = true, configured = true, placeId, rating, total, reviews };
            _cache.Set(CacheKey, payload, TimeSpan.FromHours(6));
            return Ok(payload);
        }
        catch
        {
            var err = new { success = true, configured = true, placeId, error = "fetch_failed", rating = (double?)null, total = 0, reviews = Array.Empty<object>() };
            _cache.Set(CacheKey, err, TimeSpan.FromMinutes(5));
            return Ok(err);
        }
    }
}
