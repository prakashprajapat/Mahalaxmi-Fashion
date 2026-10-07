'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Reel } from '@/lib/instagramReels';

// The homepage's Instagram strip: the clothes on a person, in a room, in real
// light.
//
// Every other photograph on this site is the garment laid flat or on a stand,
// which answers what it is and not what it looks like worn. That gap is the one
// thing a shopper cannot close from a product page, and it is the reason for the
// commonest return we take: it arrived, and it did not look like the picture.
// The shop's own line is जो दिखता है, वही पहुँचता है - this section is where that
// line is either demonstrated or not.
//
// Three things in here are load-bearing, and all three are about a phone on a
// patchy connection:
//
//   preload="none"   - nothing is fetched until a tile is actually looked at.
//                      Six reels eagerly preloading is several megabytes spent
//                      before the shopper has scrolled past the first product.
//   the poster       - so the tile is a finished picture from the first paint,
//                      whether or not its video ever arrives.
//   play on sight    - the observer starts the one tile on screen and pauses
//                      the rest. Six videos playing at once is six decoders,
//                      and on a mid-range phone that is where the page starts
//                      to stutter.
//
// Reduced motion and Save-Data are both honoured by simply not starting
// anything: the strip becomes a row of stills, which is a complete section and
// not a broken one.

export default function InstagramReels({
  reels,
  handle,
  profileUrl,
}: {
  reels: Reel[];
  handle: string;
  profileUrl: string;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const videos = Array.from(strip.querySelectorAll('video'));
    if (videos.length === 0) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduced || saveData) return;

    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) {
            // play() rejects on its own when the browser decides it will not
            // autoplay. Nothing to do about that, and nothing to report: the
            // poster is already on screen and stays there.
            v.play().catch(() => {});
          } else {
            v.pause();
          }
        });
      },
      // Half the tile has to be showing. A tile clipped at the edge of a
      // sideways scroll is not being watched.
      { threshold: 0.5 },
    );

    videos.forEach(v => io.observe(v));
    return () => io.disconnect();
  }, [reels.length]);

  if (reels.length === 0) return null;

  return (
    <section style={{ padding: 'clamp(2.5rem, 5vw, 4.5rem) 0 0' }} aria-labelledby="ig-strip-heading">
      <div style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: '0 var(--gutter)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.6rem' }}>
          <div>
            <span style={{
              display: 'block', fontSize: '.68rem', letterSpacing: '.3em',
              textTransform: 'uppercase', color: '#7c726a', fontWeight: 600,
            }}>
              Worn, not photographed
            </span>
            <h2 id="ig-strip-heading" style={{
              margin: '.5rem 0 0',
              fontFamily: 'var(--font-playfair), Georgia, serif',
              fontSize: 'clamp(1.5rem, 3vw, 2.3rem)', fontWeight: 500, color: '#1e1b19',
            }}>
              As Seen on Instagram
            </h2>
          </div>
          {profileUrl && (
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '.74rem', letterSpacing: '.14em', textTransform: 'uppercase',
                color: '#722f37', fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              {handle ? `@${handle}` : 'Follow us'}
            </a>
          )}
        </div>

        <div className="ig-strip" ref={stripRef}>
          {reels.map((r, i) => {
            const tile = (
              <>
                <div className="ig-frame">
                  {/* The still, always. unoptimized because these are already
                      small uploads served from our own API, and next/image's
                      optimiser cannot resize a path it is not allowed to fetch. */}
                  <Image
                    src={r.poster}
                    alt={r.caption || 'Mahalaxmi Fashion Hub on Instagram'}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 46vw, 23vw"
                    loading={i < 2 ? 'eager' : 'lazy'}
                    style={{ objectFit: 'cover' }}
                  />
                  {r.video && (
                    <video
                      src={r.video}
                      poster={r.poster}
                      muted
                      loop
                      playsInline
                      preload="none"
                      aria-hidden="true"
                      tabIndex={-1}
                    />
                  )}
                </div>
                {r.caption && <p className="ig-caption">{r.caption}</p>}
              </>
            );

            // A tile with somewhere to go is a link to the product; one without
            // is not a link at all. It used to be tempting to send the rest to
            // the Instagram profile - that is a tile on a shop's homepage whose
            // only job is to take the shopper off the shop.
            return r.href ? (
              <Link key={i} href={r.href} className="ig-tile">{tile}</Link>
            ) : (
              <div key={i} className="ig-tile">{tile}</div>
            );
          })}
        </div>
      </div>

      <style>{`
        .ig-strip {
          display: grid;
          gap: clamp(.7rem, 1.6vw, 1.5rem);
          grid-template-columns: repeat(2, 1fr);
        }
        @media (min-width: 700px)  { .ig-strip { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1024px) { .ig-strip { grid-template-columns: repeat(4, 1fr); } }

        .ig-tile { display: block; text-decoration: none; color: inherit; }

        .ig-frame {
          position: relative;
          aspect-ratio: 9 / 16;
          border-radius: 14px;
          overflow: hidden;
          background: #f2ece7;
        }
        /* The video sits exactly on top of its own poster, so there is no jump
           when it starts and no gap if it never does. */
        .ig-frame video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .ig-tile:hover .ig-frame { box-shadow: 0 10px 28px rgba(114, 47, 55, .16); }

        .ig-caption {
          margin: .6rem 0 0;
          font-size: .78rem;
          line-height: 1.45;
          color: #5c534d;
        }
      `}</style>
    </section>
  );
}
