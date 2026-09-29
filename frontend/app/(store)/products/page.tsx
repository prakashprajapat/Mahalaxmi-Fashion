import type { Metadata } from 'next';
import ProductsClient from '@/components/products/ProductsClient';
import { toListingProducts } from '@/lib/listingProduct';
import { fetchAllProducts } from '@/lib/adminPaged';

export const revalidate = 300;

interface Props {
  searchParams: { category?: string; subcategory?: string; q?: string; bestSeller?: string };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const label = searchParams.subcategory
    ? searchParams.subcategory
    : searchParams.category
      ? searchParams.category.charAt(0).toUpperCase() + searchParams.category.slice(1).replace(/-/g, ' ')
      : searchParams.bestSeller === 'true' ? 'Best Sellers' : 'All Products';

  const canonical = searchParams.category
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
  const products = await fetchAllProducts({
    category: searchParams.category,
    bestSeller: searchParams.bestSeller === 'true' ? true : undefined,
  }).catch(() => [] as any[]);

  const title = searchParams.subcategory
    ? searchParams.subcategory
    : searchParams.bestSeller === 'true'
      ? 'Best Sellers'
      : searchParams.category
        ? searchParams.category.charAt(0).toUpperCase() + searchParams.category.slice(1).replace(/-/g, ' ')
        : 'All Products';

  // Pre-filter by subcategory from URL if present (for SEO page loads)
  // Client component will then allow changing it without page reload
  return (
    <ProductsClient
      products={toListingProducts(products as any[])}
      title={title}
      initialQ={searchParams.q ?? ''}
      initialSubcat={searchParams.subcategory ?? ''}
    />
  );
}
