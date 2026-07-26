'use client';

import { useEffect, useState } from 'react';

// Shows the store's live Google rating + latest Google reviews as a trust section.
// Data comes from the backend (/api/google-reviews), which reads the Google Place ID +
// API key from admin Settings and calls the Places API server-side. If it's not configured
// yet (no key/place id) or there are no reviews, the whole section renders nothing — so it's
// safe to ship before setup is done.

const MAROON = '#7a0a22';
const GOLD = '#f5a623';

type Review = {
  author: string;
  profilePhoto?: string | null;
  rating: number;
  text: string;
  relativeTime: string;
};

type Payload = {
  configured?: boolean;
  placeId?: string | null;
  rating?: number | null;
  total?: number;
  reviews?: Review[];
};

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <span aria-label={`${value} out of 5`} style={{ color: GOLD, fontSize: size, letterSpacing: '1px', lineHeight: 1 }}>
      {'★★★★★'.slice(0, full)}
      <span style={{ color: '#dcdcdc' }}>{'★★★★★'.slice(full)}</span>
    </span>
  );
}

export default function GoogleReviews() {
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/google-reviews')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const reviews = (data?.reviews ?? []).filter((r) => r.text && r.text.trim().length > 0);
  if (!data || data.configured === false || reviews.length === 0) return null;

  const rating = data.rating ?? 0;
  const total = data.total ?? 0;
  const writeUrl = data.placeId
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(data.placeId)}`
    : undefined;

  return (
    <section style={{ background: '#fff', borderTop: '1px solid #f0e6e9', padding: '2.25rem 1.15rem' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {/* Header: Google logo mark + overall rating */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.9rem', flexWrap: 'wrap', marginBottom: '1.4rem' }}>
          <svg width="26" height="26" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
            <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46z" />
            <path fill="#FBBC05" d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
            <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.94 4.34 14.12l7.35 5.7C13.42 14.62 18.27 10.75 24 10.75z" />
          </svg>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '1.5rem', color: '#1a1a1a' }}>{rating.toFixed(1)}</strong>
            <Stars value={rating} size={20} />
            {total > 0 && (
              <span style={{ color: '#666', fontSize: '.9rem' }}>
                {total.toLocaleString('en-IN')} Google reviews
              </span>
            )}
          </div>
        </div>

        <h2 style={{ textAlign: 'center', fontSize: '1.15rem', fontWeight: 800, color: MAROON, margin: '0 0 1.3rem' }}>
          What our customers say
        </h2>

        {/* Review cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {reviews.slice(0, 6).map((rev, i) => (
            <div key={i} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: '14px', padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                {rev.profilePhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rev.profilePhoto} alt="" width={38} height={38} style={{ borderRadius: '50%' }} referrerPolicy="no-referrer" />
                ) : (
                  <span style={{ width: 38, height: 38, borderRadius: '50%', background: MAROON, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>
                    {(rev.author || 'G').charAt(0).toUpperCase()}
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {rev.author || 'Google user'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                    <Stars value={rev.rating} size={13} />
                    <span style={{ color: '#999', fontSize: '.72rem' }}>{rev.relativeTime}</span>
                  </div>
                </div>
              </div>
              <p style={{ color: '#555', fontSize: '.86rem', lineHeight: 1.55, margin: 0, display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {rev.text}
              </p>
            </div>
          ))}
        </div>

        {writeUrl && (
          <div style={{ textAlign: 'center', marginTop: '1.4rem' }}>
            <a href={writeUrl} target="_blank" rel="noopener noreferrer"
               style={{ display: 'inline-block', background: MAROON, color: '#fff', fontWeight: 700, fontSize: '.9rem', padding: '.6rem 1.4rem', borderRadius: '999px', textDecoration: 'none' }}>
              Write a review on Google
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
