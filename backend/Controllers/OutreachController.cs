using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Authorization;

namespace MahalaxmiApi.Controllers;

// Who has already been written to.
//
// The Customers and Popup Leads screens both want the same two things: a list of
// everybody already invited, so the tick survives a logout, and somewhere to
// report a send that the server could not see for itself.
//
// That second one is WhatsApp. It is a link, not a request — the browser hands
// the chat to WhatsApp and the server never hears about it. So the page says so
// afterwards. It is a claim rather than a receipt, and it is treated as one:
// recorded, shown, and never counted as proof of delivery.
[ApiController]
[Route("api/outreach")]
[Authorize]
public class OutreachController : ControllerBase
{
    private readonly AppDbContext _db;
    public OutreachController(AppDbContext db) => _db = db;

    public record SentRequest(string? Audience, int PersonId, string? Channel);

    private static readonly string[] Audiences = { "customer", "lead" };
    private static readonly string[] Channels = { "email", "whatsapp" };

    /// <summary>Only the two words we expect, lower-cased; anything else is rejected.</summary>
    private static string? Allowed(string? value, string[] of)
    {
        var v = (value ?? "").Trim().ToLowerInvariant();
        return Array.IndexOf(of, v) >= 0 ? v : null;
    }

    // GET /api/outreach/sends?audience=customer
    //
    // The whole list rather than a page of it: it is two short columns, the
    // screens need every row they might draw a tick against, and asking per row
    // would be fifty requests to paint one page.
    [HttpGet("sends")]
    [RequirePerm("customers", "popup-leads", "campaigns")]
    public async Task<IActionResult> Sends([FromQuery] string? audience)
    {
        var who = Allowed(audience, Audiences);
        if (who is null)
            return BadRequest(new { success = false, message = "audience must be customer or lead." });

        // One row per person per channel — the most recent send, which is what
        // "when did we last write to them" means.
        var rows = await _db.InviteSends
            .Where(x => x.Audience == who)
            .GroupBy(x => new { x.PersonId, x.Channel })
            .Select(g => new
            {
                personId = g.Key.PersonId,
                channel = g.Key.Channel,
                sentAt = g.Max(x => x.SentAt),
                times = g.Count(),
            })
            .ToListAsync();

        return Ok(new { success = true, sends = rows });
    }

    // POST /api/outreach/sent   { audience, personId, channel }
    [HttpPost("sent")]
    [RequirePerm("customers", "popup-leads", "campaigns")]
    public async Task<IActionResult> Sent([FromBody] SentRequest req)
    {
        var who = Allowed(req?.Audience, Audiences);
        var how = Allowed(req?.Channel, Channels);
        if (who is null || how is null || req!.PersonId <= 0)
            return BadRequest(new { success = false, message = "audience, personId and channel are required." });

        // A person who is not there any more cannot have been written to, and a
        // row pointing at nothing would keep its tick for ever.
        var exists = who == "customer"
            ? await _db.Customers.AnyAsync(c => c.Id == req.PersonId)
            : await _db.PopupLeads.AnyAsync(l => l.Id == req.PersonId);
        if (!exists)
            return NotFound(new { success = false, message = "That person no longer exists." });

        _db.InviteSends.Add(new InviteSend
        {
            Audience = who,
            PersonId = req.PersonId,
            Channel = how,
            SentBy = User.FindFirst(ClaimTypes.Email)?.Value ?? User.Identity?.Name,
            SentAt = DateTimeOffset.UtcNow,
        });
        await _db.SaveChangesAsync();

        return Ok(new { success = true });
    }
}
