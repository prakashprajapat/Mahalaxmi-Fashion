import type { Metadata } from 'next';
import { productsApi, settingsApi } from '@/lib/api';
import ProductsClient from '@/components/products/ProductsClient';
import HomeHero from '@/components/home/HomeHero';
import OfferBanner from '@/components/home/OfferBanner';
import GoogleReviews from '@/components/reviews/GoogleReviews';
import FaqSection from '@/components/home/FaqSection';

// No searchParams = page is fully ISR-cached; 60s so new products appear quickly.
export const revalidate = 60;

// Homepage SEO — admin-editable from Settings → "SEO — Homepage & Google".
// Falls back to the site defaults (in layout.tsx) when a field is left blank.
export async function generateMetadata(): Promise<Metadata> {
  const res = await settingsApi.getAll().catch(() => ({ settings: {} as Record<string, string> }));
  const s = res.settings ?? {};
  const title = s.seoHomeTitle?.trim();
  const description = s.seoHomeDescription?.trim();
  const keywords = s.seoKeywords?.trim();
  const ogImage = s.seoOgImage?.trim();

  const meta: Metadata = {};
  if (title) meta.title = { absolute: title };
  if (description) meta.description = description;
  if (keywords) meta.keywords = keywords;
  if (title || description || ogImage) {
    meta.openGraph = {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    };
  }
  return meta;
}

export default async function HomePage() {
  const { products } = await productsApi.getAll({ pageSize: 200 }).catch(() => ({ products: [] as any[] }));

  return (
    <>
      {/* Hero + offer strip — shown on every device */}
      <HomeHero />
      <OfferBanner />

      {/* FULL, filterable product listing — ALL products, on desktop / tablet / mobile / app.
          (Previously the desktop home page showed only curated Best Sellers + New Arrivals;
          now the whole catalogue appears everywhere, like the category pages.) */}
      <ProductsClient products={products as any[]} title="" />

      {/* Desktop-only trust + SEO sections below the listing */}
      <div className="home-desktop">
        {/* Live Google rating + reviews (renders only once configured in admin Settings) */}
        <GoogleReviews />
        {/* SEO: FAQ rich results + AI Overviews (visible accordion + FAQPage schema) */}
        <FaqSection />
      </div>
    </>
  );
}
