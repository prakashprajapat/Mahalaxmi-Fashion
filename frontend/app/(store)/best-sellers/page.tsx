import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Best Sellers | Mahalaxmi Fashion Hub',
  description: 'Shop best-selling sarees, nightwear, petticoats and fabrics from Mahalaxmi Fashion Hub.',
  alternates: { canonical: '/best-sellers' },
};

export default async function BestSellersPage() {
  const { products } = await productsApi.getAll({ bestSeller: true, pageSize: 200 }).catch(() => ({ products: [] }));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Curated Collection</p>
        <h1>⭐ Best Sellers</h1>
        <p>Most loved products — handpicked bestsellers</p>
      </section>
      <CategoryPageContent products={products as any} category="Best Sellers" icon="⭐" desc="Most loved products" allHref="/products?bestSeller=true" />
    </>
  );
}
