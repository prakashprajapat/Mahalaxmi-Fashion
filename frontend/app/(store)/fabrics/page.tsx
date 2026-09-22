import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';
import CategorySeoBlock from '@/components/product/CategorySeoBlock';
import { getCategorySeo } from '@/lib/seoContent';

export const revalidate = 60;

// Read at request time, not baked in at build: the title and description are
// editable from Admin → Category Page Copy, and an edit that only appears
// after the next deploy is not really editable.
export async function generateMetadata(): Promise<Metadata> {
  const seo = (await getCategorySeo()).fabrics;
  return {
    title: { absolute: seo.title },
    description: seo.description,
    alternates: { canonical: '/fabrics' },
  };
}

export default async function FabricsPage() {
  const { products } = await productsApi.getAll({ category: 'fabrics', pageSize: 200 }).catch(() => ({ products: [] }));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Shop by Category</p>
        <h1>Fabrics</h1>
        <p>Premium fabrics & cloth materials</p>
      </section>
      <CategoryPageContent products={products as any} category="Fabrics" icon="🧵" desc="Premium fabrics & cloth materials" allHref="/products?category=fabrics" />
      <CategorySeoBlock slug="fabrics" />
    </>
  );
}
