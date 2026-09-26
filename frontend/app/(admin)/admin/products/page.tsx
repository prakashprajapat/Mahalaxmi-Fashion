'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { exportProducts } from '@/lib/exportExcel';
import type { Product } from '@/types';
import { PageHeader, Card, Stat, StatGrid, Chips, Empty, Pill } from '@/components/admin/Ui';

const CATEGORIES = ['Women','Men','Kids','Beauty','Fabrics','More'];

// ── CSV ────────────────────────────────────────────────────────────────────
function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let cur = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQuote && line[i+1] === '"') { cur += '"'; i++; } else inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

function exportProductsCSV(products: Product[]) {
  const header = ['name','category','subcategory','price','discountPrice','stock','sku','description','image','bestSeller','hsnCode','gstRate'];
  const rows = products.map(p => [
    p.name, p.category, p.subcategory ?? '', p.price, p.discountPrice ?? '',
    p.stock, p.sku ?? '', p.description ?? '', p.image ?? '', p.bestSeller ? 'true' : 'false',
    (p as any).hsnCode ?? '6211', (p as any).gstRate ?? 5,
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `products-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// Five words the catalogue actually uses, and what each one means for the
// website. Draft and Inactive both mean "not on the website", but they are not
// the same thing: a draft was held back by the quality gate and has a list of
// fixes, an inactive product was switched off on purpose.
const TABS = [
  { key: 'all',      label: 'All' },
  { key: 'live',     label: 'Live' },
  { key: 'limited',  label: 'Limited' },
  { key: 'out',      label: 'Out of Stock' },
  { key: 'draft',    label: 'Draft' },
  { key: 'inactive', label: 'Inactive' },
] as const;

function tabOf(p: Product): string {
  if (p.stock === 'Draft') return 'draft';
  if (p.stock === 'Inactive') return 'inactive';
  if (p.stock === 'Limited Stock') return 'limited';
  if (p.stock === 'In Stock') return 'live';
  return 'out';
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [tab, setTab] = useState('all');
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [busy, setBusy] = useState('');
  const csvRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLLabelElement>(null);

  const fetchProducts = () =>
    productsApi.getAll({ pageSize: 500 })
      .then(r => setProducts(r.products))
      .finally(() => setLoading(false));

  useEffect(() => { fetchProducts(); }, []);

  // The tab in the address bar, so the Dashboard can send you straight here.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t && TABS.some(x => x.key === t)) setTab(t);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: products.length };
    products.forEach(p => { const k = tabOf(p); c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [products]);

  const filtered = products.filter(p => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      (p.sku ?? '').toLowerCase().includes(q) ||
      (p.subcategory ?? '').toLowerCase().includes(q);
    const matchCat = !catFilter || p.category === catFilter;
    const matchTab = tab === 'all' || tabOf(p) === tab;
    return matchSearch && matchCat && matchTab;
  });

  const handleInactive = async (id: number, sku: string) => {
    if (!confirm(`Mark product SKU ${sku} as Inactive?\nThis product will be removed from the website but not deleted.`)) return;
    await productsApi.updateStock(id, 'Inactive', getAdminToken() ?? '').catch(e => alert(e.message));
    await fetchProducts();
  };

  const handleActivate = async (id: number, sku: string) => {
    if (!confirm(`Set ${sku} back to Active?`)) return;
    await productsApi.updateStock(id, 'In Stock', getAdminToken() ?? '').catch(e => alert(e.message));
    await fetchProducts();
  };

  const handleMarkAll = async (stock: 'In Stock' | 'Out of Stock') => {
    if (!confirm(`Mark all ${products.length} products as "${stock}"?`)) return;
    const token = getAdminToken() ?? '';
    setBusy(`Updating ${products.length} products…`);
    for (const p of products) {
      await productsApi.update(p.dbId, { ...p, stock }, token).catch(() => {});
    }
    setBusy('');
    await fetchProducts();
    alert(`All products marked as ${stock}.`);
  };

  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { setBulkStatus('CSV is empty or has no data rows.'); return; }
      const headers = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase());
      setCsvHeaders(headers);
      const rows = lines.slice(1).map(l => {
        const vals = parseCsvRow(l);
        return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]));
      }).filter(r => Object.values(r).some(v => v));
      setCsvPreview(rows);
      setBulkStatus(`Preview: ${rows.length} products ready to import.`);
    };
    reader.readAsText(file);
  };

  const handleBulkImport = async () => {
    if (!csvPreview.length) return;
    setImporting(true);
    try {
      const rows = csvPreview.map(row => ({
        name: row.name || row['product name'] || '',
        category: row.category || 'Women',
        subcategory: row.subcategory || '',
        price: Number(row.price || row['mrp'] || 0),
        discountPrice: row.discountprice || row['discount price'] || row['sale price']
          ? Number(row.discountprice || row['discount price'] || row['sale price']) : null,
        stock: row.stock || 'In Stock',
        sku: row.sku || row['sku id'] || '',
        description: row.description || '',
        image: row.image || row['image url'] || '',
        bestSeller: ['true','yes','1'].includes((row.bestseller || row['best seller'] || '').toLowerCase()),
        hsnCode: row.hsncode || row['hsn code'] || '6211',
        gstRate: Number(row.gstrate || row['gst rate'] || 5),
      }));
      await productsApi.bulkSave(rows, getAdminToken() ?? '');
      await fetchProducts();
      setCsvPreview([]); setCsvHeaders([]);
      setBulkStatus(`Imported ${rows.length} products.`);
    } catch (e) { setBulkStatus('Import failed: ' + (e as Error).message); }
    finally { setImporting(false); }
  };

  return (
    <div className="admin-page">
      <PageHeader
        title="Products"
        sub={`${products.length} in the catalogue · ${counts.live ?? 0} showing on the website`}
        right={
          <>
            <button className="adm-btn" onClick={() => setShowBulk(v => !v)}>Bulk Import</button>
            <button className="adm-btn" onClick={() => exportProductsCSV(filtered)}>CSV</button>
            <button className="adm-btn" onClick={() => exportProducts(filtered)}>Excel</button>
            <Link className="adm-btn adm-btn-primary" href="/admin/products/add">Add Product</Link>
          </>
        }
      />

      <StatGrid>
        <Stat label="On the website" value={counts.live ?? 0} tone="green"
              action={tab === 'live' ? undefined : 'Show only these'} onClick={() => setTab('live')} />
        <Stat label="Out of stock" value={counts.out ?? 0} tone={(counts.out ?? 0) > 0 ? 'red' : undefined}
              action="Restock" href="/admin/stock" />
        <Stat label="Drafts" value={counts.draft ?? 0} tone={(counts.draft ?? 0) > 0 ? 'red' : undefined}
              action="Fix and publish" href="/admin/products/drafts" />
        <Stat label="Switched off" value={counts.inactive ?? 0}
              action={tab === 'inactive' ? undefined : 'Show only these'} onClick={() => setTab('inactive')} />
      </StatGrid>

      {showBulk && (
        <Card title="Bulk CSV Import">
          <p style={{ fontSize: '.82rem', color: '#7d736d', margin: '0 0 .75rem', lineHeight: 1.55 }}>
            Columns the file may have: <code>name, category, subcategory, price, discountPrice, stock, sku,
            description, image, bestSeller, hsnCode, gstRate</code>. Anything missing is filled with a sensible
            default — but a product imported this way still has to pass the quality checks before it goes live.
          </p>
          <label ref={dropRef}
            style={{ display: 'block', border: '1.5px dashed #e0d5d6', borderRadius: '12px', padding: '1.5rem',
                     textAlign: 'center', cursor: 'pointer', marginBottom: '.75rem', background: '#fcfaf9' }}
            onDragOver={e => { e.preventDefault(); if (dropRef.current) dropRef.current.style.borderColor = '#722f37'; }}
            onDragLeave={() => { if (dropRef.current) dropRef.current.style.borderColor = '#e0d5d6'; }}
            onDrop={e => { e.preventDefault(); if (dropRef.current) dropRef.current.style.borderColor = '#e0d5d6'; const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}>
            <p style={{ fontWeight: 700, fontSize: '.88rem', margin: '0 0 .2rem' }}>Drop a CSV here, or click to choose one</p>
            <p style={{ fontSize: '.78rem', color: '#9a908a', margin: 0 }}>.csv files only</p>
            <input ref={csvRef} type="file" accept=".csv,text/csv" hidden
                   onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
          </label>

          {bulkStatus && <p style={{ fontSize: '.84rem', fontWeight: 700, color: '#463d38', margin: '0 0 .75rem' }}>{bulkStatus}</p>}

          {csvPreview.length > 0 && (
            <>
              <div style={{ overflowX: 'auto', marginBottom: '.75rem', maxHeight: '220px', border: '1px solid #f0eae7', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem' }}>
                  <thead style={{ background: '#faf7f6', position: 'sticky', top: 0 }}>
                    <tr>{csvHeaders.map(h => (
                      <th key={h} style={{ padding: '.4rem .7rem', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 700, color: '#7d736d' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {csvPreview.slice(0, 10).map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f6f1ef' }}>
                        {csvHeaders.map(h => (
                          <td key={h} style={{ padding: '.4rem .7rem', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row[h]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvPreview.length > 10 && (
                <p style={{ fontSize: '.78rem', color: '#9a908a', margin: '0 0 .6rem' }}>Showing the first 10 of {csvPreview.length} rows.</p>
              )}
              <button className="adm-btn adm-btn-primary" onClick={handleBulkImport} disabled={importing}>
                {importing ? 'Importing…' : `Import ${csvPreview.length} products`}
              </button>
            </>
          )}
        </Card>
      )}

      <Card>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.7rem' }}>
          <input className="adm-input" style={{ flex: '1 1 220px' }}
                 placeholder="Search name, SKU or subcategory"
                 value={search} onChange={e => setSearch(e.target.value)} />
          <select className="adm-input" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <Chips value={tab} onChange={setTab}
               items={TABS.map(t => ({ key: t.key, label: t.label, count: counts[t.key] ?? 0 }))} />

        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', borderTop: '1px solid #f4efec', paddingTop: '.7rem' }}>
          <button className="adm-btn" onClick={() => handleMarkAll('In Stock')} disabled={Boolean(busy)}>Mark all In Stock</button>
          <button className="adm-btn" onClick={() => handleMarkAll('Out of Stock')} disabled={Boolean(busy)}>Mark all Out of Stock</button>
          {busy && <span style={{ fontSize: '.8rem', color: '#7d736d', alignSelf: 'center' }}>{busy}</span>}
        </div>
      </Card>

      <Card title={`${filtered.length} ${filtered.length === 1 ? 'product' : 'products'}`}>
        {loading ? (
          <Empty>Loading the catalogue…</Empty>
        ) : filtered.length === 0 ? (
          <Empty>
            {products.length === 0
              ? 'Nothing in the catalogue yet. Add your first product and it will appear here.'
              : 'No product matches this search. Clear the search or pick a different tab.'}
          </Empty>
        ) : filtered.map(p => {
          const isDraft = p.stock === 'Draft';
          const isInactive = p.stock === 'Inactive';
          const off = isDraft || isInactive;
          const base = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
          const ship = p.shippingCharge ?? 0;
          return (
            <div key={p.dbId} className="adm-item" style={off ? { opacity: .62 } : undefined}>
              {p.image
                ? <img src={p.image} alt="" className="adm-item-thumb" style={off ? { filter: 'grayscale(1)' } : undefined} />
                : <div className="adm-item-thumb">—</div>}

              <div style={{ minWidth: 0 }}>
                <Link href={`/admin/products/${p.dbId}`} className="adm-item-t" style={{ display: 'block', textDecoration: 'none' }}>
                  {p.name}
                </Link>
                <div className="adm-item-s">
                  {p.sku || 'no SKU'} · {p.category}{p.subcategory ? ` · ${p.subcategory}` : ''}
                </div>
                {isDraft && <div style={{ fontSize: '.72rem', color: '#b26b00', fontWeight: 700, marginTop: '.2rem' }}>
                  Held back — open it to see what Google is missing.
                </div>}
                {isInactive && <div style={{ fontSize: '.72rem', color: '#c0392b', fontWeight: 700, marginTop: '.2rem' }}>
                  Switched off — not on the website.
                </div>}
                <div className="adm-actions" style={{ marginTop: '.35rem' }}>
                  <Link href={`/admin/products/${p.dbId}`}>Edit</Link>
                  {isInactive
                    ? <button onClick={() => handleActivate(p.dbId, p.sku ?? p.name)} style={{ color: '#2e7d32' }}>Activate</button>
                    : <button onClick={() => handleInactive(p.dbId, p.sku ?? p.name)} style={{ color: '#c0392b' }}>Switch off</button>}
                </div>
              </div>

              <div className="adm-item-r">
                <span className="adm-money">₹{(base + ship).toLocaleString('en-IN')}</span>
                {ship > 0 && <span className="adm-money-s">incl. ₹{ship.toLocaleString('en-IN')} shipping</span>}
                {p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price && (
                  <span className="adm-money-s" style={{ textDecoration: 'line-through' }}>₹{p.price.toLocaleString('en-IN')}</span>
                )}
                <Pill tone={isDraft ? 'amber' : isInactive ? 'grey' : p.stock === 'In Stock' ? 'green' : p.stock === 'Limited Stock' ? 'amber' : 'red'}>
                  {p.stock}
                </Pill>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
