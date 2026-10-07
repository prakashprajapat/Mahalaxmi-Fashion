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

    /// <summary>A file to hang off an email: its name, its bytes, and what it is.</summary>
    public readonly record struct Attachment(string FileName, byte[] Content, string MediaType);

    // Returns true if the email was accepted by the SMTP server, false otherwise.
    public Task<bool> SendAsync(string toEmail, string subject, string htmlBody) =>
        SendAsync(new[] { toEmail }, subject, htmlBody, null);

    /// <summary>
    /// Send to one or more people, optionally carrying files. Used by the nightly
    /// backup, which needs the database dump and the day's new photos attached.
    /// </summary>
    public async Task<bool> SendAsync(
        IEnumerable<string> recipients,
        string subject,
        string htmlBody,
        IEnumerable<Attachment>? attachments)
    {
        if (!IsConfigured)
        {
            _logger.LogWarning("Email not sent — SMTP is not configured (Email:Host/User/Password missing).");
            return false;
        }

        var to = recipients
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Select(r => r.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (to.Count == 0)
        {
            _logger.LogWarning("Email not sent — no recipient.");
            return false;
        }

        // Every attachment stream has to stay open until the message is sent,
        // so they are disposed together after the send, not as they are made.
        var streams = new List<MemoryStream>();
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
            foreach (var addr in to) msg.To.Add(addr);

            foreach (var a in attachments ?? Enumerable.Empty<Attachment>())
            {
                var stream = new MemoryStream(a.Content);
                streams.Add(stream);
                msg.Attachments.Add(new System.Net.Mail.Attachment(stream, a.FileName, a.MediaType));
            }

            using var client = new SmtpClient(host, port)
            {
                Credentials    = new NetworkCredential(user, pass),
                EnableSsl      = true,   // STARTTLS on port 587
                DeliveryMethod = SmtpDeliveryMethod.Network,
            };

            await client.SendMailAsync(msg);
            _logger.LogInformation("Email sent to {Email} (subject: {Subject}).", LogSafe.Email(string.Join(", ", to)), subject);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {Email}.", LogSafe.Email(string.Join(", ", to)));
            return false;
        }
        finally
        {
            foreach (var st in streams) st.Dispose();
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
    <img src=""https://mahalaxmifashionhub.com/email-logo.png"" alt=""Mahalaxmi Fashion Hub"" width=""230"" style=""max-width:230px;width:230px;height:auto;display:inline-block"" />
  </div>
  <div style=""padding:24px"">
    <p style=""color:#333;font-size:15px;margin:0 0 12px"">Your OTP for <strong>Mahalaxmi Fashion Hub</strong> is:</p>
    <p style=""font-size:32px;font-weight:800;letter-spacing:.25em;color:#a7354d;margin:8px 0 16px"">{otp}</p>
    <p style=""color:#777;font-size:13px;margin:0"">Valid for {validMinutes} minutes. Please do not share this code with anyone.</p>
  </div>
</div>";
    }

    // Birthday / anniversary offer email.
    //
    // Ye SMS ki naqal nahi hai. SMS me 160 akshar ki seema hai aur har shabd
    // DLT par manzoor hona padta hai, isliye wahan sirf itna likha ja sakta
    // hai: tareekh, chhoot, code. Email par na seema hai na manzoori, to
    // yahan code bada dikhta hai, kab tak chalega saaf likha hai, aur "Shop
    // now" ka batan seedha dukaan par le jata hai.
    //
    // isTheDay == true matlab aaj wahi din hai - tab "Happy Birthday" likha
    // jata hai. Usse pehle wahi baat jhooth hogi, isliye tab sirf itna kehte
    // hain ki din aa raha hai.
    public static string BuildCelebrationEmail(
        string firstName,
        string occasion,
        bool isTheDay,
        string? occasionOn,
        string percent,
        string code,
        string? validTill)
    {
        var who = string.IsNullOrWhiteSpace(firstName) ? "" : ", " + firstName.Trim();
        var isAnniversary = occasion == "anniversary";
        var word = isAnniversary ? "anniversary" : "birthday";

        var heading = isTheDay
            ? (isAnniversary ? $"Happy Anniversary{who}!" : $"Happy Birthday{who}!")
            : (isAnniversary ? $"Your anniversary is coming up{who}" : $"Your birthday is coming up{who}");

        var line = isTheDay
            ? "Wishing you a wonderful day from all of us at Mahalaxmi Fashion Hub. Here is a little something from us."
            : (string.IsNullOrWhiteSpace(occasionOn)
                ? $"Your {word} is almost here, and we did not want to turn up empty-handed."
                : $"Your {word} is on <strong>{occasionOn}</strong>, and we did not want to turn up empty-handed.");

        var valid = string.IsNullOrWhiteSpace(validTill)
            ? "Use it on your next order."
            : $"Use it any time before <strong>{validTill}</strong>.";

        var shopUrl = "https://www.mahalaxmifashionhub.com/?utm_source=email&utm_medium=celebration&utm_campaign="
                      + word + "_offer";

        return $@"
<div style=""font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden"">
  <div style=""background:#ffffff;padding:22px 24px;text-align:center;border-bottom:3px solid #a7354d"">
    <img src=""https://mahalaxmifashionhub.com/email-logo.png"" alt=""Mahalaxmi Fashion Hub"" width=""230"" style=""max-width:230px;width:230px;height:auto;display:inline-block"" />
  </div>
  <div style=""padding:24px"">
    <p style=""color:#a7354d;font-size:20px;font-weight:800;margin:0 0 10px"">{heading}</p>
    <p style=""color:#333;font-size:15px;line-height:1.6;margin:0 0 18px"">{line}</p>

    <div style=""background:#fbf1f3;border:1px dashed #d8a8b4;border-radius:10px;padding:18px;text-align:center"">
      <p style=""color:#7a6b6f;font-size:13px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em"">Your personal offer</p>
      <p style=""color:#a7354d;font-size:30px;font-weight:800;margin:0 0 10px"">{percent}% OFF</p>
      <p style=""color:#333;font-size:14px;margin:0 0 6px"">Use code</p>
      <p style=""font-size:22px;font-weight:800;letter-spacing:.14em;color:#2d2724;margin:0"">{code}</p>
    </div>

    <p style=""color:#555;font-size:13px;line-height:1.6;margin:16px 0 20px"">{valid} This code is yours alone and works once.</p>

    <p style=""text-align:center;margin:0 0 6px"">
      <a href=""{shopUrl}"" style=""background:#a7354d;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 28px;border-radius:8px;display:inline-block"">Shop now</a>
    </p>
    <p style=""color:#999;font-size:12px;text-align:center;margin:14px 0 0"">
      Mahalaxmi Fashion Hub &middot; www.mahalaxmifashionhub.com
    </p>
  </div>
</div>";
    }

    /// <summary>
    /// The "come and have a look" email, sent by hand from the Customers screen
    /// to somebody who made an account and has not been back since.
    ///
    /// Everything here is email-safe on purpose. Gmail throws away a &lt;style&gt;
    /// block and Outlook ignores most of what a browser takes for granted, so
    /// there is no flexbox, no grid, no background image and no web font: every
    /// style is inline, the layout is stacked blocks that cannot break on a
    /// narrow screen, and the only picture is the logo. A dark band and a little
    /// space do the work that a stylesheet would do on the website.
    /// </summary>
    public static string BuildShopInviteEmail(string firstName)
    {
        var who = string.IsNullOrWhiteSpace(firstName) ? "there" : firstName.Trim();

        const string site = "https://www.mahalaxmifashionhub.com";
        const string tag  = "utm_source=email&utm_medium=invite&utm_campaign=shop_invite";

        var shopUrl      = site + "/?" + tag;
        var collectionUrl= site + "/products?" + tag;
        var referUrl     = site + "/account/refer?" + tag;
        const string appUrl       = "https://play.google.com/store/apps/details?id=com.mahalaxmifashionhub.www.twa";
        const string affiliateUrl = "https://affiliate.mahalaxmifashionhub.com/";

        // One row of the "there is more here" list. Kept as a local function so
        // the three of them cannot drift apart.
        static string Row(string title, string line, string label, string url) => $@"
      <div style=""border:1px solid #efe6e2;border-radius:10px;padding:14px 16px;margin:0 0 10px"">
        <p style=""color:#2d2724;font-size:14px;font-weight:700;margin:0 0 4px"">{title}</p>
        <p style=""color:#6b615c;font-size:13px;line-height:1.55;margin:0 0 8px"">{line}</p>
        <a href=""{url}"" style=""color:#a7354d;font-size:13px;font-weight:700;text-decoration:none"">{label} &rarr;</a>
      </div>";

        return $@"
<div style=""background:#faf6f2;padding:24px 12px"">
  <div style=""font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #efe6e2;border-radius:14px;overflow:hidden"">

    <div style=""padding:22px 24px;text-align:center;border-bottom:1px solid #f2ece9"">
      <img src=""https://mahalaxmifashionhub.com/email-logo.png"" alt=""Mahalaxmi Fashion Hub"" width=""220"" style=""max-width:220px;width:220px;height:auto;display:inline-block"" />
    </div>

    <div style=""background:#722f37;padding:26px 24px;text-align:center"">
      <p style=""color:#e8c9ce;font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin:0 0 8px;font-family:Arial,Helvetica,sans-serif"">The new collection is in</p>
      <p style=""color:#ffffff;font-size:25px;font-weight:normal;line-height:1.3;margin:0"">Something you will love<br/>is waiting for you</p>
    </div>

    <div style=""padding:26px 24px 8px"">
      <p style=""color:#2d2724;font-size:16px;line-height:1.6;margin:0 0 14px;font-family:Arial,Helvetica,sans-serif"">Hello {who},</p>
      <p style=""color:#5a514c;font-size:14px;line-height:1.75;margin:0 0 18px;font-family:Arial,Helvetica,sans-serif"">
        You are already part of the Mahalaxmi family &mdash; thank you for that. We have been busy since,
        and there is a good deal on the shelves now that was not there when you last looked.
      </p>

      <p style=""color:#8a7f76;font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin:0 0 10px;font-family:Arial,Helvetica,sans-serif"">What is new</p>
      <p style=""color:#2d2724;font-size:15px;line-height:1.9;margin:0 0 22px"">
        Sarees &nbsp;&middot;&nbsp; Nighties &nbsp;&middot;&nbsp; Dresses<br/>
        Kurti Sets &nbsp;&middot;&nbsp; Rajasthani Wear &nbsp;&middot;&nbsp; Fabrics
      </p>

      <p style=""text-align:center;margin:0 0 10px"">
        <a href=""{collectionUrl}"" style=""background:#a7354d;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 34px;border-radius:9px;display:inline-block;font-family:Arial,Helvetica,sans-serif"">See the new collection</a>
      </p>
      <p style=""text-align:center;color:#8a7f76;font-size:12px;margin:0 0 24px;font-family:Arial,Helvetica,sans-serif"">
        Hand-checked before it ships &middot; 7-day returns &middot; Delivered across India
      </p>

      <div style=""border-top:1px solid #f2ece9;padding-top:20px"">
        <p style=""color:#8a7f76;font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin:0 0 12px;font-family:Arial,Helvetica,sans-serif"">There is more here than the shop</p>
{Row("Shop from the app", "Your orders, your addresses and your wallet in one place, and the app tells you the moment a parcel moves.", "Get it on Google Play", appUrl)}
{Row("Refer &amp; Earn", "Send the shop to a friend. When they order, you both get something back.", "See your referral link", referUrl)}
{Row("Earn as a creator", "Making content? Join the affiliate programme and earn on every order that comes through you.", "Join the programme", affiliateUrl)}
      </div>
    </div>

    <div style=""background:#faf6f2;padding:20px 24px;text-align:center;border-top:1px solid #f2ece9"">
      <p style=""color:#722f37;font-size:15px;margin:0 0 4px"">Mahalaxmi Fashion Hub</p>
      <p style=""color:#8a7f76;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 12px;font-family:Arial,Helvetica,sans-serif"">Fashion &middot; Quality &middot; Value</p>
      <p style=""color:#9a908a;font-size:11px;line-height:1.6;margin:0;font-family:Arial,Helvetica,sans-serif"">
        <a href=""{shopUrl}"" style=""color:#9a908a;text-decoration:none"">www.mahalaxmifashionhub.com</a><br/>
        Balotra, Rajasthan
      </p>
    </div>
  </div>
</div>";
    }
}
