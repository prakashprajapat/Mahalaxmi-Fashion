'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { productsApi } from '@/lib/api';
import type { Product } from '@/types';

interface Issue {
  product: Product;
  problems: string[];
}

export default function SeoAnalysisPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productsApi.getAll({ pageSize: 1000 })
      .then(r => setProducts(r.products || []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  // Duplicate name detection
  const nameCount = new Map<string, number>();
  products.forEach(p => {
    const n = (p.name || '').trim().toLowerCase();
    if (n) nameCount.set(n, (nameCount.get(n) || 0) + 1);
  });

  const issues: Issue[] = products.map(p => {
    const problems: string[] = [];
    const name = (p.name || '').trim();
    const desc = (p.description || '').trim();
    if (!desc) problems.push('Missing meta description');
    else if (desc.length < 30) problems.push('Description too short (<30 chars)');
    if (!p.image || !p.image.trim()) problems.push('Missing image / ALT');
    if (!name) problems.push('Missing title');
    else if (name.length < 10) problems.push('Title too short (<10 chars)');
    else if ((nameCount.get(name.toLowerCase()) || 0) > 1) problems.push('Duplicate title');
    return { product: p, problems };
  }).filter(i => i.problems.length > 0);

  const count = (label: string) => issues.filter(i => i.problems.some(p => p.startsWith(label))).length;

  const stats = [
    { icon: '📦', label: 'Total Products', value: products.length, color: '#a7354d' },
    { icon: '📝', label: 'Missing Description', value: count('Missing meta') + count('Description too'), color: '#e67e22' },
    { icon: '🖼️', label: 'Missing Image/ALT', value: count('Missing image'), color: '#c0392b' },
    { icon: '📑', label: 'Duplicate Titles', value: count('Duplicate'), color: '#8e44ad' },
    { icon: '⚠️', label: 'Products with Issues', value: issues.length, color: '#d35400' },
  ];

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>SEO Analysis</h1>
          <p className="admin-page-sub">Products with missing or weak SEO — fix these to rank better on Google</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1rem 1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem' }}>{s.icon}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '.74rem', color: '#888', marginTop: '.2rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Issues table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>Analysing products…</div>
        ) : issues.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#2e7d32' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>✅</div>
            <p>All products have good SEO — no issues found!</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
              <thead>
                <tr style={{ background: '#fdf0f3', borderBottom: '2px solid #eee' }}>
                  {['#', 'Product', 'Category', 'Issues', 'Fix'].map(h => (
                    <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {issues.map((it, i) => (
                  <tr key={it.product.dbId} style={{ borderBottom: '1px solid #f5f5f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '.65rem 1rem', color: '#aaa', fontSize: '.8rem' }}>{it.product.dbId}</td>
                    <td style={{ padding: '.65rem 1rem', maxWidth: 280 }}>
                      <div style={{ fontWeight: 600 }}>{it.product.name || <span style={{ color: '#ccc' }}>— no title —</span>}</div>
                      {it.product.sku && (
                        <div style={{ fontSize: '.72rem', color: '#999', marginTop: '.15rem', fontFamily: 'monospace' }}>SKU: {it.product.sku}</div>
                      )}
                    </td>
                    <td style={{ padding: '.65rem 1rem', color: '#888', fontSize: '.82rem' }}>{it.product.category || '—'}</td>
                    <td style={{ padding: '.65rem 1rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
                        {it.problems.map(p => (
                          <span key={p} style={{ background: '#fff3e0', color: '#e65100', borderRadius: 20, padding: '2px 9px', fontSize: '.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{p}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '.65rem 1rem' }}>
                      <Link href={`/admin/products/${it.product.dbId}`}
                        style={{ background: '#a7354d', color: '#fff', borderRadius: 6, padding: '.3rem .8rem', fontSize: '.78rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        Edit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: '.8rem', color: '#999', marginTop: '1rem' }}>
        Tip: Each product's <strong>name</strong> becomes its Google title and its <strong>description</strong> becomes the Google snippet.
        Keep both clear and unique — SEO improves automatically.
      </p>
    </div>
  );
}
