using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

// Guest identity linker. Every order (guest or logged-in) is tied to exactly ONE
// customer record: we match an existing account by email / last-10 mobile, or
// auto-create a lightweight passwordless "guest" profile. The guest can later
// activate the account (Register/OTP) and keep their full order history.
public static class CustomerLinker
{
    public static string Digits10(string? raw)
    {
        var d = new string((raw ?? "").Where(char.IsDigit).ToArray());
        return d.Length > 10 ? d[^10..] : d;
    }

    public static async Task<int> FindOrCreateAsync(
        AppDbContext db, string? name, string? email, string? phone,
        string? addr = null, string? city = null, string? state = null, string? pincode = null)
    {
        var e = email?.Trim().ToLowerInvariant();
        var p10 = Digits10(phone);

        var match = await db.Customers.FirstOrDefaultAsync(x =>
            (!string.IsNullOrEmpty(e) && x.Email == e)
            || (p10.Length == 10 && x.Phone != null && x.Phone.EndsWith(p10)));
        if (match is not null) return match.Id;

        // Need at least a mobile or email to key a stable identity on.
        if (p10.Length != 10 && string.IsNullOrEmpty(e)) return 0;

        var parts = (name ?? "").Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        var guest = new Customer
        {
            CustomerCode = await NextCustomerCodeAsync(db),
            FirstName    = parts.Length > 0 ? parts[0] : "Guest",
            LastName     = parts.Length > 1 ? parts[1] : "",
            Email        = string.IsNullOrEmpty(e) ? null : e,
            Phone        = p10.Length == 10 ? p10 : (phone ?? "").Trim(),
            AddrLine1    = addr ?? "",
            District     = city ?? "",
            State        = state ?? "",
            Pincode      = pincode ?? "",
            PasswordHash = "",   // passwordless => guest; activated later on Register/OTP
            PasswordSalt = "",
            SubmittedAt  = DateTimeOffset.UtcNow.ToString("o"),
        };
        db.Customers.Add(guest);
        await db.SaveChangesAsync();
        return guest.Id;
    }

    // Same MFHCUS sequence CustomersController.Register uses (kept in sync).
    private static async Task<string> NextCustomerCodeAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync(@"
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'customer_code_seq' AND relkind = 'S') THEN
                    CREATE SEQUENCE customer_code_seq;
                    PERFORM setval('customer_code_seq',
                        GREATEST(1004,
                            (SELECT COALESCE(MAX(CAST(SUBSTRING(customer_code FROM 'MFHCUS([0-9]+)$') AS INTEGER)), 1004) FROM customers)),
                        true);
                END IF;
            END $$;");
        var next = await db.Database.SqlQueryRaw<long>("SELECT nextval('customer_code_seq') AS \"Value\"").FirstAsync();
        return "MFHCUS" + next;
    }
}
