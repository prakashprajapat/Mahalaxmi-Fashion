'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { settingsApi } from '@/lib/api';

// Client-rendered so that toggling the offer in the admin panel reflects on the
// storefront on the next page load — without waiting for the homepage's ISR cache.
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

  // Only allow a real path/URL as the button link. If admin left a placeholder or
  // invalid value, the button is hidden (so it never leads to a 404).
  const rawLink = (s.offerButtonLink || '').trim();
  const offerButtonLink = rawLink === ''
    ? '/products?bestSeller=true'
    : (/^(\/|https?:\/\/)/.test(rawLink) ? rawLink : '');

  const hasButton = !!offerButtonLink;

  return (
    <section style={{ background: 'rgb(227,186,127)', padding: '1.6rem 1.5rem' }}>
      <div style={{
        maxWidth: '1080px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: hasButton ? 'space-between' : 'center',
        textAlign: hasButton ? 'left' : 'center',
        gap: '1.25rem',
        flexWrap: 'wrap',
      }}>
        <div style={{ maxWidth: hasButton ? '620px' : '100%' }}>
          <p style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.18em', color: '#8a2a3e', marginBottom: '.4rem', fontWeight: 700 }}>{offerEyebrow}</p>
          <h2 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.7rem)', fontWeight: 800, margin: '0 0 .45rem', lineHeight: 1.25, color: '#5c1a28' }}>{offerTitle}</h2>
          <p style={{ fontSize: '.9rem', margin: 0, lineHeight: 1.5, color: 'rgba(92,26,40,.85)', maxWidth: hasButton ? '520px' : '620px', marginLeft: hasButton ? 0 : 'auto', marginRight: hasButton ? 0 : 'auto' }}>{offerText}</p>
        </div>
        {hasButton && (
          <Link href={offerButtonLink} style={{ background: '#7a0a22', color: '#fff', fontWeight: 800, whiteSpace: 'nowrap', padding: '.7rem 1.7rem', borderRadius: '10px', textDecoration: 'none', flexShrink: 0, boxShadow: '0 4px 14px rgba(0,0,0,.18)' }}>
            {offerButtonLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
