import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/types';

// Five doors into the shop, at the top of the homepage.
//
// The homepage used to open with a filter sidebar and all eighty products —
// which is a category page, not a shop front. Someone arriving for the first
// time does not know what they want filtered; they want to be shown where
// things are. These tiles are that, and the full filterable grid is one click
// away behind each of them.
//
// Each tile borrows a real photograph from the products behind it rather than
// needing artwork of its own, so nothing here has to be maintained by hand as
// the catalogue changes.

interface Tile {
  label: string;
  href: string;
  match: (p: Product) => boolean;
}

const TILES: Tile[] = [
  {
    label: 'Nightwear',
    href: '/collections/cotton-nighty',
    match: p => /nighty|night gown|nightwear/i.test(p.subcategory ?? ''),
  },
  {
    label: 'Petticoats',
    href: '/collections/saree-petticoat',
    match: p => /petticoat/i.test(p.subcategory ?? ''),
  },
  {
    label: "Men's Footwear",
    href: '/collections/formal-shoes-for-men',
    match: p => /shoe|footwear|sandal/i.test(p.subcategory ?? ''),
  },
  {
    label: 'Innerwear',
    href: '/men',
    match: p => /undergarment|innerwear|shorts/i.test(p.subcategory ?? ''),
  },
  {
    label: 'Perfume',
    href: '/beauty',
    match: p => /perfume|fragrance|deo/i.test(`${p.subcategory ?? ''} ${p.category ?? ''}`),
  },
];

export default function CategoryTiles({ products }: { products: Product[] }) {
  const tiles = TILES.map(t => {
    const inIt = (products ?? []).filter(t.match);
    return { ...t, count: inIt.length, image: inIt.find(p => p.image)?.image ?? '' };
  }).filter(t => t.count > 0);   // a door into an empty room is worse than no door

  if (tiles.length === 0) return null;

  return (
    <section style={{ padding: 'clamp(2.5rem, 5vw, 4.5rem) clamp(1rem, 4vw, 4rem) 0' }}>
      <div style={{ maxWidth: 'var(--shell)', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.6rem' }}>
          <h2 style={{
            margin: 0, fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: 'clamp(1.5rem, 3vw, 2.3rem)', fontWeight: 500, color: '#1e1b19',
          }}>
            Shop by category
          </h2>
          <Link href="/products" style={{
            fontSize: '.74rem', letterSpacing: '.14em', textTransform: 'uppercase',
            color: '#722f37', fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            View everything
          </Link>
        </div>

        <div className="cat-tiles" style={{ display: 'grid', gap: 'clamp(.6rem, 1.3vw, 1.25rem)' }}>
          {tiles.map(t => (
            <Link key={t.href} href={t.href} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
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
                marginTop: '.7rem', fontSize: '.78rem', letterSpacing: '.12em',
                textTransform: 'uppercase', color: '#1e1b19', fontWeight: 600,
              }}>
                {t.label}
              </div>
              <div style={{ marginTop: '.2rem', fontSize: '.8rem', color: '#6b625c' }}>
                {t.count} {t.count === 1 ? 'piece' : 'pieces'}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        .cat-tiles { grid-template-columns: repeat(5, minmax(0, 1fr)); }
        @media (max-width: 1024px) { .cat-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 600px)  { .cat-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      `}</style>
    </section>
  );
}
