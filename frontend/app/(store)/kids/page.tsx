import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';
import CategorySeoBlock from '@/components/product/CategorySeoBlock';
import { CATEGORY_SEO } from '@/lib/categorySeo';

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: CATEGORY_SEO.kids.title },
  description: CATEGORY_SEO.kids.description,
  alternates: { canonical: '/kids' },
};

export default async function KidsPage() {
  const { products } = await productsApi.getAll({ category: 'kids', pageSize: 200 }).catch(() => ({ products: [] }));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Shop by Category</p>
        <h1>👶 Kids</h1>
        <p>Cute &amp; comfortable kids clothing</p>
      </section>
      <CategoryPageContent products={products as any} category="Kids" icon="👶" desc="Cute & comfortable kids clothing" allHref="/products?category=kids" />
      <CategorySeoBlock slug="kids" />
    </>
  );
}
