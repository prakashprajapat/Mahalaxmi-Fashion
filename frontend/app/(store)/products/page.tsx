import type { Metadata } from 'next';
import ProductsClient from '@/components/products/ProductsClient';
import { toListingProducts } from '@/lib/listingProduct';
import { fetchAllProducts } from '@/lib/adminPaged';

export const revalidate = 300;

interface Props {
  searchParams: { category?: string; subcategory?: string; q?: string; bestSeller?: string };
}

// ?subcategory= carries one name or several separated by commas. Several is how
// a homepage tile points at a group that has no curated collection page of its
// own — "Nightwear" is Cotton Nighty and Hosiery Nighty and Night Suit, not one
// subcategory and not the whole shop.
function subcategoriesFromQuery(value?: string): string[] {
  return (value ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

const normSub = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const subs = subcategoriesFromQuery(searchParams.subcategory);

  const label = subs.length > 0
    ? subs.join(' & ')
    : searchParams.category
      ? searchParams.category.charAt(0).toUpperCase() + searchParams.category.slice(1).replace(/-/g, ' ')
      : searchParams.bestSeller === 'true' ? 'Best Sellers' : 'All Products';

  // A subcategory listing is its own page, so it gets its own canonical. Pointing
  // it at /products told Google every tile was the same page and dropped them all
  // from the index.
  const canonical = subs.length > 0
    ? `/products?subcategory=${encodeURIComponent(subs.join(','))}`
    : searchParams.category
      ? `/${searchParams.category}`
      : searchParams.bestSeller === 'true'
        ? '/best-sellers'
        : '/products';

  // Internal search-result pages (?q=...) are thin/duplicate — keep them out of the
  // index so they don't dilute ranking, but still let Google follow the links.
  const isSearch = !!searchParams.q;

  return {
    title: searchParams.q
      ? `Search: ${searchParams.q}`
      : `${label}`,
    alternates: { canonical },
    ...(isSearch ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function ProductsPage({ searchParams }: Props) {
  // Server ek page me 100 se zyada nahi deta, isliye pageSize: 500 maangne par
  // bhi 103 me se sirf 100 aate the — listing par teen products kabhi dikhte hi
  // nahi the. Ab saare page padhe jaate hain.
  const all = await fetchAllProducts({
    category: searchParams.category,
    bestSeller: searchParams.bestSeller === 'true' ? true : undefined,
  }).catch(() => [] as any[]);

  const subs = subcategoriesFromQuery(searchParams.subcategory);

  // Several subcategories are narrowed here, on the server, so the shopper lands
  // on the group and the sidebar then offers only the subcategories inside it.
  // A single one is left to the client, where it stays a filter the shopper can
  // clear.
  const wanted = new Set(subs.map(normSub));
  const products = subs.length > 1
    ? (all as any[]).filter(p => wanted.has(normSub(p.subcategory ?? '')))
    : all;

  const title = subs.length > 0
    ? subs.join(' & ')
    : searchParams.bestSeller === 'true'
      ? 'Best Sellers'
      : searchParams.category
        ? searchParams.category.charAt(0).toUpperCase() + searchParams.category.slice(1).replace(/-/g, ' ')
        : 'All Products';

  return (
    <ProductsClient
      products={toListingProducts(products as any[])}
      title={title}
      initialQ={searchParams.q ?? ''}
      initialSubcat={subs.length === 1 ? subs[0] : ''}
    />
  );
}
