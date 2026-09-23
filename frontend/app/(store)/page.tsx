import type { Metadata } from 'next';
import { productsApi, settingsApi } from '@/lib/api';
import HomeHero from '@/components/home/HomeHero';
import OfferBanner from '@/components/home/OfferBanner';
import CategoryTiles from '@/components/home/CategoryTiles';
import ProductEdit from '@/components/home/ProductEdit';
import GoogleReviews from '@/components/reviews/GoogleReviews';
import CustomerReviews from '@/components/reviews/CustomerReviews';
import FaqSection from '@/components/home/FaqSection';
import { toListingProducts } from '@/lib/listingProduct';

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
  const all = toListingProducts(products as any[]);

  // The homepage used to be the whole catalogue with a filter sidebar, which is
  // what a category page is for. It is a shop front now: where things are, then
  // two short runs of products, with the full filterable grid one tap away from
  // every one of them. Nothing is hidden — /products still holds all of it.
  const newest = [...all].sort((a, b) => b.dbId - a.dbId);
  const loved = all.filter(p => p.bestSeller);
  // If nothing is marked a best seller, fall back to what sells rather than
  // showing an empty band or, worse, repeating the row above.
  const mostLoved = (loved.length >= 4 ? loved : [...all].sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0)))
    .filter(p => !newest.slice(0, 4).some(n => n.dbId === p.dbId));

  return (
    <>
      {/* Hero + offer strip — shown on every device */}
      <HomeHero />
      <OfferBanner />

      <CategoryTiles products={all} />

      <ProductEdit
        eyebrow="The edit"
        title="New this week"
        products={newest}
        href="/products"
        hrefLabel={`See all ${all.length}`}
        priority
      />

      <ProductEdit
        eyebrow="Bought most often"
        title="Most loved"
        products={mostLoved}
        href="/best-sellers"
        hrefLabel="See all"
      />

      {/* Real customer reviews. Shows itself only once there are four of them —
          on a phone as well as on a desktop, which is where most of them are read. */}
      <CustomerReviews />

      {/* Desktop-only trust + SEO sections below the listing */}
      <div className="home-desktop" style={{ marginTop: 'clamp(2.5rem, 5vw, 4.5rem)' }}>
        {/* Live Google rating + reviews (renders only once configured in admin Settings) */}
        <GoogleReviews />
        {/* SEO: FAQ rich results + AI Overviews (visible accordion + FAQPage schema) */}
        <FaqSection />
      </div>
    </>
  );
}
