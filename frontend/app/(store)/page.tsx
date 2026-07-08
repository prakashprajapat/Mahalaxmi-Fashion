import type { Metadata } from 'next';
import Link from 'next/link';
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
      {/* Hero — banner-style composition in pure code (logo on top, no heavy photo) */}
      <section style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 50% 0%, #faf1de 0%, #f0dcb6 45%, rgb(227,186,127) 100%)',
        padding: 'clamp(2rem, 6vw, 3.75rem) 1.25rem',
      }}>
        {/* decorative border frame */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: '14px', border: '1.5px solid rgba(122,10,34,.22)', borderRadius: '14px', pointerEvents: 'none' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: '-70px', right: '-50px', width: 240, height: 240, borderRadius: '50%', background: 'rgba(122,10,34,.06)' }} />

        <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative', textAlign: 'center' }}>
          {/* Logo on top (Mahalaxmi Fashion Hub — the brand font lives in the logo) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp?v=4" alt="Mahalaxmi Fashion Hub" loading="eager"
            style={{ height: 'clamp(88px, 15vw, 140px)', width: 'auto', maxWidth: '90%', margin: '0 auto .5rem', display: 'block' }} />

          {/* Ornament divider */}
          <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.6rem', color: '#b98a3e', margin: '.2rem 0 1rem' }}>
            <span style={{ height: 1, width: 46, background: 'currentColor', opacity: .6 }} />
            <span style={{ fontSize: '.9rem' }}>✦</span>
            <span style={{ height: 1, width: 46, background: 'currentColor', opacity: .6 }} />
          </div>

          <h1 style={{ fontSize: 'clamp(1.5rem, 4.5vw, 2.5rem)', fontWeight: 800, lineHeight: 1.15, color: '#5c1a28', margin: '0 0 1.1rem' }}>
            Ethnic Wear for the <span style={{ color: '#7a0a22' }}>Entire Family</span>
          </h1>

          {/* Category icons */}
          <div style={{ display: 'flex', gap: 'clamp(.6rem, 3vw, 1.6rem)', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.1rem' }}>
            {[
              { emoji: '🥻', label: 'Sarees', href: '/products?category=saree' },
              { emoji: '🌙', label: 'Nighty', href: '/products?category=nighty' },
              { emoji: '👗', label: 'Petticoat', href: '/products?category=petticoat' },
              { emoji: '👔', label: 'Ethnic Wear', href: '/men' },
            ].map(c => (
              <Link key={c.label} href={c.href} style={{ textDecoration: 'none', color: '#5c1a28', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.25rem', minWidth: 66 }}>
                <span style={{ fontSize: '1.7rem', lineHeight: 1 }} aria-hidden="true">{c.emoji}</span>
                <span style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>{c.label}</span>
              </Link>
            ))}
          </div>

          <p style={{ fontSize: '.74rem', textTransform: 'uppercase', letterSpacing: '.26em', color: '#8a2a3e', fontWeight: 800, margin: '0 0 1.2rem' }}>
            Tradition &nbsp;|&nbsp; Style &nbsp;|&nbsp; Quality
          </p>

          {/* Shop Now */}
          <Link href="/best-sellers" style={{ display: 'inline-block', background: '#7a0a22', color: '#fff', fontWeight: 800, fontSize: '1.02rem', letterSpacing: '.04em', padding: '.85rem 2.6rem', borderRadius: '10px', textDecoration: 'none', boxShadow: '0 6px 18px rgba(122,10,34,.3)' }}>
            SHOP NOW
          </Link>

          {/* Quality badges */}
          <div style={{ display: 'flex', gap: 'clamp(.8rem, 4vw, 2.2rem)', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.6rem' }}>
            {[
              { icon: '🏅', label: 'Premium Quality' },
              { icon: '🌿', label: 'Comfort Fabrics' },
              { icon: '🛍️', label: 'Trusted Shopping' },
            ].map(b => (
              <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.3rem', color: '#5c1a28' }}>
                <span style={{ fontSize: '1.4rem' }} aria-hidden="true">{b.icon}</span>
                <span style={{ fontSize: '.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
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
