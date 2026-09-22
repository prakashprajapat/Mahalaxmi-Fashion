using System.Text;
using System.Text.RegularExpressions;

namespace MahalaxmiApi.Services;

/// <summary>
/// Cleans the HTML that blog articles and collection intros are written in.
///
/// Those bodies are rendered with dangerouslySetInnerHTML. That was safe while
/// they lived in a source file that only a developer could change. Now the shop
/// owner writes them from the admin panel, so the text travels through the
/// database, and "only a developer can change it" is no longer the boundary —
/// anyone who can sign in with the Settings permission can, and one day that may
/// be a staff account, or an account whose password went somewhere it should not
/// have. A script tag written there would run on every visitor's browser,
/// including on the checkout page.
///
/// So the content is filtered on the way in, against a list of tags a shop
/// article actually needs. Anything else is dropped and its text kept.
///
/// This is a filter, not a parser, and it is deliberately strict rather than
/// clever: unknown tags go, unknown attributes go, and any URL that is not plainly
/// http, https or site-relative goes. It is one layer of defence and not the only
/// one — the permission check in front of the endpoint is still what matters most.
/// </summary>
public static class SeoHtmlSanitizer
{
    // Tags a product guide or buying guide genuinely uses.
    private static readonly HashSet<string> AllowedTags = new(StringComparer.OrdinalIgnoreCase)
    {
        "p", "br", "h2", "h3", "h4",
        "ul", "ol", "li",
        "strong", "b", "em", "i", "u",
        "blockquote", "hr",
        "table", "thead", "tbody", "tr", "th", "td",
        "a", "img",
    };

    // Per-tag attribute allowlist. Everything not named here is discarded,
    // which is what removes onclick, onerror, style and the rest in one go.
    private static readonly Dictionary<string, string[]> AllowedAttributes =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["a"]   = new[] { "href", "title", "rel", "target" },
            ["img"] = new[] { "src", "alt", "width", "height", "loading" },
        };

    /// <summary>Whole elements whose *contents* must go too, not just the tags.</summary>
    private static readonly Regex DangerousBlocks = new(
        @"<\s*(script|style|iframe|object|embed|form|noscript|template|svg|math)\b[^>]*>.*?<\s*/\s*\1\s*>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);

    /// <summary>The same elements written without a closing tag.</summary>
    private static readonly Regex DangerousSelfClosing = new(
        @"<\s*/?\s*(script|style|iframe|object|embed|form|input|button|noscript|template|svg|math)\b[^>]*>",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex AnyTag = new(@"<[^>]*>", RegexOptions.Compiled);

    private static readonly Regex TagName = new(
        @"^<\s*(/?)\s*([A-Za-z][A-Za-z0-9]*)", RegexOptions.Compiled);

    private static readonly Regex AttributeRe = new(
        @"([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(""([^""]*)""|'([^']*)'|([^\s""'>]+))",
        RegexOptions.Compiled);

    /// <summary>
    /// A link is kept only if it plainly goes somewhere on the web or on this
    /// site. That rules out javascript:, data: and vbscript: without having to
    /// enumerate them, including the versions written with stray whitespace or
    /// HTML entities in the middle to slip past a blocklist.
    /// </summary>
    private static bool SafeUrl(string raw)
    {
        var url = System.Net.WebUtility.HtmlDecode(raw ?? "").Trim();
        // Strip control characters and whitespace that only exist to break up a scheme.
        url = new string(url.Where(c => !char.IsControl(c) && !char.IsWhiteSpace(c)).ToArray());
        if (url.Length == 0) return false;
        return url.StartsWith("/", StringComparison.Ordinal)
            || url.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            || url.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase)
            || url.StartsWith("#", StringComparison.Ordinal);
    }

    public static string Clean(string? html)
    {
        if (string.IsNullOrWhiteSpace(html)) return "";

        var s = html;

        // Run the block removal until it stops changing anything: a nested or
        // deliberately broken-up pair can reveal another one underneath.
        for (var i = 0; i < 5; i++)
        {
            var before = s;
            s = DangerousBlocks.Replace(s, "");
            s = DangerousSelfClosing.Replace(s, "");
            if (before == s) break;
        }

        // Walk the tags rather than replacing them in place, so that the text
        // BETWEEN them can be escaped too. A stripped block can leave a stray
        // "<" behind — "<scr<script>…</script>" leaves "<scr" — and a browser
        // reading that as the start of a tag will swallow whatever follows it.
        // It is not a script, but it is a broken page, and a sanitiser that
        // breaks the article it was protecting has not done its job.
        var outp = new StringBuilder();
        var pos = 0;
        foreach (Match m in AnyTag.Matches(s))
        {
            outp.Append(EscapeText(s[pos..m.Index]));
            outp.Append(RenderTag(m.Value));
            pos = m.Index + m.Length;
        }
        outp.Append(EscapeText(s[pos..]));
        return outp.ToString();
    }

    /// <summary>
    /// Angle brackets left loose in the text are escaped so they show as
    /// characters instead of opening a tag. "&amp;" is deliberately left alone:
    /// the author may have written &amp;amp; or &amp;#8377; on purpose, and
    /// escaping it again would print the entity instead of the rupee sign.
    /// </summary>
    private static string EscapeText(string text) =>
        text.Replace("<", "&lt;").Replace(">", "&gt;");

    /// <summary>Re-emit one tag, keeping it only if it is on the list, and only with the attributes that are.</summary>
    private static string RenderTag(string tag)
    {
        // Comments and doctypes carry nothing an article needs.
        if (tag.StartsWith("<!", StringComparison.Ordinal)) return "";

        var name = TagName.Match(tag);
        if (!name.Success) return "";

        var closing = name.Groups[1].Value == "/";
        var tagName = name.Groups[2].Value.ToLowerInvariant();

        // Not on the list — drop the tag but keep whatever it wrapped.
        if (!AllowedTags.Contains(tagName)) return "";

        if (closing) return $"</{tagName}>";

        var sb = new StringBuilder("<").Append(tagName);

        if (AllowedAttributes.TryGetValue(tagName, out var allowed))
        {
            foreach (Match a in AttributeRe.Matches(tag))
            {
                var attr = a.Groups[1].Value.ToLowerInvariant();
                if (!allowed.Contains(attr, StringComparer.OrdinalIgnoreCase)) continue;

                var val = a.Groups[3].Success ? a.Groups[3].Value
                        : a.Groups[4].Success ? a.Groups[4].Value
                        : a.Groups[5].Value;

                if ((attr is "href" or "src") && !SafeUrl(val)) continue;

                // Quotes and angle brackets are escaped so a value cannot
                // close the attribute and start an attribute of its own.
                var safe = val.Replace("&", "&amp;").Replace("\"", "&quot;")
                              .Replace("<", "&lt;").Replace(">", "&gt;");
                sb.Append(' ').Append(attr).Append("=\"").Append(safe).Append('"');
            }

            // A link that opens a new tab gets rel="noopener", because the
            // page it opens can otherwise reach back into this one.
            if (tagName == "a" && tag.Contains("target", StringComparison.OrdinalIgnoreCase)
                && !tag.Contains("noopener", StringComparison.OrdinalIgnoreCase))
                sb.Append(" rel=\"noopener noreferrer\"");
        }

        if (tagName is "br" or "hr" or "img") sb.Append(" /");
        return sb.Append('>').ToString();
    }
}
