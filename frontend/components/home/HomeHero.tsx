import HeroMedia from '@/components/home/HeroMedia';
import TrustStrip from '@/components/home/TrustStrip';

// Elegant serif for the hero — matches the "Mahalaxmi" wordmark. Loaded via <link> in layout.tsx.
const HERO_FONT = "var(--font-playfair), Georgia, serif";

/* Home hero banner (no "Shop Now" CTA). Rendered between the filter chips and the
   product grid on mobile, and at the top of the desktop home. */
export default function HomeHero() {
  return (
    <>
      <section style={{
        position: 'relative',
        background: 'linear-gradient(180deg, #faf3e6 0%, #f3e6cb 100%)',
        padding: 'clamp(.75rem, 1.6vw, 1.15rem) 1.15rem',
      }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: '7px', border: '1.5px solid rgba(201,162,75,.55)', borderRadius: '12px', pointerEvents: 'none' }} />

        <div className="hero-grid" style={{
          maxWidth: 1180, margin: '0 auto', position: 'relative',
          display: 'grid', gridTemplateColumns: '1.25fr .75fr',
          gap: 'clamp(.75rem, 2.5vw, 1.75rem)', alignItems: 'center',
        }}>
          <div>
            <h1 className="hero-copy" style={{ fontFamily: HERO_FONT, fontSize: 'clamp(1.05rem, 2.7vw, 1.9rem)', fontWeight: 800, lineHeight: 1.25, color: '#5c1a28', margin: '0 0 .3rem' }}>
              Sarees, Nighty &amp; Ethnic Wear
            </h1>
            <p className="hero-copy" style={{ fontFamily: HERO_FONT, fontSize: 'clamp(1.05rem, 2.7vw, 1.9rem)', fontWeight: 600, lineHeight: 1.25, color: 'rgba(92,26,40,.8)', margin: '0 0 1rem' }}>
              Premium quality you can trust, thoughtfully crafted for every need.
            </p>

            <div className="hero-badges" style={{ display: 'flex', gap: 'clamp(.8rem, 2.5vw, 1.6rem)', flexWrap: 'wrap', marginTop: '1.1rem' }}>
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

          <HeroMedia />
        </div>
      </section>
      <style>{`
        .hero-copy { white-space: normal; }
        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Trust signals right below the hero (Secure Payment, Returns, Genuine, Delivery) */}
      <TrustStrip />
    </>
  );
}
