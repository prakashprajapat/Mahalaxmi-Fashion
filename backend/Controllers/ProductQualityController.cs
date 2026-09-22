using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// The catalogue seen through the quality gate: which products would be
/// allowed on the website and which would not, and the one button that applies
/// that decision to everything at once.
///
/// The report and the sweep are separate endpoints on purpose. Applying the
/// gate to 84 products can take most of a shop offline in one click, and a
/// number the owner has seen beforehand is the difference between a decision
/// and an accident.
/// </summary>
[ApiController]
[Route("api/product-quality")]
[Authorize]
[RequirePerm("products")]
public class ProductQualityController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<ProductQualityController> _log;

    public ProductQualityController(AppDbContext db, ILogger<ProductQualityController> log)
    {
        _db = db;
        _log = log;
    }

    /// <summary>Every product, with the reasons it would or would not be allowed live. Changes nothing.</summary>
    [HttpGet]
    public async Task<IActionResult> Report()
    {
        var products = await _db.Products.OrderBy(p => p.Name).ToListAsync();

        var rows = products.Select(p =>
        {
            var g = ProductQualityGate.Check(p);
            var hidden = ProductQualityGate.HiddenStatuses.Contains(p.StockStatus, StringComparer.OrdinalIgnoreCase);
            return new
            {
                id = p.Id,
                name = p.Name,
                sku = p.Sku,
                category = p.Category,
                subcategory = p.Subcategory,
                status = p.StockStatus,
                live = !hidden,
                passed = g.Passed,
                // The ones that matter: live today, but would be taken down by a sweep.
                wouldGoToDraft = !hidden && !g.Passed,
                errors = g.Blocking.Select(i => new { field = i.Field, message = i.Message }).ToList(),
                warnings = g.Warnings.Select(i => new { field = i.Field, message = i.Message }).ToList(),
            };
        }).ToList();

        // Which problems account for the most products — the fastest thing to fix first.
        var byReason = rows
            .SelectMany(r => r.errors.Select(e => e.field))
            .GroupBy(f => f)
            .Select(g => new { field = g.Key, count = g.Count() })
            .OrderByDescending(x => x.count)
            .ToList();

        return Ok(new
        {
            success = true,
            total = rows.Count,
            live = rows.Count(r => r.live),
            passing = rows.Count(r => r.passed),
            failing = rows.Count(r => !r.passed),
            wouldGoToDraft = rows.Count(r => r.wouldGoToDraft),
            byReason,
            products = rows,
        });
    }

    /// <summary>
    /// Apply the gate to the whole catalogue: everything currently live that
    /// does not pass becomes a draft.
    ///
    /// The caller has to send back the number the report gave it. If the two do
    /// not match, the catalogue changed since the owner looked and the sweep is
    /// refused rather than run against numbers nobody has seen. Confirming a
    /// figure is not a formality here — it is the whole safeguard.
    /// </summary>
    [HttpPost("enforce")]
    public async Task<IActionResult> Enforce([FromBody] EnforceRequest req)
    {
        var products = await _db.Products.ToListAsync();

        var failing = products
            .Where(p => !ProductQualityGate.HiddenStatuses.Contains(p.StockStatus, StringComparer.OrdinalIgnoreCase))
            .Where(p => !ProductQualityGate.Check(p).Passed)
            .ToList();

        if (req.ExpectedCount != failing.Count)
            return Conflict(new
            {
                success = false,
                message = $"The catalogue has changed since you looked — {failing.Count} products would now be taken off the website, not {req.ExpectedCount}. Run the report again and check the new number.",
                actual = failing.Count,
            });

        foreach (var p in failing)
            p.StockStatus = ProductQualityGate.DraftStatus;

        await _db.SaveChangesAsync();
        // Otherwise the storefront keeps serving the cached list and the owner
        // sees nothing change for up to the cache's lifetime.
        ProductsController.BustCache();
        _log.LogWarning("Quality sweep moved {Count} products to draft", failing.Count);

        return Ok(new
        {
            success = true,
            movedToDraft = failing.Count,
            stillLive = products.Count - failing.Count
                        - products.Count(p => string.Equals(p.StockStatus, "Inactive", StringComparison.OrdinalIgnoreCase)),
        });
    }

    public record EnforceRequest(int ExpectedCount);
}
