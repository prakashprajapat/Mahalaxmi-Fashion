import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { productsApi, settingsApi } from '@/lib/api';
import { BestSellersSection, NewArrivalsSection } from '@/components/home/HomeSections';
import OfferBanner from '@/components/home/OfferBanner';
import TrustStrip from '@/components/home/TrustStrip';

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
      {/* Hero */}
      <section className="home-hero">
        <Image
          className="home-hero-image"
          src="/hero-bannernew.webp"
          alt="Mahalaxmi Fashion Hub - Ethnic Wear for the Entire Family"
          width={1200}
          height={600}
          priority
          sizes="100vw"
          style={{ width: '100%', display: 'block', height: 'auto' }}
        />

        {/* Bottom-left text overlay — hidden on mobile via .home-hero-overlay CSS */}
        <div className="home-hero-overlay" style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
          pointerEvents: 'none',
        }}>
          {/* Headline (page H1 for SEO) — both lines same font & size */}
          <h1 style={{
            fontSize: 'clamp(1rem, 2.8vw, 2rem)',
            fontWeight: 800,
            color: '#fff',
            lineHeight: 1.2,
            textShadow: '0 2px 12px rgba(0,0,0,.55)',
            letterSpacing: '.01em',
            margin: 0,
          }}>
            <span style={{ display: 'block' }}>Every Look,</span>
            <span style={{ display: 'block' }}>A New Experience</span>
          </h1>

          {/* Sub-headline */}
          <p style={{
            fontSize: 'clamp(.6rem, 1.3vw, .88rem)',
            fontWeight: 600,
            color: 'rgba(255,255,255,.92)',
            margin: 0,
            letterSpacing: '.04em',
            textShadow: '0 1px 6px rgba(0,0,0,.45)',
          }}>
            Fashion for Every Generation
          </p>

          {/* Tagline */}
          <p style={{
            fontSize: 'clamp(.44rem, .95vw, .65rem)',
            color: 'rgba(255,255,255,.9)',
            margin: 0,
            lineHeight: 1.55,
            textShadow: '0 1px 5px rgba(0,0,0,.4)',
            fontWeight: 500,
          }}>
            Boutique feel &nbsp;•&nbsp; Honest support &nbsp;•&nbsp; Fast bulk WhatsApp ordering
          </p>

          {/* Service badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem' }}>
            {[
              { icon: '✨', label: 'Premium Edits' },
              { icon: '💬', label: 'WhatsApp Assistance' },
              { icon: '🔄', label: 'Return Support' },
            ].map(b => (
              <span key={b.label} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '.2rem',
                background: 'rgba(100,20,35,.6)',
                backdropFilter: 'blur(6px)',
                border: '1px solid rgba(255,255,255,.2)',
                color: '#fff',
                fontSize: 'clamp(.42rem, .9vw, .62rem)',
                fontWeight: 600,
                padding: '.15rem .5rem',
                borderRadius: '6px',
                textShadow: '0 1px 3px rgba(0,0,0,.3)',
              }}>
                <span>{b.icon}</span>
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {/* Transparent clickable area over the "SHOP NOW" button in the image (bottom-centre) */}
        <Link href="/best-sellers" aria-label="Shop Best Sellers" style={{
          position: 'absolute',
          left: '64%', right: '15%',
          bottom: '2%', height: '9%',
          display: 'block',
          cursor: 'pointer',
          zIndex: 2,
        }} />
      </section>

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
