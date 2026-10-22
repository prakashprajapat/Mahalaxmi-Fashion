using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using System.Security.Claims;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// A switch for a feature that is already deployed.
///
/// Shipping code and turning it on are two different acts, and keeping them
/// separate is what makes a bad change survivable. Deployed-and-off, the new
/// code is sitting there doing nothing; the shop behaves exactly as it did
/// yesterday. Turning it on is then a decision made while somebody is watching,
/// and turning it back off is a toggle rather than a rebuild.
///
/// That difference is the whole point here. A deploy on this VPS is a publish,
/// a health check and an nginx switch - a few minutes with everything going
/// right. A flag is the time it takes to press a button. When the thing that
/// has gone wrong is "customers cannot sign in", those are not comparable.
///
/// What this deliberately does NOT do is percentages. A 1% rollout needs
/// enough traffic that 1% is a readable signal, and at this shop 1% is a
/// couple of people a day - the number would tell you nothing and you would
/// turn it to 100% out of boredom. The useful middle setting at this size is
/// Staff: the feature is live on the real site for whoever is signed into the
/// panel, and invisible to every customer. That is a rollout of one, and the
/// one is you.
/// </summary>
public sealed class FeatureFlags
{
    /// <summary>Who a feature is on for.</summary>
    public enum State
    {
        /// <summary>Nobody. The code is deployed and asleep.</summary>
        Off = 0,
        /// <summary>The owner and staff only, on the live site.</summary>
        Staff = 1,
        /// <summary>Everybody.</summary>
        On = 2,
    }

    /// <summary>
    /// The switches that exist. Adding one here is what makes it appear on the
    /// admin screen; nothing else needs changing.
    ///
    /// Every one of them defaults to Off. A flag that defaults to On is a
    /// feature with an off switch, which is a different and much weaker thing:
    /// the first time anyone finds out it is broken is from a customer.
    /// </summary>
    public static readonly IReadOnlyList<FlagInfo> All =
    [
        new("auth.refreshTokens",
            "Stay signed in with refresh tokens",
            "Access tokens last 15-30 minutes and a refresh token quietly renews them, so logging out and changing a password actually end a session. OFF means the old behaviour: one long token, 7 days for the panel and 30 for a shopper, which nothing can cancel.",
            "Everyone gets signed out, or nobody can stay signed in. The worst thing on this list - turn it on when you can watch it."),

        new("security.perAccountLimits",
            "Rate limits counted per account",
            "Password guesses and OTP sends are counted per phone number and email, not only per IP. OFF leaves the per-IP limits, which is what the shop ran on before.",
            "A limit set too tight locks real customers out of signing in, and they will not tell you - they will just leave."),
    ];

    public sealed record FlagInfo(string Key, string Title, string What, string IfItBreaks);

    // Short, because the point of a flag is that flipping it works NOW. Five
    // minutes - the public settings cache - is fine for a shop's phone number
    // and far too long to sit watching a feature misbehave. Ten seconds costs
    // one small query per ten seconds per process.
    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(10);
    private const string CacheKey = "feature_flags";

    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;

    public FeatureFlags(AppDbContext db, IMemoryCache cache)
    {
        _db = db;
        _cache = cache;
    }

    private static string SettingKey(string flag) => "flag_" + flag.Replace('.', '_');

    /// <summary>Every flag's state, for the admin screen.</summary>
    public async Task<Dictionary<string, State>> AllStatesAsync()
    {
        if (_cache.TryGetValue(CacheKey, out Dictionary<string, State>? hit) && hit is not null)
            return hit;

        var keys = All.Select(f => SettingKey(f.Key)).ToList();
        var rows = await _db.SiteSettings.AsNoTracking()
            .Where(s => keys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, s => s.Value);

        var states = All.ToDictionary(
            f => f.Key,
            f => Parse(rows.TryGetValue(SettingKey(f.Key), out var v) ? v : null));

        _cache.Set(CacheKey, states, CacheFor);
        return states;
    }

    /// <summary>
    /// Is this feature on for this caller?
    ///
    /// <paramref name="user"/> may be null - a signed-out shopper - and that is
    /// not Staff, so a Staff-only feature stays invisible to them.
    /// </summary>
    public async Task<bool> IsOnAsync(string flag, ClaimsPrincipal? user = null)
    {
        var states = await AllStatesAsync();
        if (!states.TryGetValue(flag, out var state)) return false;

        return state switch
        {
            State.On => true,
            State.Staff => user?.Identity?.IsAuthenticated == true
                           && !string.Equals(user.FindFirst("role")?.Value, "customer",
                                             StringComparison.OrdinalIgnoreCase),
            _ => false,
        };
    }

    /// <summary>Flip a switch. Takes effect within <see cref="CacheFor"/>, with no deploy.</summary>
    public async Task SetAsync(string flag, State state)
    {
        if (!All.Any(f => f.Key == flag))
            throw new ArgumentException($"There is no flag called {flag}.", nameof(flag));

        var key = SettingKey(flag);
        var row = await _db.SiteSettings.FirstOrDefaultAsync(s => s.Key == key);
        if (row is null)
            _db.SiteSettings.Add(new SiteSetting { Key = key, Value = state.ToString().ToLowerInvariant() });
        else
        {
            row.Value = state.ToString().ToLowerInvariant();
            row.UpdatedAt = DateTimeOffset.UtcNow;
        }
        await _db.SaveChangesAsync();
        _cache.Remove(CacheKey);   // so the person who pressed it sees it at once
    }

    /// <summary>
    /// Anything that is not plainly one of the three is Off.
    ///
    /// A flag whose value cannot be read has to fail to the quiet side. Reading
    /// a typo as On would turn a feature on for everybody at the exact moment
    /// somebody was fumbling with its setting.
    /// </summary>
    public static State Parse(string? raw) => (raw ?? "").Trim().ToLowerInvariant() switch
    {
        "on" or "all" or "true" or "1" => State.On,
        "staff" or "admin" => State.Staff,
        _ => State.Off,
    };
}
