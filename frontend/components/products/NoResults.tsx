'use client';
import { useEffect, useMemo, useState } from 'react';
import ProductCard from '@/components/product/ProductCard';
import { fuzzyScore, productHaystack } from '@/lib/fuzzy';

// An empty result used to be a full stop: a magnifying glass, "No products
// found", and a Clear Filters button. Somebody who typed "red saree" and got
// that has no reason to type anything again - they leave, and the shop never
// learns what they wanted.
//
// So the dead end becomes three offers, in the order that helps most:
//   1. the closest things we DO have - the filters are dropped and the whole
//      catalogue is searched again, because nine times out of ten the item is
//      there and a size or price tick hid it;
//   2. the aisles, so a wrong word is one tap from the right shelf;
//   3. WhatsApp, carrying what they searched for - which turns a lost visitor
//      into a message the shop can answer, and tells you what you are missing.

interface Props {
  /** What they typed, if anything. */
  q: string;
  /** The whole catalogue for this page, before any filter. */
  products: any[];
  /** Aisle names to offer as chips - the label is what the filter is set to. */
  subcategories: { key: string; label: string }[];
  /** How many filters are on - decides whether this is a search miss or a filter miss. */
  activeFilterCount: number;
  onPickSubcat: (sub: string) => void;
  onClearAll: () => void;
}

export default function NoResults({ q, products, subcategories, activeFilterCount, onPickSubcat, onClearAll }: Props) {
  const [whatsapp, setWhatsapp] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => setWhatsapp((d?.settings?.whatsapp ?? '').replace(/\D/g, '')))
      .catch(() => { /* no number, no WhatsApp line - the rest still helps */ });
  }, []);

  const term = q.trim();

  const suggestions = useMemo(() => {
    const pick = (list: any[]) => list.slice(0, 8);

    if (term) {
      // Same search, no filters. This is the common case: the item exists and a
      // price slider or a size tick was hiding it.
      const scored = products
        .map((p: any) => ({ p, s: fuzzyScore(term, productHaystack(p)) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s);
      if (scored.length) return pick(scored.map(x => x.p));

      // Still nothing. Try each word on its own - "red cotton saree" finds
      // sarees even when no single product carries all three words.
      const words = term.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      if (words.length > 1) {
        const byWord = products
          .map((p: any) => ({ p, s: Math.max(...words.map(w => fuzzyScore(w, productHaystack(p)))) }))
          .filter(x => x.s > 0)
          .sort((a, b) => b.s - a.s);
        if (byWord.length) return pick(byWord.map(x => x.p));
      }
    }

    // No search term, or a word nothing in the shop has ever been called.
    // Show what sells rather than an empty space.
    return pick(products);
  }, [term, products]);

  const waText = encodeURIComponent(
    term
      ? `Hello! I was looking for "${term}" on your website but could not find it. Do you have it?`
      : 'Hello! I could not find what I was looking for on your website. Can you help?',
  );

  return (
    <div>
      <div style={{ textAlign: 'center', padding: '2.25rem 1rem 1.5rem' }}>
        <div style={{ fontSize: '2.75rem', marginBottom: '.5rem' }}>🔍</div>
        <p style={{ margin: '0 0 .35rem', fontWeight: 700, color: '#2d2724', fontSize: '1.05rem' }}>
          {term ? <>Nothing matched &ldquo;{term}&rdquo;</> : 'Nothing matches these filters'}
        </p>
        <p style={{ margin: 0, color: '#8a7f76', fontSize: '.88rem', lineHeight: 1.6 }}>
          {activeFilterCount > 0
            ? 'Your filters may be hiding it — here is what we have without them.'
            : 'Here are the closest things we have.'}
        </p>
        {activeFilterCount > 0 && (
          <button onClick={onClearAll}
            style={{ marginTop: '.9rem', padding: '.6rem 1.5rem', background: '#722f37', color: '#fff',
                     border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '.88rem' }}>
            Clear filters
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <>
          <p style={{ margin: '0 0 .75rem', fontWeight: 700, fontSize: '.92rem', color: '#2d2724' }}>
            {term ? 'You might like these' : 'Popular right now'}
          </p>
          <div className="products-grid">
            {suggestions.map((p: any, i: number) => (
              <ProductCard key={p.dbId} product={p} priority={i < 4} />
            ))}
          </div>
        </>
      )}

      {subcategories.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <p style={{ margin: '0 0 .6rem', fontWeight: 700, fontSize: '.92rem', color: '#2d2724' }}>
            Or browse by type
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
            {subcategories.slice(0, 10).map(sub => (
              <button key={sub.key} onClick={() => onPickSubcat(sub.label)}
                style={{ padding: '.5rem .95rem', borderRadius: 999, border: '1.5px solid #e8d9dd',
                         background: '#fff', color: '#722f37', fontWeight: 650, fontSize: '.84rem',
                         cursor: 'pointer' }}>
                {sub.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {whatsapp && (
        <div style={{ marginTop: '2rem', background: '#f6faf6', border: '1px solid #d9ecd9',
                      borderRadius: 12, padding: '1.1rem 1.25rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 .3rem', fontWeight: 700, color: '#2d2724', fontSize: '.95rem' }}>
            Still not finding it?
          </p>
          <p style={{ margin: '0 0 .9rem', color: '#6b615c', fontSize: '.86rem', lineHeight: 1.6 }}>
            Tell us on WhatsApp what you are looking for. We stock more than what is on the website,
            and we can arrange most things on order.
          </p>
          <a href={`https://wa.me/${whatsapp}?text=${waText}`} target="_blank" rel="noopener noreferrer"
             style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', background: '#128C7E',
                      color: '#fff', textDecoration: 'none', padding: '.7rem 1.4rem', borderRadius: 9,
                      fontWeight: 700, fontSize: '.9rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.08-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z"/>
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.18h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.4c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.41a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24z"/>
            </svg>
            Ask on WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}
