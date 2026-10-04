'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { productsApi } from '@/lib/api';
import { addToCart } from '@/lib/cart';
import type { Product } from '@/types';

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const priceOf = (p: Product) => (p.discountPrice && p.discountPrice > 0 ? p.discountPrice : p.price);

// "Add these together" — this product plus two that go with it.
//
// Not the same thing as the row of suggestions further down the page. That one
// is for browsing: eight cards, each a trip to another page, and the basket is
// no fuller for it. This is one decision, taken where the shopper already is,
// with the total of the whole set in front of them — which is the only reason
// it moves the average order at all.
//
// Companions are real products, chosen from the same subcategory and then the
// same category. They have to be real: the server rebuilds every order's total
// from the products table by id, so anything that is not a product row would
// silently vanish from the bill. The shop's own "add-ons" field — a typed name
// and price, with no product behind it — cannot go in a cart for exactly that
// reason, and pretending otherwise would undercharge every order that used it.
export default function BoughtTogether({ product }: { product: Product }) {
  const [mates, setMates] = useState<Product[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let alive = true;
    const sub = (product.subcategory ?? '').trim();
    const ask = sub
      ? productsApi.getAll({ category: product.category, subcategory: sub, pageSize: 12 })
      : productsApi.getAll({ category: product.category, pageSize: 12 });

    ask.then(async r => {
      let pool = (r.products ?? []).filter(p => p.dbId !== product.dbId && p.stock !== 'Out of Stock');
      // A subcategory with nothing else in it falls back to the category, so a
      // lone product in its own niche still gets a pair rather than an empty box.
      if (pool.length < 2 && sub) {
        const wider = await productsApi.getAll({ category: product.category, pageSize: 12 }).catch(() => null);
        pool = (wider?.products ?? []).filter(p => p.dbId !== product.dbId && p.stock !== 'Out of Stock');
      }
      if (alive) setMates(pool.slice(0, 2));
    }).catch(() => {});

    return () => { alive = false; };
  }, [product.dbId, product.category, product.subcategory]);

  if (mates.length === 0) return null;

  const chosen = mates.filter(m => picked.has(m.dbId));
  const total = priceOf(product) + chosen.reduce((s, m) => s + priceOf(m), 0);

  const toggle = (id: number) =>
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const addAll = () => {
    // This product is always part of the set — the button says "add these
    // together", and leaving the one they came for out of the basket is the
    // surprise nobody wants at checkout.
    addToCart(product, 1);
    chosen.forEach(m => addToCart(m, 1));
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  const row = (p: Product, isMain: boolean) => (
    <label key={p.dbId}
      style={{ display: 'flex', alignItems: 'center', gap: '.7rem', padding: '.5rem 0',
        cursor: isMain ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={isMain || picked.has(p.dbId)} disabled={isMain}
        onChange={() => toggle(p.dbId)}
        aria-label={isMain ? `${p.name} (this product)` : `Add ${p.name}`}
        style={{ width: 18, height: 18, accentColor: '#722f37', flexShrink: 0 }} />
      <span style={{ position: 'relative', width: 52, height: 62, flexShrink: 0, background: '#f5f5f5', borderRadius: 6, overflow: 'hidden' }}>
        {p.image && <Image src={p.image} alt="" fill sizes="52px" style={{ objectFit: 'cover' }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '.84rem', color: '#1a1a1a', lineHeight: 1.35,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.name}
        </span>
        <span style={{ fontSize: '.8rem', fontWeight: 700, color: '#722f37' }}>
          {money(priceOf(p))}{isMain && <span style={{ color: '#888', fontWeight: 400 }}> · this product</span>}
        </span>
      </span>
    </label>
  );

  return (
    <section style={{ border: '1px solid #eee', borderRadius: 12, padding: '1rem 1.1rem', margin: '1.2rem 0', background: '#fff' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#4a1f27', margin: '0 0 .4rem' }}>
        Buy these together
      </h2>
      <div>
        {row(product, true)}
        {mates.map(m => row(m, false))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.9rem', flexWrap: 'wrap',
        borderTop: '1px solid #f0f0f0', marginTop: '.5rem', paddingTop: '.8rem' }}>
        <span style={{ fontSize: '.9rem', color: '#555' }}>
          Total for {1 + chosen.length} item{chosen.length === 0 ? '' : 's'}:{' '}
          <b style={{ color: '#1a1a1a', fontSize: '1.05rem' }}>{money(total)}</b>
        </span>
        <button type="button" onClick={addAll}
          style={{ marginLeft: 'auto', background: added ? '#1b5e20' : '#722f37', color: '#fff',
            border: 'none', borderRadius: 8, padding: '.6rem 1.2rem', fontWeight: 700,
            fontSize: '.88rem', cursor: 'pointer' }}>
          {added ? '✓ Added' : 'Add to cart'}
        </button>
      </div>
    </section>
  );
}
