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
    sub: 'Comfortable daily-wear nighties in floral and fancy prints',
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
    sub: 'Two quality nighties at the best per-piece price — maximum savings',
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
    sub: 'Quality nightwear under ₹500 — with no compromise',
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
    sub: 'Comfortable cotton inskirts in the right colour for every saree',
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
    sub: 'All petticoat fabrics and colours in one place',
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
    sub: 'Beautiful sarees under ₹1000 — daily and light festive wear',
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
  'cotton-saree': {
    slug: 'cotton-saree',
    label: 'Cotton Sarees',
    title: 'Cotton Saree Online — Soft, Daily-Wear Sarees',
    description:
      'Shop pure cotton sarees online at Mahalaxmi Fashion Hub — soft, breathable and easy to drape for daily and office wear. Quality-checked, COD, pan-India delivery.',
    eyebrow: 'Saree Collection',
    h1: 'Cotton Sarees Online',
    sub: 'Soft, breathable cotton sarees for daily and office wear',
    intro: [
      'A good cotton saree is a wardrobe essential — light on the body, easy to manage all day and perfect for the Indian climate. Our cotton sarees are chosen for their soft feel, neat fall and clean finish, whether you want a plain everyday drape or a printed piece with a little character. Every saree is quality-checked before it leaves our store.',
      'We are based in Balotra, Rajasthan and ship pan-India with tracking. Want to see how a saree really falls before buying? Message us on WhatsApp for a quick video, and add a matching petticoat to the same order to save on shipping.',
    ],
    faqs: [
      { q: 'Are cotton sarees good for daily and office wear?', a: 'Yes — cotton is breathable, comfortable for long hours and easy to iron, which makes it ideal for daily, college and office wear.' },
      { q: 'Do cotton sarees come with a blouse piece?', a: 'It depends on the saree — the product page clearly mentions whether a blouse piece is included.' },
      { q: 'How do I care for a cotton saree?', a: 'Hand or machine wash in cold water with mild detergent and dry in shade. Light starching keeps the crispness and fall.' },
    ],
    category: 'saree',
    terms: ['cotton'],
  },
  'printed-saree': {
    slug: 'printed-saree',
    label: 'Printed Sarees',
    title: 'Printed Saree Online — Floral, Bandhani & More',
    description:
      'Shop printed sarees online — floral, bandhani, geometric and more in easy-to-drape fabrics at honest prices. Mahalaxmi Fashion Hub, Balotra. COD available.',
    eyebrow: 'Saree Collection',
    h1: 'Printed Sarees Online',
    sub: 'Floral, bandhani and modern prints in easy-drape fabrics',
    intro: [
      'Prints bring a saree to life. This collection brings together our printed sarees — from soft florals and classic bandhani to modern geometric patterns — in light, easy-to-drape fabrics that work for daily wear and light occasions alike. Each design is checked for print quality and fall before dispatch.',
      'Shipped pan-India with tracking from Balotra, Rajasthan, with COD available. Not sure a print will suit you? WhatsApp us and we\'ll send a live video of the saree before you order.',
    ],
    faqs: [
      { q: 'What fabrics are these printed sarees made from?', a: 'Mostly georgette, chiffon, cotton and art silk — light fabrics that drape easily and are comfortable for daily and festive wear.' },
      { q: 'Will the print colours fade after washing?', a: 'Our sarees are quality-checked for colour-fastness. Wash in cold water with mild detergent and dry in shade to keep the print vivid for longer.' },
      { q: 'Can I get a matching blouse or petticoat?', a: 'Many sarees include a blouse piece (mentioned on the product page), and you can add a matching cotton petticoat to the same order.' },
    ],
    category: 'saree',
    terms: ['print'],
  },
  'party-wear-saree': {
    slug: 'party-wear-saree',
    label: 'Party Wear Sarees',
    title: 'Party Wear Sarees Online — Festive & Designer',
    description:
      'Shop party wear & festive sarees online — georgette, silk and net designs with a rich fall. Quality-checked at Mahalaxmi Fashion Hub, Balotra. COD & pan-India delivery.',
    eyebrow: 'Festive Edit',
    h1: 'Party Wear Sarees Online',
    sub: 'Festive and designer sarees with a rich, graceful fall',
    intro: [
      'For weddings, festivals and celebrations, a saree with the right shine and fall makes all the difference. Our party wear edit features georgette, silk-blend and net sarees with graceful drape and detailing — pieces that photograph beautifully and feel special to wear, without a designer-store price tag.',
      'Every saree is quality-checked and shipped pan-India with tracking from Balotra, Rajasthan. Ordering for a specific date? Message us on WhatsApp and we\'ll confirm delivery timelines and send a live video of the saree.',
    ],
    faqs: [
      { q: 'Are these sarees suitable for weddings and receptions?', a: 'Yes — the party wear range is chosen for festive and wedding occasions, with richer fabrics, borders and detailing than daily-wear sarees.' },
      { q: 'Do party wear sarees include a blouse piece?', a: 'Most do — the product page mentions whether a blouse piece is included and its fabric.' },
      { q: 'Can you deliver before a specific festival or function?', a: 'In most pincodes, yes. WhatsApp us your delivery pincode and date and we\'ll confirm before you order.' },
    ],
    category: 'saree',
    terms: ['georgette', 'silk', 'party', 'festive', 'net', 'designer', 'embroider'],
  },
  'saree-under-500': {
    slug: 'saree-under-500',
    label: 'Sarees Under ₹500',
    title: 'Sarees Under ₹500 Online — Budget Daily Wear',
    description:
      'Sarees under ₹500 — light daily-wear drapes at honest prices, quality-checked before dispatch. Mahalaxmi Fashion Hub, Balotra. COD & pan-India delivery.',
    eyebrow: 'Budget Picks',
    h1: 'Sarees Under ₹500',
    sub: 'Light, easy daily-wear sarees at budget-friendly prices',
    intro: [
      'Looking for a simple, everyday saree that won\'t stretch the budget? This collection curates our best sarees under ₹500 — light, easy-to-manage drapes for daily and casual wear. Even at this price, every saree is quality-checked for fabric and fall before it ships.',
      'We ship pan-India with tracking from Balotra, Rajasthan, and COD is available. Buying a few? Orders above ₹999 ship free, so it\'s worth stocking up on your daily favourites.',
    ],
    faqs: [
      { q: 'Are sarees under ₹500 good quality?', a: 'These are simple daily-wear sarees in light fabrics. They\'re quality-checked for fall and finish, but are meant for everyday use rather than heavy festive occasions.' },
      { q: 'Is Cash on Delivery available on budget sarees?', a: 'Yes, COD is available across India, along with UPI, cards and net banking.' },
      { q: 'Can I combine several sarees for free shipping?', a: 'Yes — add multiple sarees to one order; shipping is free above ₹999.' },
    ],
    category: 'saree',
    maxPrice: 500,
  },
  'daily-wear-nighty': {
    slug: 'daily-wear-nighty',
    label: 'Daily Wear Nighty',
    title: 'Daily Wear Nighty for Women — Soft Everyday Comfort',
    description:
      'Shop soft daily-wear nighties for women — cotton and printed styles for everyday comfort. Mahalaxmi Fashion Hub, Balotra. COD, free shipping over ₹999.',
    eyebrow: 'Everyday Comfort',
    h1: 'Daily Wear Nighty for Women',
    sub: 'Soft, easy nighties made for everyday comfort',
    intro: [
      'A daily-wear nighty needs to be soft, breathable and completely fuss-free — something you reach for every single night. This collection brings together our most comfortable everyday nighties in cotton and cotton-blend fabrics, in simple solids and easy prints, all stitched for a relaxed full-length fit and checked for quality before dispatch.',
      'We ship pan-India with tracking from Balotra, Rajasthan, and delivery is free on orders above ₹999. Unsure about size? WhatsApp us your usual kurti or dress size and we\'ll help you pick.',
    ],
    faqs: [
      { q: 'Which fabric is best for a daily-wear nighty?', a: 'Cotton and cotton blends are best for daily wear — they\'re breathable, absorb sweat and stay soft wash after wash, which matters for something you wear every night.' },
      { q: 'What sizes are available?', a: 'Most daily-wear nighties come in a relaxed free-size or L–XXL fit. Check the product page, or WhatsApp us your size and we\'ll guide you.' },
      { q: 'Do you offer combo packs for daily wear?', a: 'Yes — we have nighty combo packs that are great value for daily rotation. Check our Nighty Combo Pack collection.' },
    ],
    category: 'nighty',
    terms: ['cotton', 'printed', 'regular', 'daily', 'hosiery'],
  },
};

export const COLLECTION_SLUGS = Object.keys(COLLECTIONS);
