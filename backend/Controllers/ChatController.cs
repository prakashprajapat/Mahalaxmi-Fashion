using System.Net;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/chat")]
public class ChatController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly EmailService _email;
    private readonly IConfiguration _config;

    public ChatController(AppDbContext db, EmailService email, IConfiguration config)
    {
        _db = db;
        _email = email;
        _config = config;
    }

    // POST /api/chat/notify
    // Emails the full chat transcript + the visitor's details to the store owner
    // whenever a customer has a conversation with the on-site chatbot.
    [HttpPost("notify")]
    [EnableRateLimiting("auth")]   // basic abuse protection (shared 10/min limiter)
    public async Task<IActionResult> Notify([FromBody] ChatNotifyRequest req)
    {
        // Need at least one real customer (user) message — ignore empty / bot-only pings.
        if (req?.Messages == null || req.Messages.Count == 0
            || !req.Messages.Any(m => string.Equals(m.Role, "user", StringComparison.OrdinalIgnoreCase)))
            return Ok(new { success = false });

        var adminEmail = await _db.SiteSettings
            .Where(s => s.Key == "admin_email")
            .Select(s => s.Value)
            .FirstOrDefaultAsync() ?? _config["Admin:Email"] ?? "";
        if (string.IsNullOrWhiteSpace(adminEmail))
            return Ok(new { success = false });

        var name  = string.IsNullOrWhiteSpace(req.CustomerName) ? "Guest visitor" : req.CustomerName!.Trim();
        var email = req.CustomerEmail?.Trim() ?? "";
        var phone = req.CustomerPhone?.Trim() ?? "";
        var code  = req.CustomerCode?.Trim() ?? "";
        var page  = req.PageUrl?.Trim() ?? "";

        // Cap the transcript so a malicious payload can't build a huge email.
        var rows = new StringBuilder();
        foreach (var m in req.Messages.Take(120))
        {
            var isUser = string.Equals(m.Role, "user", StringComparison.OrdinalIgnoreCase);
            var who    = isUser ? "Customer" : "Bot";
            var colour = isUser ? "#a7354d" : "#777";
            var text   = (m.Content ?? "");
            if (text.Length > 2000) text = text.Substring(0, 2000) + "…";
            var safe   = WebUtility.HtmlEncode(text);
            rows.Append($"<p style='margin:.35rem 0'><strong style='color:{colour}'>{who}:</strong> {safe}</p>");
        }

        var html =
            "<div style='font-family:Arial,sans-serif;color:#222;max-width:640px'>" +
            "<h2 style='color:#a7354d;margin:0 0 .5rem'>New chat on Mahalaxmi Fashion Hub</h2>" +
            "<p style='margin:.2rem 0'>" +
            $"<strong>Name:</strong> {WebUtility.HtmlEncode(name)}<br/>" +
            $"<strong>Email:</strong> {WebUtility.HtmlEncode(email)}<br/>" +
            $"<strong>Phone:</strong> {WebUtility.HtmlEncode(phone)}<br/>" +
            $"<strong>Customer ID:</strong> {WebUtility.HtmlEncode(code)}<br/>" +
            $"<strong>Page:</strong> {WebUtility.HtmlEncode(page)}</p>" +
            "<hr style='border:none;border-top:1px solid #eee'/>" +
            "<h3 style='color:#333'>Conversation</h3>" +
            rows +
            "</div>";

        try
        {
            await _email.SendAsync(adminEmail, $"💬 Chat: {name}", html);
        }
        catch { /* never fail the caller because of email delivery */ }

        return Ok(new { success = true });
    }
}

public record ChatNotifyMessage(string? Role, string? Content);
public record ChatNotifyRequest(
    string? CustomerName,
    string? CustomerEmail,
    string? CustomerPhone,
    string? CustomerCode,
    string? PageUrl,
    List<ChatNotifyMessage>? Messages);
