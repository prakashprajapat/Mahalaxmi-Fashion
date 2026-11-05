using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Login History - har customer (aur staff) ka Web / App login record.
/// Customers ke login "customers" permission wala dekh sakta hai; staff aur
/// owner ke login sirf owner.
/// </summary>
[ApiController]
[Route("api/login-events")]
[Authorize]
[RequirePerm("customers")]
public class LoginEventsController : ControllerBase
{
    private readonly AppDbContext _db;
    public LoginEventsController(AppDbContext db) => _db = db;

    // GET /api/login-events?type=customer&customerId=&q=&platform=&status=&from=&to=&page=1&limit=100
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? type = "customer",
        [FromQuery] string? customerId = null,
        [FromQuery] string? q = null,
        [FromQuery] string? platform = null,
        [FromQuery] string? status = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 100)
    {
        page = Math.Clamp(page, 1, 10_000);
        limit = Math.Clamp(limit, 1, 500);
        var staffSide = string.Equals(type, "staff", StringComparison.OrdinalIgnoreCase);
        if (staffSide && !User.IsOwner())
            return StatusCode(403, new { success = false, message = "Staff login history is for the owner only." });

        var query = _db.LoginEvents.AsNoTracking().AsQueryable();
        query = staffSide
            ? query.Where(e => e.SubjectType == TokenService.Staff || e.SubjectType == TokenService.Owner)
            : query.Where(e => e.SubjectType == TokenService.Customer);

        if (!string.IsNullOrWhiteSpace(customerId))
        {
            var cid = customerId.Trim();
            query = query.Where(e => e.SubjectId == cid);
        }
        if (platform is "web" or "app") query = query.Where(e => e.Platform == platform);
        if (status == "failed") query = query.Where(e => !e.Success);
        else if (status == "ok") query = query.Where(e => e.Success);

        // Dates are India days: from 00:00 IST to the end of 'to' IST.
        var ist = TimeSpan.FromHours(5.5);
        if (from is { } f) { var start = new DateTimeOffset(DateTime.SpecifyKind(f.Date, DateTimeKind.Unspecified), ist).ToUniversalTime(); query = query.Where(e => e.CreatedAt >= start); }
        if (to is { } t)   { var end = new DateTimeOffset(DateTime.SpecifyKind(t.Date.AddDays(1), DateTimeKind.Unspecified), ist).ToUniversalTime(); query = query.Where(e => e.CreatedAt < end); }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            var like = "%" + term.Replace("%", "").Replace("_", "") + "%";
            if (!staffSide)
            {
                var ids = await _db.Customers.AsNoTracking()
                    .Where(c => EF.Functions.ILike(c.FirstName + " " + c.LastName, like)
                             || EF.Functions.ILike(c.Phone, like)
                             || (c.Email != null && EF.Functions.ILike(c.Email, like)))
                    .Select(c => c.Id.ToString()).Take(1000).ToListAsync();
                query = query.Where(e => (e.LoginId != null && EF.Functions.ILike(e.LoginId, like))
                                      || (e.Ip != null && e.Ip == term)
                                      || (e.SubjectId != null && ids.Contains(e.SubjectId)));
            }
            else
            {
                query = query.Where(e => (e.LoginId != null && EF.Functions.ILike(e.LoginId, like))
                                      || (e.Ip != null && e.Ip == term));
            }
        }

        var total = await query.CountAsync();
        var rows = await query.OrderByDescending(e => e.CreatedAt)
            .Skip((page - 1) * limit).Take(limit).ToListAsync();

        // Names, phones and emails for the people on this page.
        var subjIds = rows.Where(r => r.SubjectId != null).Select(r => r.SubjectId!).Distinct().ToList();
        var intIds = subjIds.Select(s => int.TryParse(s, out var n) ? n : -1).Where(n => n > 0).ToList();
        var people = new Dictionary<string, (string Name, string? Phone, string? Email)>();
        if (!staffSide)
        {
            foreach (var c in await _db.Customers.AsNoTracking().Where(c => intIds.Contains(c.Id))
                         .Select(c => new { c.Id, c.FirstName, c.LastName, c.Phone, c.Email }).ToListAsync())
                people[c.Id.ToString()] = ((c.FirstName + " " + c.LastName).Trim(), c.Phone, c.Email);
        }
        else
        {
            foreach (var s in await _db.StaffMembers.AsNoTracking().Where(s => intIds.Contains(s.Id))
                         .Select(s => new { s.Id, s.Name, s.Username, s.Email }).ToListAsync())
                people[s.Id.ToString()] = (s.Name, s.Username, s.Email);
        }

        // Quick counts over the same filter (without paging).
        var todayStart = new DateTimeOffset(DateTime.SpecifyKind(DateTime.UtcNow.Add(ist).Date, DateTimeKind.Unspecified), ist).ToUniversalTime();
        var summary = new
        {
            today  = await query.CountAsync(e => e.CreatedAt >= todayStart && e.Success),
            web    = await query.CountAsync(e => e.Platform == "web" && e.Success),
            app    = await query.CountAsync(e => e.Platform == "app" && e.Success),
            failed = await query.CountAsync(e => !e.Success),
            people = await query.Where(e => e.Success && e.SubjectId != null).Select(e => e.SubjectId).Distinct().CountAsync(),
        };

        return Ok(new
        {
            success = true,
            total,
            page,
            summary,
            events = rows.Select(r =>
            {
                var who = r.SubjectId != null && people.TryGetValue(r.SubjectId, out var p) ? p : default;
                return new
                {
                    r.Id, r.SubjectType, r.SubjectId, r.LoginId,
                    name = who.Name, phone = who.Phone, email = who.Email,
                    r.Method, r.Platform, r.Device, r.Ip, r.UserAgent,
                    r.Success, r.Reason, r.CreatedAt,
                };
            }),
        });
    }

    public record DeleteOldRequest(DateTime? Before);

    // POST /api/login-events/delete-old  { before: "2026-10-01" }
    // Owner only: forgets every login record (customer and staff) from before
    // that day, India time, so the table does not grow for ever.
    [HttpPost("delete-old")]
    [RequireOwner]
    public async Task<IActionResult> DeleteOld([FromBody] DeleteOldRequest req)
    {
        if (req.Before is not { } before) return BadRequest(new { success = false, message = "Choose a date." });
        var cut = new DateTimeOffset(DateTime.SpecifyKind(before.Date, DateTimeKind.Unspecified), TimeSpan.FromHours(5.5)).ToUniversalTime();
        // The last 12 months always stay: the DPDP Rules 2025 ask for logs of
        // personal-data processing to be kept at least one year.
        var keep = DateTimeOffset.UtcNow.AddDays(-366);
        if (cut > keep) cut = keep;
        var n = await _db.LoginEvents.Where(e => e.CreatedAt < cut).ExecuteDeleteAsync();
        return Ok(new { success = true, deleted = n });
    }
}
