using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// Someone tried "email + password" with an email that has no account.
///
/// Usually a new shopper who thought she had to log in first, or a customer
/// whose account was made with a mobile OTP and so has no password. Either
/// way she leaves thinking the site is broken. This sends her the way in: an
/// email to that address (and a text, when a mobile number is known for it
/// and an SMS template is set) saying "log in or sign up with OTP - no
/// password needed".
///
/// At most once per address every 7 days, so typing somebody else's email
/// into the login box cannot be used to flood their inbox. Nothing about it
/// changes what the login screen says, so it does not tell a stranger whether
/// an account exists.
/// </summary>
public class LoginHelpNudge
{
    public const string TemplateSettingKey = "msg91TplLoginHelp";
    public const string Audience = "login-help";
    private static readonly TimeSpan Every = TimeSpan.FromDays(7);
    private const string LoginUrl = "https://www.mahalaxmifashionhub.com/account";

    private static readonly Regex EmailShape = new(@"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", RegexOptions.Compiled);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<LoginHelpNudge> _log;

    public LoginHelpNudge(IServiceScopeFactory scopeFactory, ILogger<LoginHelpNudge> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    /// <summary>Returns at once; the mail and text go from a background task.</summary>
    public void Queue(string? typedEmail)
    {
        var addr = (typedEmail ?? "").Trim().ToLowerInvariant();
        if (addr.Length > 200 || !EmailShape.IsMatch(addr)) return;

        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var sp = scope.ServiceProvider;
                await SendAsync(sp.GetRequiredService<AppDbContext>(), sp.GetRequiredService<EmailService>(),
                                sp.GetRequiredService<SmsService>(), addr);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Login help message to {Email} did not go out.", addr);
            }
        });
    }

    private async Task SendAsync(AppDbContext db, EmailService mail, SmsService sms, string addr)
    {
        // An account may have been made a moment later (OTP straight after the
        // failed try) - then there is nothing to help with.
        if (await db.Customers.AnyAsync(c => c.Email == addr)) return;

        var since = DateTimeOffset.UtcNow - Every;
        if (await db.InviteSends.AnyAsync(i => i.Audience == Audience && i.Email == addr && i.SentAt >= since)) return;

        // A mobile number for this email, if the shop has ever been given one:
        // the welcome popup, or an earlier guest order.
        string? phone = await db.PopupLeads.Where(l => l.Email == addr && l.Phone != null)
            .OrderByDescending(l => l.CreatedAt).Select(l => l.Phone).FirstOrDefaultAsync();
        if (string.IsNullOrWhiteSpace(phone))
        {
            phone = (await db.Database.SqlQuery<string>(
                $@"SELECT customer_json->>'phone' AS ""Value"" FROM site_orders
                   WHERE lower(customer_json->>'email') = {addr} AND coalesce(customer_json->>'phone','') <> ''
                   ORDER BY created_at DESC LIMIT 1").ToListAsync()).FirstOrDefault();
        }
        var ten = OutreachContactPhone(phone);

        bool mailed = false, texted = false;

        if (mail.IsConfigured)
        {
            try
            {
                mailed = await mail.SendAsync(addr, "Login to Mahalaxmi Fashion Hub with OTP - no password needed", Body());
            }
            catch (Exception ex) { _log.LogWarning(ex, "Login help email to {Email} failed.", addr); }
            if (mailed)
                db.InviteSends.Add(new InviteSend { Audience = Audience, PersonId = 0, Channel = "login-email", Email = addr, SentBy = "automatic", SentAt = DateTimeOffset.UtcNow });
        }

        var templateId = (await sms.SettingAsync(TemplateSettingKey) ?? "").Trim();
        if (ten is not null && templateId.Length > 0)
        {
            var (ok, detail) = await sms.SendTemplateAsync(ten, templateId, new[] { LoginUrl },
                new Dictionary<string, string> { ["link"] = LoginUrl, ["url"] = LoginUrl });
            texted = ok;
            if (ok)
                db.InviteSends.Add(new InviteSend { Audience = Audience, PersonId = 0, Channel = "login-sms", Email = addr, Phone = ten, SentBy = "automatic", SentAt = DateTimeOffset.UtcNow });
            else
                _log.LogWarning("Login help text for {Email} refused: {Detail}", addr, detail);
        }

        if (mailed || texted)
        {
            await db.SaveChangesAsync();
            _log.LogInformation("Login help sent to {Email}: email {Mail}, text {Text}.", addr, mailed ? "yes" : "no", texted ? "yes" : "no");
        }
    }

    private static string? OutreachContactPhone(string? raw)
    {
        var d = new string((raw ?? "").Where(char.IsDigit).ToArray());
        if (d.Length > 10) d = d[^10..];
        return d.Length == 10 ? d : null;
    }

    private static string Body() => $@"
<div style=""font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden"">
  <div style=""background:#a7354d;padding:16px 24px""><span style=""color:#fff;font-size:17px;font-weight:700"">Mahalaxmi Fashion Hub</span></div>
  <div style=""padding:22px 24px;color:#333;font-size:15px;line-height:1.65"">
    <p style=""margin:0 0 12px"">Namaste,</p>
    <p style=""margin:0 0 12px"">Someone (probably you) just tried to log in to Mahalaxmi Fashion Hub with this email and a password. There is no password set for this email - which is normal: most of our customers log in with a one-time code (OTP) instead.</p>
    <p style=""margin:0 0 18px""><strong>To log in, or to create your account if you are new:</strong> open the login page, enter your mobile number or this email, and type the OTP we send you. That is all - no form, no password.</p>
    <p style=""margin:0 0 20px;text-align:center"">
      <a href=""{LoginUrl}"" style=""display:inline-block;background:#a01836;color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:8px"">Login / Sign up with OTP</a>
    </p>
    <p style=""margin:0;color:#888;font-size:13px"">If this was not you, you can ignore this email. Nothing has been changed.</p>
  </div>
</div>";
}
