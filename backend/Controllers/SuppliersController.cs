using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SuppliersController : ControllerBase
{
    private readonly AppDbContext _db;
    public SuppliersController(AppDbContext db) => _db = db;

    // POST /api/suppliers  (public) — a supplier submits their onboarding details.
    [HttpPost]
    public async Task<IActionResult> Apply([FromBody] SupplierApplyRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.FirmName) || string.IsNullOrWhiteSpace(req.ContactName) || string.IsNullOrWhiteSpace(req.Phone))
            return BadRequest(new { success = false, message = "Firm name, contact name and mobile number are required." });

        var digits = new string((req.Phone ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length < 10)
            return BadRequest(new { success = false, message = "Please enter a valid 10-digit mobile number." });

        var app = new SupplierApplication
        {
            FirmName        = req.FirmName.Trim(),
            ContactName     = req.ContactName.Trim(),
            Phone           = digits.Length > 10 ? digits[^10..] : digits,
            Email           = req.Email?.Trim(),
            GstNumber       = req.GstNumber?.Trim().ToUpper(),
            PanNumber       = req.PanNumber?.Trim().ToUpper(),
            BusinessType    = req.BusinessType?.Trim(),
            Categories      = req.Categories?.Trim(),
            Address         = req.Address?.Trim(),
            City            = req.City?.Trim(),
            State           = req.State?.Trim(),
            Pincode         = req.Pincode?.Trim(),
            Website         = req.Website?.Trim(),
            YearsInBusiness = req.YearsInBusiness?.Trim(),
            Message         = req.Message?.Trim(),
            Status          = "new",
            CreatedAt       = DateTimeOffset.UtcNow,
        };
        _db.SupplierApplications.Add(app);
        await _db.SaveChangesAsync();
        return Ok(new { success = true, message = "Thank you! Your supplier application has been received. Our team will contact you soon." });
    }

    // GET /api/suppliers  (admin) — list applications (no dedicated panel; available if needed).
    [HttpGet]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> List()
    {
        var items = await _db.SupplierApplications.OrderByDescending(s => s.CreatedAt).ToListAsync();
        return Ok(new { success = true, applications = items });
    }
}

public record SupplierApplyRequest(
    string FirmName,
    string ContactName,
    string Phone,
    string? Email = null,
    string? GstNumber = null,
    string? PanNumber = null,
    string? BusinessType = null,
    string? Categories = null,
    string? Address = null,
    string? City = null,
    string? State = null,
    string? Pincode = null,
    string? Website = null,
    string? YearsInBusiness = null,
    string? Message = null
);
