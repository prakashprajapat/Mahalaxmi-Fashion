'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { exportProducts } from '@/lib/exportExcel';
import type { Product } from '@/types';
import { PageHeader, Card, Stat, StatGrid, Chips, Empty, Pill } from '@/components/admin/Ui';
import { fetchAllProducts } from '@/lib/adminPaged';
import { draftHoldReasons } from '@/lib/productQC';

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

// Jo dekha ja raha tha, wahi wapas aane par mile.
//
// 140 product hain. Koi "Sarees" chunta hai, niche scroll karke bees-pacchees
// product baad wale ko kholta hai, kuch sudhar kar wapas aata hai — aur list
// phir se shuru se, bina filter ke. Us product tak dobara pahunchne me utni hi
// mehnat lagti hai jitni pehli baar, har baar. Das product theek karne hain to
// yahi das baar.
//
// Isliye chhani hui halat yaad rakhi jati hai: khoj, shreni, upvarg, tab,
// tartib aur kitna scroll kiya tha.
//
// localStorage me, sessionStorage me nahi. Pehle ye us tab tak hi yaad rehti
// thi, is soch se ki kal subah dukaan adhi chhani hui na khule. Par kaam aisa
// nahi chalta: Sarees theek karte-karte shaam ho jati hai aur agle din wahi
// kaam wahin se uthana hota hai. Isliye ab jo chuna hai wahi laga rehta hai —
// jab tak khud na badlein. Hatana ho to "Clear" wahin bagal me hai, aur
// chipkon me "All 140" hamesha dikhta rehta hai, to chhanni chhup nahi sakti.
const VIEW_KEY = 'mfh_admin_products_view';

interface SavedView { search: string; cat: string; sub: string; tab: string; sortBy: string; sortDir: string; y: number }

function readView(): SavedView | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedView>;
    return {
      search:  typeof v.search  === 'string' ? v.search  : '',
      cat:     typeof v.cat     === 'string' ? v.cat     : '',
      sub:     typeof v.sub     === 'string' ? v.sub     : '',
      tab:     typeof v.tab     === 'string' ? v.tab     : 'all',
      sortBy:  typeof v.sortBy  === 'string' ? v.sortBy  : '',
      sortDir: v.sortDir === 'asc' ? 'asc' : 'desc',
      y:       typeof v.y       === 'number' ? v.y       : 0,
    };
  } catch { return null; }   // private window, band ki hui storage — bhool jana hi theek
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // Pehle render par hi purani halat — ek jhalak bina filter ke na dikhe.
  const saved = useRef<SavedView | null>(typeof window === 'undefined' ? null : readView());
  const [search, setSearch] = useState(saved.current?.search ?? '');
  const [catFilter, setCatFilter] = useState(saved.current?.cat ?? '');
  const [subFilter, setSubFilter] = useState(saved.current?.sub ?? '');
  const [tab, setTab] = useState(saved.current?.tab ?? 'all');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'stock' | ''>((saved.current?.sortBy as 'name' | 'price' | 'stock' | '') ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(saved.current?.sortDir === 'asc' ? 'asc' : 'desc');
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [busy, setBusy] = useState('');
  const csvRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLLabelElement>(null);

  // Har badlaav par likh dete hain — chhodte waqt likhne ka bharosa nahi kiya
  // ja sakta: tab band ho sakta hai, browser maar sakta hai.
  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_KEY, JSON.stringify({
        search, cat: catFilter, sub: subFilter, tab, sortBy, sortDir, y: window.scrollY,
      }));
    } catch { /* storage band ho to filter yaad na rahe, kaam na ruke */ }
  }, [search, catFilter, subFilter, tab, sortBy, sortDir]);

  // Scroll alag se: badalta rehta hai, isliye jaate waqt hi likhna kafi hai.
  useEffect(() => {
    const save = () => {
      try {
        const raw = window.localStorage.getItem(VIEW_KEY);
        const v = raw ? JSON.parse(raw) : {};
        window.localStorage.setItem(VIEW_KEY, JSON.stringify({ ...v, y: window.scrollY }));
      } catch { /* ignore */ }
    };
    window.addEventListener('pagehide', save);
    return () => { save(); window.removeEventListener('pagehide', save); };
  }, []);

  // List aane ke baad hi wahan wapas jaya ja sakta hai jahan chhoda tha —
  // khali panne par scroll karne ki koi jagah hi nahi hoti.
  const restored = useRef(false);
  useEffect(() => {
    if (loading || restored.current) return;
    restored.current = true;
    const y = saved.current?.y ?? 0;
    if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
  }, [loading]);

  const fetchProducts = () =>
    fetchAllProducts({}, getAdminToken() ?? undefined)
      .then(setProducts)
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
    const matchSub = !subFilter || (p.subcategory ?? '') === subFilter;
    const matchTab = tab === 'all' || tabOf(p) === tab;
    return matchSearch && matchCat && matchSub && matchTab;
  });

  // Upvarg ki soochi shreni ke saath badalti hai - "Women" chunne par "Sarees"
  // dikhe, "Shirts" nahi. Haath se likhi list purani pad jati, isliye catalogue
  // se hi bana lete hain.
  const subcats = useMemo(() => Array.from(new Set(
    products.filter(p => !catFilter || p.category === catFilter)
            .map(p => (p.subcategory ?? '').trim()).filter(Boolean),
  )).sort(), [products, catFilter]);

  // Shreni badalne par agar purana upvarg usme hai hi nahi, to khali list mil
  // jati — isliye woh apne aap hat jata hai.
  //
  // Par sirf tab, jab catalogue haath me ho. Pehla render khali list ke saath
  // hota hai, to upvargon ki soochi bhi khali hoti hai — aur yahi chhanni
  // "Sarees" ko usme na paakar saaf kar deti thi. Natija: wapas aate hi chuna
  // hua upvarg apne aap "All subcategories" ho jata tha, bina kisi ke chhue.
  // Khali soochi ka matlab "aisa upvarg hai hi nahi" nahi, "abhi pata nahi" hai.
  useEffect(() => {
    if (loading || products.length === 0) return;
    if (subFilter && !subcats.includes(subFilter)) setSubFilter('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, products.length, catFilter, subcats.join('|')]);

  const priceOf = (p: Product) =>
    ((p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price) + (p.shippingCharge ?? 0);

  const shown = !sortBy ? filtered : [...filtered].sort((a, b) => {
    let d = 0;
    if (sortBy === 'name')  d = a.name.localeCompare(b.name);
    if (sortBy === 'price') d = priceOf(a) - priceOf(b);
    if (sortBy === 'stock') d = (a.stock ?? '').localeCompare(b.stock ?? '');
    return sortDir === 'asc' ? d : -d;
  });
  const toggleSort = (k: 'name' | 'price' | 'stock') => {
    if (sortBy === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(k); setSortDir('asc'); }
  };
  const arrow = (k: string) => (sortBy === k ? (sortDir === 'asc' ? ' \u25b2' : ' \u25bc') : '');

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
            <Link className="adm-btn" href="/admin/products/colour-fix">🎨 Colour Fix</Link>
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
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.7rem', alignItems: 'center' }}>
          <span style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase',
                         letterSpacing: '.04em', color: '#8a7f76' }}>Filter by</span>
          <input className="adm-input" style={{ flex: '1 1 200px' }}
                 placeholder="Search name, SKU or subcategory"
                 value={search} onChange={e => setSearch(e.target.value)} />
          <select className="adm-input" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="adm-input" style={{ maxWidth: 190 }} value={subFilter}
                  onChange={e => setSubFilter(e.target.value)}>
            <option value="">All subcategories</option>
            {subcats.map(sc => <option key={sc} value={sc}>{sc}</option>)}
          </select>
          {(search || catFilter || subFilter || sortBy) && (
            <button className="adm-btn" onClick={() => { setSearch(''); setCatFilter(''); setSubFilter(''); setSortBy(''); }}>
              Clear
            </button>
          )}
        </div>
        <Chips value={tab} onChange={setTab}
               items={TABS.map(t => ({ key: t.key, label: t.label, count: counts[t.key] ?? 0 }))} />

        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', borderTop: '1px solid #f4efec', paddingTop: '.7rem' }}>
          <button className="adm-btn" onClick={() => handleMarkAll('In Stock')} disabled={Boolean(busy)}>Mark all In Stock</button>
          <button className="adm-btn" onClick={() => handleMarkAll('Out of Stock')} disabled={Boolean(busy)}>Mark all Out of Stock</button>
          {busy && <span style={{ fontSize: '.8rem', color: '#7d736d', alignSelf: 'center' }}>{busy}</span>}
        </div>
      </Card>

      <Card title={`${shown.length} ${shown.length === 1 ? 'product' : 'products'}`}>
        {loading ? (
          <Empty>Loading the catalogue…</Empty>
        ) : filtered.length === 0 ? (
          <Empty>
            {products.length === 0
              ? 'Nothing in the catalogue yet. Add your first product and it will appear here.'
              : 'No product matches this search. Clear the search or pick a different tab.'}
          </Empty>
        ) : (
          /* Catalogue ab khaane me hai: tasveer aur naam, SKU, shreni, upvarg,
             daam, haalat. Naam, daam aur haalat ke khaane par click karke
             tartib badal sakte hain - aur yeh tartib bhi chhanni ke saath yaad
             rehti hai, to product kholkar wapas aane par list waisi hi milti
             hai jaisi chhodi thi. */
          <div className="adm-table-wrap">
            <table className="adm-table adm-table-sticky">
              <thead>
                <tr>
                  <th><button type="button" className="adm-sort" onClick={() => toggleSort('name')}>Product{arrow('name')}</button></th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Subcategory</th>
                  <th className="num"><button type="button" className="adm-sort" onClick={() => toggleSort('price')}>Price{arrow('price')}</button></th>
                  <th><button type="button" className="adm-sort" onClick={() => toggleSort('stock')}>Status{arrow('stock')}</button></th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(p => {
                  const isDraft = p.stock === 'Draft';
                  const isInactive = p.stock === 'Inactive';
                  const off = isDraft || isInactive;
                  const base = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
                  const ship = p.shippingCharge ?? 0;
                  return (
                    <tr key={p.dbId} style={off ? { opacity: .68 } : undefined}>
                      <td data-label="Product">
                        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                          {p.image
                            ? <img src={p.image} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0,
                                                                 border: '1px solid #f0eae7', filter: off ? 'grayscale(1)' : undefined }} />
                            : <div className="adm-item-thumb" style={{ width: 36, height: 36, fontSize: '.85rem', flexShrink: 0 }}>&mdash;</div>}
                          <div style={{ minWidth: 0 }}>
                            <Link href={`/admin/products/${p.dbId}`}
                                  style={{ fontWeight: 650, color: '#2d2724', textDecoration: 'none', display: 'block',
                                           maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.name}
                            </Link>
                            {isDraft && (() => {
                              // Wajah yahin likh do. Pehle sirf "open it to see what Google
                              // is missing" likha tha - aur khol kar dekhne par jawab panne
                              // ke sabse upar hota tha, jabki Save ka batan sabse neeche.
                              // Yeh wahi jaanch hai jo save ke waqt chalti hai, isliye dono
                              // jagah jawab ek hi rehta hai.
                              const why = draftHoldReasons(p);
                              return (
                                <span style={{ fontSize: '.7rem', color: '#b26b00', fontWeight: 700, display: 'block', whiteSpace: 'normal' }}>
                                  Held back &mdash; {why.length > 0 ? why.join(' \u00b7 ') : 'open it to see what Google is missing'}
                                  {why.some(w => w.startsWith('Colour ')) && (
                                    <>
                                      {' '}
                                      <Link href="/admin/products/colour-fix" style={{ color: '#722f37', textDecoration: 'underline' }}>
                                        Fix in Colour Fix &rarr;
                                      </Link>
                                    </>
                                  )}
                                </span>
                              );
                            })()}
                            {isInactive && <span style={{ fontSize: '.7rem', color: '#c0392b', fontWeight: 700 }}>Switched off &mdash; not on the website</span>}
                          </div>
                        </div>
                      </td>
                      <td data-label="SKU" className="mono">{p.sku || <span style={{ color: '#c4bab5' }}>no SKU</span>}</td>
                      <td data-label="Category">{p.category}</td>
                      <td data-label="Subcategory">{p.subcategory || <span style={{ color: '#c4bab5' }}>&mdash;</span>}</td>
                      <td data-label="Price" className="num">
                        <span className="adm-money">&#8377;{(base + ship).toLocaleString('en-IN')}</span>
                        {ship > 0 && <div className="adm-money-s">incl. &#8377;{ship.toLocaleString('en-IN')} shipping</div>}
                        {p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price && (
                          <div className="adm-money-s" style={{ textDecoration: 'line-through' }}>&#8377;{p.price.toLocaleString('en-IN')}</div>
                        )}
                      </td>
                      <td data-label="Status">
                        <Pill tone={isDraft ? 'amber' : isInactive ? 'grey' : p.stock === 'In Stock' ? 'green' : p.stock === 'Limited Stock' ? 'amber' : 'red'}>
                          {p.stock}
                        </Pill>
                      </td>
                      <td data-label="Action">
                        <div className="adm-actions" style={{ flexWrap: 'wrap', margin: 0 }}>
                          <Link href={`/admin/products/${p.dbId}`}>Edit</Link>
                          {isInactive
                            ? <button onClick={() => handleActivate(p.dbId, p.sku ?? p.name)} style={{ color: '#2e7d32' }}>Activate</button>
                            : <button onClick={() => handleInactive(p.dbId, p.sku ?? p.name)} style={{ color: '#c0392b' }}>Switch off</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
