using System.Text.Json;
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

        // What the hourly sweep last did, so the screen can say when the
        // catalogue was last acted on rather than only what is wrong with it.
        var lastSweepRaw = await _db.SiteSettings
            .Where(x => x.Key == ProductGateSweepService.LastSweepSettingKey)
            .Select(x => x.Value)
            .FirstOrDefaultAsync();

        object? lastSweep = null;
        if (!string.IsNullOrWhiteSpace(lastSweepRaw))
        {
            // Written by this application, but a malformed row must not take
            // the whole report down with it.
            try { lastSweep = JsonSerializer.Deserialize<JsonElement>(lastSweepRaw); }
            catch { lastSweep = null; }
        }

        return Ok(new
        {
            success = true,
            total = rows.Count,
            live = rows.Count(r => r.live),
            passing = rows.Count(r => r.passed),
            failing = rows.Count(r => !r.passed),
            wouldGoToDraft = rows.Count(r => r.wouldGoToDraft),
            // Drafts that have since been fixed — the sweep will put these back
            // on the website by itself.
            wouldGoLive = rows.Count(r => !r.live && r.passed
                                          && string.Equals(r.status, ProductQualityGate.DraftStatus, StringComparison.OrdinalIgnoreCase)),
            byReason,
            lastSweep,
            products = rows,
        });
    }

    /// <summary>
    /// Runs the hourly sweep now instead of waiting for it.
    ///
    /// This used to be the only thing that applied the gate to products already
    /// on the website, which is why it asked the owner to type a number back:
    /// taking a seventh of a shop offline deserved a deliberate act. It runs on
    /// its own every hour now, so asking for a confirmation here would be
    /// ceremony around something that is going to happen anyway. The button is
    /// "do it now", and it does exactly what the timer does — both directions.
    /// </summary>
    [HttpPost("enforce")]
    public async Task<IActionResult> Enforce()
    {
        var result = await ProductGateSweepService.SweepAsync(_db, _log);

        return Ok(new
        {
            success = true,
            movedToDraft = result.TakenDown.Count,
            putBackOnWebsite = result.PutBack.Count,
            checkedCount = result.Checked,
            takenDownNames = result.TakenDown.Take(10).ToList(),
            putBackNames = result.PutBack.Take(10).ToList(),
        });
    }
}
