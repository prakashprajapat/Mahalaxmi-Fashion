namespace MahalaxmiApi.Services;

/// <summary>
/// A count of attempts per key, held in memory, used where the thing worth
/// protecting is an account rather than a socket.
///
/// The limiter in Program.cs counts per IP address, which is the right unit for
/// "one machine is hammering us" and the wrong unit for the two cases that
/// actually happen:
///
///   A hacker with a hundred machines gets the whole per-IP budget a hundred
///   times over against ONE account. Six password guesses an IP becomes six
///   hundred, and the account it is aimed at never sees a limit at all.
///
///   Half a town shares one mobile-carrier address. Counted per IP, the
///   fifteenth honest shopper to sign in in five minutes is turned away for
///   something the first fourteen did.
///
/// So the two are counted separately and both have to pass: the IP limit stops
/// one machine from making noise, and the key limit here - a phone number, an
/// email address - stops a thousand machines from queueing up against a single
/// customer, however they arrive.
///
/// In memory, and deliberately. The counts matter for minutes, cost nothing to
/// lose, and a restart clearing them is a few free guesses, not a breach - not
/// worth a database write on the path that signs every customer in. The one
/// thing to know is that it is per process: a second backend container would
/// keep its own counts, so these numbers are a per-container budget.
/// </summary>
public sealed class AttemptLimiter
{
    /// <summary>
    /// Whether this attempt may proceed, and how long to wait if not. The wait
    /// is real - it is when the oldest attempt in the window actually falls out
    /// - so it can be told to the customer rather than a vague "try later".
    /// </summary>
    public readonly record struct Decision(bool Allowed, int RetryAfterSeconds)
    {
        public static readonly Decision Pass = new(true, 0);
    }

    private sealed class Window
    {
        public readonly Queue<DateTimeOffset> Hits = new();
        public DateTimeOffset LastSeen;
    }

    // One lock for everything. These are microseconds of work per request and
    // the alternative - a concurrent dictionary of individually locked windows -
    // buys nothing at a few requests a second and is harder to reason about.
    private readonly object _gate = new();
    private readonly Dictionary<string, Window> _windows = new(StringComparer.Ordinal);

    // Keys are attacker-supplied: every made-up phone number creates one. Both
    // numbers exist so a flood cannot grow this dictionary without bound.
    private const int MaxKeys = 50_000;
    private static readonly TimeSpan IdleBeforeEvict = TimeSpan.FromHours(1);
    private static readonly TimeSpan SweepEvery = TimeSpan.FromMinutes(5);
    private DateTimeOffset _nextSweep = DateTimeOffset.MinValue;

    private readonly Func<DateTimeOffset> _now;

    public AttemptLimiter() : this(() => DateTimeOffset.UtcNow) { }

    /// <summary>Clock injection, so the window behaviour can be tested without sleeping.</summary>
    public AttemptLimiter(Func<DateTimeOffset> now) => _now = now;

    /// <summary>
    /// Count this attempt against <paramref name="key"/> and say whether it may
    /// proceed. An empty key is always allowed: a rule that cannot tell who it
    /// is looking at must not guess, or every caller it fails to identify ends
    /// up sharing one bucket - the exact bug this class exists to avoid.
    /// </summary>
    public Decision Check(string? key, int limit, TimeSpan window)
    {
        if (string.IsNullOrEmpty(key) || limit <= 0) return Decision.Pass;

        var now = _now();
        lock (_gate)
        {
            SweepIfDue(now);

            if (!_windows.TryGetValue(key, out var w))
            {
                w = new Window();
                _windows[key] = w;
            }
            w.LastSeen = now;

            var cutoff = now - window;
            while (w.Hits.Count > 0 && w.Hits.Peek() <= cutoff) w.Hits.Dequeue();

            if (w.Hits.Count >= limit)
            {
                // The window is sliding, not a bucket that empties on the hour:
                // the next slot frees up when the oldest attempt in it expires.
                var freesAt = w.Hits.Peek() + window;
                var wait = (int)Math.Ceiling((freesAt - now).TotalSeconds);
                return new Decision(false, Math.Max(1, wait));
            }

            w.Hits.Enqueue(now);
            return Decision.Pass;
        }
    }

    /// <summary>
    /// Wipe the count for a key. Called when an attempt SUCCEEDS: a customer who
    /// mistyped her password twice and got it right on the third try has done
    /// nothing wrong, and should not start her next visit two guesses down.
    /// Only success clears it - a failure that merely looks different does not.
    /// </summary>
    public void Forget(string? key)
    {
        if (string.IsNullOrEmpty(key)) return;
        lock (_gate) _windows.Remove(key);
    }

    /// <summary>How many keys are being tracked. For diagnostics only.</summary>
    public int TrackedKeys { get { lock (_gate) return _windows.Count; } }

    // Called under the lock, from Check, so eviction costs nothing on a quiet
    // site and is paid by whoever happens to arrive after the interval.
    private void SweepIfDue(DateTimeOffset now)
    {
        var crowded = _windows.Count > MaxKeys;
        if (now < _nextSweep && !crowded) return;
        _nextSweep = now + SweepEvery;

        var idle = now - IdleBeforeEvict;
        var stale = _windows.Where(kv => kv.Value.LastSeen <= idle).Select(kv => kv.Key).ToList();
        foreach (var k in stale) _windows.Remove(k);

        // Still over the cap means a flood of invented keys is in progress.
        // Drop the least recently seen rather than refusing service: the keys an
        // attacker just made up are worth less than the ones real customers are
        // mid-login on, and turning everyone away would be doing his work.
        if (_windows.Count <= MaxKeys) return;
        var excess = _windows.Count - MaxKeys;
        var oldest = _windows.OrderBy(kv => kv.Value.LastSeen).Take(excess).Select(kv => kv.Key).ToList();
        foreach (var k in oldest) _windows.Remove(k);
    }

    // ── Key builders ──────────────────────────────────────────────────────────
    //
    // The prefix is part of the key on purpose. The same phone number guessing
    // passwords and asking for OTPs are two different budgets: one is free to
    // attempt and the other sends an SMS the shop pays for, and sharing a
    // counter between them would let the cheap one spend the expensive one's.

    /// <summary>A password-guessing budget for one account, however it was named.</summary>
    public static string? LoginKey(string? phoneOrEmail)
    {
        var e = CustomerKeys.Email(phoneOrEmail);
        if (e is not null) return "login:e:" + e;
        var p = CustomerKeys.Phone(phoneOrEmail);
        return p is null ? null : "login:p:" + p;
    }

    /// <summary>
    /// A creator's own budget, kept apart from the shopper account she may have
    /// under the same address. Her earnings page and the shop are two different
    /// doors, and a few mistyped sign-ins at one should not shut the other.
    /// </summary>
    public static string? CreatorKey(string? phoneOrEmail)
    {
        var k = LoginKey(phoneOrEmail);
        return k is null ? null : k + ":creator";
    }

    /// <summary>An OTP-sending budget for one destination. Each send costs money.</summary>
    public static string? OtpKey(string? phone, string? email)
    {
        var e = CustomerKeys.Email(email) ?? CustomerKeys.Email(phone);
        if (e is not null) return "otp:e:" + e;
        var p = CustomerKeys.Phone(phone);
        return p is null ? null : "otp:p:" + p;
    }

    /// <summary>A sign-up budget for one destination, so one number cannot open a hundred accounts.</summary>
    public static string? SignupKey(string? phone, string? email)
    {
        var e = CustomerKeys.Email(email);
        if (e is not null) return "signup:e:" + e;
        var p = CustomerKeys.Phone(phone);
        return p is null ? null : "signup:p:" + p;
    }

    /// <summary>
    /// A guessing budget for one admin or staff sign-in name. Not built on
    /// CustomerKeys: staff sign in with a username, which is neither an email
    /// nor a phone number, and a username that produced no key would be the one
    /// identifier in the shop with no per-account limit on it.
    /// </summary>
    public static string? AdminKey(string? loginId)
    {
        var id = (loginId ?? string.Empty).Trim().ToLowerInvariant();
        return id.Length == 0 ? null : "admin:" + id;
    }

    /// <summary>A password-reset budget for one account.</summary>
    public static string? ResetKey(string? phoneOrEmail)
    {
        var e = CustomerKeys.Email(phoneOrEmail);
        if (e is not null) return "reset:e:" + e;
        var p = CustomerKeys.Phone(phoneOrEmail);
        return p is null ? null : "reset:p:" + p;
    }

    // ── The limits themselves ─────────────────────────────────────────────────
    //
    // Set against what an honest person does, not against what feels safe. A
    // shopper who has forgotten her password tries three or four times and then
    // asks for a code; she does not try forty. A number that wants six codes in
    // an hour is not a shopper.

    /// <summary>Password guesses against one account: 8 in 15 minutes.</summary>
    public static readonly (int Limit, TimeSpan Window) Login = (8, TimeSpan.FromMinutes(15));

    /// <summary>Codes sent to one destination: 4 in 15 minutes.</summary>
    public static readonly (int Limit, TimeSpan Window) OtpBurst = (4, TimeSpan.FromMinutes(15));

    /// <summary>Codes sent to one destination in a day: 12. This one is the SMS bill.</summary>
    public static readonly (int Limit, TimeSpan Window) OtpDaily = (12, TimeSpan.FromHours(24));

    /// <summary>Accounts opened from one destination: 3 in an hour.</summary>
    public static readonly (int Limit, TimeSpan Window) Signup = (3, TimeSpan.FromHours(1));

    /// <summary>Reset attempts against one account: 6 in an hour.</summary>
    public static readonly (int Limit, TimeSpan Window) Reset = (6, TimeSpan.FromHours(1));

    /// <summary>
    /// Admin password guesses against one sign-in name: 5 in 15 minutes.
    /// Tighter than a customer's, because this password opens the orders, the
    /// customer list and the payment settings, and because there are perhaps
    /// five people in the world who are supposed to type it.
    /// </summary>
    public static readonly (int Limit, TimeSpan Window) AdminLogin = (5, TimeSpan.FromMinutes(15));

    /// <summary>
    /// The sentence a customer sees. Minutes, not seconds, once it is past a
    /// minute: "wait 847 seconds" is a number to be argued with, "wait about 15
    /// minutes" is an instruction.
    /// </summary>
    public static string WaitMessage(int seconds)
    {
        if (seconds <= 90) return "Please wait about a minute and try again.";
        var mins = (int)Math.Ceiling(seconds / 60.0);
        if (mins < 60) return $"Please try again in about {mins} minutes.";
        var hours = (int)Math.Ceiling(mins / 60.0);
        return hours == 1
            ? "Please try again in about an hour."
            : $"Please try again in about {hours} hours.";
    }
}
