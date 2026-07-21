'use client';
import { useEffect, useState } from 'react';
import ProductCard from '@/components/product/ProductCard';
import { getRecentlyViewed } from '@/lib/recentlyViewed';
import type { Product } from '@/types';

// Shows the products this visitor recently opened (from their own browser only).
// Renders nothing until there are at least 2 items, so it never looks empty.
export default function RecentlyViewed({
  excludeId, limit = 6, title = 'Recently Viewed',
}: { excludeId?: number; limit?: number; title?: string }) {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    const load = () =>
      setItems(getRecentlyViewed().filter(p => p.dbId !== excludeId).slice(0, limit));
    load();
    window.addEventListener('recently-viewed-updated', load);
    return () => window.removeEventListener('recently-viewed-updated', load);
  }, [excludeId, limit]);

  if (items.length < 2) return null;

  return (
    <section className="section-wrap" style={{ paddingTop: '1.5rem' }}>
      <h2 className="section-heading" style={{ margin: '0 0 1rem' }}>{title}</h2>
      <div className="products-grid">
        {items.map(p => <ProductCard key={p.dbId} product={p} />)}
      </div>
    </section>
  );
}
