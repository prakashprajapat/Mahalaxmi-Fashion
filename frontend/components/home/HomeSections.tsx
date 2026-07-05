'use client';
import Link from 'next/link';
import { useState } from 'react';
import ProductCard from '@/components/product/ProductCard';
import { finalUnitPrice } from '@/lib/price';
import type { Product } from '@/types';

function sortArr(products: Product[], sort: string): Product[] {
  const a = [...products];
  switch (sort) {
    case 'price-low':  return a.sort((x, y) => finalUnitPrice(x) - finalUnitPrice(y));
    case 'price-high': return a.sort((x, y) => finalUnitPrice(y) - finalUnitPrice(x));
    case 'newest':     return a.sort((x, y) => y.dbId - x.dbId);
    case 'discount':   return a.sort((x, y) => {
      const dx = x.discountPrice ? Math.round(((x.price - x.discountPrice) / x.price) * 100) : 0;
      const dy = y.discountPrice ? Math.round(((y.price - y.discountPrice) / y.price) * 100) : 0;
      return dy - dx;
    });
    default: return a;
  }
}

export function BestSellersSection({ products }: { products: Product[] }) {
  const [sort, setSort] = useState('default');
  const sorted = sortArr(products, sort).slice(0, 8);

  if (products.length === 0) return null;

  return (
    <section style={{ background: '#fdf0f3', padding: '.6rem 0 2rem' }} id="best-sellers">
      <div className="section-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
          <h2 className="section-heading" style={{ margin: 0 }}>Best Sellers</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <span style={{ fontSize: '.8rem', color: '#888' }}>Sort:</span>
              <select value={sort} onChange={e => setSort(e.target.value)}
                style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.28rem .65rem', fontSize: '.82rem', cursor: 'pointer', background: '#fff' }}>
                <option value="default">Default</option>
                <option value="price-low">Price ↑</option>
                <option value="price-high">Price ↓</option>
                <option value="newest">Newest</option>
                <option value="discount">Discount ↓</option>
              </select>
            </div>
            <Link href="/best-sellers" style={{ color: '#a7354d', fontWeight: 600, fontSize: '.9rem' }}>View All →</Link>
          </div>
        </div>

        <div className="products-grid">
          {sorted.map((p, i) => <ProductCard key={p.dbId} product={p} priority={i < 4} />)}
        </div>
      </div>
    </section>
  );
}

export function NewArrivalsSection({ products }: { products: Product[] }) {
  const newest = [...products].sort((a, b) => b.dbId - a.dbId).slice(0, 8);
  if (newest.length === 0) return null;

  return (
    <section className="section-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 className="section-heading" style={{ margin: 0 }}>New Arrivals</h2>
        <Link href="/products" style={{ color: '#a7354d', fontWeight: 600, fontSize: '.9rem' }}>View All →</Link>
      </div>
      <div className="products-grid">
        {newest.map((p) => <ProductCard key={p.dbId} product={p} />)}
      </div>
    </section>
  );
}
