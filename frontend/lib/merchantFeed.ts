import { allSlotPhotos, colourSetsOf, colourPhotos } from './photoExtras';
import { isColourValid } from './googleColours';
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

/**
 * The photo that belongs on ONE feed row.
 *
 * Both feeds sent the product's main photo on every row. A dress in five
 * colours therefore went to Meta and to Google as five rows that all showed
 * the same colour - MFH1218's black row and its green row carry the identical
 * image_link today. In a catalogue ad that is a shopper being shown a black
 * dress under the word Green, and she finds out when the parcel opens.
 *
 * The colour's own front photo when the shop has filled one in, the product's
 * main photo otherwise. Read through colourSetsOf, so a colour filled in on
 * the pack-column screen counts exactly like one filled in on the picker.
 */
export function imageForColour(p: FeedInput, colour?: string): string | undefined {
  if (!colour) return undefined;
  try {
    const e = (p.extraJson ? JSON.parse(p.extraJson) : {}) as Record<string, unknown>;
    const set = colourSetsOf(e).find(c => c.name.toLowerCase() === colour.trim().toLowerCase());
    if (!set) return undefined;
    const own = typeof set.photo === 'string' ? set.photo : '';
    return own || colourPhotos(set)[0] || undefined;
  } catch { return undefined; }
}

/** Google accepts ten additional images per item; Meta accepts more, so ten is the cap. */
export const MAX_ADDITIONAL_IMAGES = 10;

/**
 * The OTHER photos that belong on one feed row.
 *
 * Merchant Center's store quality scorecard scores "Images per item" - the
 * average number of photographs an offer carries - and reported Incomplete,
 * because all three feeds sent exactly one image_link and there was nothing to
 * average. The photographs exist: every garment is shot front, side, back and
 * zoomed, and several carry fabric and label close-ups past those. They were
 * simply never offered to anyone outside the product page.
 *
 * Which photos belong on a row depends on what the row IS. A green row must
 * not carry four pictures of the black one - that is the same mistake
 * image_link used to make, one shopper-facing step worse, because an ad can
 * show any of these images as the main one.
 *
 * So: the colour's own set when the shop has filled in more than a single
 * photo for it, exactly the rule the product page follows. Otherwise the
 * product's own gallery - the four named views, then `images`, then the
 * colour's lone photo, then the pack columns nobody named. The main image_link
 * is left out, since repeating it is what Google calls a duplicate image.
 */
export function extraImagesFor(p: FeedInput, colour?: string, main?: string): string[] {
  let pool: string[] = [];
  try {
    const e = (p.extraJson ? JSON.parse(p.extraJson) : {}) as Record<string, unknown>;
    const set = colour
      ? colourSetsOf(e).find(c => c.name.toLowerCase() === colour.trim().toLowerCase())
      : undefined;
    const own = set ? colourPhotos(set) : [];

    if (own.length >= 2) {
      // The shop photographed this colour properly. The row is that colour.
      pool = own;
    } else {
      const strings = (v: unknown): string[] =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
      pool = [
        ...allSlotPhotos(e.productPhotos as Record<string, unknown>),
        ...strings(e.images),
        ...own,
      ];
      const cols = (e.packImages ?? e.packColumnPhotos ?? e.variantColumns ?? []) as unknown[];
      for (const col of Array.isArray(cols) ? cols : []) {
        if (typeof col === 'string') { pool.push(col); continue; }
        if (!col || typeof col !== 'object') continue;
        const c = col as Record<string, unknown>;
        // A named column is some other colour's photographs. Only the columns
        // nobody named can belong to the product at large.
        const named = String(c.colour ?? c.colorName ?? c.color ?? '').trim();
        if (!named) pool.push(...allSlotPhotos(c));
      }
    }
  } catch { return []; }

  const seen = new Set<string>();
  const skip = (main ?? '').trim();
  if (skip) seen.add(skip);

  const out: string[] = [];
  for (const raw of pool) {
    const v = (raw ?? '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= MAX_ADDITIONAL_IMAGES) break;
  }
  return out;
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
    const picked = c.length > 0 ? c : names(e.colours);
    // A pack product's colours are its column names and reach neither of those
    // two fields, so the feed was sending those products with no colour at all
    // - the very gap that leaves apparel "Limited" in Merchant Center.
    const fromSets = colourSetsOf(e as unknown as Record<string, unknown>).map(x => x.name);
    const list = [...new Set([...picked, ...fromSets])];
    // Google jis value ko colour maanta hi nahi ("MultiColour", "Design C",
    // hex code, akela letter) wo bhejne se item disapprove ho jata hai. Aisi
    // value chhod dete hain — product row phir bhi jati hai, bas colour ke
    // bina. Asli ilaaj admin me colour theek karna hai (Colour Fix screen).
    return list.filter(isColourValid);
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
// feedIdFor used to live here, and its comment said the id was built in one
// place and that variantsOf used the same rule. Neither was true: variantsOf
// builds its ids inline, and before that it runs the colours through
// coloursOf, which throws away everything Google will not accept as a colour.
// feedIdFor skipped that step, so the pixel sent MFH1225-6-design-white for a
// row the catalogue calls MFH1225-6, and Meta reported a product it had never
// heard of on the shop's Add to Cart events.
//
// It is gone rather than fixed. Two functions that build the same id is the
// bug; pixelIdFor below asks variantsOf what the rows ARE instead of guessing
// what they should be, so there is now one builder and nothing to drift from.

export function variantsOf(p: FeedInput, seen?: Set<string>): Variant[] {
  const base = (p.sku ?? '').trim() || `MFH-${p.dbId}`;

  // Two things produce duplicate ids, and Google rejects a feed row whose id it
  // has already seen — 41 rows collided on the first version of this.
  //  - the same size or colour listed twice on one product, and
  //  - two different products sharing a SKU, which makes every one of their
  //    rows collide.
  // The first is fixed by de-duplicating here; the second cannot be seen from
  // inside one product, so the caller passes a set of ids already used in this
  // feed and collisions fall back to the database id, which is unique by
  // definition.
  const uniq = (xs: string[]) => {
    const out: string[] = [];
    const lower = new Set<string>();
    for (const x of xs) {
      const k = x.trim().toLowerCase();
      if (!k || lower.has(k)) continue;
      lower.add(k);
      out.push(x.trim());
    }
    return out;
  };

  const sizes = uniq(sizesOf(p));
  const colours = uniq(coloursOf(p));

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const claim = (id: string) => {
    if (!seen) return id;
    let candidate = id;
    if (seen.has(candidate)) candidate = `${id}-${p.dbId}`;
    let n = 2;
    while (seen.has(candidate)) candidate = `${id}-${p.dbId}-${n++}`;
    seen.add(candidate);
    return candidate;
  };

  if (sizes.length === 0 && colours.length === 0)
    return [{ id: claim(base), itemGroupId: base }];

  const rows: Variant[] = [];
  const sizeList: (string | undefined)[] = sizes.length > 0 ? sizes : [undefined];
  const colourList: (string | undefined)[] = colours.length > 0 ? colours : [undefined];

  for (const size of sizeList) {
    for (const colour of colourList) {
      if (rows.length >= 40) return rows;
      rows.push({
        id: claim([base, size && slug(size), colour && slug(colour)].filter(Boolean).join('-')),
        itemGroupId: base,
        size,
        colour,
      });
    }
  }
  return rows;
}

/**
 * The catalogue id for the row a shopper is actually looking at.
 *
 * feedIdFor builds an id out of whatever size and colour it is handed. The
 * FEED does not: variantsOf asks coloursOf first, and coloursOf drops every
 * colour Google will not accept - "Design White", "MultiColour", a hex code, a
 * lone letter. So the shop sells "campus cable, size 6, Design White", the feed
 * carries it as MFH1225-6, and the pixel was calling it MFH1225-6-design-white.
 *
 * Meta read that as a product it had never heard of. It is the Add to Cart and
 * the Purchase that went out wrong - the two events the catalogue ads and the
 * Conversions API actually bid on.
 *
 * So the id is not built here either. The product's real rows are generated by
 * the feed's own function and the one the shopper chose is picked out of them.
 * When her colour is not among them - because the feed dropped it - the row for
 * her SIZE is still the right row, and that is what the feed itself would have
 * sold her.
 *
 * Falls back to the SKU, which is the item_group_id: not a match, but a true
 * statement about a real group, rather than an id nothing has.
 */
export function pixelIdFor(
  p: { dbId?: number; sku?: string; extraJson?: string } | null | undefined,
  size?: string,
  colour?: string,
): string {
  const base = (p?.sku ?? '').trim() || `MFH-${p?.dbId ?? ''}`;
  if (!p) return base;

  const rows = variantsOf({ dbId: p.dbId ?? 0, name: '', price: 1, sku: p.sku, extraJson: p.extraJson });
  if (rows.length === 0) return base;

  const norm = (x?: string) => (x ?? '').trim().toLowerCase();
  const s = norm(size);
  const c = norm(colour);

  // Her size AND her colour both survived into the feed.
  let hit = rows.find(r => norm(r.size) === s && norm(r.colour) === c);
  // Her colour did not - Google would not take it - so the size names the row.
  if (!hit && s) hit = rows.find(r => norm(r.size) === s && !r.colour);
  // The product has no sizes, only colours.
  if (!hit && c) hit = rows.find(r => !r.size && norm(r.colour) === c);
  // One row for the whole product: that is the row, whatever she picked.
  if (!hit && rows.length === 1) hit = rows[0];

  return hit ? hit.id : base;
}

/**
 * Google's product taxonomy, as a text path.
 *
 * Only paths that exist in Google's list are used; anything unrecognised falls
 * back to the top-level "Apparel & Accessories", which is always valid. A wrong
 * category is an item-level error in Merchant Center, so a vague-but-correct
 * value beats a specific guess.
 */
/** ExtraJson as an object, or null when it is missing or unreadable. */
function parseExtra(p: FeedInput): unknown | null {
  const raw = (p as unknown as { extraJson?: unknown }).extraJson;
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch { return null; }
}

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
