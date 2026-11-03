using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// One spelling per Indian state / UT.
///
/// Customers type "TN", "BR", "tamilnadu", "WEST BENGAL", "Orissa"... and every
/// one of those is the same place written differently. Left as typed, a list
/// grouped by state splits one state into five rows, the label shows "BR",
/// and the GST rule (CGST+SGST inside Rajasthan, IGST outside) depends on the
/// text matching. Everything is turned into the one name the address forms
/// offer in their State list (frontend/lib/indianLocations.ts INDIA_STATES).
/// </summary>
public static class IndianStates
{
    public static readonly string[] All =
    {
        "Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh",
        "Chhattisgarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Goa","Gujarat","Haryana",
        "Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep",
        "Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry",
        "Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
    };

    // Vehicle / postal codes and old or common spellings.
    private static readonly Dictionary<string, string> Alias = new(StringComparer.Ordinal)
    {
        ["an"] = "Andaman and Nicobar Islands", ["andaman"] = "Andaman and Nicobar Islands", ["andamannicobar"] = "Andaman and Nicobar Islands", ["andamanandnicobar"] = "Andaman and Nicobar Islands",
        ["ap"] = "Andhra Pradesh", ["ar"] = "Arunachal Pradesh", ["as"] = "Assam", ["br"] = "Bihar",
        ["ch"] = "Chandigarh", ["cg"] = "Chhattisgarh", ["ct"] = "Chhattisgarh", ["chattisgarh"] = "Chhattisgarh", ["chhatisgarh"] = "Chhattisgarh",
        ["dn"] = "Dadra and Nagar Haveli and Daman and Diu", ["dd"] = "Dadra and Nagar Haveli and Daman and Diu",
        ["dadranagarhaveli"] = "Dadra and Nagar Haveli and Daman and Diu", ["dadraandnagarhaveli"] = "Dadra and Nagar Haveli and Daman and Diu", ["damananddiu"] = "Dadra and Nagar Haveli and Daman and Diu", ["damandiu"] = "Dadra and Nagar Haveli and Daman and Diu",
        ["dl"] = "Delhi", ["newdelhi"] = "Delhi", ["nctofdelhi"] = "Delhi", ["nctdelhi"] = "Delhi", ["delhincr"] = "Delhi",
        ["ga"] = "Goa", ["gj"] = "Gujarat", ["gujrat"] = "Gujarat", ["hr"] = "Haryana", ["hp"] = "Himachal Pradesh",
        ["jk"] = "Jammu and Kashmir", ["jammukashmir"] = "Jammu and Kashmir", ["jammu"] = "Jammu and Kashmir", ["kashmir"] = "Jammu and Kashmir",
        ["jh"] = "Jharkhand", ["ka"] = "Karnataka", ["kl"] = "Kerala", ["la"] = "Ladakh", ["ld"] = "Lakshadweep",
        ["mp"] = "Madhya Pradesh", ["mh"] = "Maharashtra", ["maharastra"] = "Maharashtra", ["mn"] = "Manipur", ["ml"] = "Meghalaya",
        ["mz"] = "Mizoram", ["nl"] = "Nagaland", ["od"] = "Odisha", ["or"] = "Odisha", ["orissa"] = "Odisha",
        ["py"] = "Puducherry", ["pondicherry"] = "Puducherry", ["pondy"] = "Puducherry", ["pb"] = "Punjab",
        ["rj"] = "Rajasthan", ["raj"] = "Rajasthan", ["sk"] = "Sikkim", ["tn"] = "Tamil Nadu", ["tamilnad"] = "Tamil Nadu",
        ["ts"] = "Telangana", ["tg"] = "Telangana", ["telengana"] = "Telangana", ["tr"] = "Tripura",
        ["up"] = "Uttar Pradesh", ["uk"] = "Uttarakhand", ["ut"] = "Uttarakhand", ["uttaranchal"] = "Uttarakhand", ["uttrakhand"] = "Uttarakhand",
        ["wb"] = "West Bengal", ["westbangal"] = "West Bengal", ["bengal"] = "West Bengal",
    };

    private static readonly Dictionary<string, string> ByKey =
        All.ToDictionary(Key, s => s, StringComparer.Ordinal);

    private static string Key(string s)
    {
        var t = s.ToLowerInvariant().Replace("&", "and");
        return new string(t.Where(char.IsLetter).ToArray());
    }

    /// <summary>The proper name, or the input trimmed when it is not recognised (never lost).</summary>
    public static string? Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return raw;
        var k = Key(raw);
        if (k.Length == 0) return raw.Trim();
        if (ByKey.TryGetValue(k, out var hit)) return hit;
        if (Alias.TryGetValue(k, out hit)) return hit;
        // "Tamil Nadu India", "Rajasthan 344022", "State of Bihar"
        foreach (var s in All.OrderByDescending(x => x.Length))
            if (k.Contains(Key(s))) return s;
        return raw.Trim();
    }

    /// <summary>
    /// Fixes the states already saved - orders, customers, saved addresses.
    /// Works on the distinct values only, so it is a few quick statements at
    /// boot, and does nothing once everything is already in the proper form.
    /// </summary>
    public static async Task<int> BackfillAsync(AppDbContext db, ILogger log)
    {
        int changed = 0;

        var orderStates = await db.Database
            .SqlQueryRaw<string>(@"SELECT DISTINCT shipping_json->>'state' AS ""Value"" FROM site_orders WHERE coalesce(shipping_json->>'state','') <> ''")
            .ToListAsync();
        foreach (var raw in orderStates)
        {
            var fixedName = Normalize(raw);
            if (fixedName is null || fixedName == raw) continue;
            changed += await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE site_orders SET shipping_json = jsonb_set(shipping_json, '{{state}}', to_jsonb({fixedName}::text)) WHERE shipping_json->>'state' = {raw}");
        }

        var custStates = await db.Customers.Where(c => c.State != null && c.State != "").Select(c => c.State).Distinct().ToListAsync();
        foreach (var raw in custStates)
        {
            var fixedName = Normalize(raw);
            if (fixedName is null || fixedName == raw) continue;
            changed += await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE customers SET state = {fixedName} WHERE state = {raw}");
        }

        var addrStates = await db.CustomerAddresses.Where(a => a.State != null && a.State != "").Select(a => a.State).Distinct().ToListAsync();
        foreach (var raw in addrStates)
        {
            var fixedName = Normalize(raw);
            if (fixedName is null || fixedName == raw) continue;
            changed += await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE customer_addresses SET state = {fixedName} WHERE state = {raw}");
        }

        if (changed > 0) log.LogInformation("State names tidied on {Count} rows (e.g. TN -> Tamil Nadu).", changed);
        return changed;
    }
}
