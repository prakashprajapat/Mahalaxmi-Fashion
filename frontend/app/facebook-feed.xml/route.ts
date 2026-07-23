import { productsApi } from '@/lib/api';
import { productSlug } from '@/lib/productSlug';
import { productImageSrc } from '@/lib/productImages';

// Meta / Facebook product feed (RSS 2.0 with the g: namespace). Meta Commerce Manager pulls
// this URL on a schedule to build/refresh the product catalogue, which then powers the
// WhatsApp Business catalogue. Because it reads live from the products API, adding or editing
// a product on the site automatically updates the WhatsApp catalogue on the next feed refresh.
//   Feed URL:  https://www.mahalaxmifashionhub.com/facebook-feed.xml

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

const sellingPrice = (p: any): number =>
  p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price ? p.discountPrice : p.price;

export async function GET() {
  let products: any[] = [];
  try {
    const r = await productsApi.getAll({ pageSize: 1000 });
    products = r.products ?? [];
  } catch {
    products = [];
  }

  const items = products
    .map((p) => {
      const img = productImageSrc(p.image);
      const price = sellingPrice(p);
      // Meta requires a valid image and a price > 0 for every item.
      if (!img || !(price > 0)) return '';

      const imageUrl = /^https?:/i.test(img) ? img : `${BASE}${img}`;
      const link = `${BASE}/products/${productSlug(p.name, p.dbId)}`;
      const outOfStock = (p.stock || '').toLowerCase().includes('out of stock');
      const id = (p.sku && String(p.sku).trim()) || String(p.dbId);
      const desc = (p.description
        || `${p.name} — quality-checked ${p.category || 'fashion'} from Mahalaxmi Fashion Hub. COD available, free shipping over rupees 999, pan-India delivery.`)
        .replace(/\s+/g, ' ').trim().slice(0, 4900);
      const hasSale = p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price;
      const regular = hasSale ? p.price : price;

      return `  <item>
    <g:id>${esc(id)}</g:id>
    <g:title>${esc(String(p.name).slice(0, 150))}</g:title>
    <g:description>${esc(desc)}</g:description>
    <g:link>${esc(link)}</g:link>
    <g:image_link>${esc(imageUrl)}</g:image_link>
    <g:availability>${outOfStock ? 'out of stock' : 'in stock'}</g:availability>
    <g:condition>new</g:condition>
    <g:price>${regular.toFixed(2)} INR</g:price>${hasSale ? `
    <g:sale_price>${price.toFixed(2)} INR</g:sale_price>` : ''}
    <g:brand>Mahalaxmi Fashion Hub</g:brand>
    <g:product_type>${esc(p.category || 'Fashion')}</g:product_type>
  </item>`;
    })
    .filter(Boolean)
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
