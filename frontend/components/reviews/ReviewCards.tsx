import Link from 'next/link';
import type { PublicReview } from '@/lib/api';

// What a customer actually wrote, shown as they wrote it.
//
// Nothing here is generated, averaged or rounded up: each card is one approved
// review, its rating, its words, the photos that customer attached, and the
// product it was left on. If there is nothing to show, the caller shows nothing
// — an empty reviews wall is worse than no reviews wall, and inventing one is
// not on the table.

export const MIN_TO_SHOW = 4;

function Stars({ n }: { n: number }) {
  const full = Math.max(0, Math.min(5, Math.round(n)));
  return (
    <span aria-label={`${full} out of 5`} style={{ display: 'inline-flex', gap: 2 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"
          fill={i < full ? '#c9a24b' : 'none'} stroke={i < full ? '#c9a24b' : '#cfc5bd'} strokeWidth="1.5">
          <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z" />
        </svg>
      ))}
    </span>
  );
}

function photosOf(r: PublicReview): string[] {
  if (!r.imageUrls) return [];
  try {
    const v = JSON.parse(r.imageUrls);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 3) : [];
  } catch {
    return [];
  }
}

export function ReviewCard({ r }: { r: PublicReview }) {
  const photos = photosOf(r);
  const when = new Date(r.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  return (
    <article style={{
      background: '#fff', border: '1px solid #ece5e6', borderRadius: 12,
      padding: '1.1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '.6rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.6rem' }}>
        <Stars n={r.rating} />
        <span style={{ fontSize: '.74rem', color: '#9a908a' }}>{when}</span>
      </div>

      {r.text && (
        <p style={{ margin: 0, fontSize: '.92rem', lineHeight: 1.6, color: '#3a3330' }}>{r.text}</p>
      )}

      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: '.4rem' }}>
          {photos.map(src => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" loading="lazy"
              style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid #f0ebe8' }} />
          ))}
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '.5rem', borderTop: '1px solid #f4efec', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.6rem' }}>
        <span style={{ fontSize: '.82rem', fontWeight: 600, color: '#1e1b19' }}>{r.customerName}</span>
        {r.productName && (
          <Link href={`/products/${r.productId}`}
            style={{ fontSize: '.76rem', color: '#722f37', textAlign: 'right', maxWidth: '62%' }}>
            {r.productName}
          </Link>
        )}
      </div>
    </article>
  );
}
