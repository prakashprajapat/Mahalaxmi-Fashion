import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';
import WomenCategoryMenu from '@/components/layout/WomenCategoryMenu';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Women | Mahalaxmi Fashion Hub',
  description: "Women's ethnic wear and fashion essentials",
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
      <WomenCategoryMenu />
      <CategoryPageContent products={products as any} category="Women" icon="👩" desc="Women's ethnic wear and fashion essentials" allHref="/products?category=women" />
    </>
  );
}
