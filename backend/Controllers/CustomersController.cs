using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using MahalaxmiApi.Data;
using MahalaxmiApi.DTOs;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;

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

    public CustomersController(AppDbContext db, AuthService auth, IWebHostEnvironment env, EmailService email, SmsService sms)
    {
        _db = db;
        _auth = auth;
        _env = env;
        _email = email;
        _sms = sms;
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
    [Authorize(Policy = "AdminOnly")]
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

    // GET /api/customers/celebrations?days=15
    [HttpGet("celebrations")]
    [Authorize(Policy = "AdminOnly")]
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
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> SendCelebrationSms([FromBody] CelebrationSmsRequest req)
    {
        var authKey    = await _db.SiteSettings.Where(s => s.Key == "msg91AuthKey").Select(s => s.Value).FirstOrDefaultAsync();
        var templateId = await _db.SiteSettings.Where(s => s.Key == "msg91SmsTemplateId").Select(s => s.Value).FirstOrDefaultAsync();

        if (string.IsNullOrWhiteSpace(authKey) || string.IsNullOrWhiteSpace(templateId))
            return BadRequest(new { success = false, message = "MSG91 not configured. Set msg91AuthKey and msg91SmsTemplateId in Settings." });

        if (string.IsNullOrWhiteSpace(req.Phone))
            return BadRequest(new { success = false, message = "Phone number is required." });

        var phone = req.Phone.TrimStart('+').Replace(" ", "");
        if (!phone.StartsWith("91")) phone = "91" + phone;

        using var http = new System.Net.Http.HttpClient();
        var payload = new {
            template_id = templateId,
            short_url   = "1",
            recipients  = new[] { new { mobiles = phone } }
        };
        var body = System.Text.Json.JsonSerializer.Serialize(payload);
        var httpReq = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, "https://api.msg91.com/api/v5/flow/")
        {
            Content = new System.Net.Http.StringContent(body, System.Text.Encoding.UTF8, "application/json")
        };
        httpReq.Headers.Add("authkey", authKey);

        var res = await http.SendAsync(httpReq);
        var resBody = await res.Content.ReadAsStringAsync();

        return Ok(new { success = true, message = $"SMS sent to {req.Phone}.", response = resBody });
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
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        var email = req.Email.ToLower().Trim();
        var phone = req.Phone?.Trim() ?? "";

        if (await _db.Customers.AnyAsync(c => c.Email == email))
            return Conflict(new { success = false, message = "Email already registered." });

        if (!string.IsNullOrWhiteSpace(phone) && await _db.Customers.AnyAsync(c => c.Phone == phone))
            return Conflict(new { success = false, message = "Phone already registered." });

        if (!string.IsNullOrWhiteSpace(req.Otp))
        {
            var otpOk = await VerifyOtpToken(phone, email, req.Otp);
            if (!otpOk)
                return BadRequest(new { success = false, message = "Invalid or expired OTP." });
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
            EmailVerified    = !string.IsNullOrWhiteSpace(req.Otp),
        };

        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();

        var token = _auth.GenerateJwt(customer.Id.ToString(), customer.Email ?? "", "customer");
        return Ok(new { success = true, token, customer = ToDto(customer) });
    }

    // POST /api/customers/login
    [HttpPost("login")]
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
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10),
        });
        await _db.SaveChangesAsync();

        // Deliver the OTP: email via SMTP, or mobile via MSG91 SMS.
        var sent = false;
        if (!string.IsNullOrWhiteSpace(email))
            sent = await _email.SendAsync(
                email,
                "Your Mahalaxmi Fashion Hub login code",
                EmailService.BuildOtpEmail(otp, "login", 10));
        else if (!string.IsNullOrWhiteSpace(phoneOrEmail))
            sent = await _sms.SendOtpAsync(phoneOrEmail, otp);

        // SEC-1: devOtp only in Development, or as a fallback if delivery isn't configured yet.
        if (_env.IsDevelopment() || !sent)
            return Ok(new { success = true, message = "OTP sent.", devOtp = otp });
        return Ok(new { success = true, message = "OTP sent." });
    }

    // POST /api/customers/verify-otp
    [HttpPost("verify-otp")]
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
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10),
        });
        await _db.SaveChangesAsync();

        // Send the SAME OTP to every channel the account has.
        var emailed = false;
        var texted  = false;
        if (!string.IsNullOrWhiteSpace(accEmail))
            emailed = await _email.SendAsync(accEmail,
                "Your Mahalaxmi Fashion Hub password reset code",
                EmailService.BuildOtpEmail(otp, "password reset", 10));
        if (!string.IsNullOrWhiteSpace(accPhone))
            texted = await _sms.SendOtpAsync(accPhone, otp);

        var sentTo = new
        {
            email = emailed ? MaskEmail(accEmail) : null,
            phone = texted  ? MaskPhone(accPhone) : null,
        };

        if (_env.IsDevelopment() || (!emailed && !texted))
            return Ok(new { success = true, message = "OTP generated.", sentTo, devOtp = otp });
        return Ok(new { success = true, message = "OTP sent.", sentTo });
    }

    // POST /api/customers/reset-password
    [HttpPost("reset-password")]
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
        var isAdmin = User.HasClaim("role", "admin");
        if (!isAdmin && callerId != id.ToString())
            return Forbid();

        var c = await _db.Customers.FindAsync(id);
        if (c is null) return NotFound();

        // Partial update: only change fields that were actually provided (non-null),
        // so a partial request (e.g. only birthday dates) does not wipe other fields.
        if (req.FirstName    != null) c.FirstName    = req.FirstName.Trim();
        if (req.LastName     != null) c.LastName     = req.LastName.Trim();
        if (req.Gender       != null) c.Gender       = req.Gender;
        if (req.Phone        != null) c.Phone        = req.Phone.Trim();
        // Birthday & anniversary can be set once, then locked — stops customers editing
        // their dates repeatedly to keep claiming date-based offers.
        if (req.DateOfBirth  != null && c.DateOfBirth  == null) c.DateOfBirth  = ParseDate(req.DateOfBirth);
        if (req.MarriageDate != null && c.MarriageDate == null) c.MarriageDate = ParseDate(req.MarriageDate);
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
        var isAdmin = User.HasClaim("role", "admin");
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
    [Authorize(Policy = "AdminOnly")]
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
        var isAdmin = User.HasClaim("role", "admin");
        if (!isAdmin && callerId != id.ToString())
            return Forbid();

        var c = await _db.Customers.FindAsync(id);
        if (c is null) return NotFound();

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
                $"https://graph.facebook.com/v18.0/oauth/access_token?client_id={appId}&redirect_uri={Uri.EscapeDataString(req.RedirectUri)}&client_secret={appSecret}&code={req.Code}");
            if (!tokenRes.IsSuccessStatusCode)
                return BadRequest(new { success = false, message = "Facebook token exchange failed. Please try again." });

            var tokenJson = System.Text.Json.JsonDocument.Parse(await tokenRes.Content.ReadAsStringAsync());
            if (!tokenJson.RootElement.TryGetProperty("access_token", out var atEl))
                return BadRequest(new { success = false, message = "Facebook did not return an access token. Please try again." });
            var accessToken = atEl.GetString();

            // Get user info
            var infoRes = await http.GetAsync(
                $"https://graph.facebook.com/me?fields=id,name,email&access_token={accessToken}");
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
        c.CreatedAt
    );
}
