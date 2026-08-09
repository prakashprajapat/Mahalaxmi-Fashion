using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Controllers;

// Web Push (browser/app) notifications.
//   GET  /api/push/public-key  -> the VAPID public key the browser needs to subscribe
//   POST /api/push/subscribe   -> store a customer's push subscription (public)
//   POST /api/push/unsubscribe -> remove a subscription (public)
//   POST /api/push/send        -> broadcast a notification to everyone (admin only)
[ApiController]
[Route("api/push")]
public class PushController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<PushController> _log;

    public PushController(AppDbContext db, ILogger<PushController> log)
    {
        _db = db;
        _log = log;
    }

    // The browser needs the VAPID public key to create a subscription.
    [HttpGet("public-key")]
    public async Task<IActionResult> PublicKey()
    {
        var key = await _db.SiteSettings
            .Where(s => s.Key == "vapidPublicKey")
            .Select(s => s.Value)
            .FirstOrDefaultAsync() ?? "";
        return Ok(new { publicKey = key });
    }

    // Save (or refresh) a customer's push subscription. Called by the browser after
    // the visitor allows notifications. Public — anyone can opt in.
    [HttpPost("subscribe")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Subscribe([FromBody] PushSubscribeRequest req)
    {
        if (req == null || string.IsNullOrWhiteSpace(req.Endpoint))
            return BadRequest(new { success = false, message = "Missing endpoint" });

        var existing = await _db.PushSubscriptions
            .FirstOrDefaultAsync(p => p.Endpoint == req.Endpoint);

        if (existing == null)
        {
            _db.PushSubscriptions.Add(new MahalaxmiApi.Models.PushSubscription
            {
                Endpoint = req.Endpoint.Trim(),
                P256dh = req.P256dh?.Trim() ?? "",
                Auth = req.Auth?.Trim() ?? "",
            });
        }
        else
        {
            existing.P256dh = req.P256dh?.Trim() ?? existing.P256dh;
            existing.Auth = req.Auth?.Trim() ?? existing.Auth;
        }
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    // Remove a subscription (customer turned notifications off / browser unsubscribed).
    [HttpPost("unsubscribe")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Unsubscribe([FromBody] PushUnsubscribeRequest req)
    {
        if (req == null || string.IsNullOrWhiteSpace(req.Endpoint))
            return Ok(new { success = false });

        var rows = await _db.PushSubscriptions
            .Where(p => p.Endpoint == req.Endpoint)
            .ToListAsync();
        if (rows.Count > 0)
        {
            _db.PushSubscriptions.RemoveRange(rows);
            await _db.SaveChangesAsync();
        }
        return Ok(new { success = true });
    }

    // How many devices are subscribed (shown in the admin composer).
    [HttpGet("count")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Count()
    {
        var n = await _db.PushSubscriptions.CountAsync();
        return Ok(new { count = n });
    }

    // Broadcast a notification to every subscribed device. Admin only.
    [HttpPost("send")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Send([FromBody] PushSendRequest req)
    {
        if (req == null || string.IsNullOrWhiteSpace(req.Title) || string.IsNullOrWhiteSpace(req.Body))
            return BadRequest(new { success = false, message = "Title and body are required" });

        var pub = await _db.SiteSettings.Where(s => s.Key == "vapidPublicKey").Select(s => s.Value).FirstOrDefaultAsync() ?? "";
        var priv = await _db.SiteSettings.Where(s => s.Key == "vapidPrivateKey").Select(s => s.Value).FirstOrDefaultAsync() ?? "";
        var subject = await _db.SiteSettings.Where(s => s.Key == "vapidSubject").Select(s => s.Value).FirstOrDefaultAsync() ?? "mailto:mahalaxmifashionhub@gmail.com";

        if (string.IsNullOrWhiteSpace(pub) || string.IsNullOrWhiteSpace(priv))
            return StatusCode(500, new { success = false, message = "Push keys are not configured" });

        var subs = await _db.PushSubscriptions.ToListAsync();
        if (subs.Count == 0)
            return Ok(new { success = true, sent = 0, failed = 0, message = "No subscribers yet" });

        // Build the JSON payload the service worker's 'push' handler expects.
        var title = JsonEscapeString(req.Title.Trim());
        var body  = JsonEscapeString(req.Body.Trim());
        var url   = JsonEscapeString(string.IsNullOrWhiteSpace(req.Url) ? "https://www.mahalaxmifashionhub.com/" : req.Url!.Trim());
        var image = JsonEscapeString(req.Image?.Trim() ?? "");
        var icon  = "https://www.mahalaxmifashionhub.com/icon-192.png";
        var payload =
            "{\"title\":\"" + title + "\",\"body\":\"" + body + "\",\"url\":\"" + url +
            "\",\"image\":\"" + image + "\",\"icon\":\"" + icon + "\",\"tag\":\"mfh-offer\"}";

        var vapid = new WebPush.VapidDetails(subject, pub, priv);
        var client = new WebPush.WebPushClient();

        int sent = 0, failed = 0;
        var dead = new List<MahalaxmiApi.Models.PushSubscription>();

        foreach (var s in subs)
        {
            try
            {
                var sub = new WebPush.PushSubscription(s.Endpoint, s.P256dh, s.Auth);
                await client.SendNotificationAsync(sub, payload, vapid);
                sent++;
            }
            catch (WebPush.WebPushException ex)
            {
                failed++;
                // 404/410 => the subscription is gone; clean it up.
                if (ex.StatusCode == System.Net.HttpStatusCode.NotFound
                    || ex.StatusCode == System.Net.HttpStatusCode.Gone)
                    dead.Add(s);
            }
            catch (Exception ex)
            {
                failed++;
                _log.LogWarning(ex, "Push send failed for endpoint {Endpoint}", s.Endpoint);
            }
        }

        if (dead.Count > 0)
        {
            _db.PushSubscriptions.RemoveRange(dead);
            await _db.SaveChangesAsync();
        }

        return Ok(new { success = true, sent, failed, total = subs.Count });
    }

    // Minimal JSON string escaper for the payload values.
    private static string JsonEscapeString(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var sb = new System.Text.StringBuilder(s.Length + 8);
        foreach (var c in s)
        {
            switch (c)
            {
                case '"':  sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n");  break;
                case '\r': sb.Append("\\r");  break;
                case '\t': sb.Append("\\t");  break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }
}

public record PushSubscribeRequest(string? Endpoint, string? P256dh, string? Auth);
public record PushUnsubscribeRequest(string? Endpoint);
public record PushSendRequest(string? Title, string? Body, string? Url, string? Image);
