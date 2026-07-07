import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';
import CategorySeoBlock from '@/components/product/CategorySeoBlock';
import { CATEGORY_SEO } from '@/lib/categorySeo';

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: CATEGORY_SEO.men.title },
  description: CATEGORY_SEO.men.description,
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
      <CategoryPageContent products={products as any} category="Men" icon="👔" desc="Men's fabric and ethnic wear" allHref="/products?category=men" />
      <CategorySeoBlock slug="men" />
    </>
  );
}
