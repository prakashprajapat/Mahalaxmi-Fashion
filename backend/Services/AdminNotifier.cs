using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// Sends admin alert emails (new order, new customer, new lead, repeat-return, etc.).
/// The admin recipients come from Settings ('admin_email') or config ('Admin:Email').
/// More than one address may be listed, separated by a comma, semicolon or space:
/// an order alert sitting unread in a mailbox nobody opens is the same as no alert
/// at all, so the shop email and a phone's own inbox can both be on the list.
/// The actual SMTP send is fire-and-forget so it never slows down or breaks the caller.
/// </summary>
public class AdminNotifier
{
    private readonly AppDbContext _db;
    private readonly EmailService _email;
    private readonly IConfiguration _config;
    private readonly ILogger<AdminNotifier> _logger;

    public AdminNotifier(AppDbContext db, EmailService email, IConfiguration config, ILogger<AdminNotifier> logger)
    {
        _db = db;
        _email = email;
        _config = config;
        _logger = logger;
    }

    private async Task<string> AdminEmailAsync()
    {
        var fromSettings = await _db.SiteSettings
            .Where(s => s.Key == "admin_email")
            .Select(s => s.Value)
            .FirstOrDefaultAsync();
        return !string.IsNullOrWhiteSpace(fromSettings) ? fromSettings.Trim() : (_config["Admin:Email"] ?? "").Trim();
    }

    // "a@x.com, b@y.com" -> two recipients. Anything without an @ is dropped
    // rather than handed to the SMTP server, which would reject the whole message
    // and take the good addresses down with it.
    private static List<string> Recipients(string raw) => raw
        .Split(new[] { ',', ';', ' ', '\n', '\r', '\t' }, StringSplitOptions.RemoveEmptyEntries)
        .Select(x => x.Trim())
        .Where(x => x.Contains('@') && !x.StartsWith('@') && !x.EndsWith('@'))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToList();

    // Resolves the admin email in-request (uses the DbContext), then sends in the background.
    // EmailService only reads config, so it's safe to use after the request scope ends.
    public async Task NotifyAsync(string subject, string htmlBody)
    {
        string raw;
        try { raw = await AdminEmailAsync(); }
        catch { raw = (_config["Admin:Email"] ?? "").Trim(); }

        var to = Recipients(raw);
        if (to.Count == 0)
        {
            // Loud on purpose. A silent return here is how a shop ends up believing
            // no orders came in when the orders were there all along.
            _logger.LogWarning("Admin alert '{Subject}' not sent — no admin email is set (Settings 'admin_email' / Admin:Email).", subject);
            return;
        }

        var email = _email;
        _ = Task.Run(async () =>
        {
            try
            {
                var ok = await email.SendAsync(to, subject, htmlBody, null);
                if (!ok) _logger.LogWarning("Admin alert '{Subject}' was not accepted by the mail server.", subject);
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Admin notification email failed."); }
        });
    }

    // Small branded wrapper so all alert emails look consistent.
    public static string Wrap(string title, string bodyHtml) => $@"
<div style=""font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden"">
  <div style=""background:#a7354d;padding:16px 24px""><span style=""color:#fff;font-size:16px;font-weight:700"">{title}</span></div>
  <div style=""padding:20px 24px;color:#333;font-size:14px;line-height:1.6"">{bodyHtml}</div>
  <div style=""padding:12px 24px;background:#faf6f2;color:#888;font-size:12px"">Mahalaxmi Fashion Hub — admin alert</div>
</div>";
}
