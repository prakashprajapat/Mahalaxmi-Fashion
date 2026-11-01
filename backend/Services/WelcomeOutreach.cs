using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MahalaxmiApi.Controllers;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// The one text and the one email that go out by themselves the moment a
/// popup lead or a customer account comes into being.
///
/// Until now both lists were entirely hand-worked: somebody had to open the
/// screen and press a button. A shopper who left their number in the popup at
/// eleven at night heard nothing from the shop until the next time the shop
/// went looking, which on a busy week is never. The moment a stranger hands
/// over their number is the moment they are most interested, and it is the one
/// moment nobody is at the admin panel.
///
/// This is the row button's message, sent under the everyone button's rules,
/// to one new row. Nothing about what gets sent is new - same MFHBULK
/// template, same "come and have a look" email, same invite_sends row - so
/// the two screens and the automatic send cannot disagree about who has been
/// written to.
///
/// WHAT IT REFUSES TO DO
///
///   • Twice. invite_sends is consulted first, by NUMBER for the text and by
///     ADDRESS for the email, exactly as the ticks on the two screens are.
///     That matters most for the same human being arriving twice: they leave a
///     number in the popup in March and make an account with it in April, and
///     those are two rows and one person. The April account gets nothing,
///     because March already did.
///
///   • Advertise to somebody who has just bought. The shop's own rule is
///     thirty days after an order and forty-eight hours after a cancellation,
///     and a guest who ordered last week and makes an account today is exactly
///     the person that rule is for. The order messages are already going to
///     them; this one would read as a shop that is not paying attention.
///
///   • Hold up the account. Nothing here runs on the request. A slow MSG91 - it
///     is allowed fifteen seconds - or a mail server that is not answering
///     would otherwise be felt by the customer as a sign-up that hangs, and in
///     the worst case as a failure, when their account was made perfectly well.
///     So the work is handed to a background task with a scope of its own,
///     after the account is saved and the answer sent.
///
///   • Fail. Every path is wrapped. An advert that does not go out is a small
///     loss and it corrects itself: the person stays due, so the next press of
///     the everyone button picks them up. An exception escaping into a
///     registration request is not small.
///
/// `welcomeOutreachEnabled` = off in Settings stops it, and a blank
/// msg91TplNewCollection stops the text on its own.
/// </summary>
public class WelcomeOutreach
{
    /// <summary>Type "off" in Settings to stop it. Blank means on.</summary>
    public const string EnabledSettingKey = "welcomeOutreachEnabled";

    /// Written into invite_sends where a person's email would otherwise go, so
    /// the screens can tell a message nobody chose from one somebody pressed.
    private const string SentByAutomatic = "automatic";

    /// How far back the order rules can reach. Thirty days is the longest of
    /// the two waits, so a month and a day of orders is every order that could
    /// still be holding somebody back - and it is a bounded query rather than
    /// the whole table, which the sweep over the entire list can afford and a
    /// signup cannot.
    private static readonly TimeSpan OrderLookback = TimeSpan.FromDays(31);

    private static readonly TimeSpan AfterAnOrder = TimeSpan.FromDays(30);
    private static readonly TimeSpan AfterACancellation = TimeSpan.FromHours(48);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<WelcomeOutreach> _log;

    public WelcomeOutreach(IServiceScopeFactory scopeFactory, ILogger<WelcomeOutreach> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    /// <summary>
    /// Hand the welcome text and email to a background task and return at once.
    ///
    /// Only plain values are captured - no DbContext, no HttpContext, nothing
    /// belonging to the request - because the request is finished and disposed
    /// long before MSG91 answers. The task makes its own scope.
    /// </summary>
    /// <param name="audience">customer or lead, as invite_sends spells it.</param>
    /// <param name="emailAlreadySent">
    /// True when the caller has already sent this person something - the
    /// welcome coupon email, which carries a discount code and is the better
    /// of the two. Then only the text goes. Two emails from the same shop in
    /// the same minute is how a sender ends up in a spam folder.
    /// </param>
    public void Queue(string audience, int personId, string? name, string? email, string? phone,
                      bool emailAlreadySent = false)
    {
        // Captured by value. Task.Run returns immediately; the caller's reply
        // goes out while this is still waiting on MSG91.
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var sp = scope.ServiceProvider;
                await SendAsync(
                    sp.GetRequiredService<AppDbContext>(),
                    sp.GetRequiredService<SmsService>(),
                    sp.GetRequiredService<EmailService>(),
                    audience, personId, name, email, phone, emailAlreadySent);
            }
            catch (Exception ex)
            {
                // Deliberately a warning. Nobody is waiting on this, the
                // person's account exists, and the everyone button will reach
                // them on the next press.
                _log.LogWarning(ex, "Welcome outreach to {Audience} {Id} did not go out.", audience, personId);
            }
        });
    }

    private async Task SendAsync(
        AppDbContext db, SmsService sms, EmailService mail,
        string audience, int personId, string? name, string? email, string? phone, bool emailAlreadySent)
    {
        var off = (await sms.SettingAsync(EnabledSettingKey) ?? "").Trim();
        if (off.Equals("off", StringComparison.OrdinalIgnoreCase)) return;

        var ten = OutreachContact.Phone10(phone);
        var addr = OutreachContact.Email(email);
        if (ten is null && addr is null) return;

        // One gate for both channels. Both are adverts, and the thirty-day
        // rule is about the person, not about the channel it arrives on.
        if (ten is not null)
        {
            var quietUntil = await QuietUntilAsync(db, ten);
            if (quietUntil is not null && quietUntil > DateTimeOffset.UtcNow)
            {
                _log.LogInformation(
                    "Welcome outreach skipped for {Audience} {Id}: that number ordered recently, free again {When:o}.",
                    audience, personId, quietUntil);
                return;
            }
        }

        var first = FirstName(name);
        var sentText = await TryTextAsync(db, sms, audience, personId, ten);
        var sentMail = emailAlreadySent
            ? false
            : await TryEmailAsync(db, mail, audience, personId, first, addr);

        if (sentText || sentMail)
            _log.LogInformation("Welcome outreach to {Audience} {Id}: text {Text}, email {Mail}.",
                audience, personId, sentText ? "sent" : "no", sentMail ? "sent" : "no");
    }

    /// <summary>
    /// When this number stops being somebody who has just bought, or null if
    /// it never ordered in the window.
    ///
    /// The same arithmetic OutreachController does over the whole list, read
    /// for one number: an order frees it thirty days later, a cancellation
    /// forty-eight hours later, and the LATEST answer wins. Somebody who
    /// bought on Monday and cancelled a second order on Wednesday is still a
    /// customer who bought on Monday - the cancellation is the more recent
    /// event but carries the shorter wait.
    /// </summary>
    private static async Task<DateTimeOffset?> QuietUntilAsync(AppDbContext db, string ten)
    {
        var since = DateTimeOffset.UtcNow - OrderLookback;

        // UpdatedAt as well as the placed date, because an order placed in
        // August and cancelled this morning is a cancellation that happened
        // this morning, and its row would otherwise be outside the window.
        var rows = await db.SiteOrders
            .Where(o => (o.PlacedAt ?? o.CreatedAt) >= since || o.UpdatedAt >= since)
            .Select(o => new { o.CustomerJson, o.ShippingJson, o.Status, o.PlacedAt, o.CreatedAt, o.UpdatedAt })
            .ToListAsync();

        DateTimeOffset? latest = null;
        foreach (var o in rows)
        {
            var raw = OrderMessenger.Field(o.CustomerJson, "phone")
                   ?? OrderMessenger.Field(o.ShippingJson, "phone");
            if (OutreachContact.Phone10(raw) != ten) continue;

            var cancelled = (o.Status ?? "").StartsWith("Cancel", StringComparison.OrdinalIgnoreCase);
            var at = cancelled ? o.UpdatedAt : (o.PlacedAt ?? o.CreatedAt);
            var free = at + (cancelled ? AfterACancellation : AfterAnOrder);

            if (latest is null || free > latest) latest = free;
        }
        return latest;
    }

    /// <summary>The promotional text, unless this number has already had one.</summary>
    private async Task<bool> TryTextAsync(
        AppDbContext db, SmsService sms, string audience, int personId, string? ten)
    {
        if (ten is null) return false;

        // Ever, not lately. This is a one-time welcome: a number that has had
        // it once has had it, whichever list it was on at the time.
        if (await db.InviteSends.AnyAsync(i => i.Channel == "sms" && i.Phone == ten)) return false;

        var templateId = await sms.SettingAsync(OutreachController.TemplateSettingKey);
        if (string.IsNullOrWhiteSpace(templateId)) return false;

        var link = (await sms.SettingAsync(OutreachController.LinkSettingKey) ?? "").Trim();
        if (link.Length == 0) link = OutreachController.DefaultSiteLink;

        var (ok, detail) = await sms.SendTemplateAsync(ten, templateId!, new[] { link },
                                                       OutreachController.LinkVars(link));
        if (!ok)
        {
            _log.LogWarning("Welcome text to {Audience} {Id} refused: {Detail}", audience, personId, detail);
            return false;
        }

        // Written down only once MSG91 has taken it, as everywhere else.
        db.InviteSends.Add(new InviteSend
        {
            Audience = audience,
            PersonId = personId,
            Channel = "sms",
            Phone = ten,
            SentBy = SentByAutomatic,
            SentAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();
        return true;
    }

    /// <summary>The "come and have a look" email, unless this address has had one.</summary>
    private async Task<bool> TryEmailAsync(
        AppDbContext db, EmailService mail, string audience, int personId, string first, string? addr)
    {
        if (addr is null || !mail.IsConfigured) return false;
        if (await db.InviteSends.AnyAsync(i => i.Channel == "email" && i.Email == addr)) return false;

        var subject = first.Length > 0
            ? first + ", your next favourite outfit is waiting"
            : "Your next favourite outfit is waiting";

        bool sent;
        try
        {
            sent = await mail.SendAsync(addr, subject, EmailService.BuildShopInviteEmail(first));
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Welcome email to {Audience} {Id} failed.", audience, personId);
            return false;
        }
        if (!sent) return false;

        db.InviteSends.Add(new InviteSend
        {
            Audience = audience,
            PersonId = personId,
            Channel = "email",
            Email = addr,
            SentBy = SentByAutomatic,
            SentAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();
        return true;
    }

    /// A popup's "name" is one box, so it may hold the whole name. The email
    /// greets by first name; the rest reads oddly.
    private static string FirstName(string? name)
    {
        var parts = (name ?? "").Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 0 ? parts[0] : "";
    }
}
