using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// Two tokens instead of one, and the reason is that they cannot both be good
/// at the same things.
///
/// The access token is a JWT. Every service that gets one can read who you are
/// out of it and check the signature on its own, with no database lookup, which
/// is the whole point - a shop doing a few hundred requests a minute cannot
/// afford one SELECT per request just to learn who is asking. The cost of that
/// is that nothing was written down, so nothing can be crossed off: the token
/// is good until it expires and there is no way to cancel it. It used to expire
/// after SEVEN DAYS for an admin and THIRTY for a shopper. A token copied off a
/// shared computer was a month of somebody else's account, and pressing Log out
/// did not shorten it by a second.
///
/// So the access token is cut to minutes, and a second token - this one written
/// down - is what keeps you signed in. It does one thing: it is exchanged for a
/// fresh access token. That exchange is the one moment per quarter-hour when
/// the server looks you up, and the one moment it can say no.
///
/// Three things fall out of that, all of which were impossible before:
///
///   Log out means log out. The row is revoked and the next exchange fails.
///   Logging out everywhere revokes every row for the account.
///
///   A changed password ends every other session, which is the only thing that
///   makes changing it after a scare worth doing.
///
///   Permissions stop going stale. The role and permissions of the NEXT access
///   token are read from the account at exchange time, not copied from the old
///   token - so cutting a staff member's access in the panel takes hold inside
///   fifteen minutes instead of whenever their month-long token ran out.
///
/// What it does NOT do is make an access token cancellable. Nothing can, short
/// of a database lookup per request. The window is the expiry, and that is why
/// the expiry is short.
/// </summary>
public sealed class TokenService
{
    // How long an access token lives. A shopper gets longer than an admin
    // because her token opens her own orders, and his opens the shop; and
    // because a flaky mobile connection failing a refresh is more annoying
    // mid-checkout than it is in the panel.
    public const int AccessMinutesCustomer = 30;
    public const int AccessMinutesStaff    = 15;

    // How long you stay signed in without typing a password. Chosen with the
    // owner: fourteen days for the panel, a month for shoppers.
    public const int RefreshDaysCustomer = 30;
    public const int RefreshDaysStaff    = 14;

    // Two tabs, or a page that fires five requests at once, can present the
    // same refresh token twice before the first exchange has finished. That is
    // not theft, and signing the customer out for it would be a bug that only
    // ever hit real users - a thief replays once, a browser races constantly.
    // Inside this window a second attempt is told to retry and read the token
    // the winner just stored. Outside it, the same token turning up again means
    // a copy exists somewhere, and the whole chain goes.
    private static readonly TimeSpan ReuseGrace = TimeSpan.FromSeconds(60);

    // The lifetimes this replaced, kept because the switch has to be able to
    // put them back exactly. "Roughly the old behaviour" is not an off switch.
    private const int LegacyAccessDaysStaff = 7;
    private const int LegacyAccessDaysCustomer = 30;

    private readonly AppDbContext _db;
    private readonly AuthService _auth;
    private readonly ILogger<TokenService> _log;
    private readonly FeatureFlags _flags;

    public TokenService(AppDbContext db, AuthService auth, ILogger<TokenService> log, FeatureFlags flags)
    {
        _db = db;
        _auth = auth;
        _log = log;
        _flags = flags;
    }

    public const string Customer = "customer";
    public const string Staff    = "staff";
    public const string Owner    = "admin";

    /// <summary>Who a pair of tokens is being issued to.</summary>
    public readonly record struct Principal(
        string SubjectType, string SubjectId, string Email, string Role, string? Perms);

    public sealed record Pair(string AccessToken, string RefreshToken, int ExpiresInSeconds);

    /// <summary>
    /// The outcome of an exchange. <c>Retry</c> is not a failure: it means
    /// another request in the same browser got there first and the caller should
    /// read the token it stored rather than sign the person out.
    /// </summary>
    public sealed record RotateResult(Pair? Pair, string? Error, bool Retry);

    private static string Hash(string raw) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));

    private static int AccessMinutes(string subjectType) =>
        subjectType == Customer ? AccessMinutesCustomer : AccessMinutesStaff;

    private static int RefreshDays(string subjectType) =>
        subjectType == Customer ? RefreshDaysCustomer : RefreshDaysStaff;

    /// <summary>
    /// A browser description short enough to be useful and too short to
    /// identify anybody: the platform and the engine, nothing else.
    /// </summary>
    public static string? DeviceOf(string? userAgent)
    {
        var ua = (userAgent ?? string.Empty).Trim();
        if (ua.Length == 0) return null;
        var os =
            ua.Contains("Android", StringComparison.OrdinalIgnoreCase) ? "Android" :
            ua.Contains("iPhone", StringComparison.OrdinalIgnoreCase) ? "iPhone" :
            ua.Contains("iPad", StringComparison.OrdinalIgnoreCase) ? "iPad" :
            ua.Contains("Windows", StringComparison.OrdinalIgnoreCase) ? "Windows" :
            ua.Contains("Mac OS", StringComparison.OrdinalIgnoreCase) ? "Mac" :
            ua.Contains("Linux", StringComparison.OrdinalIgnoreCase) ? "Linux" : "Other";
        var browser =
            ua.Contains("Edg/", StringComparison.OrdinalIgnoreCase) ? "Edge" :
            ua.Contains("Chrome", StringComparison.OrdinalIgnoreCase) ? "Chrome" :
            ua.Contains("Firefox", StringComparison.OrdinalIgnoreCase) ? "Firefox" :
            ua.Contains("Safari", StringComparison.OrdinalIgnoreCase) ? "Safari" : "App";
        return $"{os} / {browser}";
    }

    /// <summary>
    /// Mint an access token and a refresh token for a sign-in that has just
    /// been proved - a correct password, a correct OTP, a verified social
    /// account. Nothing here checks credentials; the caller has already done
    /// that and this is the receipt.
    /// </summary>
    public async Task<Pair> IssuePairAsync(Principal p, string? userAgent, string? family = null)
    {
        // Switched off, this hands back exactly what the shop issued before:
        // one long-lived access token and NO refresh token. The browser stores
        // a refresh token only when it is given one, and renewAccess already
        // does nothing without one - so off is the old behaviour throughout,
        // not a version of it.
        if (!await _flags.IsOnAsync("auth.refreshTokens"))
        {
            var days = p.SubjectType == Customer ? LegacyAccessDaysCustomer : LegacyAccessDaysStaff;
            var legacy = _auth.GenerateJwt(p.SubjectId, p.Email, p.Role, p.Perms, TimeSpan.FromDays(days));
            return new Pair(legacy, string.Empty, days * 24 * 60 * 60);
        }

        return (await IssueAsync(p, userAgent, family)).Pair;
    }

    private async Task<(Pair Pair, int RowId)> IssueAsync(Principal p, string? userAgent, string? family)
    {
        var access = _auth.GenerateJwt(
            p.SubjectId, p.Email, p.Role, p.Perms, TimeSpan.FromMinutes(AccessMinutes(p.SubjectType)));

        var raw = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var row = new RefreshToken
        {
            TokenHash   = Hash(raw),
            SubjectType = p.SubjectType,
            SubjectId   = p.SubjectId,
            Email       = p.Email,
            Role        = p.Role,
            Family      = string.IsNullOrEmpty(family) ? Guid.NewGuid().ToString("N") : family,
            Device      = DeviceOf(userAgent),
            IssuedAt    = DateTimeOffset.UtcNow,
            ExpiresAt   = DateTimeOffset.UtcNow.AddDays(RefreshDays(p.SubjectType)),
        };
        _db.RefreshTokens.Add(row);
        await _db.SaveChangesAsync();

        return (new Pair(access, raw, AccessMinutes(p.SubjectType) * 60), row.Id);
    }

    /// <summary>
    /// Exchange a refresh token for a fresh pair, and retire the one presented.
    ///
    /// The retiring is done first, by the database, in one statement that only
    /// succeeds while the token is unused: that is what makes a token good
    /// exactly once even when two requests arrive together. Read-then-update
    /// would let both read "unused", both pass, and two live chains exist for
    /// one sign-in - which is indistinguishable from a theft and would have
    /// made the detection below fire on honest users.
    /// </summary>
    public async Task<RotateResult> RotateAsync(string? presented, string? userAgent)
    {
        // Nothing to rotate while the feature is off, and a stale refresh token
        // in somebody's browser must not keep working after it is switched off.
        if (!await _flags.IsOnAsync("auth.refreshTokens"))
            return new RotateResult(null, "Please sign in again.", false);

        if (string.IsNullOrWhiteSpace(presented))
            return new RotateResult(null, "Session expired. Please sign in again.", false);

        var hash = Hash(presented.Trim());

        await PruneIfDueAsync();

        var claimed = await _db.Database.ExecuteSqlInterpolatedAsync(
            $@"UPDATE refresh_tokens SET used_at = NOW()
               WHERE token_hash = {hash}
                 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()");

        var row = await _db.RefreshTokens.AsNoTracking()
            .FirstOrDefaultAsync(t => t.TokenHash == hash);

        if (claimed == 0)
        {
            // Nothing matched. Work out which of the four reasons it was,
            // because one of them is theft and the other three are ordinary.
            if (row is null)
                return new RotateResult(null, "Session not found. Please sign in again.", false);

            if (row.RevokedAt is not null || row.ExpiresAt <= DateTimeOffset.UtcNow)
                return new RotateResult(null, "Session expired. Please sign in again.", false);

            if (row.UsedAt is not null && DateTimeOffset.UtcNow - row.UsedAt.Value <= ReuseGrace)
                return new RotateResult(null, null, true);   // two tabs racing

            // A token that was spent minutes or days ago has turned up again.
            // The legitimate holder moved on to the next one in the chain long
            // since, so whoever sent this has a copy. Which of the two is the
            // real customer cannot be known from here, so neither keeps the
            // session: the whole family goes and both must sign in with a
            // password, which only one of them has.
            _log.LogWarning(
                "Refresh token reuse detected for {Type} {Id} (family {Family}) - revoking the family",
                row.SubjectType, row.SubjectId, row.Family);
            await RevokeFamilyAsync(row.Family, "reuse-detected");
            return new RotateResult(null, "This session was ended for security. Please sign in again.", false);
        }

        if (row is null)
            return new RotateResult(null, "Session not found. Please sign in again.", false);

        // Who they are NOW, not who the old token said they were. This is the
        // line that stops a deactivated staff member and a stale permission set
        // from outliving the change in the panel.
        var (ok, principal, why) = await CurrentPrincipalAsync(row);
        if (!ok)
        {
            await RevokeFamilyAsync(row.Family, why ?? "account-closed");
            return new RotateResult(null, why switch
            {
                "deactivated" => "This account is no longer active.",
                _             => "Please sign in again.",
            }, false);
        }

        var (pair, newId) = await IssueAsync(principal, userAgent ?? row.Device, row.Family);

        // Link the chain, so a later reuse can be traced to the sign-in it came
        // from rather than just to one orphaned token.
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE refresh_tokens SET replaced_by = {newId} WHERE id = {row.Id}");

        return new RotateResult(pair, null, false);
    }

    // The account as it stands, looked up fresh. Returns false when the sign-in
    // should not be renewed at all.
    private async Task<(bool ok, Principal principal, string? why)> CurrentPrincipalAsync(RefreshToken row)
    {
        if (row.SubjectType == Customer)
        {
            if (!int.TryParse(row.SubjectId, out var cid))
                return (false, default, "gone");
            var c = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == cid);
            if (c is null) return (false, default, "gone");
            if (c.AccountStatus != "active") return (false, default, "deactivated");
            return (true, new Principal(Customer, c.Id.ToString(), c.Email ?? "", "customer", null), null);
        }

        if (row.SubjectType == Staff)
        {
            if (!int.TryParse(row.SubjectId, out var sid))
                return (false, default, "gone");
            var s = await _db.StaffMembers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == sid);
            if (s is null) return (false, default, "gone");
            if (!s.IsActive) return (false, default, "deactivated");
            var role = string.IsNullOrWhiteSpace(s.Role) ? "staff" : s.Role;
            return (true, new Principal(Staff, s.Id.ToString(), s.Username, role, s.Permissions), null);
        }

        // The owner. There is no row for him - he is the email and password hash
        // in site_settings - so the check is that he is still that email.
        var adminEmail = await _db.SiteSettings.AsNoTracking()
            .Where(x => x.Key == "admin_email").Select(x => x.Value).FirstOrDefaultAsync();
        if (!string.IsNullOrWhiteSpace(adminEmail)
            && !string.Equals(adminEmail, row.Email, StringComparison.OrdinalIgnoreCase))
            return (false, default, "gone");

        return (true, new Principal(Owner, row.SubjectId, row.Email, "admin", null), null);
    }

    /// <summary>End one session. What pressing Log out should have always done.</summary>
    public async Task RevokeAsync(string? presented, string reason)
    {
        if (string.IsNullOrWhiteSpace(presented)) return;
        var hash = Hash(presented.Trim());
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $@"UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = {reason}
               WHERE token_hash = {hash} AND revoked_at IS NULL");
    }

    /// <summary>End a whole chain - every renewal descended from one sign-in.</summary>
    public async Task RevokeFamilyAsync(string family, string reason)
    {
        if (string.IsNullOrWhiteSpace(family)) return;
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $@"UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = {reason}
               WHERE family = {family} AND revoked_at IS NULL");
    }

    /// <summary>
    /// End every session for an account: Log out from all devices, and what a
    /// changed password or a closed account must do. Returns how many were
    /// ended, which is worth telling the owner - "3 other sessions ended" is
    /// the sentence that makes the button believable.
    /// </summary>
    public async Task<int> RevokeAllAsync(string subjectType, string subjectId, string reason, string? exceptToken = null)
    {
        var keep = string.IsNullOrWhiteSpace(exceptToken) ? "" : Hash(exceptToken.Trim());
        return await _db.Database.ExecuteSqlInterpolatedAsync(
            $@"UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = {reason}
               WHERE subject_type = {subjectType} AND subject_id = {subjectId}
                 AND revoked_at IS NULL
                 AND ({keep} = '' OR token_hash <> {keep})");
    }

    /// <summary>
    /// Every session for the owner, whoever he is by email. He has no row to
    /// key on, so his sessions are found by subject type.
    /// </summary>
    public async Task<int> RevokeAllOwnerAsync(string reason, string? exceptToken = null)
    {
        var keep = string.IsNullOrWhiteSpace(exceptToken) ? "" : Hash(exceptToken.Trim());
        return await _db.Database.ExecuteSqlInterpolatedAsync(
            $@"UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = {reason}
               WHERE subject_type = {Owner} AND revoked_at IS NULL
                 AND ({keep} = '' OR token_hash <> {keep})");
    }

    /// <summary>
    /// Clear out rows nobody can use any more. Expired and revoked tokens are
    /// kept for a fortnight first: a reuse that shows up the day after a theft
    /// is worth being able to see in the log, and the row is what records it.
    /// </summary>
    // One sign-in generates a row every time it is renewed - roughly a hundred
    // a day for somebody who keeps the panel open. Nothing schedules a cleanup
    // in this app, so it is paid for here: the first exchange after the hour
    // clears out what nobody can use any more, and the rest cost nothing. The
    // field is static because the service is created per request.
    private static DateTimeOffset _nextPrune = DateTimeOffset.MinValue;

    private async Task PruneIfDueAsync()
    {
        var now = DateTimeOffset.UtcNow;
        if (now < _nextPrune) return;
        _nextPrune = now.AddHours(1);
        try
        {
            var gone = await PruneAsync();
            if (gone > 0) _log.LogInformation("Pruned {Count} dead refresh tokens.", gone);
        }
        catch (Exception ex)
        {
            // Housekeeping must never be what breaks a sign-in.
            _log.LogWarning(ex, "Refresh token prune failed.");
        }
    }

    public async Task<int> PruneAsync()
    {
        return await _db.Database.ExecuteSqlRawAsync(
            @"DELETE FROM refresh_tokens
              WHERE (expires_at < NOW() - INTERVAL '14 days')
                 OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '14 days')");
    }
}
