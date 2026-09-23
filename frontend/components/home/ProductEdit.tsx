import Link from 'next/link';
import type { Product } from '@/types';
import ProductCard from '@/components/product/ProductCard';

// A short, chosen run of products — four of them, with somewhere to go for
// the rest.
//
// Showing everything is not the same as showing what is good: eighty products
// in one grid asks the shopper to do the choosing, four asks them to look. The
// link in the corner is what keeps that honest — nothing is hidden, it is one
// tap away.

export default function ProductEdit({
  eyebrow,
  title,
  products,
  href,
  hrefLabel,
  count = 4,
  priority = false,
}: {
  eyebrow?: string;
  title: string;
  products: Product[];
  href: string;
  hrefLabel: string;
  count?: number;
  /** True only for the first run on the page — it holds the images above the fold. */
  priority?: boolean;
}) {
  const shown = (products ?? []).slice(0, count);
  if (shown.length === 0) return null;

  return (
    <section style={{ padding: 'clamp(2.5rem, 5vw, 4.5rem) clamp(1rem, 4vw, 4rem) 0' }}>
      <div style={{ maxWidth: 'var(--shell)', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.6rem' }}>
          <div>
            {eyebrow && (
              <span style={{
                display: 'block', fontSize: '.68rem', letterSpacing: '.3em',
                textTransform: 'uppercase', color: '#8a7f76', fontWeight: 600,
              }}>
                {eyebrow}
              </span>
            )}
            <h2 style={{
              margin: eyebrow ? '.5rem 0 0' : 0,
              fontFamily: 'var(--font-playfair), Georgia, serif',
              fontSize: 'clamp(1.5rem, 3vw, 2.3rem)', fontWeight: 500, color: '#1e1b19',
            }}>
              {title}
            </h2>
          </div>
          <Link href={href} style={{
            fontSize: '.74rem', letterSpacing: '.14em', textTransform: 'uppercase',
            color: '#722f37', fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {hrefLabel}
          </Link>
        </div>

        <div className="edit-grid" style={{ display: 'grid', gap: 'clamp(.7rem, 1.6vw, 1.75rem)' }}>
          {shown.map((p, i) => (
            <ProductCard key={p.dbId} product={p} priority={priority && i < 2} />
          ))}
        </div>
      </div>

      <style>{`
        .edit-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        @media (max-width: 1024px) { .edit-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 640px)  { .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      `}</style>
    </section>
  );
}
