// Google Merchant Center product feed (RSS 2.0 / Google Shopping format).
// Add this URL in Merchant Center → Products → Feeds → "Scheduled fetch":
//     https://www.mahalaxmifashionhub.com/product-feed.xml
// It regenerates live on every fetch, so newly added / edited products stay in sync.
// The same feed (via Merchant Center "free listings" linked to your Business Profile)
// also surfaces products on your Google Search + Google Maps listing.

import { productsApi } from '@/lib/api';
import { productSlug } from '@/lib/productSlug';
import { productImageSrc } from '@/lib/productImages';
import {
  isFeedable, variantsOf, googleCategoryOf, productTypeOf, genderOf, ageGroupOf,
} from '@/lib/merchantFeed';

export const dynamic = 'force-dynamic';

const BASE = 'https://www.mahalaxmifashionhub.com';
const BRAND = 'Mahalaxmi Fashion Hub';

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function genderFor(cat?: string): string {
  const c = (cat || '').toLowerCase();
  if (c.includes('women') || c.includes('girl')) return 'female';
  if (c.includes('men') || c.includes('boy')) return 'male';
  return '';
}

export async function GET() {
  let products: any[] = [];
  try {
    const res = await productsApi.getAll({ pageSize: 1000 });
    products = res.products ?? [];
  } catch {
    products = [];
  }

  // Shared across every product so a SKU used twice cannot produce two rows
  // with the same id, which Google rejects.
  const usedIds = new Set<string>();

  const items = products
    // Inactive and draft products were being sent to Google from this feed —
    // only the other one filtered them. A draft is a product held back because
    // Google would refuse it, so sending it anyway is asking for a disapproval.
    .filter((p: any) => isFeedable(p))
    .flatMap((p: any) => {
      const link = `${BASE}/products/${productSlug(p.name, p.dbId)}`;
      const img = productImageSrc(p.image);
      const imageLink = img ? (/^https?:/i.test(img) ? img : `${BASE}${img}`) : '';
      const avail = (p.stock ?? '').toLowerCase().includes('out') ? 'out_of_stock' : 'in_stock';
      const regular = Number(p.price) || 0;
      const sale = (p.discountPrice != null && Number(p.discountPrice) > 0 && Number(p.discountPrice) < regular)
        ? Number(p.discountPrice) : null;
      const desc = (p.description && String(p.description).trim()) ? String(p.description) : p.name;
      const variants = variantsOf(p, usedIds);

      // One row per size and colour, sharing an item_group_id. Google's size
      // and colour attributes take a single value each, so this is the only
      // shape in which a four-size nighty can be offered as four sizes.
      return variants.map(v => {
        let s = '<item>';
        s += `<g:id>${esc(v.id)}</g:id>`;
        if (variants.length > 1) s += `<g:item_group_id>${esc(v.itemGroupId)}</g:item_group_id>`;
        s += `<g:title>${esc(String(p.name).slice(0, 150))}</g:title>`;
        s += `<g:description>${esc(desc)}</g:description>`;
        s += `<g:link>${esc(link)}</g:link>`;
        if (imageLink) s += `<g:image_link>${esc(imageLink)}</g:image_link>`;
        s += `<g:availability>${avail}</g:availability>`;
        s += `<g:price>${regular.toFixed(2)} INR</g:price>`;
        if (sale != null) s += `<g:sale_price>${sale.toFixed(2)} INR</g:sale_price>`;
        s += `<g:brand>${esc(BRAND)}</g:brand>`;
        s += '<g:condition>new</g:condition>';
        s += '<g:identifier_exists>no</g:identifier_exists>';
        s += `<g:google_product_category>${esc(googleCategoryOf(p))}</g:google_product_category>`;
        const ptype = productTypeOf(p);
        if (ptype) s += `<g:product_type>${esc(ptype)}</g:product_type>`;
        // Required by Google for anything in Apparel & Accessories.
        if (v.size) s += `<g:size>${esc(v.size)}</g:size>`;
        if (v.colour) s += `<g:color>${esc(v.colour)}</g:color>`;
        s += `<g:gender>${genderOf(p)}</g:gender>`;
        s += `<g:age_group>${ageGroupOf(p)}</g:age_group>`;
        s += '</item>';
        return s;
      });
    })
    .join('');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">' +
    '<channel>' +
    `<title>${esc(BRAND)}</title>` +
    `<link>${BASE}</link>` +
    '<description>Product feed for Google Merchant Center</description>' +
    items +
    '</channel>' +
    '</rss>';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=1800',
    },
  });
}
