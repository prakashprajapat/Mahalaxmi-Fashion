import type { Metadata } from 'next';
import { productsApi, settingsApi } from '@/lib/api';
import { BestSellersSection, NewArrivalsSection } from '@/components/home/HomeSections';
import ProductsClient from '@/components/products/ProductsClient';
import HomeHero from '@/components/home/HomeHero';
import OfferBanner from '@/components/home/OfferBanner';
import TrustStrip from '@/components/home/TrustStrip';
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

  const bestSellers = products.filter((p: any) => p.bestSeller);

  return (
    <>
      {/* Mobile: header chips → hero banner → products. The hero is injected between the
          filter chips and the product grid via ProductsClient's `banner` slot. */}
      <div className="home-listing">
        <ProductsClient products={products as any[]} title="" banner={<HomeHero />} />
      </div>

      {/* Desktop-only sections below (hidden on mobile): hero at top, then curated sections */}
      <div className="home-desktop">
      <HomeHero />
      {/* Trust signals — payment, returns, authenticity, delivery */}
      <TrustStrip />

      {/* Dynamic Offer Banner — client-rendered so admin toggle reflects instantly */}
      <OfferBanner />

      {/* Best Sellers — simple preview grid */}
      <BestSellersSection products={bestSellers} />

      {/* New Arrivals — client component */}
      <NewArrivalsSection products={products} />

      {/* Live Google rating + reviews (trust signal). Renders only once configured
          in admin Settings (googlePlaceId + googlePlacesApiKey). */}
      <GoogleReviews />

      {/* SEO: FAQ rich results + AI Overviews (visible accordion + FAQPage schema) */}
      <FaqSection />
      </div>{/* /home-desktop */}
    </>
  );
}
