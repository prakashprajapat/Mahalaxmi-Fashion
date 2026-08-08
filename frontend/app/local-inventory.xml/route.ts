// Google Merchant Center LOCAL product inventory feed.
// Tells Google which products are available in the physical store (by store code),
// so items stop showing "Missing local inventory data" and can appear as
// in-store / available-nearby on Google Search & Maps.
//
// Add this URL in Merchant Center → Data sources → Add local inventory →
// "Enter a link to your file":
//     https://www.mahalaxmifashionhub.com/local-inventory.xml
//
// The product ids here match the main product feed (SKU / dbId), so Google links
// each inventory row to the right product. Regenerates live on every fetch.

import { productsApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

// The Business Profile store code for MAHALAXMI FASHION HUB (Balotra).
const STORE_CODE = '06755793204923870023';

export async function GET() {
  let products: any[] = [];
  try {
    const res = await productsApi.getAll({ pageSize: 1000 });
    products = res.products ?? [];
  } catch {
    products = [];
  }

  const items = products
    .filter((p: any) => (Number(p.price) || 0) > 0)
    .map((p: any) => {
      const avail = (p.stock ?? '').toLowerCase().includes('out') ? 'out_of_stock' : 'in_stock';
      let s = '<item>';
      s += `<g:store_code>${STORE_CODE}</g:store_code>`;
      s += `<g:id>${String(p.sku || p.dbId)}</g:id>`;
      s += `<g:availability>${avail}</g:availability>`;
      s += '</item>';
      return s;
    })
    .join('');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">' +
    '<channel>' +
    '<title>Mahalaxmi Fashion Hub — Local Inventory</title>' +
    '<link>https://www.mahalaxmifashionhub.com</link>' +
    '<description>Local (in-store) inventory feed for Google Merchant Center</description>' +
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
