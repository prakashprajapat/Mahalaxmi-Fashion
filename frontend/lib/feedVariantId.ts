// Turn a Google feed row id back into the product, size and colour it names.
//
// Google's "Checkout" button sends people to a URL we give it with {id}
// replaced by the id of the row they were looking at — MFH1116-xs-rust, one row
// per size and colour. For that button to be worth having, the page it lands on
// has to put THAT size in THAT colour into the basket. A link that opens an
// empty basket is worse than no button, because the shopper came intending to
// pay.
//
// The id is not parsed. It is rebuilt.
//
// Splitting "MFH1116-xs-rust" on hyphens looks easy and is wrong: a SKU may
// contain a hyphen, so may a slugged size ("free-size") and so may a colour
// ("dark-navy"), and nothing in the string says where one ends. Worse, the feed
// appends the database id to an id that has already been used, so the same text
// can mean different things. So this runs the feed's own pipeline — same
// products, same order, same filter, same shared id set — and looks for the row
// whose id matches. Whatever the feed emitted, this finds; and when the feed's
// rules change, they change here too, because it is the same function.

import { isFeedable, variantsOf } from '@/lib/merchantFeed';
import type { Product } from '@/types';

export interface FeedVariantHit {
  product: Product;
  size?: string;
  colour?: string;
}

export async function resolveFeedVariant(feedId: string): Promise<FeedVariantHit | null> {
  const wanted = (feedId ?? '').trim();
  if (!wanted) return null;

  const { productsApi } = await import('@/lib/api');
  const res = await productsApi.getAll({ pageSize: 1000 }).catch(() => null);
  const products = (res?.products ?? []) as Product[];
  if (products.length === 0) return null;

  // The same set the feed passes through every product, so a collision here
  // resolves to the same row it resolved to there.
  const usedIds = new Set<string>();

  for (const p of products) {
    if (!isFeedable(p as never)) continue;
    for (const v of variantsOf(p as never, usedIds)) {
      if (v.id.toLowerCase() === wanted.toLowerCase()) {
        return { product: p, size: v.size, colour: v.colour };
      }
    }
  }

  // Not a variant row — but Google also sends the item_group_id in some places,
  // and a shopper may have edited the URL. A bare SKU still names a product,
  // and taking them to it beats an empty basket.
  const bySku = products.find(p => (p.sku ?? '').trim().toLowerCase() === wanted.toLowerCase());
  return bySku ? { product: bySku } : null;
}
