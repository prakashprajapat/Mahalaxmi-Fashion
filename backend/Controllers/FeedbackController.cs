using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;
using MahalaxmiApi.Authorization;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/feedback")]
public class FeedbackController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AdminNotifier _notify;

    public FeedbackController(AppDbContext db, AdminNotifier notify)
    {
        _db = db;
        _notify = notify;
    }

    private static string Digits(string? s) => new((s ?? "").Where(char.IsDigit).ToArray());
    private static string Clip(string? s, int max) =>
        string.IsNullOrWhiteSpace(s) ? "" : (s.Trim().Length <= max ? s.Trim() : s.Trim()[..max]);

    private static readonly HashSet<string> Topics = new(StringComparer.OrdinalIgnoreCase)
        { "website", "product", "delivery", "payment", "idea", "other" };

    // POST /api/feedback — public. Anyone may say something; no account needed,
    // because the people most worth hearing from are the ones who did not buy.
    [HttpPost]
    public async Task<IActionResult> Submit([FromBody] FeedbackRequest req)
    {
        var message = Clip(req.Message, 4000);
        if (message.Length < 4)
            return BadRequest(new { success = false, message = "Please write a little more." });

        // The honeypot is a field no human ever sees. Anything in it is a bot,
        // and a bot is told everything went fine rather than taught what failed.
        if (!string.IsNullOrWhiteSpace(req.Website))
            return Ok(new { success = true });

        // Same person, same words, twice in ten minutes: a double-tap on a slow
        // connection, not two opinions.
        var since = DateTimeOffset.UtcNow.AddMinutes(-10);
        var phone = Digits(req.Phone);
        var email = Clip(req.Email, 160).ToLowerInvariant();
        var dupe = await _db.Feedbacks.AnyAsync(f =>
            f.CreatedAt >= since && f.Message == message &&
            ((phone != "" && f.Phone == phone) || (email != "" && f.Email == email)));
        if (dupe) return Ok(new { success = true, duplicate = true });

        var row = new Feedback
        {
            Name    = Clip(req.Name, 120),
            Email   = email,
            Phone   = phone,
            Topic   = Topics.Contains(req.Topic ?? "") ? req.Topic!.ToLowerInvariant() : "other",
            Rating  = req.Rating is >= 1 and <= 5 ? req.Rating : 0,
            Message = message,
            PageUrl = Clip(req.PageUrl, 500),
        };

        // Only trust a customer id that came with a real token - a number in the
        // body is whatever the sender felt like typing. The token carries it as
        // "sub", which ASP.NET usually remaps to NameIdentifier; both are read
        // rather than betting on which mapping is in force.
        if (User?.Identity?.IsAuthenticated == true)
        {
            var sub = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                   ?? User.FindFirst("sub")?.Value;
            if (int.TryParse(sub, out var cid)) row.CustomerId = cid;
        }

        _db.Feedbacks.Add(row);
        await _db.SaveChangesAsync();

        // A complaint that sits unread for a week is worse than no complaint box
        // at all, so this one goes out by email the moment it lands. The pieces
        // are built as plain locals first - an interpolated string holding three
        // conditionals and its own escaped quotes is a thing nobody can read, and
        // the compiler is the only one who ever notices the missing bracket.
        static string enc(string? x) => System.Net.WebUtility.HtmlEncode(x ?? "");
        var stars = row.Rating > 0 ? $"{row.Rating}/5" : "not rated";
        var who = enc(string.IsNullOrWhiteSpace(row.Name) ? "Anonymous" : row.Name);
        if (!string.IsNullOrWhiteSpace(row.Phone)) who += " &nbsp;|&nbsp; " + enc(row.Phone);
        if (!string.IsNullOrWhiteSpace(row.Email)) who += " &nbsp;|&nbsp; " + enc(row.Email);
        var pageLine = string.IsNullOrWhiteSpace(row.PageUrl)
            ? ""
            : "<p style='color:#888;font-size:12px'>Page: " + enc(row.PageUrl) + "</p>";

        await _notify.NotifyAsync(
            $"Feedback ({row.Topic}, {stars})",
            AdminNotifier.Wrap("New Feedback", $@"
                <p><strong>Topic:</strong> {enc(row.Topic)} &nbsp;|&nbsp; <strong>Rating:</strong> {stars}</p>
                <p><strong>From:</strong> {who}</p>
                <p style='background:#faf6f2;padding:12px;border-radius:8px;white-space:pre-wrap'>{enc(row.Message)}</p>
                {pageLine}"));

        return Ok(new { success = true, id = row.Id });
    }

    // GET /api/feedback — the shop's own list.
    [HttpGet]
    [Authorize]
    [RequirePerm("reports")]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int limit = 100)
    {
        page = Math.Max(1, page);
        limit = Math.Clamp(limit, 1, 500);

        var query = _db.Feedbacks.OrderByDescending(f => f.CreatedAt);
        var total = await query.CountAsync();
        var rows = await query.Skip((page - 1) * limit).Take(limit)
            .Select(f => new
            {
                f.Id, f.Name, f.Email, f.Phone, f.Topic, f.Rating, f.Message,
                f.PageUrl, f.CustomerId, f.IsHandled, f.AdminNote, f.CreatedAt,
            })
            .ToListAsync();

        return Ok(new { success = true, total, feedback = rows });
    }

    // PATCH /api/feedback/5 — tick it off, or keep a note against it.
    [HttpPatch("{id:int}")]
    [Authorize]
    [RequirePerm("reports")]
    public async Task<IActionResult> Update(int id, [FromBody] FeedbackUpdateRequest req)
    {
        var row = await _db.Feedbacks.FirstOrDefaultAsync(f => f.Id == id);
        if (row is null) return NotFound(new { success = false, message = "Not found." });

        if (req.IsHandled is not null) row.IsHandled = req.IsHandled.Value;
        if (req.AdminNote is not null) row.AdminNote = Clip(req.AdminNote, 2000);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    [HttpDelete("{id:int}")]
    [Authorize]
    [RequirePerm("reports")]
    public async Task<IActionResult> Delete(int id)
    {
        var row = await _db.Feedbacks.FirstOrDefaultAsync(f => f.Id == id);
        if (row is null) return NotFound(new { success = false, message = "Not found." });
        _db.Feedbacks.Remove(row);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }
}

public class FeedbackRequest
{
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Topic { get; set; }
    public int Rating { get; set; }
    public string? Message { get; set; }
    public string? PageUrl { get; set; }
    /// <summary>Honeypot. Hidden from people, filled in by bots.</summary>
    public string? Website { get; set; }
}

public class FeedbackUpdateRequest
{
    public bool? IsHandled { get; set; }
    public string? AdminNote { get; set; }
}
