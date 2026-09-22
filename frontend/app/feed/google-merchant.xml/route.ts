import { NextResponse } from 'next/server';
import { productSlug } from '@/lib/productSlug';
import {
  isFeedable, variantsOf, googleCategoryOf, productTypeOf, genderOf, ageGroupOf,
} from '@/lib/merchantFeed';

/**
 * Google Merchant Center product feed (RSS 2.0)
 * URL: https://www.mahalaxmifashionhub.com/feed/google-merchant.xml
 * Merchant Center → Products → Feeds → Scheduled fetch pe ye URL daalo.
 */

const BASE = 'https://www.mahalaxmifashionhub.com';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

export const revalidate = 3600; // regenerate hourly

interface FeedProduct {
  dbId: number;
  sku?: string;
  name: string;
  category?: string;
  subcategory?: string;
  price: number;
  discountPrice?: number;
  stock?: string;
  description?: string;
  image?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function absImage(src?: string): string {
  const v = src?.trim();
  if (!v) return `${BASE}/Logo.png`;
  if (/^https?:/i.test(v)) return v;
  return `${BASE}${v.startsWith('/') ? v : '/' + v.replace(/^\.?\//, '')}`;
}

function googleCategory(category?: string, subcategory?: string): string {
  const c = `${category ?? ''} ${subcategory ?? ''}`.toLowerCase();
  if (c.includes('nighty') || c.includes('night')) return 'Apparel & Accessories > Clothing > Sleepwear & Loungewear > Nightgowns';
  if (c.includes('saree') || c.includes('sari'))   return 'Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing > Saris & Lehengas';
  if (c.includes('petticoat'))                     return 'Apparel & Accessories > Clothing > Underwear & Socks > Petticoats & Pettipants';
  if (c.includes('kurti') || c.includes('kurta'))  return 'Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing';
  return 'Apparel & Accessories > Clothing';
}

export async function GET() {
  let products: FeedProduct[] = [];
  try {
    const res = await fetch(`${API_BASE}/products?pageSize=2000`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      products = data.products ?? [];
    }
  } catch { /* API down — empty feed, next revalidate retries */ }

  const items = products
    // Drafts are products the quality gate held back because Google would
    // refuse them; sending them anyway just collects disapprovals.
    .filter(p => isFeedable(p))
    .flatMap(p => {
      const selling = p.discountPrice && p.discountPrice < p.price ? p.discountPrice : null;
      const outOfStock = p.stock === 'Out of Stock';
      const desc = (p.description ?? p.name).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4900);
      const variants = variantsOf(p);
      const ptype = productTypeOf(p);

      // One row per size and colour, sharing an item_group_id — Google's size
      // and colour attributes hold one value each, and it requires both for
      // apparel. Their absence is what leaves products at "Limited".
      return variants.map(v => `  <item>
    <g:id>${esc(v.id)}</g:id>${variants.length > 1 ? `
    <g:item_group_id>${esc(v.itemGroupId)}</g:item_group_id>` : ''}
    <g:title>${esc(p.name.slice(0, 150))}</g:title>
    <g:description>${esc(desc)}</g:description>
    <g:link>${BASE}/products/${productSlug(p.name, p.dbId)}</g:link>
    <g:image_link>${esc(absImage(p.image))}</g:image_link>
    <g:availability>${outOfStock ? 'out_of_stock' : 'in_stock'}</g:availability>
    <g:price>${p.price.toFixed(2)} INR</g:price>${selling ? `
    <g:sale_price>${selling.toFixed(2)} INR</g:sale_price>` : ''}
    <g:condition>new</g:condition>
    <g:brand>Mahalaxmi Fashion Hub</g:brand>
    <g:identifier_exists>no</g:identifier_exists>
    <g:google_product_category>${esc(googleCategoryOf(p))}</g:google_product_category>${ptype ? `
    <g:product_type>${esc(ptype)}</g:product_type>` : ''}${v.size ? `
    <g:size>${esc(v.size)}</g:size>` : ''}${v.colour ? `
    <g:color>${esc(v.colour)}</g:color>` : ''}
    <g:gender>${genderOf(p)}</g:gender>
    <g:age_group>${ageGroupOf(p)}</g:age_group>
  </item>`);
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>Mahalaxmi Fashion Hub</title>
  <link>${BASE}</link>
  <description>Sarees, Nighties, Petticoats and more — Mahalaxmi Fashion Hub product feed</description>
${items}
</channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
