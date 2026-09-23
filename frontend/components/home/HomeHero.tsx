import Link from 'next/link';
import HeroMedia from '@/components/home/HeroMedia';
import TrustStrip from '@/components/home/TrustStrip';

// The first screen.
//
// It used to be a gold-bordered panel with three emoji badges and a
// "Tradition | Style | Quality" bar under the headline. All of that was work
// the headline was already doing, and emoji plus a decorative border is the
// look of a template rather than a shop. What is left is the sentence, one
// line under it, and one button — on a quiet ground, with the photograph
// carrying the colour.
//
// HeroMedia stays exactly as it is: the video and up to three photos are set
// in Admin → Settings → Homepage Hero, and that control is not something a
// redesign should take away.

const SERIF = 'var(--font-playfair), Georgia, serif';

export default function HomeHero() {
  return (
    <>
      <section className="hero-shell" style={{ background: '#f6f1ea' }}>
        <div className="hero-grid" style={{
          maxWidth: 'var(--shell)', margin: '0 auto',
          display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'stretch',
        }}>
          <div className="hero-copy-col" style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            gap: 'clamp(.7rem, 1.5vw, 1.3rem)',
            padding: 'clamp(2rem, 5vw, 4.5rem) clamp(1.25rem, 4vw, 4rem)',
          }}>
            <span style={{
              fontSize: '.66rem', letterSpacing: '.32em', textTransform: 'uppercase',
              color: '#8a7f76', fontWeight: 600,
            }}>
              Balotra, Rajasthan
            </span>

            <h1 style={{
              margin: 0, fontFamily: SERIF, fontWeight: 400,
              fontSize: 'clamp(1.9rem, 5vw, 4rem)', lineHeight: 1.06,
              letterSpacing: '-0.01em', color: '#1e1b19',
            }}>
              Every look,<br />a new experience
            </h1>

            <p style={{
              margin: 0, fontSize: 'clamp(.9rem, 1.4vw, 1.05rem)', lineHeight: 1.7,
              color: '#554c46', maxWidth: '26rem',
            }}>
              Discover quality fashion designed to make every moment special.
            </p>

            <Link href="/products" className="hero-cta" style={{
              alignSelf: 'flex-start', marginTop: '.4rem',
              padding: '1rem 2.4rem', background: '#1e1b19', color: '#fbf8f4',
              fontSize: '.72rem', letterSpacing: '.2em', textTransform: 'uppercase',
              fontWeight: 600, textDecoration: 'none',
            }}>
              Shop the new season
            </Link>
          </div>

          <div className="hero-media-col" style={{ display: 'flex' }}>
            <HeroMedia />
          </div>
        </div>
      </section>

      <style>{`
        .hero-media-col > * { width: 100%; }
        @media (max-width: 860px) {
          .hero-grid { grid-template-columns: 1fr; }
          .hero-media-col { order: -1; }
        }
      `}</style>

      <TrustStrip />
    </>
  );
}
