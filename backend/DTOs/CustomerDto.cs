namespace MahalaxmiApi.DTOs;

public record CustomerDto(
    int     Id,
    string  CustomerCode,
    string  FirstName,
    string  LastName,
    string  Gender,
    string? Email,
    string  Phone,
    string? DateOfBirth,
    string? MarriageDate,
    string  AddrLine1,
    string  AddrLine2,
    string  Pincode,
    string  PostOffice,
    string  State,
    string  District,
    string  AccountStatus,
    string  ProfileStatus,
    bool    MarketingConsent,
    string  PanNumber,
    string  PanName,
    string  PanStatus,
    bool    EmailVerified,
    bool    PhoneVerified,
    DateTimeOffset CreatedAt,
    bool    BirthdayOfferUsed = false,
    bool    AnniversaryOfferUsed = false,
    string? PhotoUrl = null
);

public record RegisterRequest(
    string  FirstName,
    string  LastName,
    string  Email,
    string  Phone,
    string  Password,
    string  Gender,
    string? DateOfBirth,
    string? MarriageDate,
    string? AnniversaryDate,
    string? AddrLine1,
    string? AddrLine2,
    string? Pincode,
    string? PostOffice,
    string? State,
    string? District,
    bool    MarketingConsent,
    string? Otp,
    // A friend's Refer & Earn code, typed in or carried by the ?ref= link.
    string? ReferralCode = null
);

public record LoginRequest(
    string  Email,
    string  Password
);

public record OtpLoginRequest(
    string Phone,
    string Otp
);

// BUG-8: Phone is nullable — customers may supply email-only OTP requests
public record SendOtpRequest(
    string? Phone,
    string? Email,
    string? Purpose
);

public record AdminLoginRequest(
    string Email,
    string Password
);

public record CelebrationSmsRequest(
    string Phone,
    string? Message = null,   // optional custom message; backend uses template if null
    string? Occasion = null,  // "birthday" | "anniversary" — picks the code prefix
    // 30 | 15 | 7 | 0 — kaun se slab ka batan daba tha. Panel pehle se bhejta
    // tha par server ise girā deta tha; ab ye likha jata hai, taki "is slab me
    // bhej diya" dobara login karne par bhi yaad rahe.
    int? Slab = null
);

// Bulk promotional SMS campaign — sent server-side via MSG91 (no MSG91 website).
public record BulkCampaignRequest(
    string TemplateId,                       // DLT-approved promotional flow/template id
    bool OptedInOnly = false,                // send only to marketing-consented customers
    Dictionary<string, string>? Vars = null  // template variables (e.g. {"var1":"30","coupon":"SAVE30"})
);

public record SocialLoginRequest(
    string Provider,    // "google" | "facebook"
    string Code,        // authorization code from OAuth redirect
    string RedirectUri  // must match what was used in the redirect
);

public record UpdateProfileRequest(
    string? FirstName,
    string? LastName,
    string? Gender,
    string? DateOfBirth,
    string? MarriageDate,
    string? Phone,
    string? Email,
    string? AddrLine1,
    string? AddrLine2,
    string? Pincode,
    string? PostOffice,
    string? State,
    string? District,
    bool?   MarketingConsent,
    string? PanNumber,
    string? PanName,
    string? PanStatus
);

public record AccountStatusRequest(string? Reason);

public record ResetPasswordRequest(
    string Email,   // email OR mobile number — the identifier the customer entered
    string Otp,
    string Password
);

public record ForgotPasswordOtpRequest(
    string Identifier   // email OR mobile number
);
