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
    <section style={{ padding: '.5rem 1rem 1.5rem' }}>
      <div style={{
        maxWidth: '1080px',
        margin: '0 auto',
        background: 'linear-gradient(135deg, rgba(167,53,77,.93) 0%, rgba(92,26,40,.95) 100%)',
        color: '#fff',
        borderRadius: '18px',
        padding: '1.6rem 2rem',
        boxShadow: '0 10px 34px rgba(167,53,77,.22)',
        border: '1px solid rgba(255,255,255,.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: hasButton ? 'space-between' : 'center',
        textAlign: hasButton ? 'left' : 'center',
        gap: '1.25rem',
        flexWrap: 'wrap',
      }}>
        <div style={{ maxWidth: hasButton ? '620px' : '100%' }}>
          <p style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.18em', opacity: .82, marginBottom: '.4rem', fontWeight: 600 }}>{offerEyebrow}</p>
          <h2 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.7rem)', fontWeight: 800, margin: '0 0 .45rem', lineHeight: 1.25 }}>{offerTitle}</h2>
          <p style={{ opacity: .88, fontSize: '.9rem', margin: 0, lineHeight: 1.5, maxWidth: hasButton ? '520px' : '620px', marginLeft: hasButton ? 0 : 'auto', marginRight: hasButton ? 0 : 'auto' }}>{offerText}</p>
        </div>
        {hasButton && (
          <Link href={offerButtonLink} style={{ background: '#fff', color: '#a7354d', fontWeight: 800, whiteSpace: 'nowrap', padding: '.7rem 1.7rem', borderRadius: '10px', textDecoration: 'none', flexShrink: 0, boxShadow: '0 4px 14px rgba(0,0,0,.18)' }}>
            {offerButtonLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
