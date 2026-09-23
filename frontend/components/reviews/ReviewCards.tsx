import Link from 'next/link';
import type { PublicReview } from '@/lib/api';

// One customer's review, as a card.
//
// The photograph leads, because that is what a shopper actually stops on: a
// picture of the thing as it arrived, taken at home, not in a studio. Under it
// the rating, the date, who wrote it, and their words — unedited.
//
// Nothing here is generated, averaged or rounded up. Where a customer attached
// no photo the product's own photo stands in, which is honest: it is the
// product they are talking about, not a picture pretending to be theirs.

export const MIN_TO_SHOW = 4;

export function Stars({ n }: { n: number }) {
  const full = Math.max(0, Math.min(5, Math.round(n)));
  return (
    <span aria-label={`${full} out of 5`} style={{ display: 'inline-flex', gap: 1 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <svg key={i} width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"
          fill={i < full ? '#e8a33d' : '#e2dbd6'}>
          <path d="M12 2.6l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.16l-5.7 3z" />
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
  const lead = photos[0] || r.productImage || '';
  const rest = photos.slice(1);
  const when = new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <article style={{
      background: '#fff', border: '1px solid #ece5e6', borderRadius: 14,
      overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      <div style={{ position: 'relative', aspectRatio: '1 / 1', background: '#f4efec' }}>
        {lead && (
          // A plain <img>: review photos are uploaded by customers to a path
          // next/image is not configured for, and the product fallback may be
          // any URL the catalogue holds.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lead} alt="" loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        {photos.length > 1 && (
          <span style={{
            position: 'absolute', right: 10, bottom: 10, background: 'rgba(30,27,25,.72)',
            color: '#fff', fontSize: '.7rem', fontWeight: 600, borderRadius: 20, padding: '3px 9px',
          }}>
            +{rest.length} photo{rest.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div style={{ padding: '.95rem 1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '.45rem', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
          <Stars n={r.rating} />
          <span style={{ fontSize: '.74rem', color: '#9a908a' }}>{when}</span>
        </div>

        <div style={{ fontSize: '.86rem', fontWeight: 700, color: '#1e1b19', letterSpacing: '.01em' }}>
          {r.customerName}
        </div>

        {r.productName && (
          <Link href={`/products/${r.productId}`} style={{ fontSize: '.86rem', fontWeight: 600, color: '#722f37', lineHeight: 1.35 }}>
            {r.productName}
          </Link>
        )}

        {r.text && (
          <p style={{ margin: 0, fontSize: '.88rem', lineHeight: 1.6, color: '#544c47' }}>{r.text}</p>
        )}
      </div>
    </article>
  );
}
