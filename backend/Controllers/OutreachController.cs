using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Services;

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
    private readonly SmsService _sms;
    private readonly ILogger<OutreachController> _log;

    public OutreachController(AppDbContext db, SmsService sms, ILogger<OutreachController> log)
    {
        _db = db;
        _sms = sms;
        _log = log;
    }

    /// The Settings box holding the MSG91 flow id for the one promotional
    /// message this screen sends.
    public const string TemplateSettingKey = "msg91TplNewCollection";

    /// A number texted this recently is left alone by the "everyone" button.
    /// The per-row button has no such rule - that one is a person deciding.
    private static readonly TimeSpan QuietFor = TimeSpan.FromDays(30);

    /// How many go in one press. MSG91 takes a hundred to a request; more than
    /// three of those in one click is a bill nobody meant to run up, and the
    /// screen says how many are left so the next press is a decision.
    private const int MaxPerPress = 300;

    public record SentRequest(string? Audience, int PersonId, string? Channel);

    private static readonly string[] Audiences = { "customer", "lead" };
    // sms sits beside whatsapp: both go to a NUMBER, and the tick has to follow
    // the thing the channel actually writes to. See the long note in the loop.
    private static readonly string[] Channels = { "email", "whatsapp", "sms" };

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
        // carry an email, a phone, or both - but which one is consulted depends
        // on the channel. See the loop below.
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
                // A tick follows the thing the channel actually writes to.
                //
                // It used to be matched on the address OR the number, whichever
                // hit first, so that a person reached on one would show as
                // written to on the other. That reads well until a hundred and
                // sixty people type no@gmail.com into the popup: WhatsApp one of
                // them and all hundred and sixty went green, because the address
                // they share is not an address at all.
                //
                // A WhatsApp message goes to a NUMBER. Writing to 9172643849
                // says nothing about 9922264003 and never did, whatever either
                // of them wrote in the email box. An email goes to an ADDRESS,
                // and there the shared no@gmail.com is the right answer: it has
                // been written to, and writing again lands in the same inbox.
                var found = false;
                var at = DateTimeOffset.MinValue;
                var times = 0;

                if (channel is "whatsapp" or "sms")
                {
                    if (phone is not null && byPhone.TryGetValue((channel, phone), out var f))
                    {
                        found = true; at = f.At; times = f.N;
                    }
                }
                else
                {
                    if (email is not null && byEmail.TryGetValue((channel, email), out var e))
                    {
                        found = true; at = e.At; times = e.N;
                    }
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

    // ── the one promotional message, sent from these two screens ───────────
    //
    // Everything above is a note that somebody was written to by hand. This is
    // the shop actually sending something, which makes it a different kind of
    // thing: it costs money per message, it goes to people who have never
    // bought anything, and a mistake is not a wrong tick - it is a few hundred
    // strangers getting the same text twice.
    //
    // So the rules are:
    //
    //   - nobody who has ever ordered is in the "everyone" send. That is the
    //     whole point of it: the people who already buy do not need chasing,
    //     and a shop that texts its own customers an advert is a shop that
    //     gets blocked.
    //   - one message per NUMBER, however many rows carry it. The same person
    //     is very often a popup lead AND a customer, and twice in one press
    //     is the exact complaint this is meant to avoid.
    //   - a number texted in the last thirty days is skipped.
    //   - nothing is sent until the shop has seen the count. The preview below
    //     exists so the screen can say "this texts 207 people" and wait.
    //   - every number reached is written down, so the tick beside the name
    //     means the same thing it means for the other two channels.

    private sealed record Person(int Id, string? Name, string? Phone, bool Consent);

    private async Task<List<Person>> PeopleAsync(string audience) =>
        audience == "customer"
            ? await _db.Customers
                .Select(c => new Person(c.Id, c.FirstName, c.Phone, c.MarketingConsent)).ToListAsync()
            // A popup lead typed their number into a box that offered them a
            // discount, so there is no separate consent column to consult.
            : await _db.PopupLeads
                .Select(l => new Person(l.Id, l.Name, l.Phone, true)).ToListAsync();

    /// Every number that has ever placed an order, by its last ten digits.
    ///
    /// Any order counts, including a cancelled one. Somebody who ordered and
    /// changed their mind last week does not want "come and buy from us" - and
    /// of the two ways to be wrong, texting a real customer an advert is the
    /// one that costs the shop something.
    private async Task<HashSet<string>> BuyersAsync()
    {
        var rows = await _db.SiteOrders
            .Select(o => new { o.CustomerJson, o.ShippingJson })
            .ToListAsync();

        var set = new HashSet<string>();
        foreach (var o in rows)
        {
            var raw = OrderMessenger.Field(o.CustomerJson, "phone")
                   ?? OrderMessenger.Field(o.ShippingJson, "phone");
            var ten = OutreachContact.Phone10(raw);
            if (ten is not null) set.Add(ten);
        }
        return set;
    }

    private async Task<HashSet<string>> TextedRecentlyAsync()
    {
        var since = DateTimeOffset.UtcNow - QuietFor;
        var rows = await _db.InviteSends
            .Where(i => i.Channel == "sms" && i.SentAt >= since && i.Phone != null)
            .Select(i => i.Phone!)
            .ToListAsync();
        return rows.ToHashSet();
    }

    /// Who the "everyone" button would text, and who it would leave out.
    private async Task<(List<Person> Send, int NoNumber, int Bought, int Recent, int NoConsent, int Duplicate)>
        AudienceAsync(string audience, bool optedInOnly)
    {
        var people = await PeopleAsync(audience);
        var buyers = await BuyersAsync();
        var recent = await TextedRecentlyAsync();

        var send = new List<Person>();
        var seen = new HashSet<string>();
        int noNumber = 0, bought = 0, tooSoon = 0, noConsent = 0, duplicate = 0;

        foreach (var p in people)
        {
            var ten = OutreachContact.Phone10(p.Phone);
            if (ten is null) { noNumber++; continue; }
            if (buyers.Contains(ten)) { bought++; continue; }
            if (recent.Contains(ten)) { tooSoon++; continue; }
            if (optedInOnly && !p.Consent) { noConsent++; continue; }
            if (!seen.Add(ten)) { duplicate++; continue; }
            send.Add(p with { Phone = ten });
        }

        return (send, noNumber, bought, tooSoon, noConsent, duplicate);
    }

    // GET /api/outreach/sms/preview?audience=lead&optedInOnly=false
    [HttpGet("sms/preview")]
    [RequirePerm("customers", "popup-leads", "campaigns")]
    public async Task<IActionResult> SmsPreview([FromQuery] string? audience, [FromQuery] bool optedInOnly = false)
    {
        var who = Allowed(audience, Audiences);
        if (who is null)
            return BadRequest(new { success = false, message = "audience must be customer or lead." });

        var (send, noNumber, bought, recent, noConsent, duplicate) = await AudienceAsync(who, optedInOnly);
        var templateId = await _sms.SettingAsync(TemplateSettingKey);

        return Ok(new
        {
            success = true,
            configured = !string.IsNullOrWhiteSpace(templateId),
            willSend = send.Count,
            thisPress = Math.Min(send.Count, MaxPerPress),
            leftAfter = Math.Max(0, send.Count - MaxPerPress),
            skipped = new
            {
                noNumber,
                alreadyBought = bought,
                textedInTheLast30Days = recent,
                notOptedIn = noConsent,
                sameNumberTwice = duplicate,
            },
        });
    }

    public record SmsOneRequest(string? Audience, int PersonId);

    // POST /api/outreach/sms/one   { audience, personId }
    //
    // One person, because the shop looked at that row and decided. No
    // never-bought rule and no thirty-day rule here: both of those are for the
    // button that sends to hundreds without anybody reading a name.
    [HttpPost("sms/one")]
    [RequirePerm("customers", "popup-leads", "campaigns")]
    public async Task<IActionResult> SmsOne([FromBody] SmsOneRequest req)
    {
        var who = Allowed(req?.Audience, Audiences);
        if (who is null || req!.PersonId <= 0)
            return BadRequest(new { success = false, message = "audience and personId are required." });

        var person = (await PeopleAsync(who)).FirstOrDefault(p => p.Id == req.PersonId);
        if (person is null)
            return NotFound(new { success = false, message = "That person no longer exists." });

        var ten = OutreachContact.Phone10(person.Phone);
        if (ten is null)
            return Ok(new { success = false, message = "There is no mobile number on this row." });

        var templateId = await _sms.SettingAsync(TemplateSettingKey);
        if (string.IsNullOrWhiteSpace(templateId))
            return Ok(new { success = false, message = "No MSG91 flow id for this message in Settings yet." });

        var (ok, detail) = await _sms.SendTemplateAsync(ten, templateId!, new[] { SiteAddress }, Vars());
        if (!ok)
            return Ok(new { success = false, message = detail });

        await RecordSmsAsync(who, person.Id, ten);
        await _db.SaveChangesAsync();
        return Ok(new { success = true, message = $"Text sent to {person.Name ?? "this person"}." });
    }

    public record SmsBulkRequest(string? Audience, bool OptedInOnly);

    // POST /api/outreach/sms/everyone   { audience, optedInOnly }
    [HttpPost("sms/everyone")]
    [RequirePerm("customers", "popup-leads", "campaigns")]
    public async Task<IActionResult> SmsEveryone([FromBody] SmsBulkRequest req)
    {
        var who = Allowed(req?.Audience, Audiences);
        if (who is null)
            return BadRequest(new { success = false, message = "audience must be customer or lead." });

        var templateId = await _sms.SettingAsync(TemplateSettingKey);
        if (string.IsNullOrWhiteSpace(templateId))
            return Ok(new { success = false, message = "No MSG91 flow id for this message in Settings yet." });

        var (all, _, bought, recent, _, _) = await AudienceAsync(who, req!.OptedInOnly);
        if (all.Count == 0)
            return Ok(new
            {
                success = true, sent = 0, failed = 0, left = 0,
                message = $"Nobody to text. {bought} have bought before and {recent} were texted in the last 30 days.",
            });

        var batchList = all.Take(MaxPerPress).ToList();
        int sent = 0, failed = 0;

        // A hundred to a request, and each hundred written down the moment
        // MSG91 takes it. If the fourth batch fails, the first three are still
        // recorded - so pressing again sends the rest rather than starting the
        // whole list over.
        foreach (var batch in batchList.Chunk(100))
        {
            var numbers = batch.Select(p => p.Phone!).ToList();
            var (ok, detail) = await _sms.SendCampaignBatchAsync(numbers, templateId!, Vars());
            if (!ok)
            {
                failed += batch.Length;
                _log.LogError("New-collection batch of {Count} not sent: {Detail}", batch.Length, detail);
                continue;
            }
            foreach (var p in batch) await RecordSmsAsync(who, p.Id, p.Phone!);
            await _db.SaveChangesAsync();
            sent += batch.Length;
        }

        var left = Math.Max(0, all.Count - batchList.Count);
        return Ok(new
        {
            success = failed == 0,
            sent,
            failed,
            left,
            message = failed > 0
                ? $"{sent} sent, {failed} not sent. The ones that went are written down, so pressing again sends the rest."
                : left > 0
                    ? $"{sent} texts sent. {left} still to go - press again for the next batch."
                    : $"{sent} texts sent. That is everyone who has never bought.",
        });
    }

    /// The address the template's one variable fills in. Not a setting: the
    /// shop has one website, and a wrong address in a promotional SMS is a
    /// message that cost money and sends nobody anywhere.
    private const string SiteAddress = "mahalaxmifashionhub.com";

    private static Dictionary<string, string> Vars() => new()
    {
        ["var1"] = SiteAddress,
        ["url"] = SiteAddress,
        ["link"] = SiteAddress,
    };

    private async Task RecordSmsAsync(string audience, int personId, string phone)
    {
        _db.InviteSends.Add(new InviteSend
        {
            Audience = audience,
            PersonId = personId,
            Channel = "sms",
            Phone = phone,
            SentBy = User.FindFirst(ClaimTypes.Email)?.Value ?? User.Identity?.Name,
            SentAt = DateTimeOffset.UtcNow,
        });
        await Task.CompletedTask;
    }
}
