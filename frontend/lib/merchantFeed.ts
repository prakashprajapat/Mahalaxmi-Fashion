// Deliberately a narrow structural type rather than the full Product: the two
// feed routes fetch their products differently and one of them has its own
// leaner shape, so asking for only the fields these functions actually read
// lets both callers pass without casting.
export interface FeedInput {
  dbId: number;
  name: string;
  price: number;
  stock?: string;
  sku?: string;
  extraJson?: string;
  category?: string;
  subcategory?: string;
}

// The bits of a Merchant Center feed that both feeds need, in one place so
// they cannot drift apart. There are two feed URLs — /product-feed.xml and
// /feed/google-merchant.xml — and until now only one of them hid inactive
// products and neither sent a colour or a size.
//
// That missing colour and size is almost certainly why 82 products sit at
// "Limited" in Merchant Center: Google requires both for anything in Apparel &
// Accessories, and without them a product is accepted but barely shown.

/** Statuses that mean the product is not on the website and must not be in the feed. */
export const HIDDEN_STATUSES = ['Inactive', 'Draft'];

export function isFeedable(p: FeedInput): boolean {
  return Boolean(p?.dbId) && Boolean((p.name ?? '').trim()) && (Number(p.price) || 0) > 0
    && !HIDDEN_STATUSES.includes((p.stock ?? '').trim());
}

interface Extra {
  sizes?: unknown;
  colors?: unknown;
  colours?: unknown;
}

function names(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(x => (typeof x === 'string' ? x : (x && typeof x === 'object' ? (x as { name?: string }).name : null)))
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map(s => s.trim());
}

export function sizesOf(p: FeedInput): string[] {
  try {
    const e = (p.extraJson ? JSON.parse(p.extraJson) : {}) as Extra;
    return names(e.sizes);
  } catch { return []; }
}

export function coloursOf(p: FeedInput): string[] {
  try {
    const e = (p.extraJson ? JSON.parse(p.extraJson) : {}) as Extra;
    const c = names(e.colors);
    return c.length > 0 ? c : names(e.colours);
  } catch { return []; }
}

export interface Variant {
  /** Unique per row; Google will not accept two items sharing an id. */
  id: string;
  /** Shared by every row of one product, which is how Google knows they are the same thing. */
  itemGroupId: string;
  size?: string;
  colour?: string;
}

/**
 * One feed row per size and colour.
 *
 * Google's size and colour attributes hold a single value each, so a nighty
 * that comes in four sizes is four rows sharing an item_group_id — not one row
 * listing four sizes, which is what a single row would have to do and which
 * Google rejects. This is the difference between a product Google can offer to
 * someone searching for "cotton nighty size XL" and one it cannot.
 *
 * Capped at 40 rows per product so an unusual size grid cannot inflate the
 * whole feed.
 */
export function variantsOf(p: FeedInput): Variant[] {
  const base = (p.sku ?? '').trim() || `MFH-${p.dbId}`;
  const sizes = sizesOf(p);
  const colours = coloursOf(p);

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  if (sizes.length === 0 && colours.length === 0)
    return [{ id: base, itemGroupId: base }];

  const rows: Variant[] = [];
  const sizeList = sizes.length > 0 ? sizes : [undefined];
  const colourList = colours.length > 0 ? colours : [undefined];

  for (const size of sizeList) {
    for (const colour of colourList) {
      if (rows.length >= 40) return rows;
      rows.push({
        id: [base, size && slug(size), colour && slug(colour)].filter(Boolean).join('-'),
        itemGroupId: base,
        size,
        colour,
      });
    }
  }
  return rows;
}

/**
 * Google's product taxonomy, as a text path.
 *
 * Only paths that exist in Google's list are used; anything unrecognised falls
 * back to the top-level "Apparel & Accessories", which is always valid. A wrong
 * category is an item-level error in Merchant Center, so a vague-but-correct
 * value beats a specific guess.
 */
export function googleCategoryOf(p: FeedInput): string {
  const s = `${p.subcategory ?? ''} ${p.category ?? ''}`.toLowerCase();

  if (s.includes('shoe') || s.includes('footwear') || s.includes('sandal'))
    return 'Apparel & Accessories > Shoes';
  if (s.includes('nighty') || s.includes('night gown') || s.includes('nightwear') || s.includes('sleep'))
    return 'Apparel & Accessories > Clothing > Sleepwear & Loungewear';
  if (s.includes('innerwear') || s.includes('undergarment') || s.includes('bra') || s.includes('panty'))
    return 'Apparel & Accessories > Clothing > Underwear & Socks';
  if (s.includes('perfume') || s.includes('fragrance') || s.includes('deo'))
    return 'Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne';
  if (s.includes('saree') || s.includes('kurti') || s.includes('dress') || s.includes('petticoat')
      || s.includes('shorts') || s.includes('poplin'))
    return 'Apparel & Accessories > Clothing';

  return 'Apparel & Accessories';
}

/** Our own category path. Free text — Google uses it for reporting, not matching, so nothing can be invalid here. */
export function productTypeOf(p: FeedInput): string {
  return [p.category, p.subcategory].filter(Boolean).join(' > ');
}

export function genderOf(p: FeedInput): string {
  const c = `${p.category ?? ''} ${p.subcategory ?? ''}`.toLowerCase();
  if (c.includes('women') || c.includes('girl') || c.includes('nighty') || c.includes('saree') || c.includes('petticoat')) return 'female';
  if (c.includes('men') || c.includes('boy')) return 'male';
  return 'unisex';
}

export function ageGroupOf(p: FeedInput): string {
  const c = `${p.category ?? ''} ${p.subcategory ?? ''}`.toLowerCase();
  return c.includes('kid') || c.includes('child') || c.includes('baby') ? 'kids' : 'adult';
}
