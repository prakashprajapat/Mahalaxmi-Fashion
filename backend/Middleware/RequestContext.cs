using System.Diagnostics;

namespace MahalaxmiApi.Middleware;

/// <summary>
/// The one place every request passes through, and the three things that are
/// worth doing there.
///
/// This is the part of the API-gateway idea that applies to a shop with one
/// API rather than a hundred services. The reason a gateway exists is not
/// routing - nginx already does that - it is that authentication, rate limiting
/// and logging are the same job on every endpoint, and doing the same job in
/// sixty controllers means doing it sixty times and forgetting it twice. Two of
/// those three are now central (the limiter runs as middleware; authentication
/// runs as middleware). Logging was not, and it is the one that costs nothing
/// and pays every time something goes wrong.
///
/// What it does:
///
///   Gives the request an id, and reuses Cloudflare's CF-Ray when there is one
///   so the id in our log is the same string Cloudflare's own dashboard shows.
///
///   Puts that id on every log line the request produces, through a log scope.
///   Without it a log is sixty interleaved requests with no way to tell which
///   line belongs to which - and a customer saying "it failed at four o'clock"
///   cannot be matched to anything.
///
///   Returns the id on the response as X-Request-Id, so the number a customer
///   or the owner can see is the number to search the log for.
///
///   Says so when a request is slow. A request that took four seconds is not an
///   error and nothing else will ever mention it, which is how a slow query
///   stays unnoticed until it is a slow site.
/// </summary>
public sealed class RequestContextMiddleware
{
    /// <summary>The header the id comes back on, and what to grep the log for.</summary>
    public const string HeaderName = "X-Request-Id";

    // Anything past this is worth a line in the log on its own. Set where a
    // person starts to notice: a page that takes two seconds to answer feels
    // broken, and most endpoints here answer in tens of milliseconds.
    private static readonly TimeSpan Slow = TimeSpan.FromSeconds(2);

    private readonly RequestDelegate _next;
    private readonly ILogger<RequestContextMiddleware> _log;

    public RequestContextMiddleware(RequestDelegate next, ILogger<RequestContextMiddleware> log)
    {
        _next = next;
        _log = log;
    }

    /// <summary>
    /// The id for this request. Cloudflare's own first, because an id shared
    /// with the layer in front is worth more than one we invented; then a
    /// client-supplied X-Request-Id, which is trusted for correlation and
    /// nothing else - it is never used for a decision, so a made-up value costs
    /// nothing but a confusing log line for whoever made it up.
    /// </summary>
    private static string IdFor(HttpContext http)
    {
        var ray = http.Request.Headers["CF-Ray"].ToString();
        if (!string.IsNullOrWhiteSpace(ray)) return Clean(ray);

        var given = http.Request.Headers[HeaderName].ToString();
        if (!string.IsNullOrWhiteSpace(given)) return Clean(given);

        return http.TraceIdentifier;
    }

    // A header reaches the log, and a log is read by people and by tools. Keep
    // it to characters that cannot break either: no newlines to forge a second
    // log line with, no length to bury one in.
    private static string Clean(string raw)
    {
        var trimmed = raw.Trim();
        if (trimmed.Length > 64) trimmed = trimmed[..64];
        return new string(trimmed.Where(c => char.IsLetterOrDigit(c) || c is '-' or '_').ToArray());
    }

    public async Task InvokeAsync(HttpContext http)
    {
        var id = IdFor(http);
        if (id.Length == 0) id = http.TraceIdentifier;

        http.Items[HeaderName] = id;

        // Set before anything downstream writes, because once the response has
        // started the headers are gone and this would throw.
        http.Response.Headers[HeaderName] = id;

        var started = Stopwatch.GetTimestamp();

        // Every log line from here down carries the id, including the ones
        // written by controllers that know nothing about this middleware.
        using (_log.BeginScope(new Dictionary<string, object> { [HeaderName] = id }))
        {
            try
            {
                await _next(http);
            }
            finally
            {
                var took = Stopwatch.GetElapsedTime(started);
                if (took >= Slow)
                {
                    _log.LogWarning(
                        "Slow request: {Method} {Path} took {Ms}ms and answered {Status} ({RequestId})",
                        http.Request.Method, http.Request.Path.Value,
                        (int)took.TotalMilliseconds, http.Response.StatusCode, id);
                }
            }
        }
    }
}

public static class RequestContextExtensions
{
    public static IApplicationBuilder UseRequestContext(this IApplicationBuilder app)
        => app.UseMiddleware<RequestContextMiddleware>();

    /// <summary>
    /// The id for the request being handled, for a controller that wants to
    /// quote it back to the caller. Empty when the middleware has not run.
    /// </summary>
    public static string RequestId(this HttpContext http)
        => http.Items.TryGetValue(RequestContextMiddleware.HeaderName, out var v)
            ? v as string ?? string.Empty
            : string.Empty;
}
