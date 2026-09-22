// The same rules the server applies before a product is allowed on the website,
// checked here as the owner types.
//
// The server is still the authority — this cannot be trusted, and nothing here
// decides anything. What it buys is that the rules stop being a surprise: the
// list of what is missing sits on screen while the form is being filled, rather
// than arriving as a popup after a save that then has to be repeated.
//
// If a rule changes, it changes in BOTH files: backend/Services/ProductQualityGate.cs
// is the one that matters, this one is what the owner sees.

export interface GateIssue {
  field: string;
  message: string;
}

export interface GateResult {
  blocking: GateIssue[];
  warnings: GateIssue[];
  passed: boolean;
}

export interface GateInput {
  name: string;
  description: string;
  price: number;
  discountPrice?: number;
  maxPrice?: number;
  image: string;
  category: string;
  subcategory: string;
  sizes: string[];
  colours: string[];
  sku?: string;
  hsnCode?: string;
}

const TITLE_MAX = 150;
const TITLE_MIN = 10;
const DESC_MIN = 50;
const DESC_MAX = 5000;

const INTERNAL_CODE = /\b[A-Z]{2,}\d{2,}[A-Z0-9]*\b/;
const PROMO_TITLE = /\b(free\s*ship\w*|free\s*deliver\w*|best\s*price|lowest\s*price|cheapest|buy\s*now|order\s*now|hurry|limited\s*offer|sale|discount|offer|cod\s*available|100%\s*original|whats\s*app|call\s*us|dm\s*us)\b|!{2,}/i;
const PROMO_DESC = /\b(free\s*ship\w*|free\s*deliver\w*|best\s*price|lowest\s*price|cheapest|buy\s*now|order\s*now|hurry\s*up|limited\s*time|cod\s*available|100%\s*original|whats\s*app|call\s*us|dm\s*us)\b|!{3,}/i;
const CONTACT_OR_LINK = /https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.[\w.]+\b|\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/i;
const HTML_TAG = /<[a-z/][^>]*>/i;

/** Google asks for a size and a colour on clothing and footwear, and on neither for perfume. */
export function isApparel(category: string, subcategory: string): boolean {
  const s = `${subcategory} ${category}`.toLowerCase();
  if (/perfume|fragrance|deo|beauty|cosmetic/.test(s)) return false;
  return /nighty|night gown|nightwear|gown|petticoat|saree|sari|kurti|dress|shorts|top|legging|blouse|innerwear|undergarment|bra|panty|shoe|footwear|sandal|slipper|apparel|clothing|women|men|kids/.test(s);
}

export function checkProduct(p: GateInput): GateResult {
  const blocking: GateIssue[] = [];
  const warnings: GateIssue[] = [];
  const block = (field: string, message: string) => blocking.push({ field, message });
  const warn = (field: string, message: string) => warnings.push({ field, message });

  const name = (p.name ?? '').trim();
  const desc = (p.description ?? '').trim();

  if (!name) {
    block('name', 'This product has no name.');
  } else {
    if (name.length < TITLE_MIN) block('name', `The name is only ${name.length} characters — write what it is, in at least ${TITLE_MIN}.`);
    if (name.length > TITLE_MAX) block('name', `The name is ${name.length} characters. Google rejects anything over ${TITLE_MAX}.`);
    else if (name.length > 70) warn('name', `${name.length} characters — Google will cut the name off around 70. Put the important words first.`);

    const letters = (name.match(/[A-Za-z]/g) ?? []).length;
    const caps = (name.match(/[A-Z]/g) ?? []).length;
    if (letters > 8 && caps > letters * 0.8) block('name', 'The name is in BLOCK CAPITALS. Google rejects shouted titles.');
    if (INTERNAL_CODE.test(name)) block('name', 'The name contains a stock code such as ID6026. Move it to the SKU box and give the product a name a customer would type.');
    if (PROMO_TITLE.test(name)) block('name', 'The name contains an offer or promise ("sale", "free shipping", "!!"). Google rejects titles that sell the deal instead of the product.');
  }

  if (!desc) {
    block('description', 'This product has no description. It is the sentence Google shows underneath it.');
  } else {
    if (desc.length < DESC_MIN) block('description', `The description is only ${desc.length} characters. Write at least ${DESC_MIN} — fabric, fit, and who it suits.`);
    else if (desc.length < 150) warn('description', 'The description is short. Two or three full sentences give Google much more to work with.');
    if (desc.length > DESC_MAX) block('description', `The description is ${desc.length} characters. Google rejects anything over ${DESC_MAX}.`);
    if (HTML_TAG.test(desc)) block('description', 'The description contains HTML tags. Google wants plain text here.');
    if (CONTACT_OR_LINK.test(desc)) block('description', 'The description contains a link, an email or a phone number. Google does not allow contact details here.');
    if (PROMO_DESC.test(desc)) block('description', 'The description contains promotional text such as "free shipping". Describe the product instead.');
  }

  if (!(p.image ?? '').trim()) block('image', 'No photo. Clothing is bought by eye, and Google will not list a product without an image.');
  if (!(p.price > 0)) block('price', 'The price is zero.');
  if (p.discountPrice && p.discountPrice > 0 && p.discountPrice >= p.price)
    block('price', 'The discounted price is not lower than the price — Google treats that as a false discount.');
  if (p.maxPrice && p.maxPrice > 0 && p.maxPrice < p.price)
    warn('price', 'The MRP is lower than the selling price, which reads as a mistake.');

  if (!(p.category ?? '').trim()) block('category', 'No category, so this appears on no category page.');
  if (!(p.subcategory ?? '').trim()) block('subcategory', 'No subcategory, so this appears on none of your collection pages.');

  const apparel = isApparel(p.category, p.subcategory);
  const sizes = (p.sizes ?? []).filter(s => s && s.trim());
  const colours = (p.colours ?? []).filter(c => c && c.trim());

  if (sizes.length === 0) {
    if (apparel) block('sizes', 'No size set. Google will not approve clothing or footwear without one, and a shopper will not risk the order either.');
    else warn('sizes', 'No size set — not required for this kind of product.');
  }
  if (colours.length === 0) {
    if (apparel) block('colours', 'No colour set. Google requires a colour for every clothing and footwear product.');
    else warn('colours', 'No colour set — not required for this kind of product.');
  }

  if (!(p.sku ?? '').trim()) warn('sku', 'No SKU. Google uses it as the permanent id for this product.');
  if (!(p.hsnCode ?? '').trim()) warn('hsn', 'No HSN code, which the GST invoice needs.');

  return { blocking, warnings, passed: blocking.length === 0 };
}
