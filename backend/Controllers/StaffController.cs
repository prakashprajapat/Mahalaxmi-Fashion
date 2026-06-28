using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;
using MahalaxmiApi.Services;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "AdminOnly")]
public class StaffController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuthService _auth;

    public StaffController(AppDbContext db, AuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    // GET /api/staff
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var staff = await _db.StaffMembers
            .OrderBy(s => s.CreatedAt)
            .Select(s => new {
                s.Id, s.Name, s.Username, s.Email,
                s.Role, s.IsActive, s.LastLogin, s.CreatedAt
            })
            .ToListAsync();
        return Ok(staff);
    }

    // POST /api/staff
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] StaffCreateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Username))
            return BadRequest(new { message = "Name and username are required." });

        if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
            return BadRequest(new { message = "Password must be at least 8 characters." });

        var exists = await _db.StaffMembers.AnyAsync(s => s.Username == req.Username.Trim().ToLower());
        if (exists)
            return BadRequest(new { message = "Username already exists." });

        var member = new StaffMember
        {
            Name         = req.Name.Trim(),
            Username     = req.Username.Trim().ToLower(),
            Email        = string.IsNullOrWhiteSpace(req.Email) ? null : req.Email.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password, workFactor: 12),
            Role         = req.Role is "manager" ? "manager" : "staff",
            IsActive     = true,
        };

        _db.StaffMembers.Add(member);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Staff created.", id = member.Id });
    }

    // DELETE /api/staff/{id}
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var member = await _db.StaffMembers.FindAsync(id);
        if (member is null) return NotFound();

        _db.StaffMembers.Remove(member);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Removed." });
    }

    // PUT /api/staff/{id}/reset-password
    [HttpPut("{id:int}/reset-password")]
    public async Task<IActionResult> ResetPassword(int id, [FromBody] StaffResetPasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8)
            return BadRequest(new { message = "Password must be at least 8 characters." });

        var member = await _db.StaffMembers.FindAsync(id);
        if (member is null) return NotFound();

        member.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword, workFactor: 12);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Password reset." });
    }

    // PUT /api/staff/{id}/toggle-active
    [HttpPut("{id:int}/toggle-active")]
    public async Task<IActionResult> ToggleActive(int id)
    {
        var member = await _db.StaffMembers.FindAsync(id);
        if (member is null) return NotFound();

        member.IsActive = !member.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new { isActive = member.IsActive });
    }
}

public record StaffCreateRequest(string Name, string Username, string? Email, string Password, string Role);
public record StaffResetPasswordRequest(string NewPassword);
