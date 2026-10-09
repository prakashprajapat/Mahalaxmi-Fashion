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

    // Sends the given OTP to a mobile number using MSG91's Flow (Send SMS) API
    // with a DLT-approved template. This path is proven to deliver where the
    // OTP API rejects the same template ("Template ID Missing or Invalid Template").
    // Returns true only when MSG91 accepts the request.
    public async Task<bool> SendOtpAsync(string mobile, string otp)
    {
        var authKey    = await Setting("msg91AuthKey");
        var templateId = await Setting("msg91SmsTemplateId");
        var sender     = await Setting("msg91SenderId");
        if (string.IsNullOrWhiteSpace(sender)) sender = "MAHFHB";

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

            // MSG91 Flow (Send SMS) API. The OTP is carried as both "OTP" and
            // "var1" so it maps regardless of which variable name the active
            // template version uses (extra keys are ignored by MSG91).
            var payload = new
            {
                template_id = templateId,
                sender      = sender,
                short_url   = "0",
                recipients  = new[]
                {
                    new Dictionary<string, string>
                    {
                        ["mobiles"] = phone,
                        ["OTP"]     = otp,
                        ["var1"]    = otp,
                    }
                }
            };

            var json = System.Text.Json.JsonSerializer.Serialize(payload);

            using var reqMsg = new HttpRequestMessage(HttpMethod.Post,
                "https://control.msg91.com/api/v5/flow/")
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
            };
            reqMsg.Headers.Add("authkey", authKey);
            reqMsg.Headers.Add("accept", "application/json");

            var res      = await http.SendAsync(reqMsg);
            var bodyText = await res.Content.ReadAsStringAsync();

            // MSG91 returns {"type":"success", ...} when the message is accepted.
            var ok = res.IsSuccessStatusCode
                && bodyText.Contains("success", StringComparison.OrdinalIgnoreCase);

            // The number is masked, and the provider's reply is kept only when
            // something went wrong: on a good send the status says everything,
            // and MSG91 echoes the request — numbers included — when it rejects.
            if (ok)
                _logger.LogInformation("MSG91 OTP accepted ({Status}) for {Phone}.",
                    (int)res.StatusCode, LogSafe.Phone(phone));
            else
                _logger.LogWarning("MSG91 OTP rejected ({Status}) for {Phone}: {Body}",
                    (int)res.StatusCode, LogSafe.Phone(phone), LogSafe.Body(bodyText));

            return ok;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send SMS OTP to {Mobile}.", LogSafe.Phone(mobile));
            return false;
        }
    }

    // Sends the "New Order" confirmation SMS via MSG91 Flow API using a
    // DLT-approved template. Configured from admin Settings:
    //   msg91AuthKey, msg91OrderTemplateId, msg91SenderId
    // No-op (returns false) until msg91OrderTemplateId is set — safe to deploy
    // before DLT approval. Template variables: ##order_id## and ##amount##.
    public async Task<bool> SendNewOrderSmsAsync(string? mobile, string orderId, decimal amount)
    {
        var authKey    = await Setting("msg91AuthKey");
        var templateId = await Setting("msg91OrderTemplateId");
        var sender     = await Setting("msg91SenderId");
        if (string.IsNullOrWhiteSpace(sender)) sender = "MAHFHB";

        if (string.IsNullOrWhiteSpace(authKey) || string.IsNullOrWhiteSpace(templateId))
        {
            _logger.LogInformation("Order SMS skipped for {OrderId} — MSG91 order template not configured (msg91OrderTemplateId).", orderId);
            return false;
        }
        if (string.IsNullOrWhiteSpace(mobile))
        {
            _logger.LogWarning("Order SMS skipped for {OrderId} — no recipient mobile number.", orderId);
            return false;
        }

        var phone = NormalisePhone(mobile);

        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };

            // Same Flow API as OTP. Values also sent as var1/var2 so it maps
            // regardless of variable names in the approved template version.
            var amountStr = amount.ToString("0");
            var payload = new
            {
                template_id = templateId,
                sender      = sender,
                short_url   = "0",
                recipients  = new[]
                {
                    new Dictionary<string, string>
                    {
                        ["mobiles"]  = phone,
                        ["order_id"] = orderId,
                        ["amount"]   = amountStr,
                        ["var1"]     = orderId,
                        ["var2"]     = amountStr,
                    }
                }
            };

            var json = System.Text.Json.JsonSerializer.Serialize(payload);

            using var reqMsg = new HttpRequestMessage(HttpMethod.Post,
                "https://control.msg91.com/api/v5/flow/")
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
            };
            reqMsg.Headers.Add("authkey", authKey);
            reqMsg.Headers.Add("accept", "application/json");

            var res      = await http.SendAsync(reqMsg);
            var bodyText = await res.Content.ReadAsStringAsync();

            var ok = res.IsSuccessStatusCode
                && bodyText.Contains("success", StringComparison.OrdinalIgnoreCase);

            if (ok)
                _logger.LogInformation("MSG91 order SMS accepted ({Status}) for {OrderId} to {Phone}.",
                    (int)res.StatusCode, orderId, LogSafe.Phone(phone));
            else
                _logger.LogWarning("MSG91 order SMS rejected ({Status}) for {OrderId} to {Phone}: {Body}",
                    (int)res.StatusCode, orderId, LogSafe.Phone(phone), LogSafe.Body(bodyText));

            return ok;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send order SMS for {OrderId} to {Mobile}.", orderId, LogSafe.Phone(mobile));
            return false;
        }
    }

    public record BulkResult(bool Configured, int Sent, int Failed, string? Error);

    /// <summary>
    /// Sends a bulk promotional SMS campaign via the MSG91 Flow API — entirely
    /// server-side, no MSG91 website needed. Recipients are sent in batches of 100.
    /// Uses a DLT-approved promotional template (templateId) and passes the given
    /// variables (var1..varN + named) so they map regardless of template naming.
    /// </summary>
    public async Task<BulkResult> SendBulkCampaignAsync(
        IEnumerable<string> mobiles, string templateId, Dictionary<string, string>? vars)
    {
        var authKey = await Setting("msg91AuthKey");
        var sender  = await Setting("msg91SenderId");
        if (string.IsNullOrWhiteSpace(sender)) sender = "MAHFHB";

        if (string.IsNullOrWhiteSpace(authKey))
            return new(false, 0, 0, "MSG91 Auth Key not set in Settings.");
        if (string.IsNullOrWhiteSpace(templateId))
            return new(false, 0, 0, "Campaign template ID is required (must be DLT-approved).");

        var list = mobiles
            .Select(NormalisePhone)
            .Where(p => p.Length >= 12)
            .Distinct()
            .ToList();
        if (list.Count == 0)
            return new(true, 0, 0, "No valid recipients.");

        int sent = 0, failed = 0;
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };

        foreach (var batch in list.Chunk(100))
        {
            var recipients = batch.Select(phone =>
            {
                var d = new Dictionary<string, string> { ["mobiles"] = phone };
                if (vars is not null)
                    foreach (var kv in vars) d[kv.Key] = kv.Value;
                return d;
            }).ToArray();

            var payload = new { template_id = templateId, sender, short_url = "0", recipients };
            var jsonBody = System.Text.Json.JsonSerializer.Serialize(payload);

            try
            {
                using var reqMsg = new HttpRequestMessage(HttpMethod.Post, "https://control.msg91.com/api/v5/flow/")
                {
                    Content = new StringContent(jsonBody, Encoding.UTF8, "application/json"),
                };
                reqMsg.Headers.Add("authkey", authKey);
                reqMsg.Headers.Add("accept", "application/json");

                var res  = await http.SendAsync(reqMsg);
                var body = await res.Content.ReadAsStringAsync();
                if (res.IsSuccessStatusCode && body.Contains("success", StringComparison.OrdinalIgnoreCase))
                {
                    sent += batch.Length;
                }
                else
                {
                    failed += batch.Length;
                    _logger.LogError("Bulk campaign batch failed ({Status}): {Body}", (int)res.StatusCode, LogSafe.Body(body));
                }
            }
            catch (Exception ex)
            {
                failed += batch.Length;
                _logger.LogError(ex, "Bulk campaign batch exception.");
            }
        }

        return new(true, sent, failed, failed > 0 ? "Some batches failed — check logs / MSG91 wallet balance." : null);
    }

    // ── Website kharabi ka alert SMS ──────────────────────────────────────
    //
    // Admin Settings se chalta hai:
    //   msg91AuthKey, msg91AlertTemplateId, msg91SenderId, alertSmsNumbers
    //
    // msg91AlertTemplateId set na ho to kuch nahi karta - bilkul order SMS ki
    // tarah - taki DLT approval aane se pehle bhi ye code deploy ho sake aur
    // kuch toote nahi.
    //
    // Do baatein jaanbujh kar aisi hain:
    //
    // 1. Sandesh ek hi variable me jata hai (##problem##). DLT har variable ko
    //    alag se approve karta hai, aur jitne zyada variable, utni zyada baar
    //    template reject hota hai. Ek chhoti si jagah bharna sabse aasaan
    //    nikalta hai.
    //
    // 2. Teeno number ek hi call me jate hain. MSG91 ki Flow API recipients ki
    //    list leti hai, aur alag-alag call karne par ek number ka fail hona
    //    baaki do ko bhi le doobta.
    //
    // Aur wahi purani baat, yahan likhi rehni chahiye: ye SMS server ke ANDAR
    // se jata hai. Jis din server hi band hoga, ye SMS bhi nahi jayega. Uske
    // liye bahar wali uptime service hi ek raasta hai.
    public async Task<bool> SendAlertSmsAsync(string problem)
    {
        var authKey    = await Setting("msg91AuthKey");
        var templateId = await Setting("msg91AlertTemplateId");
        var sender     = await Setting("msg91SenderId");
        var rawNumbers = await Setting("alertSmsNumbers");
        if (string.IsNullOrWhiteSpace(sender)) sender = "MAHFHB";

        if (string.IsNullOrWhiteSpace(authKey) || string.IsNullOrWhiteSpace(templateId))
        {
            _logger.LogInformation("Alert SMS skipped - MSG91 alert template not configured (msg91AlertTemplateId).");
            return false;
        }

        var numbers = (rawNumbers ?? "")
            .Split(new[] { ',', ';', ' ', '\n', '\r', '\t' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(NormalisePhone)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (numbers.Count == 0)
        {
            _logger.LogWarning("Alert SMS skipped - no numbers in Settings 'alertSmsNumbers'.");
            return false;
        }

        // SMS ek line ka hota hai. Lamba sandesh do-teen SMS me tootta hai,
        // paisa bhi zyada lagta hai aur DLT ki lambai ki seema bhi hai.
        var text = (problem ?? "").Replace('\n', ' ').Replace('\r', ' ').Trim();
        if (text.Length > 90) text = text[..90];
        if (text.Length == 0) text = "website me kharabi";

        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };

            var payload = new
            {
                template_id = templateId,
                sender      = sender,
                short_url   = "0",
                recipients  = numbers.Select(n => new Dictionary<string, string>
                {
                    ["mobiles"] = n,
                    ["problem"] = text,
                    ["var1"]    = text,
                }).ToArray(),
            };

            var json = System.Text.Json.JsonSerializer.Serialize(payload);

            using var reqMsg = new HttpRequestMessage(HttpMethod.Post,
                "https://control.msg91.com/api/v5/flow/")
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
            };
            reqMsg.Headers.Add("authkey", authKey);
            reqMsg.Headers.Add("accept", "application/json");

            var res      = await http.SendAsync(reqMsg);
            var bodyText = await res.Content.ReadAsStringAsync();
            var ok = res.IsSuccessStatusCode
                && bodyText.Contains("success", StringComparison.OrdinalIgnoreCase);

            if (ok) _logger.LogInformation("Alert SMS accepted for {Count} number(s).", numbers.Count);
            else    _logger.LogWarning("Alert SMS rejected ({Status}): {Body}", (int)res.StatusCode, bodyText);
            return ok;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Alert SMS failed.");
            return false;
        }
    }
}
