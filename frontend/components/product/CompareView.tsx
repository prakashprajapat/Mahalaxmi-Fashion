'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { getCompare, removeCompare, clearCompare, COMPARE_EVENT, type CompareItem } from '@/lib/compare';
import { productImageSrc } from '@/lib/productImages';
import { productSlug } from '@/lib/productSlug';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export default function CompareView() {
  const [items, setItems] = useState<CompareItem[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setItems(getCompare());
    sync(); setReady(true);
    window.addEventListener(COMPARE_EVENT, sync);
    return () => window.removeEventListener(COMPARE_EVENT, sync);
  }, []);

  if (!ready) return null;
  if (items.length === 0) return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#666' }}>
      <div style={{ fontSize: '3rem', marginBottom: '.5rem' }}>⚖️</div>
      <h1 style={{ fontSize: '1.4rem', color: '#a7354d', marginBottom: '.5rem' }}>Nothing to compare yet</h1>
      <p style={{ marginBottom: '1.5rem' }}>Add products to compare using the “Compare” button on any product card.</p>
      <Link href="/products" className="button primary">Browse Products</Link>
    </div>
  );

  const rows: { label: string; render: (it: CompareItem) => ReactNode }[] = [
    { label: 'Price', render: it => <strong style={{ color: '#a7354d' }}>{inr(it.price)}{it.mrp ? <span style={{ color: '#999', fontWeight: 400, textDecoration: 'line-through', marginLeft: 6, fontSize: '.85em' }}>{inr(it.mrp)}</span> : null}</strong> },
    { label: 'Category', render: it => <>{it.category || '—'}{it.subcategory ? ` · ${it.subcategory}` : ''}</> },
    { label: 'SKU', render: it => it.sku || '—' },
    { label: 'Rating', render: it => it.rating ? `★ ${it.rating.toFixed(1)}${it.reviewCount ? ` (${it.reviewCount})` : ''}` : 'No reviews yet' },
    { label: 'Availability', render: it => (it.stock && /out/i.test(it.stock)) ? <span style={{ color: '#c0392b' }}>Out of Stock</span> : <span style={{ color: '#27ae60' }}>In Stock</span> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#a7354d' }}>Compare Products ({items.length})</h1>
        <button onClick={clearCompare} style={{ background: '#f5f5f5', border: 'none', borderRadius: 8, padding: '.5rem .9rem', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600 }}>Clear all</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 'min(100%, 640px)', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 96 }}></th>
              {items.map(it => (
                <th key={it.dbId} style={{ padding: '.6rem', borderBottom: '2px solid #eadfe2', verticalAlign: 'top', minWidth: 150 }}>
                  <Link href={`/products/${productSlug(it.name, it.dbId)}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                    <div style={{ width: '100%', aspectRatio: '1/1.1', borderRadius: 10, overflow: 'hidden', background: '#faf3e6', marginBottom: '.4rem' }}>
                      <img src={productImageSrc(it.image)} alt={it.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#2a2a2a', lineHeight: 1.3 }}>{it.name}</div>
                  </Link>
                  <button onClick={() => removeCompare(it.dbId)} style={{ marginTop: '.4rem', background: 'none', border: '1px solid #eadfe2', borderRadius: 6, padding: '.25rem .6rem', cursor: 'pointer', fontSize: '.72rem', color: '#999' }}>✕ Remove</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td style={{ padding: '.7rem .6rem', fontWeight: 800, fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.03em', color: '#8a7a70', borderBottom: '1px solid #f2f2f2', background: '#faf7f4' }}>{r.label}</td>
                {items.map(it => (
                  <td key={it.dbId} style={{ padding: '.7rem .6rem', fontSize: '.86rem', borderBottom: '1px solid #f2f2f2', textAlign: 'center' }}>{r.render(it)}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td style={{ background: '#faf7f4' }}></td>
              {items.map(it => (
                <td key={it.dbId} style={{ padding: '.7rem .6rem', textAlign: 'center' }}>
                  <Link href={`/products/${productSlug(it.name, it.dbId)}`} className="button primary" style={{ padding: '.45rem .9rem', fontSize: '.82rem', margin: 0 }}>View</Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
