// Google Merchant Center product feed (RSS 2.0 / Google Shopping format).
// Add this URL in Merchant Center → Products → Feeds → "Scheduled fetch":
//     https://www.mahalaxmifashionhub.com/product-feed.xml
// It regenerates live on every fetch, so newly added / edited products stay in sync.
// The same feed (via Merchant Center "free listings" linked to your Business Profile)
// also surfaces products on your Google Search + Google Maps listing.

import { productsApi } from '@/lib/api';
import { productSlug } from '@/lib/productSlug';
import { productImageSrc } from '@/lib/productImages';

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

  const items = products
    .filter((p: any) => (Number(p.price) || 0) > 0)   // Google requires a positive price
    .map((p: any) => {
      const link = `${BASE}/products/${productSlug(p.name, p.dbId)}`;
      const img = productImageSrc(p.image);
      const imageLink = img ? (/^https?:/i.test(img) ? img : `${BASE}${img}`) : '';
      const avail = (p.stock ?? '').toLowerCase().includes('out') ? 'out_of_stock' : 'in_stock';
      const regular = Number(p.price) || 0;
      const sale = (p.discountPrice != null && Number(p.discountPrice) > 0 && Number(p.discountPrice) < regular)
        ? Number(p.discountPrice) : null;
      const desc = (p.description && String(p.description).trim()) ? String(p.description) : p.name;
      const gender = genderFor(p.category);

      let s = '<item>';
      s += `<g:id>${esc(String(p.sku || p.dbId))}</g:id>`;
      s += `<g:title>${esc(p.name)}</g:title>`;
      s += `<g:description>${esc(desc)}</g:description>`;
      s += `<g:link>${esc(link)}</g:link>`;
      if (imageLink) s += `<g:image_link>${esc(imageLink)}</g:image_link>`;
      s += `<g:availability>${avail}</g:availability>`;
      s += `<g:price>${regular.toFixed(2)} INR</g:price>`;
      if (sale != null) s += `<g:sale_price>${sale.toFixed(2)} INR</g:sale_price>`;
      s += `<g:brand>${esc(BRAND)}</g:brand>`;
      s += '<g:condition>new</g:condition>';
      s += '<g:identifier_exists>no</g:identifier_exists>';
      s += '<g:google_product_category>Apparel &amp; Accessories</g:google_product_category>';
      if (gender) s += `<g:gender>${gender}</g:gender>`;
      s += '<g:age_group>adult</g:age_group>';
      s += '</item>';
      return s;
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
