import type { Product } from '@/types';

// What a product listing actually needs, and nothing else.
//
// The homepage ships every product in the catalogue — deliberately, so the
// whole shop is browsable and filterable from the first screen. The cost was
// that each product arrived complete: its full description, its gallery
// photos, its pack columns, its per-size-and-colour stock matrix, its specs
// and add-ons. None of that is read by a product card or by the filters, and
// Next.js sends it twice — once as rendered HTML and again as the data the
// browser needs to take over — so the homepage came to 397 KB.
//
// This keeps the catalogue whole and drops the parts no listing reads. The
// product page still fetches the full record when someone opens it, which is
// the only place any of it was ever used.

interface Extra {
  sizes?: unknown;
  colors?: unknown;
  customColors?: unknown;
  variant?: unknown;
  packOf?: unknown;
}

/**
 * Search matches against the description, so it cannot be dropped outright —
 * but the words that decide a match (fabric, type, fit, who it is for) are in
 * the opening sentence, and the rest is 300 characters of shipping and care
 * notes repeated on every product. Truncating keeps the search working on
 * everything a shopper would plausibly type.
 */
const DESC_KEPT = 200;

function trimExtra(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const e = JSON.parse(raw) as Extra;
    const out: Record<string, unknown> = {};
    if (Array.isArray(e.sizes) && e.sizes.length) out.sizes = e.sizes;
    if (Array.isArray(e.colors) && e.colors.length) out.colors = e.colors;
    if (Array.isArray(e.customColors) && e.customColors.length) {
      // Only the names — the filter matches on those, and each entry also
      // carries a hex code and sometimes a photo.
      out.customColors = (e.customColors as { name?: string }[])
        .map(c => ({ name: c?.name }))
        .filter(c => c.name);
    }
    if (e.variant) out.variant = e.variant;
    if (e.packOf) out.packOf = e.packOf;
    return Object.keys(out).length ? JSON.stringify(out) : undefined;
  } catch {
    // Unreadable extras must not take the listing down; the filters simply
    // treat this product as having no sizes or colours, which is what they
    // already did when the parse failed further down the line.
    return undefined;
  }
}

export function toListingProduct(p: Product): Product {
  const desc = (p.description ?? '').trim();
  return {
    dbId: p.dbId,
    sku: p.sku,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    price: p.price,
    discountPrice: p.discountPrice,
    maxPrice: p.maxPrice,
    shippingCharge: p.shippingCharge,
    stock: p.stock,
    image: p.image,
    bestSeller: p.bestSeller,
    newest: p.newest,
    packOf: p.packOf,
    avgRating: p.avgRating,
    reviewCount: p.reviewCount,
    soldCount: p.soldCount,
    description: desc.length > DESC_KEPT ? desc.slice(0, DESC_KEPT) : desc,
    extraJson: trimExtra(p.extraJson),
  } as Product;
}

export function toListingProducts(list: Product[]): Product[] {
  return (list ?? []).map(toListingProduct);
}
