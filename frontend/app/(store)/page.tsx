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
      {/* Hero — pure CSS/text (no image → instant load) */}
      <section style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 22% 18%, #f5e6cc 0%, rgb(227,186,127) 52%, #d6a563 100%)',
        padding: 'clamp(2.75rem, 7vw, 5rem) 1.25rem',
      }}>
        {/* decorative soft circles */}
        <div aria-hidden="true" style={{ position: 'absolute', top: '-70px', right: '-50px', width: 240, height: 240, borderRadius: '50%', background: 'rgba(122,10,34,.08)' }} />
        <div aria-hidden="true" style={{ position: 'absolute', bottom: '-90px', left: '-60px', width: 280, height: 280, borderRadius: '50%', background: 'rgba(122,10,34,.06)' }} />

        <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative', textAlign: 'center' }}>
          <p style={{ fontSize: '.74rem', textTransform: 'uppercase', letterSpacing: '.28em', color: '#8a2a3e', fontWeight: 800, margin: '0 0 .7rem' }}>
            Tradition &nbsp;•&nbsp; Style &nbsp;•&nbsp; Quality
          </p>

          <h1 style={{ fontSize: 'clamp(1.9rem, 6vw, 3.4rem)', fontWeight: 800, lineHeight: 1.12, color: '#5c1a28', margin: '0 0 1rem', letterSpacing: '-.01em' }}>
            Ethnic Wear for the<br /><span style={{ color: '#7a0a22' }}>Entire Family</span>
          </h1>

          <p style={{ fontSize: 'clamp(.92rem, 2.2vw, 1.12rem)', color: 'rgba(92,26,40,.9)', maxWidth: 620, margin: '0 auto 1.6rem', lineHeight: 1.6, fontWeight: 500 }}>
            Designer sarees, daily nightwear, petticoats &amp; premium fabrics — curated with a boutique touch and delivered across India.
          </p>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
            <Link href="/best-sellers" style={{ background: '#7a0a22', color: '#fff', fontWeight: 800, fontSize: '1rem', padding: '.85rem 2.1rem', borderRadius: '10px', textDecoration: 'none', boxShadow: '0 6px 18px rgba(122,10,34,.28)' }}>
              🛍️ Shop Now
            </Link>
            <Link href="/women" style={{ background: 'rgba(255,255,255,.75)', color: '#5c1a28', fontWeight: 700, fontSize: '1rem', padding: '.85rem 1.8rem', borderRadius: '10px', textDecoration: 'none', border: '1.5px solid rgba(92,26,40,.35)' }}>
              Explore Collection
            </Link>
          </div>

          {/* Category quick-tiles */}
          <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { emoji: '🥻', label: 'Sarees', href: '/products?category=saree' },
              { emoji: '🌙', label: 'Nighty', href: '/products?category=nighty' },
              { emoji: '👗', label: 'Petticoat', href: '/products?category=petticoat' },
              { emoji: '🧵', label: 'Fabrics', href: '/fabrics' },
              { emoji: '👶', label: 'Kids', href: '/kids' },
            ].map(c => (
              <Link key={c.label} href={c.href} style={{
                display: 'inline-flex', alignItems: 'center', gap: '.4rem',
                background: 'rgba(255,255,255,.65)', border: '1px solid rgba(92,26,40,.18)',
                color: '#5c1a28', fontWeight: 700, fontSize: '.85rem',
                padding: '.5rem .95rem', borderRadius: '30px', textDecoration: 'none',
              }}>
                <span aria-hidden="true">{c.emoji}</span>{c.label}
              </Link>
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
