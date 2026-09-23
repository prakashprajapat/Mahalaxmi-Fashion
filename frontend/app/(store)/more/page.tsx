import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';
import { toListingProducts } from '@/lib/listingProduct';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
    // An empty page is not worth indexing, and a shop that ships empty pages
    // to Google teaches it to trust the rest of the domain less. This is
    // decided per request from the live catalogue, so the page comes back
    // into the index by itself the day it has stock — nothing to remember,
    // nothing to undo.
  const { products } = await productsApi
    .getAll({ category: 'more', pageSize: 1 })
    .catch(() => ({ products: [] as any[] }));

  return {
    title: 'More Products',
    description: 'Explore all our products & collections',
    alternates: { canonical: '/more' },
    ...((products as any[]).length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function MoreProductsPage() {
  const { products } = await productsApi.getAll({ category: 'more', pageSize: 200 }).catch(() => ({ products: [] }));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Shop by Category</p>
        <h1>More Products</h1>
        <p>Explore all our products & collections</p>
      </section>
      <CategoryPageContent products={toListingProducts(products as any[]) as any} category="More Products" icon="🛍️" desc="Explore all our products & collections" allHref="/products" />
    </>
  );
}
