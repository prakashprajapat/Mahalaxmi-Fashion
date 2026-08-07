using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace MahalaxmiApi.Authorization;

// ─────────────────────────────────────────────────────────────────────────────
//  Admin-panel section access (Staff Permissions – backend enforcement)
//
//  • The store OWNER logs in with the JWT role claim "admin" and ALWAYS has full
//    access to every section (owner-bypass — can never be locked out).
//  • STAFF log in with a non-admin role and carry a comma-separated "perms" claim
//    listing the section keys they were granted (e.g. "orders,products,customers").
//  • Regular customers (and unauthenticated callers) have no perms → no access,
//    exactly as before, so customer-facing behaviour is unchanged.
// ─────────────────────────────────────────────────────────────────────────────
public static class SectionAccess
{
    // True only for the store owner (full admin).
    public static bool IsOwner(this ClaimsPrincipal? user) =>
        user?.Identity?.IsAuthenticated == true &&
        string.Equals(user.FindFirst("role")?.Value, "admin", StringComparison.OrdinalIgnoreCase);

    // True if the caller is the owner, OR a staff member whose "perms" claim
    // contains ANY one of the given section keys. Used as a drop-in replacement
    // for the old `User.HasClaim("role","admin")` admin checks.
    public static bool HasSectionAccess(this ClaimsPrincipal? user, params string[] sections)
    {
        if (user?.Identity?.IsAuthenticated != true) return false;
        if (user.IsOwner()) return true;

        var raw = user.FindFirst("perms")?.Value ?? "";
        if (raw.Length == 0) return false;

        var perms = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var s in sections)
            if (Array.Exists(perms, p => string.Equals(p, s, StringComparison.OrdinalIgnoreCase)))
                return true;
        return false;
    }
}

// Attribute form of the same check, for endpoints already protected by [Authorize]
// attributes. ALWAYS pair with [Authorize] so an unauthenticated caller is
// challenged (401) first; this filter then returns 403 if the section is missing.
// Owner bypasses; staff need one of the listed sections in their perms claim.
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public sealed class RequirePermAttribute : Attribute, IAuthorizationFilter
{
    private readonly string[] _sections;
    public RequirePermAttribute(params string[] sections) => _sections = sections;

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var user = context.HttpContext.User;

        if (user?.Identity?.IsAuthenticated != true)
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        if (!user.HasSectionAccess(_sections))
        {
            context.Result = new ObjectResult(new
            {
                success = false,
                message = "You don't have permission for this section."
            })
            { StatusCode = StatusCodes.Status403Forbidden };
        }
    }
}
