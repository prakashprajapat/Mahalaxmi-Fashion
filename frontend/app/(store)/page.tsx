import Link from 'next/link';
import { productsApi, settingsApi } from '@/lib/api';
import { BestSellersSection, NewArrivalsSection } from '@/components/home/HomeSections';

// No searchParams = page is fully ISR-cached (served from cache, no DB call per request)
export const revalidate = 300;

export default async function HomePage() {
  const [{ products }, settings] = await Promise.all([
    productsApi.getAll({ pageSize: 200 }).catch(() => ({ products: [] as any[] })),
    settingsApi.getAll().catch(() => ({ settings: {} as Record<string, string> })),
  ]);

  const bestSellers = products.filter((p: any) => p.bestSeller);

  const s = settings.settings ?? {};
  const offerEnabled = s.offerEnabled === 'true';
  const offerEyebrow = s.offerEyebrow || 'Festival Offer';
  const offerTitle = s.offerTitle || 'Fresh festive deals are live now';
  const offerText = s.offerText || 'Update this banner anytime from the admin panel to promote discounts, launches, or special collections.';
  const offerButtonLabel = s.offerButtonLabel || 'Explore Offer';
  const offerButtonLink = s.offerButtonLink || '/products?bestSeller=true';

  return (
    <>
      {/* Hero */}
      <section className="home-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="home-hero-image"
          src="/hero-banner.webp"
          alt="Mahalaxmi Fashion Hub - Ethnic Wear for the Entire Family"
          width={1920}
          height={900}
          fetchPriority="high"
          loading="eager"
          decoding="sync"
          style={{ width: '100%', display: 'block', height: 'auto' }}
        />

        {/* Bottom-left text overlay — hidden on mobile via .home-hero-overlay CSS */}
        <div className="home-hero-overlay" style={{
          position: 'absolute',
          bottom: '6%',
          left: '3%',
          width: '52%',
          display: 'flex',
          flexDirection: 'column',
          gap: '.5rem',
          pointerEvents: 'none',
        }}>
          {/* Headline — both lines same font & size */}
          <div style={{
            fontSize: 'clamp(1rem, 2.8vw, 2rem)',
            fontWeight: 800,
            color: '#fff',
            lineHeight: 1.2,
            textShadow: '0 2px 12px rgba(0,0,0,.55)',
            letterSpacing: '.01em',
          }}>
            <div>Every Look,</div>
            <div>A New Experience</div>
          </div>

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

        {/* Transparent clickable area over the "SHOP NOW" button in the image (right side) */}
        <Link href="/best-sellers" aria-label="Shop Best Sellers" style={{
          position: 'absolute',
          left: '63%', right: '4%',
          bottom: '3%', height: '7%',
          display: 'block',
          cursor: 'pointer',
          zIndex: 2,
        }} />
      </section>

      {/* Dynamic Offer Banner */}
      {offerEnabled && (
        <section style={{ background: 'linear-gradient(135deg, #a7354d 0%, #5c1a28 100%)', color: '#fff', padding: '2rem 1.5rem' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.1em', opacity: .8, marginBottom: '.35rem' }}>{offerEyebrow}</p>
              <h2 style={{ fontSize: 'clamp(1.2rem, 3vw, 1.6rem)', fontWeight: 800, margin: '0 0 .5rem' }}>{offerTitle}</h2>
              <p style={{ opacity: .85, fontSize: '.9rem', maxWidth: '500px' }}>{offerText}</p>
            </div>
            <Link href={offerButtonLink} className="button" style={{ background: '#fff', color: '#a7354d', fontWeight: 700, whiteSpace: 'nowrap', padding: '.65rem 1.5rem', borderRadius: '8px', textDecoration: 'none', flexShrink: 0 }}>
              {offerButtonLabel}
            </Link>
          </div>
        </section>
      )}

      {/* Best Sellers — client component, sorts without page reload */}
      <BestSellersSection products={bestSellers} />

      {/* New Arrivals — client component */}
      <NewArrivalsSection products={products} />

      {/* Why Shop With Us */}
      <section style={{ background: '#fafafa', padding: '2rem 1.5rem', borderTop: '1px solid #eee' }}>
        <div className="section-wrap">
          <h2 className="section-heading" style={{ marginBottom: '1.25rem' }}>Why Customers Stay</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
            {[
              { icon: '🧵', title: 'Premium Fabrics', desc: 'Every piece curated for quality — festive & daily wear.' },
              { icon: '💬', title: 'WhatsApp Support', desc: 'Chat 1:1 before ordering — size, fabric, availability.' },
              { icon: '🚚', title: 'Fast Shipping', desc: 'Pan-India delivery with careful packing & tracking.' },
              { icon: '🔒', title: 'Secure Payment', desc: 'Encrypted checkout for safe & worry-free payments.' },
              { icon: '🔄', title: 'Easy Returns', desc: '7-day hassle-free return & exchange on all orders.' },
            ].map(f => (
              <div key={f.title} style={{ background: '#fff', borderRadius: '10px', padding: '1rem', border: '1px solid #eee' }}>
                <div style={{ fontSize: '1.7rem', marginBottom: '.5rem' }}>{f.icon}</div>
                <h3 style={{ fontWeight: 700, fontSize: '.92rem', marginBottom: '.3rem', color: '#1a1a1a' }}>{f.title}</h3>
                <p style={{ color: '#666', fontSize: '.8rem', lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </>
  );
}
