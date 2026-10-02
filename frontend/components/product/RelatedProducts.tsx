'use client';
import { useEffect, useState } from 'react';
import { productsApi } from '@/lib/api';
import ProductCard from '@/components/product/ProductCard';
import type { Product } from '@/types';

// "You may also like" — shows a few products from the same category (excluding the current one).
// Great for cross-sell and for internal linking (helps SEO). Renders nothing if there are no others.
export default function RelatedProducts({ category, currentId }: { category?: string; currentId: number }) {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    if (!category) return;
    productsApi.getAll({ category, pageSize: 12 })
      .then(r => {
        const others = (r.products ?? []).filter((p: any) => p.dbId !== currentId);
        setItems(others.slice(0, 8));
      })
      .catch(() => {});
  }, [category, currentId]);

  if (items.length === 0) return null;

  return (
    <section style={{ background: '#fafafa', borderTop: '1px solid #eee', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4a1f27', margin: '0 0 1rem' }}>You May Also Like</h2>
        {/* Wahi grid jo home page, products ki suchi aur "Recently viewed"
            istemal karte hain. Yahan apna alag grid likha tha — minmax(170px)
            — aur foan par do card ke liye jagah chand pixel se kam padti thi,
            to ek hi card poori chaudai le leta tha. .products-grid foan par
            do column par tala hai, isliye ab har jagah ek jaisa dikhta hai. */}
        <div className="products-grid">
          {items.map(p => (
            <ProductCard key={p.dbId} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
