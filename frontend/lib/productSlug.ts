// SEO-friendly product URLs WITHOUT any database change.
// A product link looks like /products/red-cotton-saree-42 — the human/keyword-readable slug
// is derived from the product name, and the numeric id is appended at the end. The route reads
// the id back from the URL, so:
//   • no `slug` column or backend change is needed,
//   • old numeric links like /products/42 keep working (backward compatible),
//   • the canonical URL always points to the pretty slug so Google consolidates ranking.

export function slugify(text: string | undefined): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, '')       // trim leading/trailing hyphens
    .slice(0, 60)                  // keep URLs tidy
    .replace(/-+$/g, '');          // trim again after slice
}

// Build the URL path segment, e.g. productSlug("Red Cotton Saree", 42) → "red-cotton-saree-42".
export function productSlug(name: string | undefined, id: number | string): string {
  const s = slugify(name);
  return s ? `${s}-${id}` : String(id);
}

// Extract the numeric product id from a slug segment. Uses the LAST run of digits, which is the
// id we appended (works for "red-saree-42", "pack-of-2-saree-42", and plain "42").
export function parseProductId(param: string): number {
  const matches = String(param ?? '').match(/\d+/g);
  return matches && matches.length ? Number(matches[matches.length - 1]) : NaN;
}
