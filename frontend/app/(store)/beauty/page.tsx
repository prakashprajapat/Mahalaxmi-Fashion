import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Beauty | Mahalaxmi Fashion Hub',
  description: 'Beauty & personal care essentials',
  alternates: { canonical: '/beauty' },
};

export default async function BeautyPage() {
  const { products } = await productsApi.getAll({ category: 'beauty', pageSize: 200 }).catch(() => ({ products: [] }));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Shop by Category</p>
        <h1>💄 Beauty</h1>
        <p>Beauty & personal care essentials</p>
      </section>
      <CategoryPageContent products={products as any} category="Beauty" icon="💄" desc="Beauty & personal care essentials" allHref="/products?category=beauty" />
    </>
  );
}
