'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import type { Product } from '@/types';
import { PageHeader, Card, Stat, StatGrid, Empty } from '@/components/admin/Ui';

type StockStatus = 'In Stock' | 'Limited Stock' | 'Out of Stock';
const STOCK_OPTIONS: StockStatus[] = ['In Stock', 'Limited Stock', 'Out of Stock'];
const SHORT: Record<StockStatus, string> = { 'In Stock': 'In Stock', 'Limited Stock': 'Limited', 'Out of Stock': 'Out' };

const productVariant = (p: any): string => {
  try { return JSON.parse(p.extraJson ?? '{}').variant ?? ''; } catch { return ''; }
};

export default function AdminStockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [filterCategory, setFilterCategory] = useState('');
  const [filterSubcat, setFilterSubcat]     = useState('');
  const [filterVariant, setFilterVariant]   = useState('');
  const [filterSku, setFilterSku]           = useState('');
  const [filterStock, setFilterStock]       = useState('');

  useEffect(() => {
    setLoading(true);
    productsApi.getAll({ pageSize: 1000 })
      .then(r => setProducts(r.products as Product[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort() as string[],
    [products]
  );

  const subcategories = useMemo(() => {
    const source = filterCategory
      ? products.filter(p => (p.category ?? '').toLowerCase() === filterCategory.toLowerCase())
      : products;
    return Array.from(
      new Set(source.map(p => (p as any).subcategory as string | undefined).filter(Boolean))
    ).sort() as string[];
  }, [products, filterCategory]);

  const variants = useMemo(() => {
    let source = products;
    if (filterCategory) source = source.filter(p => (p.category ?? '').toLowerCase() === filterCategory.toLowerCase());
    if (filterSubcat) source = source.filter(p => ((p as any).subcategory ?? '').toLowerCase() === filterSubcat.toLowerCase());
    return Array.from(new Set(source.map(productVariant).filter(Boolean))).sort() as string[];
  }, [products, filterCategory, filterSubcat]);

  const handleCategoryChange = (cat: string) => { setFilterCategory(cat); setFilterSubcat(''); setFilterVariant(''); };
  const handleSubcatChange = (sub: string) => { setFilterSubcat(sub); setFilterVariant(''); };

  const filtered = useMemo(() => {
    let list = products;
    if (filterCategory) list = list.filter(p => (p.category ?? '').toLowerCase() === filterCategory.toLowerCase());
    if (filterSubcat)   list = list.filter(p => ((p as any).subcategory ?? '').toLowerCase() === filterSubcat.toLowerCase());
    if (filterVariant)  list = list.filter(p => productVariant(p).toLowerCase() === filterVariant.toLowerCase());
    if (filterSku.trim()) {
      const q = filterSku.trim().toLowerCase();
      list = list.filter(p => (p.sku ?? '').toLowerCase().includes(q) || (p.name ?? '').toLowerCase().includes(q));
    }
    if (filterStock) list = list.filter(p => (p.stock ?? 'In Stock') === filterStock);
    return list;
  }, [products, filterCategory, filterSubcat, filterVariant, filterSku, filterStock]);

  const anyFilter = Boolean(filterCategory || filterSubcat || filterVariant || filterSku.trim() || filterStock);
  const clearAll = () => { setFilterCategory(''); setFilterSubcat(''); setFilterVariant(''); setFilterSku(''); setFilterStock(''); };

  const toast = (text: string, ok: boolean, ms = 3000) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), ms);
  };

  const setOne = async (product: Product, newStatus: StockStatus) => {
    const token = getAdminToken() ?? '';
    setSaving(s => ({ ...s, [product.dbId]: true }));
    setMessage(null);
    try {
      await productsApi.updateStock(product.dbId, newStatus, token);
      setProducts(prev => prev.map(p => p.dbId === product.dbId ? { ...p, stock: newStatus } : p));
      toast(`${product.sku || product.name} is now ${newStatus}`, true);
    } catch (err) {
      toast(`Could not save: ${(err as Error).message}`, false, 5000);
    } finally {
      setSaving(s => ({ ...s, [product.dbId]: false }));
    }
  };

  // The bulk buttons act on what you are looking at, not on the whole
  // catalogue — that is the point of the filters above them. So they say how
  // many rows will actually change, which is never the same as how many are
  // shown once some of them already have that status.
  const bulkSet = async (status: StockStatus) => {
    const token = getAdminToken() ?? '';
    const toUpdate = filtered.filter(p => (p.stock ?? 'In Stock') !== status);
    if (!toUpdate.length) return;
    if (!confirm(`Set ${toUpdate.length} of the ${filtered.length} products shown to "${status}"?`)) return;
    setMessage({ text: `Updating ${toUpdate.length} products…`, ok: true });
    let done = 0;
    for (const p of toUpdate) {
      try {
        await productsApi.updateStock(p.dbId, status, token);
        setProducts(prev => prev.map(x => x.dbId === p.dbId ? { ...x, stock: status } : x));
        done++;
      } catch { /* keep going; the ones that failed keep their old status */ }
    }
    toast(done === toUpdate.length
      ? `${done} products set to ${status}.`
      : `${done} of ${toUpdate.length} saved — the rest kept their old status.`, done === toUpdate.length, 5000);
  };

  const countOf = (s: StockStatus) => filtered.filter(p => (p.stock ?? 'In Stock') === s).length;
  const outCount = countOf('Out of Stock');
  const limitedCount = countOf('Limited Stock');

  const pendingIn = filtered.filter(p => (p.stock ?? 'In Stock') !== 'In Stock').length;
  const pendingOut = filtered.filter(p => (p.stock ?? 'In Stock') !== 'Out of Stock').length;

  return (
    <div className="admin-page">
      <PageHeader
        title="Stock"
        sub="Change what is in stock. Every change is on the website straight away."
        right={<Link className="adm-btn" href="/admin/products">Full catalogue</Link>}
      />

      {message && (
        <div style={{
          position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999, maxWidth: '360px',
          background: message.ok ? '#2e7d32' : '#c0392b', color: '#fff', borderRadius: '10px',
          padding: '.65rem 1.1rem', fontSize: '.85rem', fontWeight: 700, boxShadow: '0 6px 20px rgba(0,0,0,.18)',
        }}>{message.text}</div>
      )}

      <StatGrid>
        <Stat label="In stock" value={countOf('In Stock')} tone="green"
              action={filterStock === 'In Stock' ? undefined : 'Show only these'}
              onClick={() => setFilterStock(filterStock === 'In Stock' ? '' : 'In Stock')} />
        <Stat label="Running low" value={limitedCount} tone={limitedCount > 0 ? 'red' : undefined}
              action={filterStock === 'Limited Stock' ? undefined : 'Show only these'}
              onClick={() => setFilterStock(filterStock === 'Limited Stock' ? '' : 'Limited Stock')} />
        <Stat label="Out of stock" value={outCount} tone={outCount > 0 ? 'red' : undefined}
              action={filterStock === 'Out of Stock' ? undefined : 'Show only these'}
              onClick={() => setFilterStock(filterStock === 'Out of Stock' ? '' : 'Out of Stock')} />
        <Stat label="Shown here" value={filtered.length}
              action={anyFilter ? 'Clear the filters' : undefined}
              onClick={anyFilter ? clearAll : undefined} />
      </StatGrid>

      <Card title="Narrow it down">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '.6rem' }}>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Category</span>
            <select className="adm-input" style={{ width: '100%', marginTop: '.25rem' }}
                    value={filterCategory} onChange={e => handleCategoryChange(e.target.value)}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Subcategory</span>
            <select className="adm-input" style={{ width: '100%', marginTop: '.25rem', opacity: subcategories.length ? 1 : .5 }}
                    value={filterSubcat} onChange={e => handleSubcatChange(e.target.value)} disabled={!subcategories.length}>
              <option value="">All subcategories</option>
              {subcategories.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Variant</span>
            <select className="adm-input" style={{ width: '100%', marginTop: '.25rem', opacity: variants.length ? 1 : .5 }}
                    value={filterVariant} onChange={e => setFilterVariant(e.target.value)} disabled={!variants.length}>
              <option value="">All variants</option>
              {variants.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">SKU or name</span>
            <input className="adm-input" style={{ width: '100%', marginTop: '.25rem' }}
                   placeholder="Search" value={filterSku} onChange={e => setFilterSku(e.target.value)} />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Status</span>
            <select className="adm-input" style={{ width: '100%', marginTop: '.25rem' }}
                    value={filterStock} onChange={e => setFilterStock(e.target.value)}>
              <option value="">Any status</option>
              {STOCK_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center',
                      borderTop: '1px solid #f4efec', marginTop: '.75rem', paddingTop: '.75rem' }}>
          <button className="adm-btn" onClick={() => bulkSet('In Stock')} disabled={!pendingIn}>
            Set these {pendingIn ? `${pendingIn} ` : ''}In Stock
          </button>
          <button className="adm-btn" onClick={() => bulkSet('Out of Stock')} disabled={!pendingOut}>
            Set these {pendingOut ? `${pendingOut} ` : ''}Out of Stock
          </button>
          {anyFilter && <button className="adm-btn" onClick={clearAll}>Clear filters</button>}
          <span style={{ fontSize: '.76rem', color: '#9a908a' }}>
            These buttons only touch the {filtered.length} products shown.
          </span>
        </div>
      </Card>

      <Card title={`${filtered.length} ${filtered.length === 1 ? 'product' : 'products'}`}>
        {loading ? (
          <Empty>Loading the catalogue…</Empty>
        ) : filtered.length === 0 ? (
          <Empty>Nothing matches these filters. Clear them to see the whole catalogue.</Empty>
        ) : filtered.map(p => {
          const current = (p.stock ?? 'In Stock') as StockStatus;
          const isSaving = saving[p.dbId];
          const variant = productVariant(p);
          return (
            <div key={p.dbId} className="adm-item" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              <div style={{ minWidth: 0 }}>
                <Link href={`/admin/products/${p.dbId}`} className="adm-item-t" style={{ display: 'block', textDecoration: 'none' }}>
                  {p.name}
                </Link>
                <div className="adm-item-s">
                  {p.sku || 'no SKU'}
                  {p.category ? ` · ${p.category}` : ''}
                  {(p as any).subcategory ? ` · ${(p as any).subcategory}` : ''}
                  {variant ? ` · ${variant}` : ''}
                </div>
              </div>
              <div className="adm-toolbar" style={{ margin: 0, justifyContent: 'flex-end' }}>
                {STOCK_OPTIONS.map(opt => (
                  <button key={opt} type="button" className={`adm-chip${current === opt ? ' on' : ''}`}
                          disabled={isSaving || current === opt}
                          onClick={() => setOne(p, opt)}
                          style={current === opt ? { cursor: 'default' } : undefined}>
                    {isSaving && current !== opt ? '…' : SHORT[opt]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
