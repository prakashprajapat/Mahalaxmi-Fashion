'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCompare, removeCompare, clearCompare, COMPARE_EVENT, type CompareItem } from '@/lib/compare';
import { productImageSrc } from '@/lib/productImages';

// Floating bar that appears once the shopper adds products to Compare.
export default function CompareBar() {
  const router = useRouter();
  const [items, setItems] = useState<CompareItem[]>([]);
  useEffect(() => {
    const sync = () => setItems(getCompare());
    sync();
    window.addEventListener(COMPARE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(COMPARE_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  if (items.length === 0) return null;
  return (
    <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: '1rem', zIndex: 1200, background: '#fff', border: '1.5px solid #eadfe2', boxShadow: '0 10px 30px rgba(92,26,40,.18)', borderRadius: 14, padding: '.6rem .8rem', display: 'flex', alignItems: 'center', gap: '.6rem', maxWidth: 'calc(100vw - 1.5rem)' }}>
      <span style={{ fontWeight: 800, fontSize: '.8rem', color: '#5c1a28', whiteSpace: 'nowrap' }}>Compare</span>
      <div style={{ display: 'flex', gap: '.35rem' }}>
        {items.map(it => (
          <div key={it.dbId} style={{ position: 'relative', width: 40, height: 40, borderRadius: 8, overflow: 'hidden', border: '1px solid #eee', background: '#faf3e6' }}>
            <img src={productImageSrc(it.image)} alt={it.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button onClick={() => removeCompare(it.dbId)} aria-label="Remove" style={{ position: 'absolute', top: -6, right: -6, background: '#7a0a22', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 10, lineHeight: '16px', cursor: 'pointer', padding: 0 }}>×</button>
          </div>
        ))}
      </div>
      <button onClick={() => router.push('/compare')} className="button primary" style={{ padding: '.45rem .9rem', fontSize: '.82rem', margin: 0, whiteSpace: 'nowrap' }}>Compare ({items.length})</button>
      <button onClick={clearCompare} aria-label="Clear all" style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '.78rem', whiteSpace: 'nowrap' }}>Clear</button>
    </div>
  );
}
