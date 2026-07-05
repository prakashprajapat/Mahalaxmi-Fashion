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
  const offerButtonLink = s.offerButtonLink || '/products?bestSeller=true';

  return (
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
  );
}
