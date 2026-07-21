'use client';
import { useEffect, useState } from 'react';
import ProductCard from '@/components/product/ProductCard';
import { productsApi } from '@/lib/api';
import { getRecentlyViewed } from '@/lib/recentlyViewed';
import type { Product } from '@/types';

// Myntra-style "For You" picks — derived from the categories/subcategories the visitor has
// actually been browsing (recency-weighted), fully client-side. Renders nothing for a
// brand-new visitor with no history, so the homepage stays clean for first-time users.
export default function RecommendedForYou({
  excludeId, limit = 8, title = 'Recommended For You',
}: { excludeId?: number; limit?: number; title?: string }) {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    const history = getRecentlyViewed();
    if (history.length === 0) return;

    // Weight each browsed category by how recently/often it was viewed.
    const catWeight = new Map<string, number>();
    history.forEach((p, i) => {
      const c = (p.category || '').trim();
      if (c) catWeight.set(c, (catWeight.get(c) ?? 0) + (history.length - i));
    });
    const topCats = [...catWeight.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
    if (topCats.length === 0) return;

    const seen = new Set(history.map(p => p.dbId));
    if (excludeId) seen.add(excludeId);

    let cancelled = false;
    Promise.all(
      topCats.map(c =>
        productsApi.getAll({ category: c, pageSize: 24 }).then(r => r.products ?? []).catch(() => [] as Product[])
      )
    ).then(lists => {
      if (cancelled) return;
      const pool: Product[] = [];
      const added = new Set<number>();
      lists.flat().forEach(p => {
        if (!seen.has(p.dbId) && !added.has(p.dbId)) { added.add(p.dbId); pool.push(p); }
      });
      // Surface best-sellers first so the row feels curated.
      pool.sort((a, b) => (b.bestSeller ? 1 : 0) - (a.bestSeller ? 1 : 0));
      setItems(pool.slice(0, limit));
    });

    return () => { cancelled = true; };
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
