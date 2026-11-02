using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// <summary>
/// Ek login (ya galat koshish) ka record - kaun, kab, kis tarah (OTP /
/// password / Google), kahan se (Web ya App, kaunsa phone/browser, IP).
/// Sirf likha jata hai, kabhi badla nahi jata. Admin panel ke
/// Customers → Login History me dikhta hai.
/// </summary>
[Table("login_events")]
public class LoginEvent
{
    [Key][Column("id")] public long Id { get; set; }

    /// <summary>customer | staff | admin</summary>
    [Column("subject_type")] public string SubjectType { get; set; } = "customer";

    /// <summary>Account id; galat koshish me khaali ho sakta hai.</summary>
    [Column("subject_id")] public string? SubjectId { get; set; }

    /// <summary>Email / phone / username jo login me use hua.</summary>
    [Column("login_id")] public string? LoginId { get; set; }

    /// <summary>otp | password | google | facebook | register | admin</summary>
    [Column("method")] public string Method { get; set; } = "login";

    /// <summary>web | app</summary>
    [Column("platform")] public string Platform { get; set; } = "web";

    [Column("device")] public string? Device { get; set; }
    [Column("ip")] public string? Ip { get; set; }
    [Column("user_agent")] public string? UserAgent { get; set; }

    [Column("success")] public bool Success { get; set; } = true;
    [Column("reason")] public string? Reason { get; set; }

    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
