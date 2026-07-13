import type { Product } from '@/types';

// ── Koskii-style SEO collection pages ────────────────────────────────────────
// Har collection = ek keyword-targeted landing page (/collections/<slug>) jo
// products ko naam/price/category se filter karti hai. Naya product add karte
// hi sahi collection me apne aap aa jata hai — koi manual tagging nahi.
//
// Nayi collection jodni ho to bas is file me ek entry add karo:
// page, sitemap, footer links sab apne aap update ho jate hain.

export interface CollectionDef {
  slug: string;
  /** <title> — keep under ~60 chars */
  title: string;
  /** meta description — keep under ~160 chars */
  description: string;
  eyebrow: string;
  h1: string;
  sub: string;
  /** on-page SEO copy (2 paragraphs) */
  intro: string[];
  faqs: { q: string; a: string }[];
  /** product filter */
  category: string;
  /** match if product name/description contains ANY of these (case-insensitive). Empty = all */
  terms?: string[];
  /** selling price (discountPrice ?? price) must be <= this */
  maxPrice?: number;
  /** footer/internal-link label */
  label: string;
}

const sellingPrice = (p: Product) =>
  p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price ? p.discountPrice : p.price;

export function matchesCollection(p: Product, def: CollectionDef): boolean {
  if (p.stock === 'Inactive') return false;
  if (def.maxPrice !== undefined && sellingPrice(p) > def.maxPrice) return false;
  if (def.terms && def.terms.length > 0) {
    const hay = `${p.name} ${p.subcategory ?? ''} ${p.description ?? ''}`.toLowerCase();
    return def.terms.some(t => hay.includes(t.toLowerCase()));
  }
  return true;
}

export const COLLECTIONS: Record<string, CollectionDef> = {
  'cotton-nighty': {
    slug: 'cotton-nighty',
    label: 'Cotton Nighty',
    title: 'Cotton Nighty for Women Online — Soft & Breathable',
    description:
      'Shop pure cotton nighties for women at Mahalaxmi Fashion Hub. Soft, breathable, full-length daily wear nighty at honest prices. Free shipping over ₹999.',
    eyebrow: 'Collection',
    h1: 'Cotton Nighty for Women',
    sub: 'Soft, breathable pure-cotton nighties for everyday comfort',
    intro: [
      'A cotton nighty is the most comfortable thing you can sleep in — especially in Indian summers. Our pure cotton and cotton-blend nighties are soft on the skin, breathable through the night, and stitched for a relaxed, full-length fit. From simple solids to floral prints, every piece is quality-checked before dispatch.',
      'We ship across India from Balotra, Rajasthan with tracking, and delivery is free on orders above ₹999. Confused about size or fabric? Message us on WhatsApp and we\'ll help you choose before you order.',
    ],
    faqs: [
      { q: 'Is pure cotton nighty good for summer?', a: 'Yes — cotton is breathable and absorbs sweat, which keeps you cool through the night. It\'s the most recommended nightwear fabric for Indian summers.' },
      { q: 'How do I choose the right nighty size?', a: 'Most of our nighties have a relaxed free-size or L-XXL fit. Check the size details on the product page, or WhatsApp us your usual kurti/dress size and we\'ll guide you.' },
      { q: 'How should I wash a cotton nighty?', a: 'Machine or hand wash in cold water with mild detergent, and dry in shade. This keeps the colour and softness intact for longer.' },
      { q: 'Do you offer Cash on Delivery?', a: 'Yes, COD is available across India along with UPI, cards and net banking. Free shipping applies on orders above ₹999.' },
    ],
    category: 'nighty',
    terms: ['cotton'],
  },
  'printed-nighty': {
    slug: 'printed-nighty',
    label: 'Printed Nighty',
    title: 'Printed Nighty for Women — Floral & Fancy Prints Online',
    description:
      'Beautiful printed nighties for women — floral and fancy prints in soft fabrics. Daily wear comfort from Mahalaxmi Fashion Hub. Free shipping over ₹999.',
    eyebrow: 'Collection',
    h1: 'Printed Nighty for Women',
    sub: 'Floral aur fancy prints me comfortable daily-wear nighties',
    intro: [
      'Printed nighties bring a little joy to bedtime — cheerful florals, classic butis and fancy all-over prints on soft, skin-friendly fabric. Each design in this collection is picked for print quality that survives regular washing without fading.',
      'Every piece is quality-checked before dispatch from our Balotra, Rajasthan store, and shipped pan-India with tracking. Want to see more photos of a print before ordering? WhatsApp us the product name and we\'ll send them.',
    ],
    faqs: [
      { q: 'Will the print fade after washing?', a: 'Our nighties use quality printed fabric. Wash in cold water, inside-out, and dry in shade — the print stays fresh for a long time.' },
      { q: 'Are printed nighties full length?', a: 'Most are full-length (ankle) with a relaxed fit. The exact length is mentioned on each product page.' },
      { q: 'Can I return if I don\'t like the print?', a: 'Eligible items can be returned or exchanged within 7 days. Please keep the parcel-opening video for any claim.' },
    ],
    category: 'nighty',
    terms: ['print'],
  },
  'nighty-combo-pack': {
    slug: 'nighty-combo-pack',
    label: 'Nighty Combo Packs',
    title: 'Nighty Combo Pack of 2 — Best Value Nightwear Online',
    description:
      'Save more with nighty combo packs — pack of 2 cotton nighties at value prices. Quality-checked daily wear from Mahalaxmi Fashion Hub. COD available.',
    eyebrow: 'Best Value',
    h1: 'Nighty Combo Packs (Pack of 2)',
    sub: 'Ek ke daam me do jaisi value — combo packs me sabse zyada bachat',
    intro: [
      'Combo packs are the smartest way to buy nightwear — you get two quality nighties at a much better per-piece price than buying separately. Perfect for daily rotation, gifting, or sharing with family. Each pack is quality-checked before dispatch.',
      'All combos ship pan-India from Balotra, Rajasthan with tracking and COD available. The photos show the exact designs you\'ll receive — what you see is what you get.',
    ],
    faqs: [
      { q: 'Do I get the exact designs shown in the photo?', a: 'Yes — the product photos show the exact pieces included in the pack. No random designs.' },
      { q: 'Why are combo packs cheaper?', a: 'Packing and shipping two pieces together costs us less, and we pass that saving to you — so the per-piece price drops.' },
      { q: 'Can I exchange one piece from a combo?', a: 'Returns and exchanges apply to the full pack. WhatsApp us within 7 days of delivery and we\'ll help you.' },
    ],
    category: 'nighty',
    terms: ['combo', 'pack of'],
  },
  'nighty-under-500': {
    slug: 'nighty-under-500',
    label: 'Nighty Under ₹500',
    title: 'Nighty Under ₹500 — Quality Nightwear at Budget Prices',
    description:
      'Shop quality nighties under ₹500 — soft cotton daily wear at honest budget prices. Quality-checked before dispatch. COD available across India.',
    eyebrow: 'Budget Picks',
    h1: 'Nighty Under ₹500',
    sub: '₹500 se kam me quality nightwear — bina compromise ke',
    intro: [
      'A good nighty doesn\'t have to be expensive. This collection brings together our best nightwear under ₹500 — soft fabrics, neat stitching and honest quality at a budget price. These are our most-ordered pieces for daily use.',
      'Every order is quality-checked before dispatch and shipped across India with tracking. Order above ₹999 (2-3 pieces) and shipping is free — which makes the value even better.',
    ],
    faqs: [
      { q: 'Is the quality good at this price?', a: 'Yes — budget price doesn\'t mean poor quality here. Every piece passes the same quality check as our premium range before dispatch.' },
      { q: 'How can I get free shipping?', a: 'Shipping is free on orders above ₹999 — most customers order 2-3 nighties together to qualify.' },
      { q: 'Is COD available?', a: 'Yes, Cash on Delivery is available across India, along with UPI and card payments.' },
    ],
    category: 'nighty',
    maxPrice: 500,
  },
  'night-gown': {
    slug: 'night-gown',
    label: 'Night Gowns',
    title: 'Night Gowns for Women Online — Comfortable Full Length',
    description:
      'Comfortable full-length night gowns for women in soft fabrics. Daily wear comfort from Mahalaxmi Fashion Hub, Balotra. Free shipping over ₹999.',
    eyebrow: 'Collection',
    h1: 'Night Gowns for Women',
    sub: 'Full-length, relaxed-fit gowns for all-night comfort',
    intro: [
      'A night gown gives you that extra-relaxed, flowy comfort — loose fit, full length and soft fabric that doesn\'t cling. Our gowns are chosen for breathable materials and neat stitching, so they look good and last long.',
      'We dispatch from Balotra, Rajasthan with pan-India tracked shipping. If you\'re between a nighty and a gown, WhatsApp us — we\'ll help you pick based on fabric and fit.',
    ],
    faqs: [
      { q: 'What is the difference between a nighty and a night gown?', a: 'A gown is typically looser and more flowy, while a nighty has a slightly more fitted cut. Both are full-length; it comes down to personal comfort.' },
      { q: 'Are these gowns suitable for summer?', a: 'Yes — most are cotton or breathable blends that stay comfortable in warm weather.' },
      { q: 'Do you have plus sizes?', a: 'Many gowns have a relaxed free-size fit that suits larger sizes too. Check the product page or WhatsApp us for exact measurements.' },
    ],
    category: 'nighty',
    terms: ['gown'],
  },
  'cotton-petticoat': {
    slug: 'cotton-petticoat',
    label: 'Cotton Petticoat',
    title: 'Cotton Petticoat for Saree Online — All Colours & Sizes',
    description:
      'Shop cotton petticoats for sarees — comfortable, durable inskirts in all essential colours. From Mahalaxmi Fashion Hub, Balotra. COD available.',
    eyebrow: 'Saree Essentials',
    h1: 'Cotton Petticoat for Saree',
    sub: 'Har saree ke liye sahi rang ka comfortable cotton inskirt',
    intro: [
      'A well-fitted cotton petticoat is the foundation of a perfect saree drape. Our petticoats are made from soft, durable cotton that stays comfortable all day, with sturdy stitching and drawstrings that last. Available in the essential colours every saree wardrobe needs.',
      'We ship across India from Balotra with tracking. Ordering a saree from us? Add a matching petticoat to the same order and save on shipping.',
    ],
    faqs: [
      { q: 'Which petticoat colour should I choose?', a: 'Match the petticoat to the dominant colour of your saree. For sheer sarees, an exact match matters more — WhatsApp us your saree photo and we\'ll suggest the right shade.' },
      { q: 'What length petticoat do I need?', a: 'Your petticoat should be about 1 inch shorter than your saree-wearing height. Standard lengths fit most; check the product page for details.' },
      { q: 'Is cotton better than satin for petticoats?', a: 'Cotton is more breathable and grips the saree better, making it ideal for daily and long wear. Satin gives more flow for special occasions.' },
    ],
    category: 'petticoat',
    terms: ['cotton'],
  },
  'saree-petticoat': {
    slug: 'saree-petticoat',
    label: 'All Petticoats',
    title: 'Saree Petticoats & Inskirts Online — Mahalaxmi Fashion Hub',
    description:
      'All saree petticoats & inskirts in one place — cotton and blended fabrics, all colours. Quality-checked, shipped pan-India from Balotra. COD available.',
    eyebrow: 'Saree Essentials',
    h1: 'Saree Petticoats & Inskirts',
    sub: 'Sabhi fabrics aur colours ke petticoat ek jagah',
    intro: [
      'Browse our complete petticoat range — cotton for daily comfort, blends for extra flow, and all the essential colours to pair with any saree. Every piece is checked for stitching quality and drawstring strength before dispatch.',
      'Based in Balotra, Rajasthan, we ship pan-India with tracking and COD. Buying multiple colours? Orders above ₹999 ship free.',
    ],
    faqs: [
      { q: 'Do you have all colours in stock?', a: 'We stock the essential saree-matching colours. If you need a specific shade, WhatsApp us and we\'ll confirm availability right away.' },
      { q: 'Can I buy petticoats in bulk?', a: 'Yes — for bulk or wholesale enquiries, message us on WhatsApp and we\'ll share special pricing.' },
      { q: 'What is the return policy?', a: 'Eligible items can be returned or exchanged within 7 days of delivery. Keep the parcel-opening video for claims.' },
    ],
    category: 'petticoat',
  },
  'saree-under-1000': {
    slug: 'saree-under-1000',
    label: 'Sarees Under ₹1000',
    title: 'Sarees Under ₹1000 Online — Daily & Festive Wear',
    description:
      'Beautiful sarees under ₹1000 — daily wear and light festive designs at honest prices. Quality-checked at Mahalaxmi Fashion Hub, Balotra. COD available.',
    eyebrow: 'Budget Picks',
    h1: 'Sarees Under ₹1000',
    sub: '₹1000 ke andar sundar sarees — daily aur light festive wear',
    intro: [
      'You don\'t need a big budget for a beautiful saree. This collection curates our best sarees under ₹1000 — everyday drapes, office wear and light festive pieces with good fall and finish. Each saree is quality-checked before it ships.',
      'We\'re a Balotra, Rajasthan based store shipping pan-India with tracking. Want to see the live fall of a saree? WhatsApp us and we\'ll send a video before you order.',
    ],
    faqs: [
      { q: 'Are these sarees good for gifting?', a: 'Yes — many customers order from this range for gifting. We pack every order carefully; mention "gift" in the order note for extra care.' },
      { q: 'Does the saree come with a blouse piece?', a: 'It varies by saree — the product page clearly mentions if a blouse piece is included.' },
      { q: 'What fabrics are available under ₹1000?', a: 'Mostly georgette, chiffon, cotton blends and art silk — light, easy-to-drape fabrics ideal for daily and light festive wear.' },
    ],
    category: 'saree',
    maxPrice: 1000,
  },
};

export const COLLECTION_SLUGS = Object.keys(COLLECTIONS);
