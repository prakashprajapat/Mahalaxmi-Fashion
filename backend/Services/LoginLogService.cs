using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// Har login ko login_events me likhta hai. Kabhi fail nahi karta: log likhne
/// me gadbad ho to bhi login chalta rahe - log ke liye kisi ka login nahi rukna
/// chahiye.
/// </summary>
public sealed class LoginLogService
{
    public const string AppUaTag = "MahalaxmiApp";

    private readonly AppDbContext _db;
    private readonly IHttpContextAccessor _http;
    private readonly ILogger<LoginLogService> _log;

    public LoginLogService(AppDbContext db, IHttpContextAccessor http, ILogger<LoginLogService> log)
    {
        _db = db; _http = http; _log = log;
    }

    /// <summary>Controller yahan likh deta hai ki login kis tarah hua (otp/google/...).</summary>
    public const string MethodKey = "mfh.loginMethod";

    public static void SetMethod(HttpContext? http, string method)
    {
        if (http is not null) http.Items[MethodKey] = method;
    }

    public async Task RecordAsync(string subjectType, string? subjectId, string? loginId,
                                  bool success, string? method = null, string? reason = null)
    {
        try
        {
            var http = _http.HttpContext;
            var ua = http?.Request.Headers.UserAgent.ToString() ?? "";
            var client = http?.Request.Headers["X-Client"].ToString() ?? "";
            var isApp = ua.Contains(AppUaTag, StringComparison.OrdinalIgnoreCase)
                        || client.Equals("app", StringComparison.OrdinalIgnoreCase);

            method ??= http?.Items[MethodKey] as string ?? "login";

            _db.LoginEvents.Add(new LoginEvent
            {
                SubjectType = Trunc(subjectType, 20) ?? "customer",
                SubjectId   = Trunc(subjectId, 64),
                LoginId     = Trunc(loginId?.Trim(), 255),
                Method      = Trunc(method, 30) ?? "login",
                Platform    = isApp ? "app" : "web",
                Device      = Trunc(TokenService.DeviceOf(ua), 200),
                Ip          = Trunc(http is null ? null : IpOf(http), 64),
                UserAgent   = Trunc(ua, 400),
                Success     = success,
                Reason      = Trunc(reason, 200),
                CreatedAt   = DateTimeOffset.UtcNow,
            });
            await _db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Login log write failed");
        }
    }

    private static string? Trunc(string? s, int n) =>
        string.IsNullOrEmpty(s) ? s : (s.Length <= n ? s : s[..n]);

    // Program.cs ke CallerIp jaisa: header par tabhi bharosa jab request apne
    // nginx (localhost / private network) se aayi ho.
    private static string? IpOf(HttpContext http)
    {
        var remote = http.Connection.RemoteIpAddress;
        var direct = remote?.ToString();
        if (remote is null) return direct;
        var v4 = remote.IsIPv4MappedToIPv6 ? remote.MapToIPv4() : remote;
        var b = v4.GetAddressBytes();
        var local = System.Net.IPAddress.IsLoopback(v4)
                    || (b.Length == 4 && (b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168)));
        if (!local) return direct;
        var cf = http.Request.Headers["CF-Connecting-IP"].ToString();
        if (!string.IsNullOrWhiteSpace(cf)) return cf.Trim();
        var real = http.Request.Headers["X-Real-IP"].ToString();
        if (!string.IsNullOrWhiteSpace(real)) return real.Trim();
        return direct;
    }
}
