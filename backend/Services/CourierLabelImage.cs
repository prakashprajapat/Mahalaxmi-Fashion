using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;

namespace MahalaxmiApi.Services;

/// <summary>
/// The picture inside a courier's label PDF, as a PNG or JPEG the browser can draw.
///
/// Shiprocket's labels (Amazon Shipping and the rest) are one scanned-style
/// image on one page. The admin's own label borrows the courier's 2D codes
/// from it, and a browser cannot read a PDF's insides - nor fetch the file
/// from Shiprocket's storage at all (no CORS) - so the server does it.
///
/// No PDF library: the image is the biggest /Subtype /Image object; a Flate
/// stream with a PNG predictor (10-15) is already PNG IDAT data and only needs
/// the PNG header around it, a plain Flate stream gets the per-row filter byte
/// added, and a DCT stream is a JPEG as it is.
/// </summary>
public static class CourierLabelImage
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(25) };

    public static async Task<(byte[] Bytes, string ContentType)?> FetchAsync(string url, ILogger log)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || u.Scheme != Uri.UriSchemeHttps) return null;
        try
        {
            var pdf = await Http.GetByteArrayAsync(u);
            return Extract(pdf);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Courier label image: could not read {Url}", url);
            return null;
        }
    }

    public static (byte[] Bytes, string ContentType)? Extract(byte[] pdf)
    {
        var text = Encoding.Latin1.GetString(pdf);
        (byte[] Bytes, string Type)? best = null;
        long bestArea = 0;
        foreach (Match m in Regex.Matches(text, @"/Subtype\s*/Image"))
        {
            var objStart = text.LastIndexOf(" obj", m.Index, StringComparison.Ordinal);
            var streamAt = text.IndexOf("stream", m.Index, StringComparison.Ordinal);
            if (objStart < 0 || streamAt < 0) continue;
            var dict = text.Substring(objStart, streamAt - objStart);
            if (dict.Contains("endobj")) continue; // the image had no stream of its own

            int Num(string key, int def)
            {
                // "/Length 7 0 R" is a reference to another object, not a number.
                var k = Regex.Match(dict, "/" + key + @"\s+(\d+)\b(?!\s+\d+\s+R)");
                return k.Success ? int.Parse(k.Groups[1].Value) : def;
            }
            var height = Num("Height", 0);
            var width = Num("Width", Num("Columns", 0));
            if (width <= 0 || height <= 0) continue;
            var bpc = Num("BitsPerComponent", 8);
            var colors = dict.Contains("/DeviceRGB") ? 3 : dict.Contains("/DeviceGray") ? 1 : Num("Colors", 1);
            var predictor = Num("Predictor", 1);

            // Data runs from after "stream" + EOL to "endstream".
            var dataStart = streamAt + 6;
            if (dataStart < text.Length && text[dataStart] == '\r') dataStart++;
            if (dataStart < text.Length && text[dataStart] == '\n') dataStart++;
            var end = text.IndexOf("endstream", dataStart, StringComparison.Ordinal);
            if (end < 0) continue;
            var len = Num("Length", -1);
            if (len <= 0 || dataStart + len > end) len = end - dataStart;
            var data = new byte[len];
            Buffer.BlockCopy(pdf, dataStart, data, 0, len);

            (byte[], string)? img = null;
            if (dict.Contains("/DCTDecode")) img = (data, "image/jpeg");
            else if (dict.Contains("/FlateDecode") && (colors == 1 || colors == 3) && bpc is 1 or 8)
            {
                var colorType = colors == 3 ? (byte)2 : (byte)0;
                if (colors == 3 && bpc != 8) continue;
                var idat = predictor >= 10 ? data : AddRowFilters(data, width, height, colors, bpc);
                if (idat is null) continue;
                img = (Png(width, height, (byte)bpc, colorType, idat), "image/png");
            }
            if (img is null) continue;
            var area = (long)width * height;
            if (area > bestArea) { bestArea = area; best = img; }
        }
        return best is null ? null : (best.Value.Bytes, best.Value.Type);
    }

    private static byte[]? AddRowFilters(byte[] zlib, int w, int h, int colors, int bpc)
    {
        try
        {
            using var src = new ZLibStream(new MemoryStream(zlib), CompressionMode.Decompress);
            using var raw = new MemoryStream();
            src.CopyTo(raw);
            var rows = raw.ToArray();
            var stride = (w * colors * bpc + 7) / 8;
            if (rows.Length < stride * h) return null;
            using var outMs = new MemoryStream();
            using (var z = new ZLibStream(outMs, CompressionLevel.Fastest, leaveOpen: true))
            {
                for (var y = 0; y < h; y++) { z.WriteByte(0); z.Write(rows, y * stride, stride); }
            }
            return outMs.ToArray();
        }
        catch { return null; }
    }

    private static byte[] Png(int w, int h, byte bitDepth, byte colorType, byte[] idat)
    {
        using var ms = new MemoryStream();
        ms.Write(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A });
        var ihdr = new byte[13];
        WriteBE(ihdr, 0, (uint)w); WriteBE(ihdr, 4, (uint)h);
        ihdr[8] = bitDepth; ihdr[9] = colorType;
        Chunk(ms, "IHDR", ihdr);
        Chunk(ms, "IDAT", idat);
        Chunk(ms, "IEND", Array.Empty<byte>());
        return ms.ToArray();
    }

    private static void Chunk(Stream s, string type, byte[] data)
    {
        var len = new byte[4]; WriteBE(len, 0, (uint)data.Length); s.Write(len);
        var t = Encoding.ASCII.GetBytes(type);
        s.Write(t); s.Write(data);
        var crc = Crc(Crc(0xFFFFFFFFu, t), data) ^ 0xFFFFFFFFu;
        var c = new byte[4]; WriteBE(c, 0, crc); s.Write(c);
    }

    private static void WriteBE(byte[] b, int at, uint v)
    { b[at] = (byte)(v >> 24); b[at + 1] = (byte)(v >> 16); b[at + 2] = (byte)(v >> 8); b[at + 3] = (byte)v; }

    private static readonly uint[] CrcTable = Enumerable.Range(0, 256).Select(n =>
    {
        var c = (uint)n;
        for (var k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
        return c;
    }).ToArray();

    private static uint Crc(uint crc, byte[] data)
    {
        foreach (var b in data) crc = CrcTable[(crc ^ b) & 0xFF] ^ (crc >> 8);
        return crc;
    }
}
