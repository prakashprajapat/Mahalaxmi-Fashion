using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// The switches, and the one screen that flips them.
///
/// Owner only, both to read and to write. These decide whether customers can
/// sign in; they are not a staff setting, and the list itself tells a reader
/// which parts of the shop are newest and least proven.
/// </summary>
[ApiController]
[Route("api/featureflags")]
[Authorize(Policy = "AdminOnly")]
public class FeatureFlagsController : ControllerBase
{
    private readonly FeatureFlags _flags;
    private readonly ILogger<FeatureFlagsController> _log;

    public FeatureFlagsController(FeatureFlags flags, ILogger<FeatureFlagsController> log)
    {
        _flags = flags;
        _log = log;
    }

    // GET /api/featureflags
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var states = await _flags.AllStatesAsync();
        return Ok(new
        {
            success = true,
            flags = FeatureFlags.All.Select(f => new
            {
                key = f.Key,
                title = f.Title,
                what = f.What,
                ifItBreaks = f.IfItBreaks,
                state = (states.TryGetValue(f.Key, out var s) ? s : FeatureFlags.State.Off)
                        .ToString().ToLowerInvariant(),
            }),
        });
    }

    // PUT /api/featureflags/{key}   body: { "state": "off" | "staff" | "on" }
    //
    // Deliberately not rate limited and deliberately cheap: the moment this is
    // most needed is the moment something is going wrong, and a switch that is
    // slow or refuses on the bad night is not a switch.
    [HttpPut("{key}")]
    public async Task<IActionResult> Set(string key, [FromBody] SetFlagRequest req)
    {
        if (!FeatureFlags.All.Any(f => f.Key == key))
            return NotFound(new { success = false, message = $"There is no switch called {key}." });

        var state = FeatureFlags.Parse(req.State);

        // Said at warning level on purpose. When somebody is reading the log
        // after a bad evening, "who turned what on, and when" is the first
        // question, and this is the line that answers it.
        _log.LogWarning("Feature switch {Key} set to {State} by {Who}",
            key, state, User.FindFirst("email")?.Value ?? "admin");

        await _flags.SetAsync(key, state);

        return Ok(new { success = true, key, state = state.ToString().ToLowerInvariant() });
    }
}

public record SetFlagRequest(string? State);
