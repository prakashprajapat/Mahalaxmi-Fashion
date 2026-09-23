import Link from 'next/link';
import { reviewsApi } from '@/lib/api';
import { MIN_TO_SHOW } from './ReviewCards';
import ReviewCarousel from './ReviewCarousel';

// The homepage review wall.
//
// It hides itself until there are MIN_TO_SHOW reviews. On the day this was
// written the whole catalogue had exactly one — five stars, two words, no
// photo — and a wall of customer praise carrying one two-word review says less
// than no wall at all. Nothing needs changing when they arrive: it turns itself
// on, and the carousel grows with them.

export default async function CustomerReviews() {
  let data: Awaited<ReturnType<typeof reviewsApi.recent>> | null = null;
  try {
    data = await reviewsApi.recent(40);
  } catch {
    return null;   // reviews are not worth failing a homepage over
  }

  const reviews = data?.reviews ?? [];
  if ((data?.total ?? 0) < MIN_TO_SHOW || reviews.length === 0) return null;

  return (
    <section style={{ padding: 'clamp(2.5rem, 5vw, 4.5rem) 0 0' }}>
      <div style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: '0 var(--gutter)' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.8rem' }}>
          <span style={{ display: 'block', fontSize: '.68rem', letterSpacing: '.3em', textTransform: 'uppercase', color: '#8a7f76', fontWeight: 600 }}>
            In their words
          </span>
          <h2 style={{
            margin: '.5rem 0 0', fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 500, color: '#1e1b19',
          }}>
            Customer reviews
          </h2>
        </div>

        <ReviewCarousel reviews={reviews} />

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link href="/customer-reviews" style={{
            fontSize: '.74rem', letterSpacing: '.14em', textTransform: 'uppercase',
            color: '#722f37', fontWeight: 600,
          }}>
            Read all {data!.total} reviews
          </Link>
        </div>
      </div>
    </section>
  );
}
