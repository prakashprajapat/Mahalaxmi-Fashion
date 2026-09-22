using System.Text.Json;
using System.Text.RegularExpressions;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Services;

/// <summary>
/// The rules a product has to pass before it is allowed on the website.
///
/// Two sets of rules, checked together because they overlap almost entirely.
/// Google Merchant Center will not approve an apparel product without a colour
/// and a size, and it rejects titles carrying promotional text or a warehouse
/// code. Those same things are what decide whether a shopper who lands on the
/// page from Google stays. A product that fails these is not a product that is
/// nearly ready — it is one that costs money to show.
///
/// Blocking issues keep the product as a draft. Warnings do not: they are worth
/// fixing, but a product without an MRP still sells.
///
/// Every message is written for the shop owner, in the second person, saying
/// what is wrong and what to do. Nobody should need a developer to read these.
/// </summary>
public static class ProductQualityGate
{
    public record Issue(string Field, string Message);

    public record Result(List<Issue> Blocking, List<Issue> Warnings)
    {
        public bool Passed => Blocking.Count == 0;
    }

    // Google's limits. Titles over 150 and descriptions over 5000 are rejected
    // outright; the shorter numbers below are ours, for pages that have to earn
    // a click.
    private const int TitleMax = 150;
    private const int TitleMin = 10;
    private const int DescMax = 5000;
    private const int DescMin = 50;

    /// <summary>A warehouse code that escaped onto the website: two or more capitals then two or more digits.</summary>
    private static readonly Regex InternalCode = new(@"\b[A-Z]{2,}\d{2,}[A-Z0-9]*\b", RegexOptions.Compiled);

    /// <summary>
    /// Merchant Center rejects TITLES that sell the offer rather than the
    /// product: "best price", "100% original", "sale", a row of exclamation
    /// marks. The title is held to the strict version of this rule.
    /// </summary>
    private static readonly Regex PromotionalTitle = new(
        @"\b(free\s*ship\w*|free\s*deliver\w*|best\s*price|lowest\s*price|cheapest|buy\s*now|order\s*now|"
        + @"hurry|limited\s*offer|sale|discount|offer|cod\s*available|100%\s*original|"
        + @"whats\s*app|call\s*us|dm\s*us)\b|!{2,}",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>
    /// Descriptions are held to a narrower rule on purpose. The policy here is
    /// about claims that belong on a banner rather than on a product — shipping
    /// promises and price claims. A description that happens to use the word
    /// "discount" or "offer" in an ordinary sentence is not a violation, and
    /// blocking a sale over one would be this tool getting in the shop's way.
    /// </summary>
    private static readonly Regex PromotionalDesc = new(
        @"\b(free\s*ship\w*|free\s*deliver\w*|best\s*price|lowest\s*price|cheapest|buy\s*now|order\s*now|"
        + @"hurry\s*up|limited\s*time|cod\s*available|100%\s*original|whats\s*app|call\s*us|dm\s*us)\b|!{3,}",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>Contact details and links are not allowed in a Merchant Center description.</summary>
    private static readonly Regex ContactOrLink = new(
        @"https?://|www\.|\b[\w.+-]+@[\w-]+\.[\w.]+\b|\b(?:\+?91[\s-]?)?[6-9]\d{9}\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex HtmlTag = new(@"<[a-z/][^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>Statuses that mean "not on the website".</summary>
    public const string DraftStatus = "Draft";
    public static readonly string[] HiddenStatuses = { "Inactive", DraftStatus };

    private static List<string> StringList(JsonElement root, string prop)
    {
        if (root.ValueKind != JsonValueKind.Object) return new List<string>();
        if (!root.TryGetProperty(prop, out var el) || el.ValueKind != JsonValueKind.Array) return new List<string>();

        var list = new List<string>();
        foreach (var item in el.EnumerateArray())
        {
            // Colours are sometimes plain strings and sometimes { name, hex }.
            var s = item.ValueKind switch
            {
                JsonValueKind.String => item.GetString(),
                JsonValueKind.Object => item.TryGetProperty("name", out var n) ? n.GetString() : null,
                _ => null,
            };
            if (!string.IsNullOrWhiteSpace(s)) list.Add(s!.Trim());
        }
        return list;
    }

    private static string? StringValue(JsonElement root, string prop)
    {
        if (root.ValueKind != JsonValueKind.Object) return null;
        if (!root.TryGetProperty(prop, out var el)) return null;
        return el.ValueKind == JsonValueKind.String ? el.GetString() : null;
    }

    public static Result Check(Product p)
    {
        var blocking = new List<Issue>();
        var warnings = new List<Issue>();

        void Block(string f, string m) => blocking.Add(new Issue(f, m));
        void Warn(string f, string m) => warnings.Add(new Issue(f, m));

        var name = (p.Name ?? "").Trim();
        var desc = (p.Description ?? "").Trim();

        // ── Name ────────────────────────────────────────────────────────────
        if (name.Length == 0)
            Block("name", "This product has no name. The name becomes its heading on Google, so it cannot go live without one.");
        else
        {
            if (name.Length < TitleMin)
                Block("name", $"The name is only {name.Length} characters. Write what it is — fabric, type, who it is for — in at least {TitleMin}.");
            if (name.Length > TitleMax)
                Block("name", $"The name is {name.Length} characters. Google rejects anything over {TitleMax} — shorten it.");
            else if (name.Length > 70)
                Warn("name", $"The name is {name.Length} characters, so Google will cut it off around 70. Put the important words first.");

            var letters = name.Count(char.IsLetter);
            if (letters > 8 && name.Count(char.IsUpper) > letters * 0.8)
                Block("name", "The name is in BLOCK CAPITALS. Google rejects shouted titles — write it normally, like \"Cotton Nighty for Women\".");

            if (InternalCode.IsMatch(name))
                Block("name", "The name contains a stock code such as ID6026 or MFH11. Nobody searches for a stock code — move it to the SKU field and give the product a name a customer would type.");

            if (PromotionalTitle.IsMatch(name))
                Block("name", "The name contains an offer or a promise (\"free shipping\", \"best price\", \"!!\"). Google rejects titles that sell the deal instead of the product.");
        }

        // ── Description ─────────────────────────────────────────────────────
        if (desc.Length == 0)
            Block("description", "This product has no description. It is the sentence Google shows under the product, and without it the product competes on its name alone.");
        else
        {
            if (desc.Length < DescMin)
                Block("description", $"The description is only {desc.Length} characters. Write at least {DescMin} — fabric, fit, sleeve length, and who it suits.");
            else if (desc.Length < 150)
                Warn("description", "The description is short. Two or three full sentences give Google far more to work with.");

            if (desc.Length > DescMax)
                Block("description", $"The description is {desc.Length} characters. Google rejects anything over {DescMax}.");

            if (HtmlTag.IsMatch(desc))
                Block("description", "The description contains HTML tags. Google wants plain text here — remove them.");

            if (ContactOrLink.IsMatch(desc))
                Block("description", "The description contains a link, an email or a phone number. Google does not allow contact details in a product description.");

            if (PromotionalDesc.IsMatch(desc))
                Block("description", "The description contains promotional text such as \"free shipping\" or \"best price\". Google rejects it — describe the product, and let the price and shipping speak for themselves.");
        }

        // ── Photo and price ─────────────────────────────────────────────────
        if (string.IsNullOrWhiteSpace(p.Image))
            Block("image", "This product has no photo. Clothing is bought by eye, and Google will not list a product without an image.");

        if (p.Price <= 0)
            Block("price", "The price is zero. Google rejects any product without a real price.");

        if (p.DiscountPrice is > 0 && p.DiscountPrice >= p.Price)
            Block("price", "The discounted price is not lower than the price. Google treats that as a false discount.");

        if (p.MaxPrice is > 0 && p.MaxPrice < p.Price)
            Warn("price", "The MRP is lower than the selling price, which reads as a mistake to a shopper.");

        // ── Category ────────────────────────────────────────────────────────
        if (string.IsNullOrWhiteSpace(p.Category))
            Block("category", "This product has no category, so it appears on no category page.");

        if (string.IsNullOrWhiteSpace(p.Subcategory))
            Block("subcategory", "This product has no subcategory, so it will not appear on any of your collection pages.");

        // ── Size and colour — Google requires both for clothing and footwear ─
        var extra = new JsonElement();
        var extraOk = false;
        if (!string.IsNullOrWhiteSpace(p.ExtraJson))
        {
            try
            {
                extra = JsonDocument.Parse(p.ExtraJson).RootElement.Clone();
                extraOk = true;
            }
            catch
            {
                Warn("extra", "The extra details on this product could not be read, so its sizes and colours are being treated as empty.");
            }
        }

        var sizes = extraOk ? StringList(extra, "sizes") : new List<string>();
        var colours = extraOk ? StringList(extra, "colors") : new List<string>();
        if (colours.Count == 0 && extraOk) colours = StringList(extra, "colours");

        if (sizes.Count == 0)
            Block("sizes", "No sizes are set. Google will not approve clothing or footwear without a size, and a shopper will not risk the order either.");

        if (colours.Count == 0)
            Block("colours", "No colour is set. Google requires a colour for every clothing and footwear product.");

        // ── Worth fixing, but not worth blocking a sale over ─────────────────
        if (string.IsNullOrWhiteSpace(p.Sku))
            Warn("sku", "No SKU. Google uses it as the product's permanent id, and changing ids later resets what Google has learned about the product.");

        // The HSN code is not a column on Product — it lives inside ExtraJson,
        // alongside the sizes and colours read above.
        var hsn = extraOk ? StringValue(extra, "hsnCode") : null;
        if (string.IsNullOrWhiteSpace(hsn))
            Warn("hsn", "No HSN code, which the GST invoice needs.");

        return new Result(blocking, warnings);
    }
}
