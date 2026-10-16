using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// Which Meta pixels this shop feeds.
///
/// One was never quite enough. The pixel carrying the history is attached to
/// one ad account, the pixel a newer ad account could see was empty, and
/// moving the site from one to the other meant throwing away whichever side
/// had the events. Meta is happy to receive the same event on two pixels, so
/// the site sends to both and nothing has to be abandoned.
///
/// Both the browser tag and the Conversions API read this same pair, so a
/// pixel can never end up getting half the story.
/// </summary>
public static class MetaPixels
{
    public const string PrimaryKey   = "facebookPixelId";
    public const string SecondaryKey = "facebookPixelId2";

    // Har pixel ki apni chaabi.
    //
    // Ek hi token dono pixel par chalega - ye maan liya gaya tha, aur ye galat
    // tha. Token ek business ke andar banta hai aur sirf usi business ke pixel
    // khol sakta hai. Dusra pixel dusre business ka nikla, to Meta ne har
    // purchase par wahi jawab diya: "Object with ID ... does not exist, cannot
    // be loaded due to missing permissions". Yani kharid us pixel tak kabhi
    // pahunchi hi nahi - aur wahi pixel wo hai jispar aaj ke ad chal rahe hain.
    //
    // Ab doosre pixel ka apna token ho sakta hai. Khali chhod dein to pehle
    // wali chaabi hi aazmai jati hai, jaisa pehle hota tha.
    public const string PrimaryTokenKey   = "metaCapiAccessToken";
    public const string SecondaryTokenKey = "metaCapiAccessToken2";

    /// <summary>One pixel and the token that can actually write to it.</summary>
    public readonly record struct PixelTarget(string PixelId, string Token);

    /// <summary>
    /// Pixel aur uske token ki jodiyan, pehla pehle. Jiska id khali hai ya
    /// jiske paas koi token hi nahi, wo chhoot jata hai: uspar bhejna sirf
    /// ek refusal kamata hai. Ek hi id dono dibbon me likhi ho to wo ek hi
    /// baar jati hai, warna shop ka har aankda dugna ho jata.
    /// </summary>
    public static async Task<List<PixelTarget>> TargetsAsync(AppDbContext db, CancellationToken ct = default)
    {
        var keys = new[] { PrimaryKey, SecondaryKey, PrimaryTokenKey, SecondaryTokenKey };
        var rows = await db.SiteSettings
            .Where(s => keys.Contains(s.Key))
            .Select(s => new { s.Key, s.Value })
            .ToListAsync(ct);

        string Get(string key) => (rows.FirstOrDefault(r => r.Key == key)?.Value ?? "").Trim();

        var primaryToken = Get(PrimaryTokenKey);
        var secondToken  = Get(SecondaryTokenKey);
        if (secondToken.Length == 0) secondToken = primaryToken;

        var pairs = new[]
        {
            (Id: Get(PrimaryKey),   Token: primaryToken),
            (Id: Get(SecondaryKey), Token: secondToken),
        };

        var outp = new List<PixelTarget>();
        foreach (var pair in pairs)
        {
            var id = new string(pair.Id.Where(char.IsDigit).ToArray());
            if (id.Length == 0 || pair.Token.Length == 0) continue;
            if (outp.Any(t => t.PixelId == id)) continue;
            outp.Add(new PixelTarget(id, pair.Token));
        }
        return outp;
    }

    /// <summary>
    /// The configured pixel ids, primary first, blanks dropped and duplicates
    /// folded — the same id typed into both boxes must not send everything
    /// twice to one pixel, which would double every number the shop reads.
    /// </summary>
    public static async Task<List<string>> IdsAsync(AppDbContext db, CancellationToken ct = default)
    {
        var rows = await db.SiteSettings
            .Where(s => s.Key == PrimaryKey || s.Key == SecondaryKey)
            .Select(s => new { s.Key, s.Value })
            .ToListAsync(ct);

        string Get(string key) => (rows.FirstOrDefault(r => r.Key == key)?.Value ?? "").Trim();

        var ids = new List<string>();
        foreach (var raw in new[] { Get(PrimaryKey), Get(SecondaryKey) })
        {
            // Digits only. A pasted id arrives with spaces around it often
            // enough, and once with the word "Pixel" still attached.
            var id = new string(raw.Where(char.IsDigit).ToArray());
            if (id.Length == 0 || ids.Contains(id)) continue;
            ids.Add(id);
        }
        return ids;
    }
}
