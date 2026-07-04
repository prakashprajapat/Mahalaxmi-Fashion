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
    DateTimeOffset CreatedAt
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
    string? Otp
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
    string? Message  // optional custom message; backend uses template if null
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
