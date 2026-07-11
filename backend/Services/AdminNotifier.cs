using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// Sends admin alert emails (new order, new customer, new lead, repeat-return, etc.).
/// The admin recipient comes from Settings ('admin_email') or config ('Admin:Email').
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

    // Resolves the admin email in-request (uses the DbContext), then sends in the background.
    // EmailService only reads config, so it's safe to use after the request scope ends.
    public async Task NotifyAsync(string subject, string htmlBody)
    {
        string to;
        try { to = await AdminEmailAsync(); }
        catch { to = (_config["Admin:Email"] ?? "").Trim(); }
        if (string.IsNullOrWhiteSpace(to)) return;

        var email = _email;
        _ = Task.Run(async () =>
        {
            try { await email.SendAsync(to, subject, htmlBody); }
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
