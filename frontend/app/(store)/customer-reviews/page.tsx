import type { Metadata } from 'next';
import Link from 'next/link';
import { reviewsApi } from '@/lib/api';
import { ReviewCard } from '@/components/reviews/ReviewCards';

// The public reviews page.
//
// The footer used to send people to /reviews, which is "My Reviews" — the page
// a signed-in customer writes a review on, after a delivery. A visitor clicking
// "Customer Reviews" landed on a sign-in wall or on "No delivered orders
// found". This is the page that link meant.

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Customer Reviews — Mahalaxmi Fashion Hub',
  description: 'What customers say about their orders from Mahalaxmi Fashion Hub — ratings, photos and reviews left after delivery.',
  alternates: { canonical: '/customer-reviews' },
};

export default async function CustomerReviewsPage() {
  let data: Awaited<ReturnType<typeof reviewsApi.recent>> | null = null;
  try {
    data = await reviewsApi.recent(100);
  } catch {
    data = null;
  }

  const reviews = data?.reviews ?? [];
  const total = data?.total ?? 0;

  return (
    <div style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: 'clamp(2rem, 4vw, 3.5rem) var(--gutter) 4rem' }}>
      <h1 style={{
        margin: 0, fontFamily: 'var(--font-playfair), Georgia, serif',
        fontSize: 'clamp(1.7rem, 3.4vw, 2.6rem)', fontWeight: 500, color: '#1e1b19',
      }}>
        Customer reviews
      </h1>
      <p style={{ margin: '.7rem 0 0', color: '#554c46', fontSize: '.95rem', maxWidth: '38rem', lineHeight: 1.7 }}>
        Every review here was left by a customer after their order was delivered. Nothing is written by us.
      </p>

      {reviews.length === 0 ? (
        <div style={{
          marginTop: '2rem', background: '#fff', border: '1px solid #ece5e6', borderRadius: 12,
          padding: 'clamp(1.5rem, 4vw, 2.5rem)', maxWidth: '38rem',
        }}>
          <p style={{ margin: 0, color: '#554c46', fontSize: '.95rem', lineHeight: 1.7 }}>
            No reviews have been published yet. If you have had an order delivered, yours can be the first —
            you can write one from <Link href="/reviews" style={{ color: '#722f37', fontWeight: 600 }}>My Reviews</Link>.
          </p>
        </div>
      ) : (
        <>
          <p style={{ margin: '1.5rem 0 1rem', fontSize: '.8rem', letterSpacing: '.12em', textTransform: 'uppercase', color: '#8a7f76', fontWeight: 600 }}>
            {total} {total === 1 ? 'review' : 'reviews'}
          </p>
          <div className="rev-page-grid" style={{ display: 'grid', gap: 'clamp(.7rem, 1.6vw, 1.25rem)' }}>
            {reviews.map(r => <ReviewCard key={r.id} r={r} />)}
          </div>
          <style>{`
            .rev-page-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            @media (max-width: 1024px) { .rev-page-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
            @media (max-width: 600px)  { .rev-page-grid { grid-template-columns: 1fr; } }
          `}</style>
        </>
      )}
    </div>
  );
}
