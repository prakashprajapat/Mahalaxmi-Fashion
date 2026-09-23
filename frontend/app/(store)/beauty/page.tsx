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
  const seo = (await getCategorySeo()).beauty;
  return {
    title: { absolute: seo.title },
    description: seo.description,
    alternates: { canonical: '/beauty' },
  };
}

export default async function BeautyPage() {
  const { products } = await productsApi.getAll({ category: 'beauty', pageSize: 200 }).catch(() => ({ products: [] }));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Shop by Category</p>
        <h1>Beauty</h1>
        <p>Beauty & personal care essentials</p>
      </section>
      <CategoryPageContent products={toListingProducts(products as any[]) as any} category="Beauty" icon="💄" desc="Beauty & personal care essentials" allHref="/products?category=beauty" />
      <CategorySeoBlock slug="beauty" />
    </>
  );
}
