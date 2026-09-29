import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/types';
import { getHomeTiles } from '@/lib/seoContent';

// Five doors into the shop, at the top of the homepage.
//
// The homepage used to open with a filter sidebar and all eighty products —
// which is a category page, not a shop front. Someone arriving for the first
// time does not know what they want filtered; they want to be shown where
// things are. These tiles are that, and the full filterable grid is one tap
// away behind each of them.
//
// The tiles themselves come from Admin → Home Categories, so a category that
// did not exist when this file was written still appears the day it is added.
// The five in lib/seoContent.ts are only what ships before anyone edits them.
//
// The photograph is the owner's choice, and that matters more than it sounds:
// when the code picked one — the first product in the group — footwear was
// represented by a shoe still lying in its delivery box, barcode and all, and
// innerwear by a supplier's advertising sheet. A tile is the first thing a
// shopper sees of a whole category; it cannot be left to whichever row the
// database returned first.

export default async function CategoryTiles({ products }: { products: Product[] }) {
  const defs = await getHomeTiles();

  const tiles = defs.map(t => {
    const terms = (t.terms ?? []).map(x => x.toLowerCase()).filter(Boolean);
    const inIt = terms.length === 0
      ? []
      : (products ?? []).filter(p => {
          const hay = `${p.subcategory ?? ''} ${p.category ?? ''}`.toLowerCase();
          return terms.some(w => hay.includes(w));
        });
    return {
      ...t,
      count: inIt.length,
      // Newest first for the fallback: a recent photo is more likely to be a
      // decent one than whatever happens to sit at the top of the table.
      image: t.image || [...inIt].sort((a, b) => b.dbId - a.dbId).find(p => p.image)?.image || '',
    };
  }).filter(t => t.image || t.count > 0);   // a door into an empty room is worse than no door

  if (tiles.length === 0) return null;

  return (
    <section style={{ padding: 'clamp(2.5rem, 5vw, 4.5rem) 0 0' }}>
      <div style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: '0 var(--gutter)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.6rem' }}>
          <h2 style={{
            margin: 0, fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: 'clamp(1.9rem, 5vw, 2.6rem)', fontWeight: 500, color: '#1e1b19',
            lineHeight: 1.15,
          }}>
            Shop by category
          </h2>
          <Link href="/products" style={{
            fontSize: '.86rem', letterSpacing: '.1em', textTransform: 'uppercase',
            color: '#722f37', fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            View everything
          </Link>
        </div>

        <div className="cat-tiles" style={{ display: 'grid', gap: 'clamp(.6rem, 1.3vw, 1.25rem)' }}>
          {tiles.map(t => (
            <Link key={t.href + t.label} href={t.href} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
              <div style={{ position: 'relative', aspectRatio: '3 / 4', overflow: 'hidden', background: '#efe9e2' }}>
                {t.image && (
                  <Image
                    src={t.image}
                    alt=""
                    fill
                    sizes="(max-width: 600px) 45vw, (max-width: 1024px) 30vw, 18vw"
                    style={{ objectFit: 'cover' }}
                  />
                )}
              </div>
              <div style={{
                marginTop: '.7rem', fontSize: '.95rem', letterSpacing: '.06em',
                textTransform: 'uppercase', color: '#1e1b19', fontWeight: 700,
                lineHeight: 1.25,
              }}>
                {t.label}
              </div>
              {/* This used to read "24 pieces". That count was built from the
                  tile's own words, while the collection page it opens has rules
                  of its own, so the two never agreed — 24 on the tile, 34 once
                  you were there. No number beats a wrong one. */}
              <div style={{ marginTop: '.25rem', fontSize: '.88rem', color: '#6b625c' }}>
                Explore Collection
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        .cat-tiles { grid-template-columns: repeat(${Math.min(tiles.length, 5)}, minmax(0, 1fr)); }
        @media (max-width: 1024px) { .cat-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 600px)  { .cat-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 430px)  { .cat-tiles { grid-template-columns: 1fr; gap: 1.1rem; } }
      `}</style>
    </section>
  );
}
