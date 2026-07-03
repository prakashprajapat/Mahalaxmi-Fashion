using System.Net.Http;
using System.Text;
using MahalaxmiApi.Data;
using Microsoft.EntityFrameworkCore;

namespace MahalaxmiApi.Services;

// Sends OTP SMS via MSG91. Credentials come from SiteSettings
// (msg91AuthKey, msg91SmsTemplateId) — configurable from the admin Settings page.
public class SmsService
{
    private readonly AppDbContext _db;
    private readonly ILogger<SmsService> _logger;

    public SmsService(AppDbContext db, ILogger<SmsService> logger)
    {
        _db = db;
        _logger = logger;
    }

    private Task<string?> Setting(string key) =>
        _db.SiteSettings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync();

    // Normalises an Indian mobile number to MSG91 format (91XXXXXXXXXX).
    private static string NormalisePhone(string raw)
    {
        var p = raw.Trim().TrimStart('+').Replace(" ", "").Replace("-", "");
        if (!p.StartsWith("91")) p = "91" + p;
        return p;
    }

    // Sends the given OTP to a mobile number using MSG91's OTP API + a registered template.
    // Returns true only when MSG91 accepts the request.
    public async Task<bool> SendOtpAsync(string mobile, string otp)
    {
        var authKey    = await Setting("msg91AuthKey");
        var templateId = await Setting("msg91SmsTemplateId");

        if (string.IsNullOrWhiteSpace(authKey) || string.IsNullOrWhiteSpace(templateId))
        {
            _logger.LogWarning("SMS not sent — MSG91 not configured (msg91AuthKey / msg91SmsTemplateId missing).");
            return false;
        }
        if (string.IsNullOrWhiteSpace(mobile))
        {
            _logger.LogWarning("SMS not sent — no recipient mobile number.");
            return false;
        }

        var phone = NormalisePhone(mobile);

        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            var url = "https://control.msg91.com/api/v5/otp"
                    + $"?template_id={Uri.EscapeDataString(templateId)}"
                    + $"&mobile={phone}"
                    + $"&otp={Uri.EscapeDataString(otp)}";

            using var reqMsg = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent("{}", Encoding.UTF8, "application/json"),
            };
            reqMsg.Headers.Add("authkey", authKey);

            var res      = await http.SendAsync(reqMsg);
            var bodyText = await res.Content.ReadAsStringAsync();

            _logger.LogInformation("MSG91 OTP response ({Status}) for {Phone}: {Body}",
                (int)res.StatusCode, phone, bodyText);

            // MSG91 returns {"type":"success", ...} when the message is accepted.
            return res.IsSuccessStatusCode
                && bodyText.Contains("success", StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send SMS OTP to {Mobile}.", mobile);
            return false;
        }
    }
}
