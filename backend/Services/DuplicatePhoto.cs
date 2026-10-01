using System.Security.Cryptography;

namespace MahalaxmiApi.Services;

// Wahi photo dobara chadh gayi? Yeh jaanch ab server par hoti hai.
//
// Pehle browser karta tha: har purane product ki har photo utaar kar, ek-ek
// karke, uska hash. 140 product yani chaar sau se zyada photo - har save par,
// aur phone par minton ka intezar. Server ke paas wahi photo apni hi disk par
// padi hai; use kuch utarna nahi padta.
//
// Tareeka: pehle SIZE milate hain - ek stat call, file kholi bhi nahi jati. Do
// alag photo ke byte bilkul barabar hone virle hain, aur jinke barabar hain
// sirf unhi ko padh kar hash karte hain. Isliye aam haalat me ek bhi file padhi
// hi nahi jati.
//
// Saaf kehna zaroori hai ki yeh kya nahi pakadta: dobara ENCODE ki hui copy -
// wahi photo, alag quality par save ki hui - iske haath nahi aati, kyunki uske
// byte alag hote hain. Uske liye photo kholkar perceptual hash nikalna padta
// hai, jo is jaanch se kai guna mehnga hai. Jo aam galti hai - wahi file dobara
// chun lena - wo yeh pakad leta hai.
public static class DuplicatePhoto
{
    public const string ImageDir = "/var/www/mahalaxmi-nextjs/frontend/public/product-images";

    /// <summary>Web ka pata (/product-images/x.webp) → disk ki file, ya null.</summary>
    private static string? OnDisk(string? webPath)
    {
        var v = (webPath ?? "").Trim();
        if (v.Length == 0) return null;
        const string prefix = "/product-images/";
        var i = v.IndexOf(prefix, StringComparison.OrdinalIgnoreCase);
        if (i < 0) return null;

        var name = v[(i + prefix.Length)..];
        var q = name.IndexOf('?');
        if (q >= 0) name = name[..q];
        if (name.Length == 0 || name.Contains("..") || name.Contains('/') || name.Contains('\\')) return null;

        var full = Path.Combine(ImageDir, name);
        return File.Exists(full) ? full : null;
    }

    private static string? Sha256Of(string file)
    {
        try
        {
            using var s = File.OpenRead(file);
            return Convert.ToHexString(SHA256.HashData(s));
        }
        catch { return null; }
    }

    /// <summary>
    /// Is photo ka pehla maalik, agar koi hai. others me wahi product hone
    /// chahiye jo iske alawa hain.
    /// </summary>
    public static string? OwnerOf(string? photoPath, IEnumerable<(string Name, string? Image)> others)
    {
        var mine = OnDisk(photoPath);
        if (mine is null) return null;

        long myLen;
        try { myLen = new FileInfo(mine).Length; }
        catch { return null; }
        if (myLen <= 0) return null;

        string? myHash = null;
        foreach (var o in others)
        {
            var theirs = OnDisk(o.Image);
            if (theirs is null || string.Equals(theirs, mine, StringComparison.OrdinalIgnoreCase)) continue;

            long theirLen;
            try { theirLen = new FileInfo(theirs).Length; }
            catch { continue; }
            if (theirLen != myLen) continue;          // alag size = alag photo, bina padhe

            myHash ??= Sha256Of(mine);
            if (myHash is null) return null;
            if (myHash == Sha256Of(theirs))
                return string.IsNullOrWhiteSpace(o.Name) ? "another product" : o.Name;
        }
        return null;
    }
}
