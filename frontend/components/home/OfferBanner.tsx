'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { settingsApi } from '@/lib/api';

// Client-rendered so that toggling the offer in the admin panel reflects on the
// storefront on the next page load — without waiting for the homepage's ISR cache.
//
// It used to be a flat slab of gold run edge to edge, square-cornered, sitting
// between the trust bar and Shop by Category like a strip pasted on from another
// website. The rest of the shop is maroon on cream; this was the one thing on the
// page that belonged to neither.
//
// Now it is a maroon card on the same cream the footer uses — rounded, inside the
// page's own width, with the gold kept as an accent on the eyebrow and the button
// instead of being the whole background. Same colours as the header, so the eye
// reads it as part of the shop rather than as an advert for one.
export default function OfferBanner() {
  const [s, setS] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    settingsApi.getAll().then(r => setS(r.settings ?? {})).catch(() => setS({}));
  }, []);

  if (!s || s.offerEnabled !== 'true') return null;

  const offerEyebrow = s.offerEyebrow || 'Festival Offer';
  const offerTitle = s.offerTitle || 'Fresh festive deals are live now';
  const offerText = s.offerText || 'Update this banner anytime from the admin panel to promote discounts, launches, or special collections.';
  const offerButtonLabel = s.offerButtonLabel || 'Explore Offer';

  // Only a real path or URL is used as the link. Anything else — a placeholder,
  // a note to self, a half-typed address — would be a 404, so it falls back to
  // the best sellers instead. It used to hide the button in that case, which
  // left a banner shouting about an offer with no way to reach it; a link that
  // certainly works beats no link at all.
  const rawLink = (s.offerButtonLink || '').trim();
  const offerButtonLink = /^(\/|https?:\/\/)/.test(rawLink) ? rawLink : '/products?bestSeller=true';

  const GOLD = '#e3ba7f';

  return (
    <section style={{ background: '#faf6f2', padding: '2rem 1rem' }}>
      <div
        style={{
          position: 'relative',
          maxWidth: 1180,
          margin: '0 auto',
          borderRadius: 18,
          overflow: 'hidden',
          background: 'linear-gradient(115deg, #5e2229 0%, #722f37 48%, #8a3a44 100%)',
          boxShadow: '0 10px 30px rgba(114,47,55,.18)',
        }}
      >
        {/* A soft disc of light at the top right, so the card has some depth
            without needing an image that would have to be designed and uploaded. */}
        <div aria-hidden="true" style={{
          position: 'absolute', top: '-55%', right: '-8%',
          width: 420, height: 420, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(227,186,127,.22) 0%, rgba(227,186,127,0) 70%)',
          pointerEvents: 'none',
        }} />

        <div className="mfh-offer-inner" style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.5rem',
          flexWrap: 'wrap',
          padding: '1.9rem 2rem',
        }}>
          <div style={{ minWidth: 0, flex: '1 1 420px' }}>
            <p style={{
              display: 'inline-flex', alignItems: 'center', gap: '.45rem',
              fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.16em',
              color: GOLD, margin: '0 0 .55rem', fontWeight: 800,
            }}>
              <span aria-hidden="true" style={{ width: 22, height: 2, background: GOLD, borderRadius: 2 }} />
              {offerEyebrow}
            </p>
            <h2 style={{
              fontSize: 'clamp(1.35rem, 3.2vw, 1.95rem)', fontWeight: 800,
              margin: '0 0 .5rem', lineHeight: 1.22, color: '#fff',
            }}>
              {offerTitle}
            </h2>
            <p style={{
              fontSize: '.92rem', margin: 0, lineHeight: 1.6,
              color: 'rgba(255,255,255,.86)', maxWidth: 560,
            }}>
              {offerText}
            </p>
          </div>

          <Link
            href={offerButtonLink}
            className="mfh-offer-btn"
            style={{
              background: GOLD, color: '#4a1f27', fontWeight: 800, fontSize: '.95rem',
              whiteSpace: 'nowrap', padding: '.85rem 2rem', borderRadius: 10,
              textDecoration: 'none', flexShrink: 0,
              boxShadow: '0 4px 14px rgba(0,0,0,.22)',
            }}
          >
            {offerButtonLabel}
          </Link>
        </div>
      </div>

      <style>{`
        .mfh-offer-btn:hover { filter: brightness(1.06); }
        @media (max-width: 680px) {
          .mfh-offer-inner { padding: 1.5rem 1.35rem !important; text-align: center; justify-content: center; }
          .mfh-offer-inner > div:first-of-type { flex: 1 1 100% !important; }
          .mfh-offer-inner p:first-of-type { justify-content: center; }
          .mfh-offer-inner p:last-of-type { margin-left: auto !important; margin-right: auto !important; }
          .mfh-offer-btn { width: 100%; text-align: center; }
        }
      `}</style>
    </section>
  );
}
