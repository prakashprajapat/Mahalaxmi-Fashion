import Link from 'next/link';
import { reviewsApi } from '@/lib/api';
import { ReviewCard, MIN_TO_SHOW } from './ReviewCards';

// The homepage strip of real customer reviews.
//
// It hides itself until there are MIN_TO_SHOW of them. On the day this was
// written the whole catalogue had exactly one review — five stars, two words,
// no photo — and a "what our customers say" wall carrying one two-word review
// says less than no wall at all. Nothing needs changing when they arrive: the
// section turns itself on.

export default async function CustomerReviews() {
  let data: Awaited<ReturnType<typeof reviewsApi.recent>> | null = null;
  try {
    data = await reviewsApi.recent(8);
  } catch {
    return null;   // reviews are not worth failing a homepage over
  }

  const shown = (data?.reviews ?? []).slice(0, 4);
  if ((data?.total ?? 0) < MIN_TO_SHOW || shown.length === 0) return null;

  return (
    <section style={{ padding: 'clamp(2.5rem, 5vw, 4.5rem) 0 0' }}>
      <div style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: '0 var(--gutter)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.6rem' }}>
          <div>
            <span style={{ display: 'block', fontSize: '.68rem', letterSpacing: '.3em', textTransform: 'uppercase', color: '#8a7f76', fontWeight: 600 }}>
              In their words
            </span>
            <h2 style={{
              margin: '.5rem 0 0', fontFamily: 'var(--font-playfair), Georgia, serif',
              fontSize: 'clamp(1.5rem, 3vw, 2.3rem)', fontWeight: 500, color: '#1e1b19',
            }}>
              Customer reviews
            </h2>
          </div>
          <Link href="/customer-reviews" style={{
            fontSize: '.74rem', letterSpacing: '.14em', textTransform: 'uppercase',
            color: '#722f37', fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            Read all {data!.total}
          </Link>
        </div>

        <div className="rev-grid" style={{ display: 'grid', gap: 'clamp(.7rem, 1.6vw, 1.25rem)' }}>
          {shown.map(r => <ReviewCard key={r.id} r={r} />)}
        </div>
      </div>

      <style>{`
        .rev-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        @media (max-width: 1024px) { .rev-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 600px)  { .rev-grid { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  );
}
