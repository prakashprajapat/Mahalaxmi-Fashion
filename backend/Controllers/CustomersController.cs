using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using MahalaxmiApi.Data;
using MahalaxmiApi.DTOs;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;

using MahalaxmiApi.Authorization;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CustomersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuthService _auth;
    private readonly IWebHostEnvironment _env;
    private readonly EmailService _email;
    private readonly SmsService _sms;
    private readonly AdminNotifier _notify;
    private readonly ILogger<CustomersController> _log;

    public CustomersController(AppDbContext db, AuthService auth, IWebHostEnvironment env, EmailService email, SmsService sms, AdminNotifier notify, ILogger<CustomersController> log)
    {
        _db = db;
        _auth = auth;
        _env = env;
        _email = email;
        _sms = sms;
        _notify = notify;
        _log = log;
    }

    // Generates the next sequential customer code: MFHCUS1005, MFHCUS1006, ...
    // Backed by a PostgreSQL sequence so a number is NEVER reused, even if a customer deletes their account.
    private async Task<string> NextCustomerCodeAsync()
    {
        // Create the counter on first use, seeded to continue after the highest existing MFHCUS code
        // (minimum 1004, so the very first issued code is MFHCUS1005).
        await _db.Database.ExecuteSqlRawAsync(@"
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'customer_code_seq' AND relkind = 'S') THEN
                    CREATE SEQUENCE customer_code_seq;
                    PERFORM setval(
                        'customer_code_seq',
                        GREATEST(
                            1004,
                            (SELECT COALESCE(MAX(CAST(SUBSTRING(customer_code FROM 'MFHCUS([0-9]+)$') AS INTEGER)), 1004)
                             FROM customers)
                        ),
                        true
                    );
                END IF;
            END $$;");

        var next = await _db.Database
            .SqlQueryRaw<long>("SELECT nextval('customer_code_seq') AS \"Value\"")
            .FirstAsync();

        return "MFHCUS" + next;
    }

    // GET /api/customers  (Admin only)
    [HttpGet]
    [Authorize]
    [RequirePerm("customers")]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var query = _db.Customers.AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            query = query.Where(c =>
                c.FirstName.ToLower().Contains(s) ||
                c.LastName.ToLower().Contains(s) ||
                (c.Email ?? "").ToLower().Contains(s) ||
                c.Phone.Contains(s) ||
                c.CustomerCode.ToLower().Contains(s));
        }

        var total = await query.CountAsync();
        var customers = await query
            .OrderByDescending(c => c.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => ToDto(c))
            .ToListAsync();

        return Ok(new { success = true, customers, total });
    }

    // GET /api/customers/phones?optedInOnly=true  (Admin only)
    // Returns just the 10-digit mobile numbers for a bulk SMS/WhatsApp campaign,
    // de-duplicated. Used by the admin "Bulk Campaigns" page to export a list that
    // is then uploaded to the MSG91 bulk panel.
    [HttpGet("phones")]
    [Authorize]
    [RequirePerm("customers","campaigns")]
    public async Task<IActionResult> GetPhones([FromQuery] bool optedInOnly = false)
    {
        var query = _db.Customers.AsQueryable();
        if (optedInOnly)
            query = query.Where(c => c.MarketingConsent);

        var raw = await query
            .Where(c => c.Phone != null && c.Phone != "")
            .Select(c => c.Phone!)
            .ToListAsync();

        // Normalise to last-10-digit, drop invalid, de-duplicate.
        var phones = raw
            .Select(p => new string(p.Where(char.IsDigit).ToArray()))
            .Select(d => d.Length > 10 ? d[^10..] : d)
            .Where(d => d.Length == 10)
            .Distinct()
            .ToList();

        var totalCustomers = await _db.Customers.CountAsync();
        var optedIn = await _db.Customers.CountAsync(c => c.MarketingConsent);

        return Ok(new { success = true, phones, count = phones.Count, totalCustomers, optedIn });
    }

    // POST /api/customers/campaign  (Admin only)
    // Sends a bulk promotional SMS to customers via MSG91 — fully server-side, no
    // MSG91 website needed. templateId must be a DLT-approved promotional template.
    [HttpPost("campaign")]
    [Authorize]
    [RequirePerm("campaigns")]
    public async Task<IActionResult> SendCampaign([FromBody] BulkCampaignRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.TemplateId))
            return BadRequest(new { success = false, message = "DLT-approved template ID is required." });

        var query = _db.Customers.AsQueryable();
        if (req.OptedInOnly) query = query.Where(c => c.MarketingConsent);

        var raw = await query.Where(c => c.Phone != null && c.Phone != "").Select(c => c.Phone!).ToListAsync();
        var phones = raw
            .Select(p => new string(p.Where(char.IsDigit).ToArray()))
            .Select(d => d.Length > 10 ? d[^10..] : d)
            .Where(d => d.Length == 10)
            .Distinct()
            .ToList();

        if (phones.Count == 0)
            return Ok(new { success = false, message = "No recipients found for this selection." });

        var result = await _sms.SendBulkCampaignAsync(phones, req.TemplateId.Trim(), req.Vars);
        if (!result.Configured)
            return StatusCode(500, new { success = false, message = result.Error });

        return Ok(new
        {
            success = result.Failed == 0,
            sent = result.Sent,
            failed = result.Failed,
            total = phones.Count,
            message = result.Error ?? $"Campaign sent to {result.Sent} number(s).",
        });
    }

    // GET /api/customers/celebrations?days=15
    [HttpGet("celebrations")]
    [Authorize]
    [RequirePerm("birthday")]
    public async Task<IActionResult> GetCelebrations([FromQuery] int days = 15)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var all = await _db.Customers
            .Where(c => c.AccountStatus == "active" && (c.DateOfBirth != null || c.MarriageDate != null))
            .ToListAsync();

        var result = all
            .Select(c => new {
                customer     = ToDto(c),
                birthdayIn   = DaysUntil(today, c.DateOfBirth),
                anniversaryIn = DaysUntil(today, c.MarriageDate),
            })
            .Where(x => (x.birthdayIn.HasValue && x.birthdayIn.Value <= days) ||
                        (x.anniversaryIn.HasValue && x.anniversaryIn.Value <= days))
            .OrderBy(x => Math.Min(x.birthdayIn ?? 999, x.anniversaryIn ?? 999))
            .ToList();

        return Ok(new { success = true, celebrations = result });
    }

    // POST /api/customers/send-celebration-sms
    [HttpPost("send-celebration-sms")]
    [Authorize]
    [RequirePerm("birthday")]
    public async Task<IActionResult> SendCelebrationSms([FromBody] CelebrationSmsRequest req)
    {
        var authKey    = await _db.SiteSettings.Where(s => s.Key == "msg91AuthKey").Select(s => s.Value).FirstOrDefaultAsync();

        var occasion = (req.Occasion ?? "birthday").Trim().ToLowerInvariant();
        occasion = occasion == "anniversary" ? "anniversary" : "birthday";

        if (string.IsNullOrWhiteSpace(authKey))
            return BadRequest(new { success = false, message = "Offer SMS not configured. Set 'msg91AuthKey' in Settings → MSG91 Configuration." });

        if (string.IsNullOrWhiteSpace(req.Phone))
            return BadRequest(new { success = false, message = "Phone number is required." });

        // Find the customer this offer is for (match on the last 10 digits of the phone).
        var digits = new string(req.Phone.Where(char.IsDigit).ToArray());
        var last10 = digits.Length >= 10 ? digits[^10..] : digits;
        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Phone != null && c.Phone.EndsWith(last10));

        // Reuse an existing unused personal code for this customer+occasion, else mint a new one.
        Coupon? coupon = null;
        if (customer != null)
        {
            coupon = await _db.Coupons.FirstOrDefaultAsync(c =>
                c.CustomerId == customer.Id && c.Occasion == occasion && c.IsActive
                && c.UsedCount < (c.MaxUses ?? 1)
                && (c.ExpiresAt == null || c.ExpiresAt > DateTimeOffset.UtcNow));
        }
        if (coupon is null)
        {
            var pctStr = await _db.SiteSettings.Where(s => s.Key == "celebrationOfferPercent").Select(s => s.Value).FirstOrDefaultAsync();
            var pct = decimal.TryParse(pctStr, out var p) && p > 0 ? p : 10m;   // default 10% off
            var prefix = occasion == "anniversary" ? "AN" : "BD";
            string code;
            do { code = $"{prefix}-{RandCode(5)}"; }
            while (await _db.Coupons.AnyAsync(c => c.Code == code));
            coupon = new Coupon
            {
                Code = code, Type = "percent", Value = pct, MinOrder = 0,
                Occasion = occasion, CustomerId = customer?.Id,
                MaxUses = 1, UsedCount = 0,
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(40),   // covers the 30-day slab + buffer
                IsActive = true, CreatedAt = DateTimeOffset.UtcNow,
            };
            _db.Coupons.Add(coupon);
            await _db.SaveChangesAsync();
        }

        var phone = req.Phone.TrimStart('+').Replace(" ", "");
        if (!phone.StartsWith("91")) phone = "91" + phone;

        // How many days until the day itself. A greeting sent a month early must
        // not read "Happy Birthday" — that is a different message, so it is a
        // different template. Counted here from the customer's own date rather
        // than taken from the browser, so the wording cannot be off by a slab.
        var todayIst = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(5.5));
        var daysAway = occasion == "anniversary"
            ? DaysUntil(todayIst, customer?.MarriageDate)
            : DaysUntil(todayIst, customer?.DateOfBirth);
        var isTheDay = daysAway is 0;

        // The day itself, spelled out. "in 25 days" makes the reader do the
        // arithmetic and goes stale the moment the message sits unread; a date
        // still means the same thing tomorrow.
        var occasionOn = occasion == "anniversary"
            ? NextOccurrence(todayIst, customer?.MarriageDate)
            : NextOccurrence(todayIst, customer?.DateOfBirth);

        // The upcoming templates print the date. With no date on file the
        // variable is empty and the customer receives "Your birthday is on ."
        // Better to say so here than to send that.
        if (occasionOn is null && !isTheDay)
            return BadRequest(new { success = false, message =
                $"No {(occasion == "anniversary" ? "marriage date" : "date of birth")} on file for this customer, "
                + "so the message would have a blank date in it. Add the date first." });

        // Combirthday reads "Your birthday is on{#alp#}." with no space after
        // "on" — that is how it is registered on DLT, so the space has to come
        // from the value. ComAnni has the space already.
        var dateText = occasionOn is null ? ""
            : (occasion == "anniversary" ? "" : " ") + occasionOn.Value.ToString("dd MMM yyyy");

        // Today has its own template; everything earlier shares the "upcoming"
        // one and says how many days are left. Each step falls back to the next
        // so a shop that has registered only one template still sends something.
        string SettingName(string suffix) =>
            (occasion == "anniversary" ? "msg91Anniversary" : "msg91Birthday") + suffix;

        var candidates = isTheDay
            ? new[] { SettingName("TodayTemplateId"), SettingName("TemplateId"), "msg91CelebrationTemplateId" }
            : new[] { SettingName("TemplateId"), SettingName("TodayTemplateId"), "msg91CelebrationTemplateId" };

        string? templateId = null;
        foreach (var key in candidates)
        {
            templateId = await _db.SiteSettings.Where(x => x.Key == key).Select(x => x.Value).FirstOrDefaultAsync();
            if (!string.IsNullOrWhiteSpace(templateId)) break;
        }
        if (string.IsNullOrWhiteSpace(templateId))
            return BadRequest(new { success = false, message = $"No {(isTheDay ? "on-the-day" : "upcoming")} {occasion} template is set. Add it in Settings → MSG91 Configuration." });

        // The discount comes from the coupon, never typed into the template by
        // hand — change the percent in Settings and a hardcoded template would
        // go on promising the old one, which is a promise we would not keep.
        var percentText = coupon.Value.ToString("0.##");

        using var http = new System.Net.Http.HttpClient();

        // The four templates registered on DLT against header 523611, and the
        // variables each one takes, in order:
        //
        //   Combirthday       1077395740079927133   date, percent, code
        //     "Your birthday is on{#alp#}. Get {#num#}% off at Mahalaxmi
        //      Fashion Hub with code {#alp#}, valid till your birdhday.
        //      Shop now www.mahalaxmifashionhub.com"
        //   ComAnni           1077432270080599648   date, percent, code
        //   HappyBirthday     1077454970079944897   percent, code
        //   HappyAnniversary  1077490780079969170   percent, code
        //
        // Name these three variables date / percent / code in MSG91 and they
        // fill themselves. Anything else sent here is ignored, so the two
        // on-the-day templates simply do not use date.
        var payload = new {
            template_id = templateId,
            // Left OFF on purpose. MSG91 would rewrite the link to its own
            // short domain, and TRAI now requires every address in an SMS to be
            // whitelisted on DLT against this sender. A rewritten link is not
            // the one that was registered, so the message can be scrubbed on
            // the operator's side — the SMS goes out looking fine to us and
            // never reaches the customer.
            short_url   = "0",
            recipients  = new[] { new {
                mobiles = phone,
                date    = dateText,
                percent = percentText,
                code    = coupon.Code,
            } }
        };
        var body = System.Text.Json.JsonSerializer.Serialize(payload);
        var httpReq = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, "https://api.msg91.com/api/v5/flow/")
        {
            Content = new System.Net.Http.StringContent(body, System.Text.Encoding.UTF8, "application/json")
        };
        httpReq.Headers.Add("authkey", authKey);

        string resBody;
        try
        {
            var res = await http.SendAsync(httpReq);
            resBody = await res.Content.ReadAsStringAsync();

            // MSG91 answers 200 with {"type":"error"} for a rejected template,
            // a bad variable or a number on DND. Reporting "SMS sent" off the
            // HTTP status alone told the shop the offer went out when it had
            // not, and the button then hid itself for that slab.
            var ok = res.IsSuccessStatusCode
                     && !resBody.Contains("\"type\":\"error\"", StringComparison.OrdinalIgnoreCase);
            if (!ok)
            {
                _log.LogError("Celebration SMS rejected by MSG91 ({Status}): {Body}", (int)res.StatusCode, resBody);
                return BadRequest(new { success = false, couponCode = coupon.Code, response = resBody,
                    message = "MSG91 did not accept the message. The coupon " + coupon.Code
                        + " is created and still valid, so this can be retried. MSG91 said: " + Trim200(resBody) });
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Celebration SMS could not be sent");
            return BadRequest(new { success = false, couponCode = coupon.Code,
                message = "Could not reach MSG91 just now. Coupon " + coupon.Code + " is created; try again." });
        }

        return Ok(new { success = true, message = $"SMS sent to {req.Phone}.", couponCode = coupon.Code, response = resBody });
    }

    /// Enough of a gateway's reply to act on, without pasting a wall of JSON
    /// into an admin toast.
    private static string Trim200(string s) =>
        string.IsNullOrWhiteSpace(s) ? "(no reply)"
        : s.Length <= 200 ? s.Trim() : s.Trim()[..200] + "\u2026";

    // Short, unambiguous random code (no easily-confused chars like 0/O/1/I).
    private static string RandCode(int n)
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var rng = Random.Shared;
        return new string(Enumerable.Range(0, n).Select(_ => chars[rng.Next(chars.Length)]).ToArray());
    }

    /// The next time this day comes round — this year if it is still ahead,
    /// otherwise next year. The same rule DaysUntil counts against, so the
    /// date in the message and the slab on the screen can never disagree.
    private static DateOnly? NextOccurrence(DateOnly today, DateOnly? date)
    {
        if (!date.HasValue) return null;
        var d = date.Value;
        var thisYear = new DateOnly(today.Year, d.Month, d.Day);
        return thisYear < today ? thisYear.AddYears(1) : thisYear;
    }

    private static int? DaysUntil(DateOnly today, DateOnly? date)
    {
        if (!date.HasValue) return null;
        var d = date.Value;
        var thisYear = new DateOnly(today.Year, d.Month, d.Day);
        if (thisYear < today) thisYear = thisYear.AddYears(1);
        return (thisYear.ToDateTime(TimeOnly.MinValue) - today.ToDateTime(TimeOnly.MinValue)).Days;
    }

    // GET /api/customers/{id}
    [HttpGet("{id:int}")]
    [Authorize]
    public async Task<IActionResult> GetById(int id)
    {
        var c = await _db.Customers.FindAsync(id);
        if (c is null) return NotFound();
        return Ok(new { success = true, customer = ToDto(c) });
    }

    // POST /api/customers/register
    [HttpPost("register")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        var email = req.Email.ToLower().Trim();
        var phone = req.Phone?.Trim() ?? "";

        if (await _db.Customers.AnyAsync(c => c.Email == email))
            return Conflict(new { success = false, message = "Email already registered." });

        if (!string.IsNullOrWhiteSpace(phone) && await _db.Customers.AnyAsync(c => c.Phone == phone))
            return Conflict(new { success = false, message = "Phone already registered." });

        // OTP verification is MANDATORY for public self-registration — the account is created
        // only after the mobile (or email) has been verified with a one-time code. An admin
        // creating a customer from the panel (authenticated with the admin role) is exempt.
        var isAdminCreate = User.HasSectionAccess("customers");
        if (!isAdminCreate)
        {
            var otpOk = await VerifyOtpToken(phone, email, req.Otp ?? "");
            if (!otpOk)
                return BadRequest(new { success = false, message = "Please verify the OTP sent to your mobile number before creating the account." });
        }

        var (hash, salt) = _auth.HashPassword(req.Password);
        var code = await NextCustomerCodeAsync();

        var customer = new Customer
        {
            CustomerCode     = code,
            FirstName        = req.FirstName.Trim(),
            LastName         = req.LastName.Trim(),
            Email            = email,
            Phone            = phone,
            Gender           = req.Gender ?? "",
            DateOfBirth      = ParseDate(req.DateOfBirth),
            MarriageDate     = ParseDate(req.MarriageDate ?? req.AnniversaryDate),
            AddrLine1        = req.AddrLine1?.Trim() ?? "",
            AddrLine2        = req.AddrLine2?.Trim() ?? "",
            Pincode          = req.Pincode?.Trim() ?? "",
            PostOffice       = req.PostOffice?.Trim() ?? "",
            State            = req.State?.Trim() ?? "",
            District         = req.District?.Trim() ?? "",
            MarketingConsent = req.MarketingConsent,
            PasswordHash     = hash,
            PasswordSalt     = salt,
            SubmittedAt      = DateTimeOffset.UtcNow.ToString("o"),
            EmailVerified    = isAdminCreate || !string.IsNullOrWhiteSpace(req.Otp),
        };

        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();

        // Notify admin of the new customer registration (email — fire-and-forget).
        await _notify.NotifyAsync($"New customer - {customer.FirstName} {customer.LastName}".Trim(),
            AdminNotifier.Wrap("New Customer Registered", $@"
                <p><strong>Name:</strong> {System.Net.WebUtility.HtmlEncode($"{customer.FirstName} {customer.LastName}".Trim())}</p>
                <p><strong>Email:</strong> {System.Net.WebUtility.HtmlEncode(customer.Email ?? "")}</p>
                <p><strong>Mobile:</strong> {System.Net.WebUtility.HtmlEncode(customer.Phone ?? "")}</p>
                <p><strong>Code:</strong> {customer.CustomerCode}</p>"));

        var token = _auth.GenerateJwt(customer.Id.ToString(), customer.Email ?? "", "customer");
        return Ok(new { success = true, token, customer = ToDto(customer) });
    }

    // POST /api/customers/login
    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var customer = await _db.Customers
            .FirstOrDefaultAsync(c => c.Email == req.Email.ToLower().Trim());

        if (customer is null || !_auth.VerifyPassword(req.Password, customer.PasswordHash, customer.PasswordSalt))
            return Unauthorized(new { success = false, message = "Invalid email or password." });

        if (customer.AccountStatus != "active")
            return Unauthorized(new { success = false, message = "Account is deactivated." });

        var token = _auth.GenerateJwt(customer.Id.ToString(), customer.Email ?? "", "customer");
        return Ok(new { success = true, token, customer = ToDto(customer) });
    }

    // POST /api/customers/send-otp
    [HttpPost("send-otp")]
    [EnableRateLimiting("auth")]  // SEC-8: prevent OTP spam
    public async Task<IActionResult> SendOtp([FromBody] SendOtpRequest req)
    {
        var phoneOrEmail = req.Phone?.Trim() ?? "";
        var email = req.Email?.Trim() ?? "";
        if (phoneOrEmail.Contains('@') && string.IsNullOrWhiteSpace(email))
        {
            email = phoneOrEmail;
            phoneOrEmail = "";
        }
        if (string.IsNullOrWhiteSpace(phoneOrEmail) && string.IsNullOrWhiteSpace(email))
            return BadRequest(new { success = false, message = "Phone or email is required." });

        // Generate 6-digit OTP
        var otp = Random.Shared.Next(100000, 999999).ToString();
        var (hash, _) = _auth.HashPassword(otp);

        // Remove old OTPs for this destination (CQ-9: also purge expired tokens)
        var old = _db.OtpTokens.Where(t =>
            (t.Used || t.ExpiresAt < DateTimeOffset.UtcNow ||
            (!string.IsNullOrWhiteSpace(phoneOrEmail) && t.Phone == phoneOrEmail) ||
             (!string.IsNullOrWhiteSpace(email) && t.Email == email)));
        _db.OtpTokens.RemoveRange(old);

        _db.OtpTokens.Add(new OtpToken
        {
            Phone     = phoneOrEmail,
            Email     = email,
            OtpHash   = hash,
            Purpose   = req.Purpose ?? "login",
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(5),
        });
        await _db.SaveChangesAsync();

        // Deliver the OTP: email via SMTP, or mobile via MSG91 SMS.
        var sent = false;
        if (!string.IsNullOrWhiteSpace(email))
            sent = await _email.SendAsync(
                email,
                "Your Mahalaxmi Fashion Hub login code",
                EmailService.BuildOtpEmail(otp, "login", 5));
        else if (!string.IsNullOrWhiteSpace(phoneOrEmail))
            sent = await _sms.SendOtpAsync(phoneOrEmail, otp);

        // SEC-1: never expose the OTP in production — it would allow account takeover. Only
        // return it in local development. If delivery failed in production, report an error.
        if (_env.IsDevelopment())
            return Ok(new { success = true, message = "OTP sent.", devOtp = otp });
        if (!sent)
            return StatusCode(500, new { success = false, message = "Could not send the OTP right now. Please try again in a moment." });
        return Ok(new { success = true, message = "OTP sent." });
    }

    // POST /api/customers/verify-otp
    [HttpPost("verify-otp")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> VerifyOtp([FromBody] OtpLoginRequest req)
    {
        var phone = req.Phone.Trim();
        var isEmail = phone.Contains('@');
        var otpRecord = await _db.OtpTokens
            .Where(t => (isEmail ? t.Email == phone : t.Phone == phone) && !t.Used && t.ExpiresAt > DateTimeOffset.UtcNow)
            .OrderByDescending(t => t.CreatedAt)
            .FirstOrDefaultAsync();

        if (otpRecord is null)
            return BadRequest(new { success = false, message = "OTP expired or not found." });

        if (otpRecord.Attempts >= 5)
            return BadRequest(new { success = false, message = "Too many attempts." });

        if (!_auth.VerifyPassword(req.Otp, otpRecord.OtpHash, ""))
        {
            otpRecord.Attempts++;
            await _db.SaveChangesAsync();
            return BadRequest(new { success = false, message = "Invalid OTP." });
        }

        otpRecord.Used = true;
        await _db.SaveChangesAsync();

        var customer = isEmail
            ? await _db.Customers.FirstOrDefaultAsync(c => c.Email == phone.ToLower())
            : await FindCustomerByIdentifier(phone);

        // First-time OTP login (mobile or email) auto-creates a passwordless account.
        if (customer is null)
        {
            customer = new Customer
            {
                CustomerCode     = await NextCustomerCodeAsync(),
                FirstName        = isEmail ? phone.Split('@')[0] : "",
                LastName         = "",
                // Phone-only signups start with no email; the customer adds it later via profile update.
                Email            = isEmail ? phone.ToLower() : null,
                Phone            = isEmail ? "" : phone,
                PasswordHash     = "",
                PasswordSalt     = "",
                EmailVerified    = isEmail,
                MarketingConsent = true,
                SubmittedAt      = DateTimeOffset.UtcNow.ToString("o"),
            };
            _db.Customers.Add(customer);
            await _db.SaveChangesAsync();
        }

        var token = _auth.GenerateJwt(customer.Id.ToString(), customer.Email ?? "", "customer");
        return Ok(new { success = true, token, customer = ToDto(customer) });
    }

    // POST /api/customers/forgot-password/send-otp
    // Accepts an email OR a mobile number, finds the account, and sends the SAME
    // OTP to every channel the account has registered (email and/or mobile).
    [HttpPost("forgot-password/send-otp")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ForgotPasswordSendOtp([FromBody] ForgotPasswordOtpRequest req)
    {
        var idf = (req.Identifier ?? "").Trim();
        if (string.IsNullOrWhiteSpace(idf))
            return BadRequest(new { success = false, message = "Email or mobile number is required." });

        var customer = await FindCustomerByIdentifier(idf);
        if (customer is null)
            return NotFound(new { success = false, message = "No account found for this email or mobile number." });

        var accEmail = (customer.Email ?? "").Trim().ToLower();
        var accPhone = (customer.Phone ?? "").Trim();
        if (string.IsNullOrWhiteSpace(accEmail) && string.IsNullOrWhiteSpace(accPhone))
            return BadRequest(new { success = false, message = "This account has no email or mobile on file to send an OTP to." });

        var otp = Random.Shared.Next(100000, 999999).ToString();
        var (hash, _) = _auth.HashPassword(otp);

        // Purge old reset OTPs for this account's contacts.
        var old = _db.OtpTokens.Where(t =>
            t.Used || t.ExpiresAt < DateTimeOffset.UtcNow ||
            (accPhone != "" && t.Phone == accPhone) ||
            (accEmail != "" && t.Email == accEmail));
        _db.OtpTokens.RemoveRange(old);

        // One token carrying BOTH contacts, so verification by either works.
        _db.OtpTokens.Add(new OtpToken
        {
            Phone     = accPhone,
            Email     = accEmail,
            OtpHash   = hash,
            Purpose   = "reset",
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(5),
        });
        await _db.SaveChangesAsync();

        // Send the SAME OTP to every channel the account has.
        var emailed = false;
        var texted  = false;
        if (!string.IsNullOrWhiteSpace(accEmail))
            emailed = await _email.SendAsync(accEmail,
                "Your Mahalaxmi Fashion Hub password reset code",
                EmailService.BuildOtpEmail(otp, "password reset", 5));
        if (!string.IsNullOrWhiteSpace(accPhone))
            texted = await _sms.SendOtpAsync(accPhone, otp);

        var sentTo = new
        {
            email = emailed ? MaskEmail(accEmail) : null,
            phone = texted  ? MaskPhone(accPhone) : null,
        };

        // Never leak the OTP in production (account-takeover risk) — dev only.
        if (_env.IsDevelopment())
            return Ok(new { success = true, message = "OTP generated.", sentTo, devOtp = otp });
        if (!emailed && !texted)
            return StatusCode(500, new { success = false, message = "Could not send the reset code. Please try again shortly." });
        return Ok(new { success = true, message = "OTP sent.", sentTo });
    }

    // POST /api/customers/reset-password
    [HttpPost("reset-password")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest req)
    {
        // req.Email carries the identifier the customer entered — email OR mobile.
        var idf = (req.Email ?? "").Trim();
        var customer = await FindCustomerByIdentifier(idf);
        if (customer is null)
            return NotFound(new { success = false, message = "No account found for this email or mobile number." });

        if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
            return BadRequest(new { success = false, message = "Password must be at least 8 characters." });

        // The reset OTP token carries both the account's email and phone, so
        // verify against whichever contacts the account actually has.
        var accEmail = (customer.Email ?? "").Trim().ToLower();
        var accPhone = (customer.Phone ?? "").Trim();
        var otpOk = await VerifyOtpToken(accPhone, accEmail, req.Otp);
        if (!otpOk)
            return BadRequest(new { success = false, message = "Invalid or expired OTP." });

        var (hash, salt) = _auth.HashPassword(req.Password);
        customer.PasswordHash = hash;
        customer.PasswordSalt = salt;
        customer.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true });
    }

    // PUT /api/customers/{id}  (Self or Admin)
    [HttpPut("{id:int}")]
    [Authorize]
    public async Task<IActionResult> UpdateProfile(int id, [FromBody] UpdateProfileRequest req)
    {
        // SEC-3 IDOR: only the customer themselves or an admin can update
        var callerId = User.FindFirstValue("sub");
        var isAdmin = User.HasSectionAccess("customers");
        if (!isAdmin && callerId != id.ToString())
            return Forbid();

        var c = await _db.Customers.FindAsync(id);
        if (c is null) return NotFound();

        // NO DUPLICATES: reject if the new phone/email is already used by a DIFFERENT account.
        var newPhone = req.Phone?.Trim();
        if (!string.IsNullOrWhiteSpace(newPhone) && newPhone != c.Phone
            && await _db.Customers.AnyAsync(x => x.Id != id && x.Phone == newPhone))
            return Conflict(new { success = false, message = "This mobile number is already used by another account." });

        var newEmail = req.Email?.Trim().ToLower();
        if (!string.IsNullOrWhiteSpace(newEmail) && newEmail != c.Email
            && await _db.Customers.AnyAsync(x => x.Id != id && x.Email == newEmail))
            return Conflict(new { success = false, message = "This email is already used by another account." });

        // Partial update: only change fields that were actually provided (non-null),
        // so a partial request (e.g. only birthday dates) does not wipe other fields.
        if (req.FirstName    != null) c.FirstName    = req.FirstName.Trim();
        if (req.LastName     != null) c.LastName     = req.LastName.Trim();
        if (req.Gender       != null) c.Gender       = req.Gender;
        if (req.Phone        != null) c.Phone        = req.Phone.Trim();
        // Email is editable by an admin (used to fix/merge duplicate accounts).
        if (isAdmin && !string.IsNullOrWhiteSpace(newEmail)) c.Email = newEmail;
        // Birthday & anniversary stay editable until the customer redeems the matching
        // date-based coupon; once that offer is used the date locks (stops repeat claims).
        if (req.DateOfBirth  != null && !c.BirthdayOfferUsed)    c.DateOfBirth  = ParseDate(req.DateOfBirth);
        if (req.MarriageDate != null && !c.AnniversaryOfferUsed) c.MarriageDate = ParseDate(req.MarriageDate);
        if (req.AddrLine1    != null) c.AddrLine1    = req.AddrLine1;
        if (req.AddrLine2    != null) c.AddrLine2    = req.AddrLine2;
        if (req.Pincode      != null) c.Pincode      = req.Pincode;
        if (req.PostOffice   != null) c.PostOffice   = req.PostOffice;
        if (req.State        != null) c.State        = req.State;
        if (req.District     != null) c.District     = req.District;
        if (req.MarketingConsent.HasValue)
            c.MarketingConsent = req.MarketingConsent.Value;
        if (req.PanNumber is not null)
            c.PanNumber = req.PanNumber.Trim().ToUpper();
        if (req.PanName is not null)
            c.PanName = req.PanName.Trim();
        if (req.PanStatus is not null)
            c.PanStatus = req.PanStatus.Trim();
        c.UpdatedAt  = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { success = true, customer = ToDto(c) });
    }

    // PATCH /api/customers/{id}/deactivate
    [HttpPatch("{id:int}/deactivate")]
    [Authorize]
    public async Task<IActionResult> Deactivate(int id, [FromBody] AccountStatusRequest req)
    {
        // SEC-3 IDOR: only the customer themselves or an admin can deactivate
        var callerId = User.FindFirstValue("sub");
        var isAdmin = User.HasSectionAccess("customers");
        if (!isAdmin && callerId != id.ToString())
            return Forbid();

        var c = await _db.Customers.FindAsync(id);
        if (c is null) return NotFound();

        c.AccountStatus = "deactivated";
        c.DeactivatedAt = DateTimeOffset.UtcNow;
        c.Notes = string.IsNullOrWhiteSpace(req.Reason) ? c.Notes : $"Deactivation reason: {req.Reason}";
        c.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, customer = ToDto(c) });
    }

    // PATCH /api/customers/{id}/reactivate  (Admin only — customers cannot reactivate themselves)
    [HttpPatch("{id:int}/reactivate")]
    [Authorize]
    [RequirePerm("customers")]
    public async Task<IActionResult> Reactivate(int id)
    {
        var c = await _db.Customers.FindAsync(id);
        if (c is null) return NotFound();

        c.AccountStatus = "active";
        c.DeactivatedAt = null;
        c.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, customer = ToDto(c) });
    }

    // DELETE /api/customers/{id}
    [HttpDelete("{id:int}")]
    [Authorize]
    public async Task<IActionResult> Delete(int id)
    {
        // SEC-3 IDOR: only the customer themselves or an admin can delete
        var callerId = User.FindFirstValue("sub");
        var isAdmin = User.HasSectionAccess("customers");
        if (!isAdmin && callerId != id.ToString())
            return Forbid();

        var c = await _db.Customers.FindAsync(id);
        if (c is null) return NotFound();

        // Detach dependent rows first so the account can be removed without a foreign-key error.
        // Reviews are kept (as content) but their customer link is cleared; wishlist rows are removed.
        var custReviews = await _db.Reviews.Where(r => r.CustomerId == id).ToListAsync();
        foreach (var r in custReviews) r.CustomerId = null;
        try { await _db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM wishlists WHERE customer_id = {id}"); }
        catch { /* wishlists table may be unused — ignore */ }

        _db.Customers.Remove(c);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    // Finds a customer by an email (contains '@') or a mobile number (matched on
    // the last 10 digits, so 91-prefixed and plain forms both resolve).
    private async Task<Customer?> FindCustomerByIdentifier(string identifier)
    {
        var idf = (identifier ?? "").Trim();
        if (string.IsNullOrWhiteSpace(idf)) return null;

        if (idf.Contains('@'))
            return await _db.Customers.FirstOrDefaultAsync(c => c.Email == idf.ToLower());

        var digits = new string(idf.Where(char.IsDigit).ToArray());
        if (digits.Length < 10)
            return await _db.Customers.FirstOrDefaultAsync(c => c.Phone == idf);

        var last10 = digits.Substring(digits.Length - 10);
        return await _db.Customers.FirstOrDefaultAsync(c =>
            c.Phone == idf || c.Phone == digits || c.Phone == last10 ||
            (c.Phone != "" && c.Phone.EndsWith(last10)));
    }

    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0) return "***";
        var name  = email.Substring(0, at);
        var shown = name.Length <= 2 ? name.Substring(0, 1) : name.Substring(0, 2);
        return shown + new string('*', Math.Max(1, name.Length - shown.Length)) + email.Substring(at);
    }

    private static string MaskPhone(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.Length <= 4) return new string('*', digits.Length);
        return new string('*', digits.Length - 4) + digits.Substring(digits.Length - 4);
    }

    private async Task<bool> VerifyOtpToken(string phone, string email, string otp)
    {
        var cleanPhone = phone?.Trim() ?? "";
        var cleanEmail = email?.Trim().ToLower() ?? "";
        var record = await _db.OtpTokens
            .Where(t =>
                !t.Used &&
                t.ExpiresAt > DateTimeOffset.UtcNow &&
                ((!string.IsNullOrWhiteSpace(cleanPhone) && t.Phone == cleanPhone) ||
                 (!string.IsNullOrWhiteSpace(cleanEmail) && t.Email == cleanEmail)))
            .OrderByDescending(t => t.CreatedAt)
            .FirstOrDefaultAsync();

        if (record is null || record.Attempts >= 5)
            return false;

        if (!_auth.VerifyPassword(otp, record.OtpHash, ""))
        {
            record.Attempts++;
            await _db.SaveChangesAsync();
            return false;
        }

        record.Used = true;
        await _db.SaveChangesAsync();
        return true;
    }

    // POST /api/customers/social-login
    [HttpPost("social-login")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> SocialLogin([FromBody] SocialLoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Provider) || string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.RedirectUri))
            return BadRequest(new { success = false, message = "provider, code, and redirectUri are required." });

        string? email = null;
        string? firstName = null;
        string? lastName = null;

        try
        {
        using var http = new System.Net.Http.HttpClient();

        if (req.Provider.Equals("google", StringComparison.OrdinalIgnoreCase))
        {
            var clientId     = await _db.SiteSettings.Where(s => s.Key == "googleClientId").Select(s => s.Value).FirstOrDefaultAsync();
            var clientSecret = await _db.SiteSettings.Where(s => s.Key == "googleClientSecret").Select(s => s.Value).FirstOrDefaultAsync();

            if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
                return BadRequest(new { success = false, message = "Google OAuth not configured." });

            // Exchange code for token
            var tokenRes = await http.PostAsync("https://oauth2.googleapis.com/token",
                new System.Net.Http.FormUrlEncodedContent(new Dictionary<string, string> {
                    ["code"] = req.Code, ["client_id"] = clientId, ["client_secret"] = clientSecret,
                    ["redirect_uri"] = req.RedirectUri, ["grant_type"] = "authorization_code"
                }));
            if (!tokenRes.IsSuccessStatusCode)
            {
                var errBody = await tokenRes.Content.ReadAsStringAsync();
                // Extract error_description from Google error response if available
                try {
                    var errJson = System.Text.Json.JsonDocument.Parse(errBody);
                    var desc = errJson.RootElement.TryGetProperty("error_description", out var d) ? d.GetString() : null;
                    var errCode = errJson.RootElement.TryGetProperty("error", out var e) ? e.GetString() : null;
                    if (!string.IsNullOrWhiteSpace(desc))
                        return BadRequest(new { success = false, message = $"Google login failed: {desc}" });
                    if (!string.IsNullOrWhiteSpace(errCode))
                        return BadRequest(new { success = false, message = $"Google login failed: {errCode}" });
                } catch { /* ignore parse errors */ }
                return BadRequest(new { success = false, message = "Google token exchange failed. Please try again." });
            }

            var tokenJson = System.Text.Json.JsonDocument.Parse(await tokenRes.Content.ReadAsStringAsync());
            if (!tokenJson.RootElement.TryGetProperty("access_token", out var atEl))
                return BadRequest(new { success = false, message = "Google did not return an access token. Please try again." });
            var accessToken = atEl.GetString();

            // Get user info
            http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
            var infoRes = await http.GetAsync("https://www.googleapis.com/oauth2/v3/userinfo");
            if (!infoRes.IsSuccessStatusCode)
                return BadRequest(new { success = false, message = "Failed to get Google user info." });

            var info = System.Text.Json.JsonDocument.Parse(await infoRes.Content.ReadAsStringAsync());
            email = info.RootElement.TryGetProperty("email", out var em) ? em.GetString() : null;
            firstName = info.RootElement.TryGetProperty("given_name", out var fn) ? fn.GetString() : "Google";
            lastName  = info.RootElement.TryGetProperty("family_name", out var ln) ? ln.GetString() : "User";
        }
        else if (req.Provider.Equals("facebook", StringComparison.OrdinalIgnoreCase))
        {
            var appId     = await _db.SiteSettings.Where(s => s.Key == "facebookAppId").Select(s => s.Value).FirstOrDefaultAsync();
            var appSecret = await _db.SiteSettings.Where(s => s.Key == "facebookAppSecret").Select(s => s.Value).FirstOrDefaultAsync();

            if (string.IsNullOrWhiteSpace(appId) || string.IsNullOrWhiteSpace(appSecret))
                return BadRequest(new { success = false, message = "Facebook OAuth not configured." });

            // Exchange code for token
            var tokenRes = await http.GetAsync(
                $"https://graph.facebook.com/v25.0/oauth/access_token?client_id={appId}&redirect_uri={Uri.EscapeDataString(req.RedirectUri)}&client_secret={appSecret}&code={req.Code}");
            if (!tokenRes.IsSuccessStatusCode)
                return BadRequest(new { success = false, message = "Facebook token exchange failed. Please try again." });

            var tokenJson = System.Text.Json.JsonDocument.Parse(await tokenRes.Content.ReadAsStringAsync());
            if (!tokenJson.RootElement.TryGetProperty("access_token", out var atEl))
                return BadRequest(new { success = false, message = "Facebook did not return an access token. Please try again." });
            var accessToken = atEl.GetString();

            // Get user info
            var infoRes = await http.GetAsync(
                $"https://graph.facebook.com/v25.0/me?fields=id,name,email&access_token={accessToken}");
            if (!infoRes.IsSuccessStatusCode)
                return BadRequest(new { success = false, message = "Failed to get Facebook user info." });

            var info = System.Text.Json.JsonDocument.Parse(await infoRes.Content.ReadAsStringAsync());
            email = info.RootElement.TryGetProperty("email", out var em) ? em.GetString() : null;
            var fullName = info.RootElement.TryGetProperty("name", out var nm) ? nm.GetString()?.Split(' ') : new[] { "Facebook", "User" };
            firstName = fullName?.FirstOrDefault() ?? "Facebook";
            lastName  = fullName?.Length > 1 ? string.Join(" ", fullName.Skip(1)) : "User";
        }
        else
        {
            return BadRequest(new { success = false, message = "Unsupported provider." });
        }

        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(new { success = false, message = "Could not retrieve email from provider. Please ensure email permission is granted." });

        email = email.ToLower().Trim();
        var existing = await _db.Customers.FirstOrDefaultAsync(c => c.Email == email);

        if (existing == null)
        {
            // Auto-register
            var code = await NextCustomerCodeAsync();
            existing = new Customer
            {
                CustomerCode     = code,
                FirstName        = firstName ?? "User",
                LastName         = lastName ?? "",
                Email            = email,
                Phone            = "",
                PasswordHash     = "",
                PasswordSalt     = "",
                EmailVerified    = true,
                MarketingConsent = true,
                SubmittedAt      = DateTimeOffset.UtcNow.ToString("o"),
            };
            _db.Customers.Add(existing);
            await _db.SaveChangesAsync();
        }
        else if (existing.AccountStatus != "active")
        {
            return Unauthorized(new { success = false, message = "Account is deactivated." });
        }

        var jwtToken = _auth.GenerateJwt(existing.Id.ToString(), existing.Email ?? "", "customer");
        return Ok(new { success = true, token = jwtToken, customer = ToDto(existing) });
        } // end try
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = $"Social login error: {ex.Message}" });
        }
    }

    private static DateOnly? ParseDate(string? raw)
    {
        return DateOnly.TryParse(raw, out var value) ? value : null;
    }

    private static CustomerDto ToDto(Customer c) => new(
        c.Id, c.CustomerCode, c.FirstName, c.LastName, c.Gender,
        c.Email, c.Phone,
        c.DateOfBirth?.ToString("yyyy-MM-dd"),
        c.MarriageDate?.ToString("yyyy-MM-dd"),
        c.AddrLine1, c.AddrLine2, c.Pincode, c.PostOffice, c.State, c.District,
        c.AccountStatus, c.ProfileStatus,
        c.MarketingConsent, c.PanNumber, c.PanName, c.PanStatus,
        c.EmailVerified, c.PhoneVerified,
        c.CreatedAt,
        c.BirthdayOfferUsed, c.AnniversaryOfferUsed,
        c.PhotoUrl
    );

    // Deploy-safe uploads root: /var/www/mahalaxmi-uploads/customers (outside repo & publish dir).
    private string CustomerPhotosRoot() =>
        Path.GetFullPath(Path.Combine(_env.ContentRootPath, "..", "mahalaxmi-uploads", "customers"));

    // POST /api/customers/{id}/photo — customer uploads their profile photo (self or admin).
    [HttpPost("{id:int}/photo")]
    [Authorize]
    [RequestSizeLimit(9_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 9_000_000)]
    public async Task<IActionResult> UploadPhoto(int id, [FromForm] IFormFile? file)
    {
        var callerId = User.FindFirstValue("sub");
        var isAdmin = User.HasSectionAccess("customers");
        if (!isAdmin && callerId != id.ToString())
            return Forbid();

        var c = await _db.Customers.FindAsync(id);
        if (c is null) return NotFound();

        if (file is null || file.Length == 0)
            return BadRequest(new { success = false, message = "No file received." });
        if (!(file.ContentType ?? "").StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { success = false, message = "Only image files are allowed." });
        if (file.Length > 8L * 1024 * 1024)
            return BadRequest(new { success = false, message = "Image too large (max 8 MB)." });

        var ext = Path.GetExtension(file.FileName ?? "");
        ext = new string(ext.Where(ch => char.IsLetterOrDigit(ch) || ch == '.').ToArray()).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(ext) || ext.Length > 6) ext = ".jpg";

        Directory.CreateDirectory(CustomerPhotosRoot());
        var name = $"cust_{Guid.NewGuid():N}{ext}";
        await using (var fs = System.IO.File.Create(Path.Combine(CustomerPhotosRoot(), name)))
            await file.CopyToAsync(fs);

        c.PhotoUrl = $"/api/customers/photo/{name}";
        c.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, customer = ToDto(c) });
    }

    // GET /api/customers/photo/{file} — stream a stored profile photo. Filenames are unguessable GUIDs.
    [HttpGet("photo/{file}")]
    [AllowAnonymous]
    public IActionResult GetPhoto(string file)
    {
        var safe = new string((file ?? "").Where(ch => char.IsLetterOrDigit(ch) || ch == '_' || ch == '.' || ch == '-').ToArray());
        if (string.IsNullOrEmpty(safe) || safe.Contains(".."))
            return NotFound();
        var full = Path.Combine(CustomerPhotosRoot(), safe);
        if (!System.IO.File.Exists(full))
            return NotFound();
        var mime = Path.GetExtension(full).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => "image/jpeg"
        };
        return File(System.IO.File.OpenRead(full), mime, enableRangeProcessing: true);
    }
}
