namespace MahalaxmiApi.Services;

/// <summary>
/// The shop's own clock.
///
/// Every timestamp in the database is stored in UTC, which is right — but a day
/// in Balotra is not a day in UTC. India runs 5 hours 30 minutes ahead, so an
/// Indian day ENDS at 18:30 UTC. An order placed at half past midnight on the
/// 5th is still the 4th as far as UTC is concerned, and a report that groups by
/// the UTC date puts it on the wrong row — which is exactly what happened to a
/// real order on the funnel page.
///
/// Anything that counts days, picks "today", or clamps a date the shop typed in
/// should go through here rather than DateTime.UtcNow.Date.
///
/// A fixed offset is used rather than a named time zone on purpose: India has
/// no daylight saving and has not changed its offset since 1945, and a fixed
/// span cannot fail on a server whose tz database is missing or stale.
/// </summary>
public static class IndiaTime
{
    /// <summary>IST — UTC+05:30. Note the half hour; it is why hourly buckets are not enough.</summary>
    public static readonly TimeSpan Offset = TimeSpan.FromMinutes(330);

    /// <summary>Right now, as a clock in the shop would read it.</summary>
    public static DateTimeOffset Now => DateTimeOffset.UtcNow.ToOffset(Offset);

    /// <summary>Today's date, as the shop sees it.</summary>
    public static DateTime Today => Now.Date;

    /// <summary>The instant an Indian calendar day began, in UTC — for a WHERE clause.</summary>
    public static DateTimeOffset DayStartUtc(DateTime istDate) =>
        new DateTimeOffset(istDate.Date, Offset).ToUniversalTime();

    /// <summary>
    /// Which Indian day a UTC half-hour bucket belongs to. Reports group in SQL
    /// by UTC date + hour + half-hour, then land each bucket on its Indian day
    /// with this — 48 rows a day instead of one row per event.
    /// </summary>
    public static DateTime DayOfBucket(DateTime utcDate, int hour, int half) =>
        new DateTimeOffset(utcDate.Date.AddHours(hour).AddMinutes(half * 30), TimeSpan.Zero)
            .ToOffset(Offset).Date;
}
