using System.Net;
using System.Net.Mail;

namespace MahalaxmiApi.Services;

// Simple SMTP email sender. Reads credentials from configuration
// (appsettings.json "Email" section or environment variables).
public class EmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IConfiguration config, ILogger<EmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    // True only when host + user + password are all set.
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_config["Email:Host"]) &&
        !string.IsNullOrWhiteSpace(_config["Email:User"]) &&
        !string.IsNullOrWhiteSpace(_config["Email:Password"]);

    // Returns true if the email was accepted by the SMTP server, false otherwise.
    public async Task<bool> SendAsync(string toEmail, string subject, string htmlBody)
    {
        if (!IsConfigured)
        {
            _logger.LogWarning("Email not sent — SMTP is not configured (Email:Host/User/Password missing).");
            return false;
        }

        try
        {
            var host     = _config["Email:Host"]!;
            var port     = int.TryParse(_config["Email:Port"], out var p) ? p : 587;
            var user     = _config["Email:User"]!;
            var pass     = _config["Email:Password"]!;
            var fromAddr = string.IsNullOrWhiteSpace(_config["Email:From"]) ? user : _config["Email:From"]!;
            var fromName = string.IsNullOrWhiteSpace(_config["Email:FromName"]) ? "Mahalaxmi Fashion Hub" : _config["Email:FromName"]!;

            using var msg = new MailMessage
            {
                From       = new MailAddress(fromAddr, fromName),
                Subject    = subject,
                Body       = htmlBody,
                IsBodyHtml = true,
            };
            msg.To.Add(toEmail);

            using var client = new SmtpClient(host, port)
            {
                Credentials    = new NetworkCredential(user, pass),
                EnableSsl      = true,   // STARTTLS on port 587
                DeliveryMethod = SmtpDeliveryMethod.Network,
            };

            await client.SendMailAsync(msg);
            _logger.LogInformation("Email sent to {Email} (subject: {Subject}).", toEmail, subject);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {Email}.", toEmail);
            return false;
        }
    }

    // Small helper to build a branded OTP email body.
    // Wording is kept in line with the OTP SMS so the customer sees one consistent message.
    // NOTE: the SMS text itself is a DLT-approved MSG91 template and can only be changed
    // on the MSG91 dashboard, not from code.
    public static string BuildOtpEmail(string otp, string purpose, int validMinutes)
    {
        _ = purpose; // kept for call-site compatibility; wording now matches the SMS
        return $@"
<div style=""font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden"">
  <div style=""background:#ffffff;padding:22px 24px;text-align:center;border-bottom:3px solid #a7354d"">
    <img src=""https://mahalaxmifashionhub.com/logo.webp?v=4"" alt=""Mahalaxmi Fashion Hub"" width=""210"" style=""max-width:210px;width:210px;height:auto;display:inline-block"" />
  </div>
  <div style=""padding:24px"">
    <p style=""color:#333;font-size:15px;margin:0 0 12px"">Your OTP for <strong>Mahalaxmi Fashion Hub</strong> is:</p>
    <p style=""font-size:32px;font-weight:800;letter-spacing:.25em;color:#a7354d;margin:8px 0 16px"">{otp}</p>
    <p style=""color:#777;font-size:13px;margin:0"">Valid for {validMinutes} minutes. Please do not share this code with anyone.</p>
  </div>
</div>";
    }
}
