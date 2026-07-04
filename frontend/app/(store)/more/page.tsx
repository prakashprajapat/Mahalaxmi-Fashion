import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'More Products | Mahalaxmi Fashion Hub',
  description: 'Explore all our products & collections',
  alternates: { canonical: '/more' },
};

export default async function MoreProductsPage() {
  const { products } = await productsApi.getAll({ category: 'more', pageSize: 200 }).catch(() => ({ products: [] }));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Shop by Category</p>
        <h1>🛍️ More Products</h1>
        <p>Explore all our products & collections</p>
      </section>
      <CategoryPageContent products={products as any} category="More Products" icon="🛍️" desc="Explore all our products & collections" allHref="/products" />
    </>
  );
}
