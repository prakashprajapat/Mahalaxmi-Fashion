import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Fabrics | Mahalaxmi Fashion Hub',
  description: 'Premium fabrics & cloth materials',
  alternates: { canonical: '/fabrics' },
};

export default async function FabricsPage() {
  const { products } = await productsApi.getAll({ category: 'fabrics', pageSize: 200 }).catch(() => ({ products: [] }));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Shop by Category</p>
        <h1>🧵 Fabrics</h1>
        <p>Premium fabrics & cloth materials</p>
      </section>
      <CategoryPageContent products={products as any} category="Fabrics" icon="🧵" desc="Premium fabrics & cloth materials" allHref="/products?category=fabrics" />
    </>
  );
}
