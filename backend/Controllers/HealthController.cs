using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Bahar se dekhne ke liye ek hi pata: GET /api/health
///
/// 200 = sab theek. 503 = kuch toota hai. Uptime monitor ko isi farak ki
/// zarurat hoti hai, aur bas.
///
/// Ye jaanbujh kar anonymous hai - jo service bahar se nigraani karti hai uske
/// paas koi token nahi hota. Isliye yahan se andar ka koi aankda bahar nahi
/// jata: na disk kitni bachi, na database ka pata, na version. Sirf itna ki
/// kaun sa hissa theek nahi hai, taki mail padhkar seedha wahin dekha ja sake.
///
/// Ek baat saaf rahe: ye endpoint tabhi jawab deta hai jab server zinda ho.
/// Jis din server hi band hoga, ye bhi chup rahega - aur yahi wajah hai ki
/// bahar wali uptime service alag se zaruri hai. Dekhiye HealthWatchdogService.
/// </summary>
[ApiController]
[Route("api/health")]
[AllowAnonymous]
public class HealthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public HealthController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var problems = await HealthChecks.RunAsync(_db, _env, ct);
        if (problems.Count == 0)
            return Ok(new { status = "ok" });

        // 503 taki monitor ise "down" gine. Sirf hisse ka naam jata hai,
        // uska byora nahi.
        return StatusCode(503, new { status = "fail", failing = problems.Select(p => p.Part).ToArray() });
    }
}
