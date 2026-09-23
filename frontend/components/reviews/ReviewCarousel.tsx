'use client';
import { useEffect, useRef, useState } from 'react';
import type { PublicReview } from '@/lib/api';
import { ReviewCard } from './ReviewCards';

// Four cards at a time, with dots for the rest.
//
// A grid would show four reviews and stop; the point of a review wall is that
// there are many. It scrolls with the finger on a phone (the same track, one
// card wide) and the dots move with it, so the control and the content never
// disagree about where you are.

export default function ReviewCarousel({ reviews }: { reviews: PublicReview[] }) {
  const track = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);

  // How many cards fit is a CSS decision, so read it back rather than guessing.
  const measure = () => {
    const el = track.current;
    if (!el) return;
    const n = Math.max(1, Math.round(el.clientWidth / Math.max(1, el.scrollWidth / reviews.length)));
    setPages(Math.max(1, Math.ceil(reviews.length / n)));
    setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    const onScroll = () => setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => { el.removeEventListener('scroll', onScroll); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews.length]);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <>
      <div ref={track} className="rev-track">
        {reviews.map(r => (
          <div key={r.id} className="rev-slide">
            <ReviewCard r={r} />
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '.5rem', marginTop: '1.4rem' }}>
          {Array.from({ length: pages }).map((_, i) => (
            <button key={i} type="button" onClick={() => go(i)}
              aria-label={`Reviews, page ${i + 1} of ${pages}`}
              aria-current={i === page ? 'true' : undefined}
              style={{
                width: i === page ? 11 : 11, height: 11, borderRadius: '50%', padding: 0, cursor: 'pointer',
                background: i === page ? '#1e1b19' : 'transparent',
                border: `1.5px solid ${i === page ? '#1e1b19' : '#c8bdb6'}`,
              }} />
          ))}
        </div>
      )}

      <style>{`
        .rev-track {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: calc((100% - 3 * clamp(.7rem, 1.6vw, 1.25rem)) / 4);
          gap: clamp(.7rem, 1.6vw, 1.25rem);
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .rev-track::-webkit-scrollbar { display: none; }
        .rev-slide { scroll-snap-align: start; }
        @media (max-width: 1024px) {
          .rev-track { grid-auto-columns: calc((100% - clamp(.7rem, 1.6vw, 1.25rem)) / 2); }
        }
        @media (max-width: 600px) {
          .rev-track { grid-auto-columns: 78%; }
        }
      `}</style>
    </>
  );
}
