using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;

using MahalaxmiApi.Authorization;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/popup-leads")]
public class PopupLeadsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AdminNotifier _notify;
    private readonly EmailService _email;
    private readonly ILogger<PopupLeadsController> _log;
    private readonly WelcomeOutreach _welcome;
    public PopupLeadsController(AppDbContext db, AdminNotifier notify, EmailService email, ILogger<PopupLeadsController> log, WelcomeOutreach welcome)
    {
        _db = db;
        _notify = notify;
        _email = email;
        _log = log;
        _welcome = welcome;
    }


    // Public — called from WelcomePopup form
    [HttpPost]
    public async Task<IActionResult> Submit([FromBody] PopupLeadRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) && string.IsNullOrWhiteSpace(req.Phone))
            return BadRequest(new { success = false, message = "Email or phone required." });

        // One row per person, for good.
        //
        // This used to ignore a repeat only within 24 hours, which is not how
        // the popup is met: the same shopper sees it again weeks later on a new
        // phone or after clearing their browser, fills it in once more out of
        // habit, and the list grew a second Dinesh with the same number — months
        // apart, so the day-long window never caught it. A list with the same
        // person twice gets them messaged twice, which is how a shop earns a
        // block on WhatsApp.
        //
        // Email is matched lowercased and the phone on its digits, because the
        // same person types "+91 87490 39868" one time and "8749039868" the
        // next, and those are not two people.
        // CustomerKeys, not a private helper. The private one kept every digit,
        // so +91 87490 39868 became 918749039868 and never matched the
        // 8749039868 the same person typed next time - the exact case the
        // comment above claims to handle. Last ten digits is what identifies
        // the phone, and CustomerKeys has said so everywhere else all along.
        var email = CustomerKeys.Email(req.Email);
        var phone = CustomerKeys.Phone(req.Phone);

        // A nine-digit number and a string with no @ are not an identity. The
        // check at the top of this method saw the raw text; this one sees what
        // is left of it, so a lead that cannot be recognised later is refused
        // now rather than saved as a row nobody can match or message.
        if (email is null && phone is null)
            return BadRequest(new { success = false, message = "A valid email address or 10-digit mobile number is required." });

        // A repeat is the same number AND the same address. Not either.
        //
        // One man reaches the shop on two numbers from one address, and from
        // one number under two addresses - three ways to reach him, all three
        // worth having on the list. Refusing on either column alone would have
        // kept the first and thrown the other two away.
        //
        // When she leaves only one of the two, that one deciding is right: she
        // has told us nothing we did not already have, so there is nothing to
        // add. Hence the null checks read as -- this field, if she gave one,
        // must match.
        var existing = await _db.PopupLeads.FirstOrDefaultAsync(l =>
            (email == null || l.Email == email) &&
            (phone == null || l.Phone == phone));

        if (existing is not null)
        {
            // Keep the first sighting — when they first showed interest is worth
            // more than when they last retyped it — but take a name if the first
            // time they did not leave one.
            if (string.IsNullOrWhiteSpace(existing.Name) && !string.IsNullOrWhiteSpace(req.Name))
            {
                existing.Name = req.Name.Trim();
                await _db.SaveChangesAsync();
            }
            return Ok(new { success = true, duplicate = true });
        }

        {
            // Held in a variable rather than added anonymously, because the
            // welcome message below needs the row's id - and looking it back up
            // by email-and-phone would be a second query answering a question
            // SaveChanges has just answered.
            var lead = new PopupLead
            {
                Name   = req.Name?.Trim(),
                Email  = email,
                Phone  = phone,
                Source = req.Source ?? "welcome_popup",
            };
            _db.PopupLeads.Add(lead);
            try
            {
                await _db.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Two submits in the same instant: neither saw the other, and
                // the unique index let one through. The person is on the list,
                // which is all they asked for, so this is not an error to show
                // them - it is the same answer the duplicate branch gives.
                return Ok(new { success = true, duplicate = true });
            }

            // Notify admin of the new popup lead (email — fire-and-forget).
            await _notify.NotifyAsync("New popup lead",
                AdminNotifier.Wrap("New Lead Captured", $@"
                    <p><strong>Name:</strong> {System.Net.WebUtility.HtmlEncode(req.Name ?? "")}</p>
                    <p><strong>Email:</strong> {System.Net.WebUtility.HtmlEncode(req.Email ?? "")}</p>
                    <p><strong>Mobile:</strong> {System.Net.WebUtility.HtmlEncode(req.Phone ?? "")}</p>
                    <p><strong>Source:</strong> {System.Net.WebUtility.HtmlEncode(req.Source ?? "welcome_popup")}</p>"));

            // And the lead's own welcome - the text, and the "come and have a
            // look" email. Up to now this list got an admin notification and
            // the person who filled the form got nothing at all until somebody
            // opened the Popup Leads screen and pressed a button, which on a
            // busy week is never. The moment a stranger hands over their number
            // is the moment they are most interested, and it is the one moment
            // nobody is at the admin panel.
            //
            // Queue() returns at once: the shopper's popup closes on its own
            // answer, not on MSG91's.
            _welcome.Queue("lead", lead.Id, lead.Name, lead.Email, lead.Phone);
        }

        return Ok(new { success = true });
    }

    // POST /api/popup-leads/import
    //
    // Bulk add from an Excel/CSV sheet (read in the browser, sent as rows).
    // Same rules as the popup: the email lower-cased, the phone on its last ten
    // digits, and a row that matches someone already on the list is skipped,
    // never doubled. Nobody is messaged unless the admin ticks the box - a
    // bought or borrowed list texted without asking is how a sender ID gets
    // blocked.
    [HttpPost("import")]
    [Authorize]
    [RequirePerm("popup-leads")]
    public async Task<IActionResult> Import([FromBody] PopupLeadImportRequest req)
    {
        var rows = req.Rows ?? new List<PopupLeadRequest>();
        if (rows.Count == 0) return BadRequest(new { success = false, message = "The sheet has no rows." });
        if (rows.Count > 5000) return BadRequest(new { success = false, message = "At most 5,000 rows at a time. Split the sheet and import it in parts." });

        var source = string.IsNullOrWhiteSpace(req.Source) ? "excel_import" : req.Source.Trim();
        if (source.Length > 50) source = source[..50];

        // Clean every row first.
        var clean = new List<(string? Name, string? Email, string? Phone)>();
        int invalid = 0;
        foreach (var r in rows)
        {
            var email = CustomerKeys.Email(r.Email);
            var phone = CustomerKeys.Phone(r.Phone);
            if (email is null && phone is null) { invalid++; continue; }
            var name = string.IsNullOrWhiteSpace(r.Name) ? null : r.Name.Trim();
            if (name is { Length: > 255 }) name = name[..255];
            clean.Add((name, email, phone));
        }

        // Everyone already on the list who could match any of these.
        var emails = clean.Where(c => c.Email != null).Select(c => c.Email!).Distinct().ToList();
        var phones = clean.Where(c => c.Phone != null).Select(c => c.Phone!).Distinct().ToList();
        var existingRows = await _db.PopupLeads.AsNoTracking()
            .Where(l => (l.Email != null && emails.Contains(l.Email)) || (l.Phone != null && phones.Contains(l.Phone)))
            .Select(l => new { l.Email, l.Phone })
            .ToListAsync();

        // A repeat is the same number AND the same address (see Submit): when a
        // row gives only one of the two, that one alone decides.
        bool Matches(string? le, string? lp, string? e, string? p) =>
            (e == null || le == e) && (p == null || lp == p);

        var seen = existingRows.Select(x => (x.Email, x.Phone)).ToList();
        var toAdd = new List<PopupLead>();
        int duplicates = 0;
        foreach (var c in clean)
        {
            if (seen.Any(x => Matches(x.Email, x.Phone, c.Email, c.Phone))) { duplicates++; continue; }
            seen.Add((c.Email, c.Phone));
            toAdd.Add(new PopupLead { Name = c.Name, Email = c.Email, Phone = c.Phone, Source = source });
        }

        int added = 0;
        if (toAdd.Count > 0)
        {
            _db.PopupLeads.AddRange(toAdd);
            try
            {
                await _db.SaveChangesAsync();
                added = toAdd.Count;
            }
            catch (DbUpdateException)
            {
                // Someone arrived through the popup in the same instant, or a
                // case the check above missed. Fall back to one at a time so
                // one clash does not throw the whole sheet away.
                foreach (var e in _db.ChangeTracker.Entries<PopupLead>().ToList()) e.State = EntityState.Detached;
                var ok = new List<PopupLead>();
                foreach (var lead in toAdd)
                {
                    var fresh = new PopupLead { Name = lead.Name, Email = lead.Email, Phone = lead.Phone, Source = lead.Source };
                    _db.PopupLeads.Add(fresh);
                    try { await _db.SaveChangesAsync(); added++; ok.Add(fresh); }
                    catch (DbUpdateException) { _db.Entry(fresh).State = EntityState.Detached; duplicates++; }
                }
                toAdd = ok;
            }
        }

        int welcomed = 0;
        if (req.SendWelcome)
        {
            foreach (var lead in toAdd)
            {
                _welcome.Queue("lead", lead.Id, lead.Name, lead.Email, lead.Phone);
                welcomed++;
            }
        }

        _log.LogInformation("Popup leads import by {Who}: {Added} added, {Dup} already on the list, {Bad} without a usable phone/email",
            User.Identity?.Name ?? "admin", added, duplicates, invalid);

        return Ok(new { success = true, total = rows.Count, added, duplicates, invalid, welcomed });
    }

    // Admin only — view all leads
    [HttpGet]
    [Authorize]
    [RequirePerm("popup-leads")]
    public async Task<IActionResult> GetAll([FromQuery] int page = 1, [FromQuery] int limit = 50)
    {
        // The admin list asks for the lot so that searching and the counts are
        // true rather than page-deep; an unbounded Take() is still not something
        // to hand out, so it is clamped the way GoogleLeads already clamps it.
        page = Math.Max(1, page);
        limit = Math.Clamp(limit, 1, 200);

        var total = await _db.PopupLeads.CountAsync();
        var leads = await _db.PopupLeads
            .OrderByDescending(l => l.CreatedAt)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(l => new
            {
                l.Id, l.Name, l.Email, l.Phone, l.Source,
                createdAt = l.CreatedAt,
                isRegistered = _db.Customers.Any(c =>
                    (l.Email != null && l.Email != "" && c.Email == l.Email) ||
                    (l.Phone != null && l.Phone != "" && c.Phone == l.Phone))
            })
            .ToListAsync();

        return Ok(new { total, page, limit, leads });
    }

    // POST /api/popup-leads/{id}/shop-invite  (Admin, or staff who handle leads)
    //
    // The same "come and have a look" email the Customers screen sends, for
    // somebody who left their address in the popup and never made an account.
    // That is the better list of the two to write to: they asked to hear from
    // the shop and then nothing came of it.
    //
    // The lead has to exist in the table. This deliberately does not take an
    // address from the caller - an admin screen that will email whatever address
    // it is handed, with a fixed template, is one misdirected request away from
    // being somebody else's mailer.
    [HttpPost("{id:int}/shop-invite")]
    [Authorize]
    [RequirePerm("popup-leads")]
    public async Task<IActionResult> SendShopInvite(int id)
    {
        var lead = await _db.PopupLeads.FindAsync(id);
        if (lead == null)
            return NotFound(new { success = false, message = "That lead no longer exists." });

        var to = (lead.Email ?? "").Trim();
        if (to.Length == 0)
            return BadRequest(new { success = false, message = "This lead left no email address. Send it on WhatsApp instead." });

        if (!_email.IsConfigured)
            return StatusCode(500, new { success = false, message = "Email is not set up on the server, so nothing was sent." });

        try
        {
            // A lead's "name" is one box on a popup, so it may well hold the whole
            // name. The email greets by first name only; the rest reads oddly.
            var name = (lead.Name ?? "").Trim().Split(' ')[0];
            var subject = name.Length > 0
                ? name + ", your next favourite outfit is waiting"
                : "Your next favourite outfit is waiting";

            var sent = await _email.SendAsync(to, subject, EmailService.BuildShopInviteEmail(name));
            if (!sent)
                return StatusCode(502, new { success = false, message = "The mail server would not accept it. Try again in a minute." });

            // Written down only once the mail server has taken it.
            _db.InviteSends.Add(new InviteSend
            {
                Audience = "lead",
                PersonId = lead.Id,
                Channel  = "email",
                Email    = to.ToLowerInvariant(),
                Phone    = OutreachContact.Phone10(lead.Phone),
                SentBy   = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value ?? User.Identity?.Name,
                SentAt   = DateTimeOffset.UtcNow,
            });
            await _db.SaveChangesAsync();

            return Ok(new { success = true, sentTo = to, message = "Sent to " + to + "." });
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Shop invite could not be sent to lead {Id}", id);
            return StatusCode(500, new { success = false, message = "The email could not be sent." });
        }
    }

    // Admin — delete a lead
    [HttpDelete("{id:int}")]
    [Authorize]
    [RequirePerm("popup-leads")]
    public async Task<IActionResult> Delete(int id)
    {
        var lead = await _db.PopupLeads.FindAsync(id);
        if (lead == null) return NotFound();
        _db.PopupLeads.Remove(lead);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }
}

public record PopupLeadRequest(string? Name, string? Email, string? Phone, string? Source);
public record PopupLeadImportRequest(List<PopupLeadRequest>? Rows, string? Source, bool SendWelcome);
