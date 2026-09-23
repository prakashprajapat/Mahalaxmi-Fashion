import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';
import CategorySeoBlock from '@/components/product/CategorySeoBlock';
import { getCategorySeo } from '@/lib/seoContent';
import { toListingProducts } from '@/lib/listingProduct';

export const revalidate = 60;

// Read at request time, not baked in at build: the title and description are
// editable from Admin → Category Page Copy, and an edit that only appears
// after the next deploy is not really editable.
export async function generateMetadata(): Promise<Metadata> {
  const seo = (await getCategorySeo()).women;
  return {
    title: { absolute: seo.title },
    description: seo.description,
    alternates: { canonical: '/women' },
  };
}

export default async function WomenPage() {
  const { products } = await productsApi.getAll({ category: 'women', pageSize: 200 }).catch(() => ({ products: [] }));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Shop by Category</p>
        <h1>Women</h1>
        <p>Women&apos;s ethnic wear and fashion essentials</p>
      </section>
      <CategoryPageContent products={toListingProducts(products as any[]) as any} category="Women" icon="👩" desc="Women's ethnic wear and fashion essentials" allHref="/products?category=women" />
      <CategorySeoBlock slug="women" />
    </>
  );
}
