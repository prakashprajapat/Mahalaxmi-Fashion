using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

// Address book for logged-in customers: several saved delivery addresses (Home, Office, ...)
// with one marked default. Checkout lists these so the shopper picks instead of retyping.
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AddressesController : ControllerBase
{
    private readonly AppDbContext _db;
    public AddressesController(AppDbContext db) => _db = db;

    // A customer may keep a sensible number of addresses, not an unbounded list.
    private const int MaxPerCustomer = 8;

    private int? CurrentCustomerId()
    {
        var sub = User.FindFirstValue("sub");
        return int.TryParse(sub, out var id) ? id : null;
    }

    public class AddressInput
    {
        public string? Label { get; set; }
        public string? FullName { get; set; }
        public string? Phone { get; set; }
        public string? AddrLine1 { get; set; }
        public string? AddrLine2 { get; set; }
        public string? Pincode { get; set; }
        public string? City { get; set; }
        public string? State { get; set; }
        public bool IsDefault { get; set; }
    }

    private static string Clean(string? v, int max)
    {
        var t = (v ?? string.Empty).Trim();
        return t.Length <= max ? t : t.Substring(0, max);
    }

    private static string DigitsOnly(string? v)
    {
        var chars = (v ?? string.Empty).Where(char.IsDigit).ToArray();
        return new string(chars);
    }

    // Shared validation so a half-filled address can never be saved.
    private static string? Validate(AddressInput i)
    {
        if (string.IsNullOrWhiteSpace(i.FullName)) return "Full name is required.";
        if (string.IsNullOrWhiteSpace(i.AddrLine1)) return "Address is required.";
        if (DigitsOnly(i.Phone).Length != 10) return "Enter a valid 10-digit mobile number.";
        if (DigitsOnly(i.Pincode).Length != 6) return "Enter a valid 6-digit PIN code.";
        return null;
    }

    private static void Apply(CustomerAddress a, AddressInput i)
    {
        var label = Clean(i.Label, 30);
        a.Label     = label.Length > 0 ? label : "Home";
        a.FullName  = Clean(i.FullName, 120);
        a.Phone     = DigitsOnly(i.Phone);
        a.AddrLine1 = Clean(i.AddrLine1, 400);
        a.AddrLine2 = Clean(i.AddrLine2, 400);
        a.Pincode   = DigitsOnly(i.Pincode);
        a.City      = Clean(i.City, 80);
        a.State     = Clean(i.State, 80);
    }

    // Keep exactly one default per customer.
    private async Task MakeOnlyDefaultAsync(int customerId, int addressId)
    {
        var all = await _db.CustomerAddresses.Where(a => a.CustomerId == customerId).ToListAsync();
        foreach (var a in all) a.IsDefault = a.Id == addressId;
    }

    // GET /api/addresses → the customer's saved addresses, default first
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var customerId = CurrentCustomerId();
        if (customerId is null) return Unauthorized(new { success = false, message = "Not a customer." });

        var addresses = await _db.CustomerAddresses
            .Where(a => a.CustomerId == customerId)
            .OrderByDescending(a => a.IsDefault).ThenBy(a => a.Id)
            .ToListAsync();

        return Ok(new { success = true, addresses });
    }

    // POST /api/addresses → add one
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AddressInput input)
    {
        var customerId = CurrentCustomerId();
        if (customerId is null) return Unauthorized(new { success = false, message = "Not a customer." });

        var error = Validate(input);
        if (error is not null) return BadRequest(new { success = false, message = error });

        var count = await _db.CustomerAddresses.CountAsync(a => a.CustomerId == customerId);
        if (count >= MaxPerCustomer)
            return BadRequest(new { success = false, message = $"You can save up to {MaxPerCustomer} addresses." });

        var address = new CustomerAddress { CustomerId = customerId.Value };
        Apply(address, input);
        _db.CustomerAddresses.Add(address);
        await _db.SaveChangesAsync();

        // The first address saved is the default, and an explicit request wins.
        if (count == 0 || input.IsDefault)
        {
            await MakeOnlyDefaultAsync(customerId.Value, address.Id);
            await _db.SaveChangesAsync();
        }

        return Ok(new { success = true, address });
    }

    // PUT /api/addresses/{id} → edit one
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] AddressInput input)
    {
        var customerId = CurrentCustomerId();
        if (customerId is null) return Unauthorized(new { success = false, message = "Not a customer." });

        var address = await _db.CustomerAddresses.FirstOrDefaultAsync(a => a.Id == id && a.CustomerId == customerId);
        if (address is null) return NotFound(new { success = false, message = "Address not found." });

        var error = Validate(input);
        if (error is not null) return BadRequest(new { success = false, message = error });

        Apply(address, input);
        if (input.IsDefault) await MakeOnlyDefaultAsync(customerId.Value, address.Id);
        await _db.SaveChangesAsync();

        return Ok(new { success = true, address });
    }

    // DELETE /api/addresses/{id}
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var customerId = CurrentCustomerId();
        if (customerId is null) return Unauthorized(new { success = false, message = "Not a customer." });

        var address = await _db.CustomerAddresses.FirstOrDefaultAsync(a => a.Id == id && a.CustomerId == customerId);
        if (address is null) return NotFound(new { success = false, message = "Address not found." });

        var wasDefault = address.IsDefault;
        _db.CustomerAddresses.Remove(address);
        await _db.SaveChangesAsync();

        // Never leave the customer without a default.
        if (wasDefault)
        {
            var next = await _db.CustomerAddresses
                .Where(a => a.CustomerId == customerId)
                .OrderBy(a => a.Id)
                .FirstOrDefaultAsync();
            if (next is not null) { next.IsDefault = true; await _db.SaveChangesAsync(); }
        }

        return Ok(new { success = true });
    }

    // POST /api/addresses/{id}/default
    [HttpPost("{id:int}/default")]
    public async Task<IActionResult> SetDefault(int id)
    {
        var customerId = CurrentCustomerId();
        if (customerId is null) return Unauthorized(new { success = false, message = "Not a customer." });

        var exists = await _db.CustomerAddresses.AnyAsync(a => a.Id == id && a.CustomerId == customerId);
        if (!exists) return NotFound(new { success = false, message = "Address not found." });

        await MakeOnlyDefaultAsync(customerId.Value, id);
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }
}
