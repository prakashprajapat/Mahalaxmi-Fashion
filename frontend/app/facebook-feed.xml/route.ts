import { productsApi } from '@/lib/api';
import { productSlug } from '@/lib/productSlug';
import { productImageSrc } from '@/lib/productImages';
import {
  isFeedable, variantsOf, productTypeOf, genderOf, ageGroupOf, googleCategoryOf,
} from '@/lib/merchantFeed';

// The Meta catalogue feed. Commerce Manager pulls this URL on a schedule to
// build the catalogue behind Instagram Shopping, the WhatsApp catalogue and
// Advantage+ catalogue ads, so a product edited on the site reaches all three
// on the next refresh.
//   Feed URL:  https://www.mahalaxmifashionhub.com/facebook-feed.xml
//
// Until now this file wrote its own rows and shipped one row per product with
// no colour, no size and no item_group_id — the exact gaps that were leaving
// products unapproved in Google Merchant Center, and Meta asks for the same
// things on apparel. The Google feed already had the fix, in lib/merchantFeed,
// so this one now uses it: one row per size and colour, ids that cannot
// collide, drafts left out.

const BASE = 'https://www.mahalaxmifashionhub.com';

export const revalidate = 3600; // rebuild hourly so new products show up quickly

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const absImage = (img?: string | null): string => {
  const src = productImageSrc(img ?? '');
  if (!src) return '';
  return /^https?:/i.test(src) ? src : `${BASE}${src}`;
};

export async function GET() {
  let products: any[] = [];
  try {
    const r = await productsApi.getAll({ pageSize: 1000 });
    products = r.products ?? [];
  } catch {
    products = [];
  }

  // Shared across the whole feed: two products with the same SKU would
  // otherwise produce rows with the same id, and Meta rejects the later one.
  const usedIds = new Set<string>();

  const items = products
    .filter(p => isFeedable(p))
    .flatMap(p => {
      const image = absImage(p.image);
      const price = Number(p.price) || 0;
      if (!image || !(price > 0)) return [];   // Meta needs both on every row

      const selling = p.discountPrice && p.discountPrice > 0 && p.discountPrice < price ? p.discountPrice : null;
      const outOfStock = String(p.stock || '').toLowerCase().includes('out of stock');
      const desc = (p.description
        || `${p.name} — quality-checked ${p.category || 'fashion'} from Mahalaxmi Fashion Hub. COD available, free shipping over rupees 999, pan-India delivery.`)
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4900);
      const link = `${BASE}/products/${productSlug(p.name, p.dbId)}`;
      const variants = variantsOf(p, usedIds);
      const ptype = productTypeOf(p);

      return variants.map(v => `  <item>
    <g:id>${esc(v.id)}</g:id>${variants.length > 1 ? `
    <g:item_group_id>${esc(v.itemGroupId)}</g:item_group_id>` : ''}
    <g:title>${esc(String(p.name).slice(0, 150))}</g:title>
    <g:description>${esc(desc)}</g:description>
    <g:link>${esc(link)}</g:link>
    <g:image_link>${esc(image)}</g:image_link>
    <g:availability>${outOfStock ? 'out of stock' : 'in stock'}</g:availability>
    <g:condition>new</g:condition>
    <g:price>${price.toFixed(2)} INR</g:price>${selling ? `
    <g:sale_price>${selling.toFixed(2)} INR</g:sale_price>` : ''}
    <g:brand>Mahalaxmi Fashion Hub</g:brand>
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
  <title>Mahalaxmi Fashion Hub — Product Feed</title>
  <link>${BASE}</link>
  <description>Cotton nighties, sarees, petticoats and family ethnic wear. COD, free shipping over rupees 999, pan-India delivery.</description>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
