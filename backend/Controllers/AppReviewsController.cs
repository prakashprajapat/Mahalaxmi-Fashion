using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Ratings of the shop itself, left from inside the Android app.
///
/// The route the shop asked for: the customer rates the app, it lands here as
/// pending, the shop reads it in the admin panel, and only an approved one is
/// published. A good one then earns an invitation to say the same thing on the
/// Play Store - an invitation, because a Play Store review can only ever be
/// written by the customer from their own Google account. Nobody can post one
/// on their behalf, and no API offers to.
///
/// A poor rating is not invited anywhere. The complaint stops with the shop,
/// which is the point of asking inside the app rather than leaving it to the
/// store listing.
/// </summary>
[ApiController]
[Route("api/app-reviews")]
public class AppReviewsController : ControllerBase
{
    private readonly AppDbContext _db;

    public AppReviewsController(AppDbContext db)
    {
        _db = db;
    }

    /// The rating at or above which the shop is happy to be sent to the Play
    /// Store. Below it the customer is thanked and nothing else is asked.
    private const int PlayStoreFloor = 4;

    private const int MaxBody = 2000;
    private const int MaxName = 120;

    // ---------------------------------------------------------------- public

    // POST /api/app-reviews
    //
    // Anyone using the app may rate it, signed in or not: the people most
    // worth hearing from are often the ones who have not made an account yet.
    // Nothing published comes out of this without the shop approving it, so
    // the open door costs moderation, not trust.
    [HttpPost]
    [AllowAnonymous]
    public async Task<IActionResult> Submit([FromBody] AppReviewRequest? req)
    {
        if (req is null)
            return BadRequest(new { success = false, message = "Nothing was sent." });

        if (req.Rating < 1 || req.Rating > 5)
            return BadRequest(new { success = false, message = "Please choose between one and five stars." });

        var body = (req.Text ?? "").Trim();
        if (body.Length > MaxBody) body = body.Substring(0, MaxBody);

        var customerId = CallerCustomerId();

        var name = (req.Name ?? "").Trim();
        if (name.Length > MaxName) name = name.Substring(0, MaxName);
        if (customerId is null && name.Length == 0)
            return BadRequest(new { success = false, message = "Please tell us your name." });

        var source = (req.Source ?? "app").Trim().ToLowerInvariant();
        if (source != "app" && source != "web") source = "app";

        // A signed-in customer has ONE rating of the shop. Rating it again is
        // changing their mind, not adding a second opinion, so the row is
        // rewritten and goes back into the queue - the same way a product
        // review behaves when it is edited.
        if (customerId is not null)
        {
            var mine = await _db.AppReviews
                .Where(r => r.CustomerId == customerId)
                .OrderByDescending(r => r.Id)
                .FirstOrDefaultAsync();

            if (mine is not null)
            {
                mine.Rating = (short)req.Rating;
                mine.Body = body.Length > 0 ? body : null;
                if (name.Length > 0) mine.Name = name;
                mine.Source = source;
                mine.Status = "pending";
                mine.PlayInvitedAt = null;
                mine.UpdatedAt = DateTimeOffset.UtcNow;
                await _db.SaveChangesAsync();
                return Ok(new { success = true, updated = true, message = "Thank you - your rating has been sent to the shop." });
            }
        }
        else
        {
            // Two taps on the same button should not make two rows for the
            // shop to read. Only an exact repeat is refused; a different
            // rating or a different sentence is a different opinion.
            var repeat = await _db.AppReviews.AnyAsync(r =>
                r.CustomerId == null &&
                r.Status == "pending" &&
                r.Name == name &&
                r.Rating == (short)req.Rating &&
                r.Body == (body.Length > 0 ? body : null));
            if (repeat)
                return Ok(new { success = true, duplicate = true, message = "Thank you - your rating has been sent to the shop." });
        }

        _db.AppReviews.Add(new AppReview
        {
            CustomerId = customerId,
            Name = name.Length > 0 ? name : CallerName(),
            Rating = (short)req.Rating,
            Body = body.Length > 0 ? body : null,
            Source = source,
            Status = "pending",
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await _db.SaveChangesAsync();

        return Ok(new { success = true, message = "Thank you - your rating has been sent to the shop." });
    }

    // GET /api/app-reviews/mine
    //
    // What the app needs to know at launch: has this customer already rated
    // us, and if the shop has since approved it, should we invite them to put
    // it on the Play Store.
    [HttpGet("mine")]
    [Authorize]
    public async Task<IActionResult> Mine()
    {
        var customerId = CallerCustomerId();
        if (customerId is null) return Ok(new { success = true, review = (object?)null });

        var mine = await _db.AppReviews
            .Where(r => r.CustomerId == customerId)
            .OrderByDescending(r => r.Id)
            .FirstOrDefaultAsync();

        if (mine is null) return Ok(new { success = true, review = (object?)null });

        var invite = mine.Status == "approved"
            && mine.Rating >= PlayStoreFloor
            && mine.PlayInvitedAt is null;

        return Ok(new
        {
            success = true,
            review = new
            {
                id = mine.Id,
                rating = (int)mine.Rating,
                text = mine.Body ?? "",
                status = mine.Status,
                createdAt = mine.CreatedAt,
            },
            invitePlayStore = invite,
        });
    }

    // POST /api/app-reviews/{id}/play-invited
    //
    // The app says it has shown the Play Store invitation. Recorded so it is
    // shown once; whether the customer actually wrote anything there is
    // Google business and nothing here can see it.
    [HttpPost("{id:int}/play-invited")]
    [Authorize]
    public async Task<IActionResult> PlayInvited(int id)
    {
        var customerId = CallerCustomerId();
        if (customerId is null) return Unauthorized(new { success = false });

        var mine = await _db.AppReviews.FirstOrDefaultAsync(r => r.Id == id && r.CustomerId == customerId);
        if (mine is null) return NotFound(new { success = false });

        mine.PlayInvitedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    // GET /api/app-reviews/recent?take=12
    //
    // The approved ones, for the website. Nothing pending or rejected leaves
    // this method.
    [HttpGet("recent")]
    [AllowAnonymous]
    public async Task<IActionResult> Recent([FromQuery] int take = 12)
    {
        if (take < 1) take = 1;
        if (take > 100) take = 100;

        var rows = await _db.AppReviews
            .Where(r => r.Status == "approved")
            .OrderByDescending(r => r.CreatedAt)
            .Take(take)
            .Select(r => new
            {
                id = r.Id,
                name = r.Name,
                rating = (int)r.Rating,
                text = r.Body ?? "",
                createdAt = r.CreatedAt,
            })
            .ToListAsync();

        var total = await _db.AppReviews.CountAsync(r => r.Status == "approved");

        return Ok(new { success = true, total, reviews = rows });
    }

    // ---------------------------------------------------------------- admin

    // GET /api/app-reviews/pending
    [HttpGet("pending")]
    [Authorize]
    [RequirePerm("reviews")]
    public async Task<IActionResult> Pending()
    {
        var rows = await _db.AppReviews
            .Where(r => r.Status == "pending")
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new
            {
                id = r.Id,
                name = r.Name,
                rating = (int)r.Rating,
                text = r.Body ?? "",
                source = r.Source,
                signedIn = r.CustomerId != null,
                status = r.Status,
                createdAt = r.CreatedAt,
                updatedAt = r.UpdatedAt,
            })
            .ToListAsync();

        return Ok(new { success = true, reviews = rows });
    }

    // PATCH /api/app-reviews/{id}/approve
    [HttpPatch("{id:int}/approve")]
    [Authorize]
    [RequirePerm("reviews")]
    public Task<IActionResult> Approve(int id) => SetStatus(id, "approved");

    // PATCH /api/app-reviews/{id}/reject
    [HttpPatch("{id:int}/reject")]
    [Authorize]
    [RequirePerm("reviews")]
    public Task<IActionResult> Reject(int id) => SetStatus(id, "rejected");

    // DELETE /api/app-reviews/{id}
    [HttpDelete("{id:int}")]
    [Authorize]
    [RequirePerm("reviews")]
    public async Task<IActionResult> Delete(int id)
    {
        var row = await _db.AppReviews.FindAsync(id);
        if (row is null) return NotFound(new { success = false });
        _db.AppReviews.Remove(row);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    private async Task<IActionResult> SetStatus(int id, string status)
    {
        var row = await _db.AppReviews.FindAsync(id);
        if (row is null) return NotFound(new { success = false });

        row.Status = status;
        // Approving is what makes the Play Store invitation possible, so a
        // review moving back out of approved takes the invitation with it.
        if (status != "approved") row.PlayInvitedAt = null;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, status });
    }

    // ---------------------------------------------------------------- helpers

    private int? CallerCustomerId()
    {
        var raw = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub");
        return int.TryParse(raw, out var id) && id > 0 ? id : null;
    }

    private string? CallerName()
    {
        var name = (User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "").Trim();
        return name.Length > 0 ? name : null;
    }
}

public record AppReviewRequest(int Rating, string? Text, string? Name, string? Source);
