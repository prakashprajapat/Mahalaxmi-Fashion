using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/popup-leads")]
public class PopupLeadsController : ControllerBase
{
    private readonly AppDbContext _db;
    public PopupLeadsController(AppDbContext db) => _db = db;

    // Public — called from WelcomePopup form
    [HttpPost]
    public async Task<IActionResult> Submit([FromBody] PopupLeadRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) && string.IsNullOrWhiteSpace(req.Phone))
            return BadRequest(new { success = false, message = "Email or phone required." });

        // Avoid exact duplicates submitted within 24 hours
        var cutoff = DateTimeOffset.UtcNow.AddHours(-24);
        bool exists = await _db.PopupLeads.AnyAsync(l =>
            l.CreatedAt > cutoff &&
            ((!string.IsNullOrEmpty(req.Email) && l.Email == req.Email) ||
             (!string.IsNullOrEmpty(req.Phone) && l.Phone == req.Phone)));

        if (!exists)
        {
            _db.PopupLeads.Add(new PopupLead
            {
                Name   = req.Name?.Trim(),
                Email  = req.Email?.Trim().ToLower(),
                Phone  = req.Phone?.Trim(),
                Source = req.Source ?? "welcome_popup",
            });
            await _db.SaveChangesAsync();
        }

        return Ok(new { success = true });
    }

    // Admin only — view all leads
    [HttpGet]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetAll([FromQuery] int page = 1, [FromQuery] int limit = 50)
    {
        var total = await _db.PopupLeads.CountAsync();
        var leads = await _db.PopupLeads
            .OrderByDescending(l => l.CreatedAt)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(l => new
            {
                l.Id, l.Name, l.Email, l.Phone, l.Source,
                createdAt = l.CreatedAt,
                isRegistered = _db.Customers.Any(c =>
                    (l.Email != null && l.Email != "" && c.Email == l.Email) ||
                    (l.Phone != null && l.Phone != "" && c.Phone == l.Phone))
            })
            .ToListAsync();

        return Ok(new { total, page, limit, leads });
    }

    // Admin — delete a lead
    [HttpDelete("{id:int}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Delete(int id)
    {
        var lead = await _db.PopupLeads.FindAsync(id);
        if (lead == null) return NotFound();
        _db.PopupLeads.Remove(lead);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }
}

public record PopupLeadRequest(string? Name, string? Email, string? Phone, string? Source);
