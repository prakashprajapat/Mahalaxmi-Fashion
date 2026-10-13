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
