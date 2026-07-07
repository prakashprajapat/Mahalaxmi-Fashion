import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';
import CategorySeoBlock from '@/components/product/CategorySeoBlock';
import { CATEGORY_SEO } from '@/lib/categorySeo';

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: CATEGORY_SEO.women.title },
  description: CATEGORY_SEO.women.description,
  alternates: { canonical: '/women' },
};

export default async function WomenPage() {
  const { products } = await productsApi.getAll({ category: 'women', pageSize: 200 }).catch(() => ({ products: [] }));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Shop by Category</p>
        <h1>👩 Women</h1>
        <p>Women&apos;s ethnic wear and fashion essentials</p>
      </section>
      <CategoryPageContent products={products as any} category="Women" icon="👩" desc="Women's ethnic wear and fashion essentials" allHref="/products?category=women" />
      <CategorySeoBlock slug="women" />
    </>
  );
}
