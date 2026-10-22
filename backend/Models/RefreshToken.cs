using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

/// <summary>
/// One sign-in, on one device, that can be cancelled.
///
/// The access token the browser sends with every request is a JWT: the server
/// reads who you are out of the token itself and checks the signature, with no
/// database lookup at all. That is what makes it fast, and it is also why it
/// cannot be cancelled - the server never wrote down that it issued one, so
/// there is nothing to cross off. Until it expires, it works.
///
/// So the access token is made short-lived, and this row is what keeps you
/// signed in past it. It is not a JWT and carries nothing readable: it is 32
/// random bytes, and only their SHA-256 hash is stored here, so a copy of this
/// table is not a set of working sessions. Its one job is to be exchanged for a
/// fresh access token, which means the exchange is the one moment the server
/// gets to look you up - and refuse.
///
/// That is what makes Log out from all devices possible, and what makes a
/// changed password mean something: both just revoke the rows.
/// </summary>
[Table("refresh_tokens")]
public class RefreshToken
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    /// <summary>
    /// SHA-256 of the token, hex. The token itself is never stored: it is shown
    /// to the client once, at issue, and after that the server can only confirm
    /// a presented one, never reproduce it.
    /// </summary>
    [Required]
    [Column("token_hash")]
    public string TokenHash { get; set; } = string.Empty;

    /// <summary>customer | admin | staff - which table SubjectId points into.</summary>
    [Column("subject_type")]
    public string SubjectType { get; set; } = string.Empty;

    [Column("subject_id")]
    public string SubjectId { get; set; } = string.Empty;

    [Column("email")]
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// The role and permissions to mint the next access token with. Not read
    /// from the old access token, on purpose: that is how a staff member whose
    /// permissions were cut keeps the old ones. Taken from the account at
    /// refresh time instead, so a change in the panel takes hold within one
    /// access-token lifetime rather than at the end of the month.
    /// </summary>
    [Column("role")]
    public string Role { get; set; } = string.Empty;

    /// <summary>
    /// The chain this token belongs to. Every refresh issues a new row in the
    /// same family, so one stolen token can be traced to the sign-in it came
    /// from and the whole chain cancelled at once - see TokenService.
    /// </summary>
    [Column("family")]
    public string Family { get; set; } = string.Empty;

    /// <summary>The row that replaced this one at refresh, if it was refreshed.</summary>
    [Column("replaced_by")]
    public int? ReplacedBy { get; set; }

    /// <summary>
    /// A short description of the browser, for a sessions screen later. Trimmed
    /// hard: enough to tell a phone from a desktop, not enough to fingerprint.
    /// </summary>
    [Column("device")]
    public string? Device { get; set; }

    [Column("issued_at")]
    public DateTimeOffset IssuedAt { get; set; } = DateTimeOffset.UtcNow;

    [Column("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>
    /// When this token was exchanged. A token is good exactly once; a second
    /// attempt with the same one is either two tabs racing (harmless, and
    /// handled by a grace window) or a copy in somebody else's hands.
    /// </summary>
    [Column("used_at")]
    public DateTimeOffset? UsedAt { get; set; }

    [Column("revoked_at")]
    public DateTimeOffset? RevokedAt { get; set; }

    /// <summary>logout | logout-all | password-change | reuse-detected | deactivated</summary>
    [Column("revoked_reason")]
    public string? RevokedReason { get; set; }
}
