import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import CategoryPageContent from '@/components/product/CategoryPageContent';
import CategorySeoBlock from '@/components/product/CategorySeoBlock';
import { getCategorySeo } from '@/lib/seoContent';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
    // An empty page is not worth indexing, and a shop that ships empty pages
    // to Google teaches it to trust the rest of the domain less. This is
    // decided per request from the live catalogue, so the page comes back
    // into the index by itself the day it has stock — nothing to remember,
    // nothing to undo.
  const { products } = await productsApi
    .getAll({ category: 'kids', pageSize: 1 })
    .catch(() => ({ products: [] as any[] }));

  const seo = (await getCategorySeo()).kids;

  return {
    title: { absolute: seo.title },
    description: seo.description,
    alternates: { canonical: '/kids' },
    ...((products as any[]).length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function KidsPage() {
  const { products } = await productsApi.getAll({ category: 'kids', pageSize: 200 }).catch(() => ({ products: [] }));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Shop by Category</p>
        <h1>Kids</h1>
        <p>Cute &amp; comfortable kids clothing</p>
      </section>
      <CategoryPageContent products={products as any} category="Kids" icon="👶" desc="Cute & comfortable kids clothing" allHref="/products?category=kids" />
      <CategorySeoBlock slug="kids" />
    </>
  );
}
