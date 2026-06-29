'use client';
import { useEffect, useState, useMemo } from 'react';
import { productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import type { Product } from '@/types';

type StockStatus = 'In Stock' | 'Out of Stock' | 'Limited Stock';

const STOCK_OPTIONS: StockStatus[] = ['In Stock', 'Out of Stock', 'Limited Stock'];

const productVariant = (p: any): string => {
  try { return JSON.parse(p.extraJson ?? '{}').variant ?? ''; } catch { return ''; }
};

export default function AdminStockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Filters
  const [filterCategory, setFilterCategory]   = useState('');
  const [filterSubcat, setFilterSubcat]       = useState('');
  const [filterVariant, setFilterVariant]     = useState('');
  const [filterSku, setFilterSku]             = useState('');
  const [filterStock, setFilterStock]         = useState('');

  useEffect(() => {
    const token = getAdminToken() ?? '';
    setLoading(true);
    productsApi.getAll({ pageSize: 1000 })
      .then(r => setProducts(r.products as Product[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Unique categories from all products
  const categories = useMemo(
    () => Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort() as string[],
    [products]
  );

  // Subcategories filtered by selected category
  const subcategories = useMemo(() => {
    const source = filterCategory
      ? products.filter(p => (p.category ?? '').toLowerCase() === filterCategory.toLowerCase())
      : products;
    return Array.from(
      new Set(source.map(p => (p as any).subcategory as string | undefined).filter(Boolean))
    ).sort() as string[];
  }, [products, filterCategory]);

  // Variants filtered by selected category + subcategory
  const variants = useMemo(() => {
    let source = products;
    if (filterCategory) source = source.filter(p => (p.category ?? '').toLowerCase() === filterCategory.toLowerCase());
    if (filterSubcat) source = source.filter(p => ((p as any).subcategory ?? '').toLowerCase() === filterSubcat.toLowerCase());
    return Array.from(new Set(source.map(productVariant).filter(Boolean))).sort() as string[];
  }, [products, filterCategory, filterSubcat]);

  // Reset child filters when a parent filter changes
  const handleCategoryChange = (cat: string) => {
    setFilterCategory(cat);
    setFilterSubcat('');
    setFilterVariant('');
  };
  const handleSubcatChange = (sub: string) => {
    setFilterSubcat(sub);
    setFilterVariant('');
  };

  // Filtered product list
  const filtered = useMemo(() => {
    let list = products;
    if (filterCategory) {
      list = list.filter(p => (p.category ?? '').toLowerCase() === filterCategory.toLowerCase());
    }
    if (filterSubcat) {
      list = list.filter(p =>
        ((p as any).subcategory ?? '').toLowerCase() === filterSubcat.toLowerCase()
      );
    }
    if (filterVariant) {
      list = list.filter(p => productVariant(p).toLowerCase() === filterVariant.toLowerCase());
    }
    if (filterSku.trim()) {
      const q = filterSku.trim().toLowerCase();
      list = list.filter(p =>
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.name ?? '').toLowerCase().includes(q)
      );
    }
    if (filterStock) {
      list = list.filter(p => (p.stock ?? 'In Stock') === filterStock);
    }
    return list;
  }, [products, filterCategory, filterSubcat, filterVariant, filterSku, filterStock]);

  const toggleStock = async (product: Product, newStatus: StockStatus) => {
    const token = getAdminToken() ?? '';
    setSaving(s => ({ ...s, [product.dbId]: true }));
    setMessage(null);
    try {
      await productsApi.update(product.dbId, { stock: newStatus }, token);
      setProducts(prev =>
        prev.map(p => p.dbId === product.dbId ? { ...p, stock: newStatus } : p)
      );
      setMessage({ text: `✅ "${product.name}" → ${newStatus}`, ok: true });
    } catch (err) {
      setMessage({ text: `❌ Failed: ${(err as Error).message}`, ok: false });
    } finally {
      setSaving(s => ({ ...s, [product.dbId]: false }));
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // Bulk actions
  const bulkSet = async (status: StockStatus) => {
    const token = getAdminToken() ?? '';
    const toUpdate = filtered.filter(p => (p.stock ?? 'In Stock') !== status);
    if (!toUpdate.length) return;
    if (!confirm(`Mark ${toUpdate.length} products as "${status}"?`)) return;
    setMessage({ text: `⏳ Updating ${toUpdate.length} products...`, ok: true });
    let done = 0;
    for (const p of toUpdate) {
      try {
        await productsApi.update(p.dbId, { stock: status }, token);
        setProducts(prev =>
          prev.map(x => x.dbId === p.dbId ? { ...x, stock: status } : x)
        );
        done++;
      } catch { /* skip */ }
    }
    setMessage({ text: `✅ ${done} / ${toUpdate.length} products set to "${status}"`, ok: true });
    setTimeout(() => setMessage(null), 4000);
  };

  const stockColor = (status?: string) =>
    status === 'In Stock' ? '#1b5e20' :
    status === 'Out of Stock' ? '#b71c1c' : '#e65100';

  const inStockCount   = filtered.filter(p => (p.stock ?? 'In Stock') === 'In Stock').length;
  const outStockCount  = filtered.filter(p => (p.stock ?? 'In Stock') === 'Out of Stock').length;
  const limitedCount   = filtered.filter(p => (p.stock ?? 'In Stock') === 'Limited Stock').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <h1 className="text-2xl font-bold text-gray-800">Stock Manager</h1>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => bulkSet('In Stock')}
            style={{ background: '#1b5e20', color: '#fff', border: 'none', borderRadius: '8px', padding: '.45rem 1rem', fontSize: '.83rem', fontWeight: 600, cursor: 'pointer' }}>
            ✅ All In Stock ({filtered.length})
          </button>
          <button
            onClick={() => bulkSet('Out of Stock')}
            style={{ background: '#b71c1c', color: '#fff', border: 'none', borderRadius: '8px', padding: '.45rem 1rem', fontSize: '.83rem', fontWeight: 600, cursor: 'pointer' }}>
            ❌ All Out of Stock ({filtered.length})
          </button>
        </div>
      </div>

      {/* Toast message */}
      {message && (
        <div style={{
          position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999,
          background: message.ok ? '#1b5e20' : '#b71c1c',
          color: '#fff', borderRadius: '10px', padding: '.7rem 1.25rem',
          fontSize: '.9rem', fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,.2)',
          maxWidth: '400px',
        }}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '.75rem' }}>
          {/* Category */}
          <div>
            <label style={{ fontSize: '.75rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '.25rem' }}>
              Category
            </label>
            <select
              value={filterCategory}
              onChange={e => handleCategoryChange(e.target.value)}
              style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.4rem .65rem', fontSize: '.86rem' }}>
              <option value="">— All Categories —</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Subcategory */}
          <div>
            <label style={{ fontSize: '.75rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '.25rem' }}>
              Subcategory
            </label>
            <select
              value={filterSubcat}
              onChange={e => handleSubcatChange(e.target.value)}
              disabled={subcategories.length === 0}
              style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.4rem .65rem', fontSize: '.86rem', opacity: subcategories.length === 0 ? .5 : 1 }}>
              <option value="">— All Subcategories —</option>
              {subcategories.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Variant */}
          <div>
            <label style={{ fontSize: '.75rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '.25rem' }}>
              Variant
            </label>
            <select
              value={filterVariant}
              onChange={e => setFilterVariant(e.target.value)}
              disabled={variants.length === 0}
              style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.4rem .65rem', fontSize: '.86rem', opacity: variants.length === 0 ? .5 : 1 }}>
              <option value="">— All Variants —</option>
              {variants.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          {/* SKU / Name search */}
          <div>
            <label style={{ fontSize: '.75rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '.25rem' }}>
              SKU / Product Name
            </label>
            <input
              placeholder="Search by SKU or name..."
              value={filterSku}
              onChange={e => setFilterSku(e.target.value)}
              style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.4rem .65rem', fontSize: '.86rem' }}
            />
          </div>

          {/* Stock status filter */}
          <div>
            <label style={{ fontSize: '.75rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '.25rem' }}>
              Stock Status
            </label>
            <select
              value={filterStock}
              onChange={e => setFilterStock(e.target.value)}
              style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.4rem .65rem', fontSize: '.86rem' }}>
              <option value="">— All —</option>
              {STOCK_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.82rem', background: '#e8f5e9', color: '#1b5e20', borderRadius: '6px', padding: '.2rem .65rem', fontWeight: 600 }}>
            ✅ In Stock: {inStockCount}
          </span>
          <span style={{ fontSize: '.82rem', background: '#ffebee', color: '#b71c1c', borderRadius: '6px', padding: '.2rem .65rem', fontWeight: 600 }}>
            ❌ Out of Stock: {outStockCount}
          </span>
          <span style={{ fontSize: '.82rem', background: '#fff3e0', color: '#e65100', borderRadius: '6px', padding: '.2rem .65rem', fontWeight: 600 }}>
            ⚠️ Limited: {limitedCount}
          </span>
          <span style={{ fontSize: '.82rem', color: '#888', marginLeft: 'auto' }}>
            Total filtered: <strong>{filtered.length}</strong>
          </span>
        </div>
      </div>

      {/* Products table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Loading products...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>No products found. Clear the filters.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
            <thead style={{ background: '#f5f5f5', borderBottom: '2px solid #eee' }}>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>SKU</th>
                <th style={thStyle}>Product Name</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Subcategory</th>
                <th style={thStyle}>Variant</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Current Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Change To</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => {
                const currentStock = (p.stock ?? 'In Stock') as StockStatus;
                const isSaving = saving[p.dbId];
                return (
                  <tr key={p.dbId} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={tdStyle}>{idx + 1}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.8rem', color: '#666' }}>{p.sku}</td>
                    <td style={{ ...tdStyle, maxWidth: '280px' }}>
                      <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{p.name}</span>
                    </td>
                    <td style={{ ...tdStyle, color: '#666' }}>{p.category ?? '—'}</td>
                    <td style={{ ...tdStyle, color: '#444' }}>{(p as any).subcategory ?? '—'}</td>
                    <td style={{ ...tdStyle, color: '#777' }}>{productVariant(p) || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '.18rem .7rem',
                        borderRadius: '999px',
                        fontSize: '.78rem',
                        fontWeight: 700,
                        background: stockColor(currentStock) + '18',
                        color: stockColor(currentStock),
                        border: `1.5px solid ${stockColor(currentStock)}40`,
                      }}>
                        {currentStock}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '.35rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {STOCK_OPTIONS.filter(opt => opt !== currentStock).map(opt => (
                          <button
                            key={opt}
                            disabled={isSaving}
                            onClick={() => toggleStock(p, opt)}
                            style={{
                              padding: '.22rem .65rem',
                              borderRadius: '6px',
                              border: `1.5px solid ${stockColor(opt)}`,
                              background: isSaving ? '#eee' : stockColor(opt) + '12',
                              color: isSaving ? '#999' : stockColor(opt),
                              fontSize: '.78rem',
                              fontWeight: 600,
                              cursor: isSaving ? 'not-allowed' : 'pointer',
                              whiteSpace: 'nowrap',
                            }}>
                            {isSaving ? '...' : opt === 'In Stock' ? '✅ In Stock' : opt === 'Out of Stock' ? '❌ Out of Stock' : '⚠️ Limited'}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ color: '#aaa', fontSize: '.78rem', marginTop: '.75rem', textAlign: 'right' }}>
        {filtered.length} products shown · Changes go live on the website
      </p>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '.6rem 1rem',
  textAlign: 'left',
  fontSize: '.75rem',
  fontWeight: 700,
  color: '#555',
  textTransform: 'uppercase',
  letterSpacing: '.04em',
};

const tdStyle: React.CSSProperties = {
  padding: '.55rem 1rem',
  verticalAlign: 'middle',
};
