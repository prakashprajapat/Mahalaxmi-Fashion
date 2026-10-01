using System.Text;

namespace MahalaxmiApi.Services;

// Feed ki row ka id — wahi jo frontend/lib/merchantFeed.ts ka feedIdFor banata hai.
//
// Catalogue me ek row har size aur har rang ki hai (MFH1143-free-size-black),
// aur akela SKU sirf unka item_group_id hai. Pixel ya Conversions API se akela
// SKU bhejne par Meta ko catalogue me kuch nahi milta — wahi 0% match rate,
// jisme kisi ne kya dekha aur kya khareeda, kuch bhi ads ke kaam nahi aata.
//
// Niyam do jagah likha hai — ek baar TypeScript me (feed aur browser ke liye)
// aur ek baar yahan (server se jane wale event ke liye) — isliye dono ko ek hi
// rakhna padta hai. Badalna ho to dono jagah, warna jodi tootegi.
public static class FeedIds
{
    private static string Slug(string x)
    {
        var sb = new StringBuilder(x.Length);
        foreach (var ch in x.ToLowerInvariant())
            sb.Append(char.IsAsciiLetterOrDigit(ch) ? ch : '-');
        var parts = sb.ToString().Split('-', StringSplitOptions.RemoveEmptyEntries);
        return string.Join("-", parts);
    }

    /// <summary>SKU (ya MFH-{dbId}) + size + rang, chhote akshar me, dash se juda.</summary>
    public static string For(string? sku, string? dbId, string? size, string? colour)
    {
        var baseId = (sku ?? "").Trim();
        if (baseId.Length == 0) baseId = "MFH-" + (dbId ?? "").Trim();

        var parts = new List<string> { baseId };
        var s = Slug((size ?? "").Trim());
        var c = Slug((colour ?? "").Trim());
        if (s.Length > 0) parts.Add(s);
        if (c.Length > 0) parts.Add(c);
        return string.Join("-", parts);
    }

    /// <summary>
    /// Checkout "M / Red" ko ek hi khaane me bhejta hai, par feed ka id sirf naap
    /// se banta hai aur rang alag se jurta hai. Isliye rang wapas nikal dete hain,
    /// warna id "…-m-red-red" ban jati aur catalogue me kuch nahi milta.
    /// </summary>
    public static string SizeWithoutColour(string? size, string? colour)
    {
        var sz = (size ?? "").Trim();
        var col = (colour ?? "").Trim();
        if (sz.Length == 0 || col.Length == 0) return sz;
        var kept = sz.Split(" / ", StringSplitOptions.RemoveEmptyEntries)
            .Where(p => !p.Trim().Equals(col, StringComparison.OrdinalIgnoreCase));
        return string.Join(" / ", kept);
    }
}
