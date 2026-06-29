import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';
import CategoryMenu from '@/components/layout/CategoryMenu';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Men | Mahalaxmi Fashion Hub',
  description: "Men's fabric and ethnic wear",
  alternates: { canonical: '/men' },
};

export default async function MenPage() {
  const { products } = await productsApi.getAll({ category: 'men', pageSize: 200 }).catch(() => ({ products: [] }));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Shop by Category</p>
        <h1>👔 Men</h1>
        <p>Men&apos;s fabric and ethnic wear</p>
      </section>
      <CategoryMenu category="men" heading="Shop Men by Category" />
      <CategoryPageContent products={products as any} category="Men" icon="👔" desc="Men's fabric and ethnic wear" allHref="/products?category=men" />
    </>
  );
}
