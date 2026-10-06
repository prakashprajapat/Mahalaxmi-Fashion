// Reading a supplier's product list.
//
// A supplier who agrees to let you sell their goods sends a file, and every
// supplier sends a different one. Shopify shops export a CSV where one product
// is spread over five or six rows. Anyone running ads sends the Google Merchant
// XML, where the product is an <item> and every field is prefixed g:. Smaller
// suppliers send whatever their accountant made in Excel.
//
// So this file does not ask what format the file is. It reads the file, works
// out the shape, and hands back rows and column names. Which column means what
// is guessed, and the guess is shown to the owner to correct — because a wrong
// guess here puts a cost price on the website as a selling price, and that is
// a mistake worth one screen of checking.
//
// Nothing here touches the network or the DOM: it is all text in, data out, so
// the same functions can be run against a sample file to prove they are right.

export interface FeedRow { [column: string]: string }

export interface ParsedFeed {
  /** What the file turned out to be, in words the owner will recognise. */
  format: string;
  columns: string[];
  rows: FeedRow[];
  /** Anything the owner should know about how it was read. */
  notes: string[];
}

// ── CSV ──────────────────────────────────────────────────────────────────────

// A real CSV parser, not a split on commas. Product descriptions contain commas
// and quotes and line breaks, and a split-on-comma turns one such description
// into nine broken columns that then land on the website.
export function parseCsv(text: string): { columns: string[]; rows: FeedRow[] } {
  const src = text.replace(/^﻿/, '');          // Excel writes a byte-order mark
  const table: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }  // "" inside quotes is one "
        else quoted = false;
      } else field += c;
      continue;
    }

    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); table.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); table.push(row); }

  const head = table.shift() ?? [];
  const columns = head.map((h, i) => h.trim() || `Column ${i + 1}`);
  const rows = table
    .filter(r => r.some(c => c.trim() !== ''))       // blank lines at the end of every export
    .map(r => {
      const o: FeedRow = {};
      columns.forEach((col, i) => { o[col] = (r[i] ?? '').trim(); });
      return o;
    });

  return { columns, rows };
}

// ── XML ──────────────────────────────────────────────────────────────────────

/** `<g:price>` and `<price>` are the same field. Prefixes carry no meaning here. */
function localName(tag: string): string {
  const name = tag.split(/\s/)[0].replace(/^\//, '').replace(/\/$/, '');
  const colon = name.indexOf(':');
  return (colon >= 0 ? name.slice(colon + 1) : name).trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');                         // last, so &amp;lt; survives as &lt;
}

// Walks the tags and keeps, for every element, the elements directly inside it.
// The record element is then the one that repeats most — <item> in a Merchant
// feed, <product> in most others — which means this works on a feed nobody has
// seen before without being told its shape.
export function parseXmlRows(text: string): { columns: string[]; rows: FeedRow[]; record: string } {
  const src = text.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');

  interface Frame { name: string; start: number; children: string[] }
  const stack: Frame[] = [];
  const counts = new Map<string, number>();         // element name → how many had children
  const blocks: { name: string; inner: string }[] = [];

  const tagRe = /<([^>]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src)) !== null) {
    const raw = m[1];
    if (raw.startsWith('!')) continue;               // DOCTYPE, CDATA handled on read
    const selfClosing = raw.endsWith('/');
    const closing = raw.startsWith('/');
    const name = localName(raw);
    if (!name) continue;

    if (selfClosing) { if (stack.length) stack[stack.length - 1].children.push(name); continue; }

    if (!closing) {
      if (stack.length) stack[stack.length - 1].children.push(name);
      stack.push({ name, start: m.index + m[0].length, children: [] });
      continue;
    }

    // Closing tag: unwind to the matching open, so one stray tag cannot derail
    // the whole file.
    let depth = stack.length - 1;
    while (depth >= 0 && stack[depth].name !== name) depth--;
    if (depth < 0) continue;
    const frame = stack[depth];
    stack.length = depth;

    if (frame.children.length > 0) {
      counts.set(frame.name, (counts.get(frame.name) ?? 0) + 1);
      blocks.push({ name: frame.name, inner: src.slice(frame.start, m.index) });
    }
  }

  let record = '';
  let best = 0;
  counts.forEach((n, name) => { if (n > best) { best = n; record = name; } });
  if (!record) return { columns: [], rows: [], record: '' };

  const columns: string[] = [];
  const rows: FeedRow[] = blocks
    .filter(b => b.name === record)
    .map(b => {
      const o: FeedRow = {};
      const childRe = /<([^/!][^>]*?)>([\s\S]*?)<\/\s*[^>]*?>/g;
      let c: RegExpExecArray | null;
      while ((c = childRe.exec(b.inner)) !== null) {
        const key = localName(c[1]);
        if (!key) continue;
        const value = decodeEntities(c[2]).trim();
        if (!value) continue;
        // A feed lists extra photos as several <additional_image_link>. Keeping
        // only the last would throw away every photo but one.
        o[key] = o[key] ? `${o[key]} | ${value}` : value;
        if (!columns.includes(key)) columns.push(key);
      }
      return o;
    })
    .filter(r => Object.keys(r).length > 0);

  return { columns, rows, record };
}

// ── Shopify's CSV, which is a format of its own ──────────────────────────────

// Shopify writes one row per variant and extra rows for extra photos, all tied
// together by Handle. Row one carries the title and description; the rows under
// it are blank except for a size, a colour or an image. Imported row-by-row you
// get one real product and five nameless ghosts, which is exactly what happens
// when somebody imports a Shopify export into a shop that was not expecting one.
function isShopifyCsv(columns: string[]): boolean {
  const has = (c: string) => columns.some(x => x.toLowerCase() === c);
  return has('handle') && (has('variant price') || has('variant sku'));
}

function foldShopify(rows: FeedRow[]): { columns: string[]; rows: FeedRow[] } {
  const get = (r: FeedRow, name: string) => {
    const key = Object.keys(r).find(k => k.toLowerCase() === name);
    return key ? (r[key] ?? '').trim() : '';
  };

  const byHandle = new Map<string, FeedRow[]>();
  for (const r of rows) {
    const h = get(r, 'handle');
    if (!h) continue;
    const list = byHandle.get(h);
    if (list) list.push(r); else byHandle.set(h, [r]);
  }

  const out: FeedRow[] = [];
  byHandle.forEach((group, handle) => {
    const head = group.find(r => get(r, 'title')) ?? group[0];

    const images: string[] = [];
    const sizes = new Set<string>();
    const colours = new Set<string>();
    let price = '';
    let compareAt = '';
    let sku = '';
    let anyInStock = false;

    // Which option column holds sizes and which holds colours changes per shop,
    // so it is read from the option NAME rather than assumed to be Option1.
    for (const r of group) {
      const img = get(r, 'image src');
      if (img && !images.includes(img)) images.push(img);

      for (const n of ['1', '2', '3']) {
        const optName = get(r, `option${n} name`).toLowerCase();
        const optValue = get(r, `option${n} value`);
        if (!optValue || optValue.toLowerCase() === 'default title') continue;
        if (optName.includes('size')) sizes.add(optValue);
        else if (optName.includes('colour') || optName.includes('color')) colours.add(optValue);
      }

      const p = get(r, 'variant price');
      if (p && !price) price = p;
      const c = get(r, 'variant compare at price');
      if (c && !compareAt) compareAt = c;
      const s = get(r, 'variant sku');
      if (s && !sku) sku = s;

      const qty = get(r, 'variant inventory qty');
      const policy = get(r, 'variant inventory policy');
      if ((qty && Number(qty) > 0) || policy.toLowerCase() === 'continue') anyInStock = true;
    }

    out.push({
      Handle: handle,
      Title: get(head, 'title'),
      Description: get(head, 'body (html)'),
      Type: get(head, 'type'),
      Tags: get(head, 'tags'),
      Vendor: get(head, 'vendor'),
      SKU: sku || handle,
      Price: price,
      MRP: compareAt,
      Image: images[0] ?? '',
      'All Images': images.join(' | '),
      Sizes: Array.from(sizes).join(' | '),
      Colours: Array.from(colours).join(' | '),
      Availability: anyInStock ? 'in stock' : 'out of stock',
      Published: get(head, 'published'),
    });
  });

  const columns = ['Handle', 'Title', 'Description', 'Type', 'Tags', 'Vendor', 'SKU', 'Price',
    'MRP', 'Image', 'All Images', 'Sizes', 'Colours', 'Availability', 'Published'];
  return { columns, rows: out };
}

// ── The one entry point ──────────────────────────────────────────────────────

export function parseFeed(text: string, fileName = ''): ParsedFeed {
  const notes: string[] = [];
  const head = text.slice(0, 2000).trim();
  const looksXml = head.startsWith('<');
  const looksJson = head.startsWith('{') || head.startsWith('[');

  if (looksJson) {
    try {
      const data = JSON.parse(text);
      const list: any[] = Array.isArray(data)
        ? data
        : (data.products ?? data.items ?? data.data ?? []);
      const rows: FeedRow[] = list.map((item: any) => {
        const o: FeedRow = {};
        for (const [k, v] of Object.entries(item ?? {})) {
          if (v === null || v === undefined) continue;
          o[k] = Array.isArray(v)
            ? v.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' | ')
            : (typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
        return o;
      });
      const columns: string[] = [];
      rows.forEach(r => Object.keys(r).forEach(k => { if (!columns.includes(k)) columns.push(k); }));
      return { format: 'JSON', columns, rows, notes };
    } catch {
      notes.push('This looked like a JSON file but could not be read. Ask the supplier for a CSV or XML instead.');
      return { format: 'unreadable', columns: [], rows: [], notes };
    }
  }

  if (looksXml) {
    const { columns, rows, record } = parseXmlRows(text);
    const merchant = columns.includes('image_link') || columns.includes('availability');
    notes.push(`Each product is one <${record}> block.`);
    return {
      format: merchant ? 'Google Merchant XML' : 'XML',
      columns, rows, notes,
    };
  }

  const csv = parseCsv(text);
  if (isShopifyCsv(csv.columns)) {
    const folded = foldShopify(csv.rows);
    notes.push(`${csv.rows.length} rows in the file became ${folded.rows.length} products — a Shopify export writes one row per size and per photo.`);
    return { format: 'Shopify CSV', columns: folded.columns, rows: folded.rows, notes };
  }

  if (fileName.toLowerCase().endsWith('.tsv') || (csv.columns.length <= 1 && text.includes('\t'))) {
    notes.push('Read as a tab-separated file.');
    const asCsv = parseCsv(text.replace(/\t/g, ','));
    return { format: 'TSV', columns: asCsv.columns, rows: asCsv.rows, notes };
  }

  return { format: 'CSV', columns: csv.columns, rows: csv.rows, notes };
}

// ── Working out which column is which ────────────────────────────────────────

export type FeedField =
  | 'sku' | 'name' | 'description' | 'category' | 'subcategory'
  | 'price' | 'mrp' | 'image' | 'images' | 'sizes' | 'colours'
  | 'fabric' | 'stock';

export const FEED_FIELDS: { key: FeedField; label: string; required?: boolean; help: string }[] = [
  { key: 'name',        label: 'Product name', required: true,  help: 'Becomes the heading on your page and on Google.' },
  { key: 'price',       label: 'Price',        required: true,  help: 'What the supplier charges you. Your margin is added below.' },
  { key: 'image',       label: 'Main photo',   required: true,  help: 'Without a photo the product cannot go live.' },
  { key: 'sku',         label: 'SKU / code',   help: 'How a product is recognised next time, so a re-import updates instead of duplicating.' },
  { key: 'description', label: 'Description',  help: 'Needs 50 characters or more, or the product is held as a draft.' },
  { key: 'subcategory', label: 'Type / subcategory', help: 'Nighty, Saree, Kurti — this decides which collection pages it appears on.' },
  { key: 'category',    label: 'Category',     help: 'Women, Men, Kids, Beauty, Fabrics. Set one below if the file has none.' },
  { key: 'mrp',         label: 'MRP',          help: 'The struck-through price. Left empty if the supplier does not give one.' },
  { key: 'images',      label: 'More photos',  help: 'Extra photos, separated by | or a comma.' },
  { key: 'sizes',       label: 'Sizes',        help: 'Google will not approve clothing without a size.' },
  { key: 'colours',     label: 'Colours',      help: 'Google will not approve clothing without a colour either.' },
  { key: 'fabric',      label: 'Fabric',       help: 'Shown under Product Details.' },
  { key: 'stock',       label: 'In stock?',    help: '"in stock" / "out of stock". Anything else is treated as in stock.' },
];

const GUESSES: Record<FeedField, string[]> = {
  sku:         ['sku', 'variant sku', 'id', 'item id', 'code', 'style code', 'product code', 'g:id', 'mpn'],
  name:        ['name', 'title', 'product name', 'product title', 'item name'],
  description: ['description', 'body (html)', 'body', 'details', 'product description', 'long description'],
  category:    ['category', 'product category', 'google product category', 'department'],
  subcategory: ['subcategory', 'sub category', 'type', 'product type', 'product_type', 'item type', 'tags'],
  price:       ['price', 'variant price', 'sale price', 'sale_price', 'rate', 'cost', 'wholesale price', 'our price'],
  mrp:         ['mrp', 'compare at price', 'variant compare at price', 'list price', 'retail price', 'max price'],
  image:       ['image', 'image src', 'image link', 'image_link', 'main image', 'photo', 'image url', 'image1'],
  images:      ['all images', 'additional image link', 'additional_image_link', 'more images', 'images', 'gallery'],
  sizes:       ['sizes', 'size', 'available sizes', 'size list'],
  colours:     ['colours', 'colors', 'colour', 'color', 'shade'],
  fabric:      ['fabric', 'material', 'cloth', 'composition'],
  stock:       ['availability', 'stock', 'in stock', 'stock status', 'inventory', 'variant inventory qty'],
};

/** Picks the likeliest column for every field. Exact names win over partial ones. */
export function guessMap(columns: string[]): Partial<Record<FeedField, string>> {
  const map: Partial<Record<FeedField, string>> = {};
  const used = new Set<string>();
  const lower = columns.map(c => c.toLowerCase().trim());

  for (const field of Object.keys(GUESSES) as FeedField[]) {
    const wants = GUESSES[field];
    let pick = '';
    for (const want of wants) {
      const exact = lower.findIndex((c, i) => c === want && !used.has(columns[i]));
      if (exact >= 0) { pick = columns[exact]; break; }
    }
    if (!pick) {
      for (const want of wants) {
        const partial = lower.findIndex((c, i) => c.includes(want) && !used.has(columns[i]));
        if (partial >= 0) { pick = columns[partial]; break; }
      }
    }
    if (pick) { map[field] = pick; used.add(pick); }
  }
  return map;
}

// ── From rows to products ────────────────────────────────────────────────────

export interface PricingRule {
  /** Added on top of the supplier's price. 40 means a 1000 rupee item sells at 1400. */
  marginPercent: number;
  /** 0 = leave the number alone, 9 = end on 9, 99 = end on 99. */
  roundTo: 0 | 9 | 99;
  /** Added to every product's shipping field, in rupees. */
  shipping: number;
}

export interface BuiltProduct {
  sku: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  supplierPrice: number;
  price: number;
  maxPrice: number | null;
  stock: string;
  image: string;
  images: string[];
  sizes: string[];
  colours: string[];
  fabric: string;
  shipping: number;
  /** Set when a product with this SKU is already in the catalogue. */
  existingId?: number;
  existingName?: string;
}

const splitList = (v: string): string[] =>
  (v ?? '').split(/\s*[|,;]\s*/).map(s => s.trim()).filter(Boolean);

/** "Rs. 1,299.00" and "1299" both mean 1299. */
export function parseMoney(v: string): number {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function applyMargin(supplier: number, rule: PricingRule): number {
  if (supplier <= 0) return 0;
  const raw = supplier * (1 + rule.marginPercent / 100);
  if (rule.roundTo === 0) return Math.round(raw);
  // Round UP to the next price ending in 9 or 99, never down: rounding down
  // quietly eats into the margin that was just asked for.
  const step = rule.roundTo === 9 ? 10 : 100;
  const end = rule.roundTo;
  const base = Math.ceil((raw - end) / step) * step;
  return Math.max(end, base + end);
}

/** HTML descriptions are rejected by the quality gate, so they are flattened here. */
export function stripHtml(v: string): string {
  return (v ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function buildProducts(
  rows: FeedRow[],
  map: Partial<Record<FeedField, string>>,
  rule: PricingRule,
  defaults: { category: string; subcategory: string },
  existing: { id: number; sku?: string; name: string }[],
): BuiltProduct[] {
  const bySku = new Map<string, { id: number; name: string }>();
  for (const p of existing) {
    const s = (p.sku ?? '').trim().toLowerCase();
    if (s) bySku.set(s, { id: p.id, name: p.name });
  }

  const take = (r: FeedRow, f: FeedField): string => {
    const col = map[f];
    return col ? (r[col] ?? '').trim() : '';
  };

  return rows.map(r => {
    const supplierPrice = parseMoney(take(r, 'price'));
    const mrp = parseMoney(take(r, 'mrp'));
    const price = applyMargin(supplierPrice, rule);

    const images = [...new Set([take(r, 'image'), ...splitList(take(r, 'images'))].filter(Boolean))];
    const availability = take(r, 'stock').toLowerCase();
    const outOfStock = availability.includes('out') || availability === '0' || availability === 'false';

    const sku = take(r, 'sku');
    const match = sku ? bySku.get(sku.trim().toLowerCase()) : undefined;

    return {
      sku,
      name: take(r, 'name'),
      description: stripHtml(take(r, 'description')),
      category: take(r, 'category') || defaults.category,
      subcategory: take(r, 'subcategory') || defaults.subcategory,
      supplierPrice,
      price,
      // An MRP below the selling price reads as a mistake to a shopper, so it is
      // dropped rather than shown.
      maxPrice: mrp > price ? mrp : null,
      stock: outOfStock ? 'Out of Stock' : 'In Stock',
      image: images[0] ?? '',
      images,
      sizes: splitList(take(r, 'sizes')),
      colours: splitList(take(r, 'colours')),
      fabric: take(r, 'fabric'),
      shipping: rule.shipping,
      existingId: match?.id,
      existingName: match?.name,
    };
  }).filter(p => p.name || p.sku);          // a wholly empty row is not a product
}

/** What the page sends to POST /api/products, which already knows how to upsert. */
export function toApiProduct(p: BuiltProduct, imageValue: string, galleryValues: string[]) {
  return {
    dbId: p.existingId ?? null,
    sku: p.sku || null,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    price: p.price,
    discountPrice: null,
    maxPrice: p.maxPrice,
    stock: p.stock,
    description: p.description,
    image: imageValue,
    bestSeller: false,
    shippingCharge: p.shipping,
    extraJson: {
      images: galleryValues,
      sizes: p.sizes,
      colors: p.colours,
      ...(p.fabric ? { fabric: p.fabric } : {}),
    },
  };
}
