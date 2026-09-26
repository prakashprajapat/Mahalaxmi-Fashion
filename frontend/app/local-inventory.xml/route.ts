// Google Merchant Center LOCAL product inventory feed.
//
// Tells Google which products are on the shelf in the Balotra shop, so they can
// show as available nearby on Search and Maps instead of reading "Missing local
// inventory data".
//
// Merchant Center → Data sources → Add local inventory → "Enter a link to your
// file":  https://www.mahalaxmifashionhub.com/local-inventory.xml
//
// Google joins a local inventory row to a product BY ID. That is the whole
// contract, and it is what broke: when the product feed started sending one row
// per size and colour — MFH1103-free-size-rose — to get apparel approved, this
// file was left sending the bare SKU, MFH1103. Almost nothing matched, and 282
// of 292 products reported missing local inventory. It now walks the same
// variants through the same helper, so every row in the product feed has a row
// here with the same id.

import { productsApi } from '@/lib/api';
import { isFeedable, variantsOf, inStoreOf, inStoreQtyOf } from '@/lib/merchantFeed';

export const dynamic = 'force-dynamic';

// The Business Profile store code for MAHALAXMI FASHION HUB (Balotra).
const STORE_CODE = '06755793204923870023';

const esc = (s: string) =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET() {
  let products: any[] = [];
  try {
    const res = await productsApi.getAll({ pageSize: 1000 });
    products = res.products ?? [];
  } catch {
    products = [];
  }

  // Shared across the whole feed, exactly as in the product feed: two products
  // with one SKU would otherwise claim the same id, and the ids here have to be
  // the ids there.
  const usedIds = new Set<string>();

  const items = products
    // Drafts are not on the website, so they are not in the product feed either;
    // a local row for a product Google does not have is a row it cannot join.
    .filter(p => isFeedable(p))
    .filter(p => (Number(p.price) || 0) > 0)
    // Only what is actually on the shelf. A product the shop sells online but
    // does not keep in Balotra has no row here, and the product feed tells
    // Google to stop expecting one.
    .filter(p => inStoreOf(p))
    .flatMap(p => {
      const outOfStock = String(p.stock ?? '').toLowerCase().includes('out');
      const qty = inStoreQtyOf(p);
      return variantsOf(p, usedIds).map(v =>
        '<item>'
        + `<g:store_code>${STORE_CODE}</g:store_code>`
        + `<g:id>${esc(v.id)}</g:id>`
        + `<g:availability>${outOfStock ? 'out_of_stock' : 'in_stock'}</g:availability>`
        // Only when the owner has entered a count. A guessed quantity is worse
        // than none: Google treats it as a promise about the shelf.
        + (qty !== null ? `<g:quantity>${qty}</g:quantity>` : '')
        + '</item>'
      );
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
