import type { Metadata } from 'next';
import Link from 'next/link';
import { productsApi, settingsApi } from '@/lib/api';

// Elegant serif for the hero — close to the "Mahalaxmi" wordmark in the logo.
// Loaded via <link> in layout.tsx (runtime), so it never blocks the build.
const HERO_FONT = "'Playfair Display', Georgia, serif";
import { BestSellersSection, NewArrivalsSection } from '@/components/home/HomeSections';
import OfferBanner from '@/components/home/OfferBanner';
import TrustStrip from '@/components/home/TrustStrip';
import HeroMedia from '@/components/home/HeroMedia';

// No searchParams = page is fully ISR-cached (served from cache, no DB call per request)
export const revalidate = 300;

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
      {/* Hero — left copy + CTA, right admin-managed video (logo fallback) */}
      <section style={{
        position: 'relative',
        background: 'linear-gradient(180deg, #faf3e6 0%, #f3e6cb 100%)',
        padding: 'clamp(1.5rem, 3vw, 2.25rem) 1.5rem',
      }}>
        {/* thin decorative border frame */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: '10px', border: '1.5px solid rgba(122,10,34,.20)', borderRadius: '14px', pointerEvents: 'none' }} />

        <div className="hero-grid" style={{
          maxWidth: 1180, margin: '0 auto', position: 'relative',
          display: 'grid', gridTemplateColumns: '1.05fr 1fr',
          gap: 'clamp(1rem, 3vw, 2.25rem)', alignItems: 'center',
        }}>
          {/* Left: copy + CTA + trust */}
          <div>
            <h1 style={{ fontFamily: HERO_FONT, fontSize: 'clamp(1.6rem, 4vw, 2.6rem)', fontWeight: 800, lineHeight: 1.18, color: '#5c1a28', margin: '0 0 .45rem' }}>
              Premium Quality You Can Trust.
            </h1>
            <p style={{ fontFamily: HERO_FONT, fontSize: 'clamp(1.6rem, 4vw, 2.6rem)', fontWeight: 600, lineHeight: 1.18, color: 'rgba(92,26,40,.8)', margin: '0 0 1.1rem' }}>
              Thoughtfully Crafted for Every Need.
            </p>

            <Link href="/best-sellers" style={{ display: 'inline-block', background: '#7a0a22', color: '#fff', fontWeight: 800, fontSize: '1rem', letterSpacing: '.03em', padding: '.75rem 2.1rem', borderRadius: '10px', textDecoration: 'none', boxShadow: '0 6px 18px rgba(122,10,34,.28)' }}>
              Shop Now
            </Link>

            {/* Quality badges */}
            <div style={{ display: 'flex', gap: 'clamp(.8rem, 2.5vw, 1.6rem)', flexWrap: 'wrap', marginTop: '1.1rem' }}>
              {[
                { icon: '🏅', label: 'Premium Quality' },
                { icon: '🌿', label: 'Comfort Fabrics' },
                { icon: '🛍️', label: 'Trusted Shopping' },
              ].map(b => (
                <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', color: '#5c1a28' }}>
                  <span style={{ fontSize: '1.15rem' }} aria-hidden="true">{b.icon}</span>
                  <span style={{ fontSize: '.72rem', fontWeight: 700 }}>{b.label}</span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.24em', color: '#8a2a3e', fontWeight: 800, margin: '.7rem 0 0' }}>
              Tradition &nbsp;|&nbsp; Style &nbsp;|&nbsp; Quality
            </p>
          </div>

          {/* Right: admin video or logo fallback */}
          <HeroMedia />
        </div>
      </section>
      <style>{`@media (max-width: 768px) { .hero-grid { grid-template-columns: 1fr !important; } }`}</style>

      {/* Trust signals — payment, returns, authenticity, delivery */}
      <TrustStrip />

      {/* Dynamic Offer Banner — client-rendered so admin toggle reflects instantly */}
      <OfferBanner />

      {/* Best Sellers — simple preview grid */}
      <BestSellersSection products={bestSellers} />

      {/* New Arrivals — client component */}
      <NewArrivalsSection products={products} />
    </>
  );
}
