using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Controllers;

// Browser ke event server se hokar Meta tak.
//
// Pixel ka apna raasta aadha band hai: ad blocker connect.facebook.net ko rok
// deta hai, iOS cookie kaat deta hai, aur app ke andar ya UPI redirect ke baad
// browser wapas aata hi nahi. Purchase to pehle se server se jata hai (paisa
// wahin pakka hota hai), par ViewContent, AddToCart aur InitiateCheckout sirf
// browser ke bharose the - aur wahi teen Meta ko sikhate hain kis tarah ke
// log kharidne ke kareeb aate hain.
//
// Ab browser ye event is pate par bhejta hai - apne hi domain par, isliye koi
// blocker ise facebook ka anurodh samajh kar nahi rokta - aur yahan se wahi
// event Conversions API par jata hai.
//
// Do baar nahi ginta: browser apna event_id bhejta hai aur wahi id yahan se
// bhi jati hai, to Meta jodi ko ek hi maanta hai.
//
// Ye Meta ka "Partner" wala raasta NAHI hai aur na Conversions API Gateway.
// Dono me beech me kisi teesre ka server aata hai, aur grahak ka data wahan
// se hokar guzarta hai. Yahan ek HTTPS call hai, usi backend se jo pehle se
// chal raha hai, aur paisa kisi ka nahi lagta.
[ApiController]
[Route("api/site-events")]
public class SiteEventsController : ControllerBase
{
    private readonly AppDbContext _db;
    public SiteEventsController(AppDbContext db) { _db = db; }

    // Sirf ye event. Purchase jaan-boojh kar bahar hai: wo paise ki baat hai
    // aur uska ek hi sacha source hai - order banne ki jagah. Khula hua pata
    // ho to koi bhi jhoothi kharid bhej kar ad data bigaad sakta tha.
    private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        "ViewContent", "AddToCart", "InitiateCheckout",
        "AddToWishlist", "Search", "Lead", "CompleteRegistration",
    };

    public record Line(string? Id, string? Name, int? Quantity, decimal? Price);

    public record SiteEventRequest(
        string EventName,
        string? EventId,
        decimal? Value,
        string? Currency,
        string? ContentType,      // "product" | "product_group"
        string? SourceUrl,
        List<Line>? Items
    );

    [HttpPost]
    [EnableRateLimiting("events")]
    public async Task<IActionResult> Post([FromBody] SiteEventRequest req)
    {
        // Naam ek hi baar nikaal kar rakh lete hain.
        //
        // Pehle yahan (req.EventName ?? "").Trim() likha tha aur neeche phir
        // se req.EventName.Trim(). EventName ko string (bina ?) likha hai, par
        // JSON se null bhi aa sakta hai — isliye yahan ?? lagaya tha. Compiler
        // ne usi ?? se samajh liya ki ye null ho sakta hai, aur neeche bina
        // jaanch ke .Trim() dekh kar CS8602 ki chetavni di: "yahan null aa gaya
        // to crash hoga". Chetavni sahi thi.
        var eventName = (req?.EventName ?? "").Trim();

        if (req is null || !Allowed.Contains(eventName))
            return Ok(new { success = true, skipped = true });

        var token = await _db.SiteSettings.Where(s => s.Key == "metaCapiAccessToken")
            .Select(s => s.Value).FirstOrDefaultAsync() ?? "";
        if (string.IsNullOrWhiteSpace(token))
            return Ok(new { success = true, skipped = true });   // band hai to chup rahna

        var pixel = await _db.SiteSettings.Where(s => s.Key == "facebookPixelId")
            .Select(s => s.Value).FirstOrDefaultAsync() ?? "";
        if (string.IsNullOrWhiteSpace(pixel))
            return Ok(new { success = true, skipped = true });

        // Grahak ka email/phone body se NAHI liya jata. Khula hua pata hai -
        // koi bhi kisi ka bhi email bhej kar milan bigaad sakta tha. Jo khud
        // login kiye baithe hain unka pata token se nikal lete hain, baki ke
        // liye _fbp / _fbc cookie hi kaafi hai.
        string? email = null, phone = null;
        if (User.Identity?.IsAuthenticated == true && User.FindFirst("role")?.Value == "customer")
        {
            var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                   ?? User.FindFirst("sub")?.Value;
            if (int.TryParse(sub, out var cid))
            {
                var c = await _db.Customers.Where(x => x.Id == cid)
                    .Select(x => new { x.Email, x.Phone }).FirstOrDefaultAsync();
                email = c?.Email; phone = c?.Phone;
            }
        }

        var items = (req.Items ?? new List<Line>())
            .Take(20)   // ek cart itni hi badi hoti hai; baki shor hai
            .Select(l => (
                id: (l.Id ?? "").Trim(),
                name: (l.Name ?? "").Trim(),
                qty: Math.Max(1, l.Quantity ?? 1),
                price: l.Price ?? 0m))
            .ToList();

        await Services.MetaCapi.SendEventAsync(
            pixel, token,
            eventName,
            string.IsNullOrWhiteSpace(req.EventId) ? null : req.EventId.Trim(),
            req.Value,
            string.IsNullOrWhiteSpace(req.Currency) ? "INR" : req.Currency.Trim(),
            email, phone,
            Fbp(), Fbc(SafeUrl(req.SourceUrl)),
            CallerIp(), Request.Headers.UserAgent.ToString(),
            SafeUrl(req.SourceUrl),
            req.ContentType,
            null,
            items);

        return Ok(new { success = true });
    }

    // _fbp — Meta ka apna browser id.
    //
    // Pixel ise khud banata hai aur cookie me rakhta hai. Par jahan blocker ne
    // pixel ko hi rok diya, wahan ye cookie banti hi nahi — aur bina kisi
    // pehchan ke Meta event ko gira deta hai. Isliye na ho to hum khud bana
    // dete hain, theek usi shakal me jo Meta mangta hai: fb.1.<samay>.<anka>.
    //
    // HttpOnly jaan-boojh kar nahi: pixel ise JavaScript se padhta hai. Chhupa
    // dete to pixel apna alag id banata aur dono raaste alag-alag aadmi gine
    // jate — yani wahi dogunapan jisse bachna hai.
    private const string FbpCookie = "_fbp";
    private const string FbcCookie = "_fbc";

    private string? Fbp()
    {
        var existing = Request.Cookies[FbpCookie];
        if (!string.IsNullOrWhiteSpace(existing)) return existing;

        var made = $"fb.1.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.{Random.Shared.NextInt64(1_000_000_000, 9_999_999_999)}";
        Append(FbpCookie, made);
        return made;
    }

    // _fbc — us click ka id jisse shopper aaya. URL me fbclid hota hai; Meta
    // isi se ad aur kharid ko jodta hai, aur yahi sabse majboot pehchan hai.
    private string? Fbc(string? sourceUrl)
    {
        var existing = Request.Cookies[FbcCookie];
        if (!string.IsNullOrWhiteSpace(existing)) return existing;
        if (string.IsNullOrWhiteSpace(sourceUrl)) return null;
        if (!Uri.TryCreate(sourceUrl, UriKind.Absolute, out var u)) return null;

        var q = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(u.Query);
        if (!q.TryGetValue("fbclid", out var raw)) return null;
        var fbclid = raw.ToString().Trim();
        if (fbclid.Length == 0) return null;

        var made = $"fb.1.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.{fbclid}";
        Append(FbcCookie, made);
        return made;
    }

    private void Append(string name, string value) => Response.Cookies.Append(name, value, new CookieOptions
    {
        HttpOnly = false,                 // pixel ko bhi yahi padhna hota hai
        Secure   = true,
        SameSite = SameSiteMode.Lax,
        Expires  = DateTimeOffset.UtcNow.AddDays(90),   // Meta ki apni muddat
        Path     = "/",
    });

    // Sirf apni hi site ka pata aage bhejte hain. Bahar ka koi bhi pata bhej
    // kar report me apna link ghusaya ja sakta tha.
    private static string? SafeUrl(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (!Uri.TryCreate(raw.Trim(), UriKind.Absolute, out var u)) return null;
        if (u.Scheme != Uri.UriSchemeHttps) return null;
        return u.Host.EndsWith("mahalaxmifashionhub.com", StringComparison.OrdinalIgnoreCase)
            ? u.ToString() : null;
    }

    // Wahi soch jo Program.cs ke CallerIp me hai: header par tabhi bharosa jab
    // anurodh apne hi nginx se hokar aaya ho. Yahan galat IP se koi khatra
    // nahi - bas Meta ka match quality girta hai - par jhooth aage bhejne se
    // behtar hai chup rehna.
    private string? CallerIp()
    {
        var remote = HttpContext.Connection.RemoteIpAddress;
        var direct = remote?.ToString();
        var local = remote is not null
                    && (System.Net.IPAddress.IsLoopback(remote) || IsPrivate(remote));
        if (!local) return direct;

        var cf = Request.Headers["CF-Connecting-IP"].ToString();
        if (!string.IsNullOrWhiteSpace(cf)) return cf.Trim();
        var real = Request.Headers["X-Real-IP"].ToString();
        if (!string.IsNullOrWhiteSpace(real)) return real.Trim();
        return direct;
    }

    private static bool IsPrivate(System.Net.IPAddress ip)
    {
        var b = ip.GetAddressBytes();
        if (b.Length != 4) return false;
        return b[0] == 10
            || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
            || (b[0] == 192 && b[1] == 168);
    }
}
