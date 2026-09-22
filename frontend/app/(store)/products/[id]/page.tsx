import { productsApi } from '@/lib/api';
import { parseProductId } from '@/lib/productSlug';
import type { Product } from '@/types';
import ProductDetail from './ProductDetail';

// Revalidate alongside the listing pages: a price or stock change shows up
// within the minute without rebuilding.
export const revalidate = 60;

/**
 * The product page is a server component whose only job is to have the product
 * in hand before the HTML leaves the server.
 *
 * It used to be the client component next door, which rendered the single word
 * "Loading…" until the browser had downloaded 155 KB of JavaScript, run it, and
 * come back from the API. On a phone that is seconds of a page that looks
 * completely unchanged — the header and footer are shared with the page you
 * tapped from, so nothing visibly happens at all. Shoppers read that as a
 * broken link, and it is also why the page had no heading a crawler could see.
 *
 * A failure here is not fatal: pass null and the client fetches as it always
 * did. layout.tsx is what decides a product does not exist, and 404s.
 */
export default async function ProductPage({ params }: { params: { id: string } }) {
  let product: Product | null = null;
  try {
    const id = parseProductId(params.id);
    if (id) product = (await productsApi.getById(id)).product ?? null;
  } catch {
    // The API is having a moment. Render the shell and let the browser retry.
  }

  // Keyed by the product so that moving from one product to another remounts
  // rather than re-rendering: without it the component keeps the first
  // product's state and shows it while the next one loads.
  return <ProductDetail key={params.id} params={params} initialProduct={product} />;
}
