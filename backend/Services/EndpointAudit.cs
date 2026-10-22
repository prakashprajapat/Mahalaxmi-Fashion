using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using MahalaxmiApi.Authorization;

namespace MahalaxmiApi.Services;

/// <summary>
/// Every route this API answers, and what guards it.
///
/// This exists because of how the last two pieces of work went. Rate limiting
/// was already built and attached to sixteen endpoints - and six others had
/// none at all, including a creator login that checks a password and an
/// application form that writes a row. Nothing was wrong with the limiter. The
/// gap was that attaching it is a thing a person has to REMEMBER on every new
/// endpoint, and the only way to find the ones nobody remembered was to read
/// every controller by hand, which is how they were found.
///
/// That is the real lesson behind putting cross-cutting controls at a single
/// entry point: not that routing through one place is faster, but that a
/// control applied per endpoint is a control that is missing somewhere. Where
/// the control genuinely cannot be central - and authorization cannot be here,
/// because most of this shop IS public and a default of "signed in only" would
/// break the storefront - the next best thing is for the gap to be something
/// the server reports rather than something a person has to notice.
///
/// So: at startup this prints what every route is guarded by, and names the
/// combination worth looking at - a route that is public, changes something,
/// and has no limit on how often it may be called.
/// </summary>
public static class EndpointAudit
{
    public sealed record Row(
        string Methods,
        string Route,
        string Guard,
        string Limit,
        bool Writes,
        bool Risky);

    private static readonly string[] WriteMethods = ["POST", "PUT", "PATCH", "DELETE"];

    public static List<Row> Inspect(EndpointDataSource source)
    {
        var rows = new List<Row>();

        foreach (var endpoint in source.Endpoints)
        {
            if (endpoint is not RouteEndpoint route) continue;

            var pattern = route.RoutePattern.RawText ?? "";
            if (pattern.Length == 0) continue;

            var meta = endpoint.Metadata;

            var methods = meta.GetMetadata<Microsoft.AspNetCore.Routing.HttpMethodMetadata>()
                ?.HttpMethods.Where(m => m != "OPTIONS").ToArray() ?? [];
            var methodText = methods.Length == 0 ? "ANY" : string.Join("/", methods);
            var writes = methods.Any(m => WriteMethods.Contains(m));

            // Guard. Metadata carries the attributes from both the controller
            // and the action, so a class-level [Authorize] shows up here on
            // every one of its endpoints - which is what we want to see.
            string guard;
            if (meta.GetMetadata<IAllowAnonymous>() is not null)
            {
                guard = "anonymous";
            }
            else
            {
                var authorize = meta.GetOrderedMetadata<IAuthorizeData>()
                    .Where(a => a is not null).ToArray();
                var perm = meta.GetMetadata<RequirePermAttribute>();

                if (authorize.Length == 0 && perm is null)
                {
                    guard = "PUBLIC";
                }
                else
                {
                    var parts = new List<string>();
                    var policy = authorize.Select(a => a.Policy)
                        .FirstOrDefault(p => !string.IsNullOrWhiteSpace(p));
                    parts.Add(string.IsNullOrWhiteSpace(policy) ? "auth" : "auth:" + policy);
                    if (perm is not null) parts.Add("perm:" + string.Join("|", perm.Sections));
                    guard = string.Join(" ", parts);
                }
            }

            // Limit.
            string limit;
            if (meta.GetMetadata<DisableRateLimitingAttribute>() is not null)
                limit = "DISABLED";
            else if (meta.GetMetadata<EnableRateLimitingAttribute>() is { } en)
                limit = string.IsNullOrWhiteSpace(en.PolicyName) ? "default" : en.PolicyName!;
            else
                limit = "none";

            // The combination worth a second look: anybody may call it, it
            // changes something, and nothing caps how often. Not automatically
            // a fault - a payment webhook is exactly this and is verified by
            // signature instead - but it should always be on purpose.
            var risky = guard == "PUBLIC" && writes && limit == "none";

            rows.Add(new Row(methodText, pattern, guard, limit, writes, risky));
        }

        return rows
            .OrderByDescending(r => r.Risky)
            .ThenBy(r => r.Route, StringComparer.Ordinal)
            .ThenBy(r => r.Methods, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// The startup lines. Counts for every run, and the routes worth looking at
    /// listed in full - a count on its own is a number nobody acts on.
    /// </summary>
    public static void Report(IReadOnlyList<Row> rows, ILogger log)
    {
        var publicWrites = rows.Count(r => r.Guard == "PUBLIC" && r.Writes);
        var unlimited = rows.Count(r => r.Limit == "none");
        var risky = rows.Where(r => r.Risky).ToList();

        log.LogInformation(
            "Endpoints: {Total} routes, {Guarded} guarded, {PublicWrites} public writes, {Unlimited} with no rate limit.",
            rows.Count,
            rows.Count(r => r.Guard != "PUBLIC" && r.Guard != "anonymous"),
            publicWrites,
            unlimited);

        if (risky.Count == 0)
        {
            log.LogInformation("No public write endpoint is missing a rate limit.");
            return;
        }

        // Warning, not an exception. Refusing to start over this would mean a
        // deploy that fails at two in the morning over something that is
        // sometimes correct on purpose.
        log.LogWarning(
            "{Count} public write endpoint(s) have no rate limit. Each should be deliberate:", risky.Count);
        foreach (var r in risky)
            log.LogWarning("  {Methods} {Route}", r.Methods, r.Route);
    }
}
