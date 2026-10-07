using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Authorization;

namespace MahalaxmiApi.Controllers;

/// <summary>How a person is recognised across the two lists: by what we write to.</summary>
public static class OutreachContact
{
    /// <summary>The last ten digits. The same number typed three ways is one number.</summary>
    public static string? Phone10(string? phone)
    {
        var digits = new string((phone ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length < 10) return null;
        return digits[^10..];
    }

    public static string? Email(string? email)
    {
        var e = (email ?? "").Trim().ToLowerInvariant();
        return e.Length == 0 ? null : e;
    }
}

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
//
// The matching is on the email and the mobile, not on the row number. The same
// person is very often on both lists — they leave an address in the popup, and
// later make an account with it — and matching by id meant the Customers screen
// showed them as untouched while the Popup Leads screen showed them as written
// to. They then got the same message twice, which is the exact thing the tick
// exists to prevent.
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

    /// <summary>Only the words we expect, lower-cased; anything else is rejected.</summary>
    private static string? Allowed(string? value, string[] of)
    {
        var v = (value ?? "").Trim().ToLowerInvariant();
        return Array.IndexOf(of, v) >= 0 ? v : null;
    }

    private sealed record Contact(int Id, string? Email, string? Phone);

    // GET /api/outreach/sends?audience=customer
    //
    // The whole list rather than a page of it: it is three short columns, the
    // screen needs every row it might draw a tick against, and asking per row
    // would be fifty requests to paint one page.
    [HttpGet("sends")]
    [RequirePerm("customers", "popup-leads", "campaigns")]
    public async Task<IActionResult> Sends([FromQuery] string? audience)
    {
        var who = Allowed(audience, Audiences);
        if (who is null)
            return BadRequest(new { success = false, message = "audience must be customer or lead." });

        var sends = await _db.InviteSends
            .Select(x => new { x.Channel, x.Email, x.Phone, x.SentAt })
            .ToListAsync();

        var people = who == "customer"
            ? await _db.Customers.Select(c => new Contact(c.Id, c.Email, c.Phone)).ToListAsync()
            : await _db.PopupLeads.Select(l => new Contact(l.Id, l.Email, l.Phone)).ToListAsync();

        // channel -> contact -> (when, how many). Two indexes, because a row may
        // carry an email, a phone, or both, and a person may match on either.
        var byEmail = new Dictionary<(string Channel, string Email), (DateTimeOffset At, int N)>();
        var byPhone = new Dictionary<(string Channel, string Phone), (DateTimeOffset At, int N)>();

        static void Note<TKey>(Dictionary<TKey, (DateTimeOffset At, int N)> into, TKey key, DateTimeOffset at)
            where TKey : notnull
        {
            if (into.TryGetValue(key, out var seen))
                into[key] = (at > seen.At ? at : seen.At, seen.N + 1);
            else
                into[key] = (at, 1);
        }

        foreach (var s in sends)
        {
            var channel = (s.Channel ?? "").Trim().ToLowerInvariant();
            if (channel.Length == 0) continue;

            var email = OutreachContact.Email(s.Email);
            if (email is not null) Note(byEmail, (channel, email), s.SentAt);

            var phone = OutreachContact.Phone10(s.Phone);
            if (phone is not null) Note(byPhone, (channel, phone), s.SentAt);
        }

        var rows = new List<object>();
        foreach (var p in people)
        {
            var email = OutreachContact.Email(p.Email);
            var phone = OutreachContact.Phone10(p.Phone);
            if (email is null && phone is null) continue;

            foreach (var channel in Channels)
            {
                var found = false;
                var at = DateTimeOffset.MinValue;
                var times = 0;

                if (email is not null && byEmail.TryGetValue((channel, email), out var e))
                {
                    found = true;
                    at = e.At;
                    times = e.N;
                }

                // Matched on both the address and the number: the later date, and
                // the larger count rather than the sum, because one send is
                // counted in both indexes.
                if (phone is not null && byPhone.TryGetValue((channel, phone), out var f))
                {
                    found = true;
                    if (f.At > at) at = f.At;
                    if (f.N > times) times = f.N;
                }

                if (found)
                    rows.Add(new { personId = p.Id, channel, sentAt = at, times });
            }
        }

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

        // The contact is read here and stored on the row, so the record keeps
        // meaning after the lead is deleted or the address is edited.
        var contact = who == "customer"
            ? await _db.Customers.Where(c => c.Id == req.PersonId)
                .Select(c => new Contact(c.Id, c.Email, c.Phone)).FirstOrDefaultAsync()
            : await _db.PopupLeads.Where(l => l.Id == req.PersonId)
                .Select(l => new Contact(l.Id, l.Email, l.Phone)).FirstOrDefaultAsync();

        if (contact is null)
            return NotFound(new { success = false, message = "That person no longer exists." });

        _db.InviteSends.Add(new InviteSend
        {
            Audience = who,
            PersonId = req.PersonId,
            Channel = how,
            Email = OutreachContact.Email(contact.Email),
            Phone = OutreachContact.Phone10(contact.Phone),
            SentBy = User.FindFirst(ClaimTypes.Email)?.Value ?? User.Identity?.Name,
            SentAt = DateTimeOffset.UtcNow,
        });
        await _db.SaveChangesAsync();

        return Ok(new { success = true });
    }
}
