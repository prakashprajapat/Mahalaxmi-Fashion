'use client';
import { useState, useMemo, useEffect } from 'react';
import ProductCard from '@/components/product/ProductCard';
import { finalUnitPrice } from '@/lib/price';

interface Props {
  products: any[];
  title: string;
  initialQ?: string;
}

function normalizeSub(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function FilterSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid #eee' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '.75rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a' }}>
        {title}
        <span style={{ fontSize: '.65rem', color: '#aaa', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▼</span>
      </button>
      {open && <div style={{ paddingBottom: '.85rem' }}>{children}</div>}
    </div>
  );
}

function FilterContent({
  products, subcategories, allVariants, allSizes, allColors,
  globalMin, globalMax, priceMin, priceMax, selectedSubcat, selectedVariant, selectedSizes, selectedColors,
  setPriceMin, setPriceMax, setSelectedSubcat, setSelectedVariant, setSelectedSizes, setSelectedColors,
}: any) {
  const minPct = globalMax > globalMin ? ((priceMin - globalMin) / (globalMax - globalMin)) * 100 : 0;
  const maxPct = globalMax > globalMin ? ((globalMax - priceMax) / (globalMax - globalMin)) * 100 : 0;

  return (
    <div style={{ padding: '0 .25rem' }}>
      {/* Price Range */}
      <FilterSection title="Price">
        <div>
          <div style={{ position: 'relative', height: 34, display: 'flex', alignItems: 'center', marginBottom: '.75rem' }}>
            <div style={{ position: 'absolute', width: '100%', height: 4, background: '#e0e0e0', borderRadius: 2 }}>
              <div style={{ position: 'absolute', left: `${minPct}%`, right: `${maxPct}%`, height: '100%', background: '#a7354d', borderRadius: 2 }} />
            </div>
            <input type="range" className="pf-range" min={globalMin} max={globalMax} value={priceMin}
              onChange={e => { const v = +e.target.value; if (v < priceMax) setPriceMin(v); }}
              style={{ position: 'absolute', width: '100%', zIndex: 3 }} />
            <input type="range" className="pf-range" min={globalMin} max={globalMax} value={priceMax}
              onChange={e => { const v = +e.target.value; if (v > priceMin) setPriceMax(v); }}
              style={{ position: 'absolute', width: '100%', zIndex: 4 }} />
          </div>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <div style={{ flex: 1, border: '1.5px solid #ddd', borderRadius: 7, padding: '.32rem .5rem', display: 'flex', alignItems: 'center', gap: '.2rem' }}>
              <span style={{ color: '#999', fontSize: '.78rem' }}>₹</span>
              <input type="number" value={priceMin}
                onChange={e => setPriceMin(Math.max(globalMin, Math.min(+e.target.value, priceMax - 1)))}
                style={{ border: 'none', outline: 'none', width: '100%', fontSize: '.82rem', color: '#333' }} />
            </div>
            <span style={{ color: '#ccc', fontSize: '.75rem' }}>–</span>
            <div style={{ flex: 1, border: '1.5px solid #ddd', borderRadius: 7, padding: '.32rem .5rem', display: 'flex', alignItems: 'center', gap: '.2rem' }}>
              <span style={{ color: '#999', fontSize: '.78rem' }}>₹</span>
              <input type="number" value={priceMax}
                onChange={e => setPriceMax(Math.min(globalMax, Math.max(+e.target.value, priceMin + 1)))}
                style={{ border: 'none', outline: 'none', width: '100%', fontSize: '.82rem', color: '#333' }} />
            </div>
          </div>
        </div>
      </FilterSection>

      {/* Subcategory — dropdown list */}
      {subcategories.length > 0 && (
        <FilterSection title="Subcategory">
          <select
            value={normalizeSub(selectedSubcat)}
            onChange={e => {
              const chosen = subcategories.find(({ key }: any) => key === e.target.value);
              setSelectedSubcat(chosen ? chosen.label : '');
            }}
            style={{
              width: '100%',
              padding: '.45rem .6rem',
              borderRadius: '8px',
              border: '1.5px solid #ddd',
              fontSize: '.82rem',
              color: selectedSubcat ? '#a7354d' : '#555',
              fontWeight: selectedSubcat ? 700 : 400,
              background: '#fff',
              cursor: 'pointer',
              outline: 'none',
              appearance: 'auto',
            }}
          >
            <option value="">All Subcategories</option>
            {subcategories.map(({ key, label }: any) => {
              const count = products.filter((p: any) => normalizeSub(p.subcategory ?? '') === key).length;
              return (
                <option key={key} value={key}>{label} ({count})</option>
              );
            })}
          </select>
        </FilterSection>
      )}

      {/* Variant — dropdown list */}
      {allVariants.length > 0 && (
        <FilterSection title="Variant">
          <select
            value={selectedVariant}
            onChange={e => setSelectedVariant(e.target.value)}
            style={{
              width: '100%',
              padding: '.45rem .6rem',
              borderRadius: '8px',
              border: '1.5px solid #ddd',
              fontSize: '.82rem',
              color: selectedVariant ? '#a7354d' : '#555',
              fontWeight: selectedVariant ? 700 : 400,
              background: '#fff',
              cursor: 'pointer',
              outline: 'none',
              appearance: 'auto',
            }}
          >
            <option value="">All Variants</option>
            {allVariants.map((v: string) => {
              const count = products.filter((p: any) => { try { return (JSON.parse(p.extraJson ?? '{}').variant ?? '') === v; } catch { return false; } }).length;
              return <option key={v} value={v}>{v} ({count})</option>;
            })}
          </select>
        </FilterSection>
      )}

      {/* Size */}
      {allSizes.length > 0 && (
        <FilterSection title="Size" defaultOpen={false}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
            {allSizes.map((s: string) => {
              const active = selectedSizes.includes(s);
              return (
                <button key={s}
                  onClick={() => setSelectedSizes((prev: string[]) => active ? prev.filter((x: string) => x !== s) : [...prev, s])}
                  style={{ padding: '.25rem .6rem', borderRadius: 6, border: `1.5px solid ${active ? '#a7354d' : '#ddd'}`, background: active ? '#fdf0f3' : '#fff', color: active ? '#a7354d' : '#555', fontSize: '.78rem', fontWeight: active ? 700 : 400, cursor: 'pointer', minWidth: 32, textAlign: 'center' }}>
                  {s}
                </button>
              );
            })}
          </div>
        </FilterSection>
      )}

      {/* Color */}
      {allColors.length > 0 && (
        <FilterSection title="Color" defaultOpen={false}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
            {allColors.map((c: string) => {
              const active = selectedColors.includes(c);
              return (
                <button key={c}
                  onClick={() => setSelectedColors((prev: string[]) => active ? prev.filter((x: string) => x !== c) : [...prev, c])}
                  style={{ padding: '.25rem .65rem', borderRadius: 20, border: `1.5px solid ${active ? '#a7354d' : '#ddd'}`, background: active ? '#fdf0f3' : '#fff', color: active ? '#a7354d' : '#444', fontSize: '.78rem', fontWeight: active ? 700 : 400, cursor: 'pointer' }}>
                  {c}
                </button>
              );
            })}
          </div>
        </FilterSection>
      )}
    </div>
  );
}

export default function ProductsClient({ products, title, initialQ = '' }: Props) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sort, setSort] = useState('position');
  const [selectedSubcat, setSelectedSubcat] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [q, setQ] = useState(initialQ);

  // Compute global price range from actual products
  const { globalMin, globalMax } = useMemo(() => {
    const prices = products.map((p: any) => {
      const v = finalUnitPrice(p);
      return typeof v === 'number' && v > 0 ? v : null;
    }).filter((v): v is number => v !== null);
    return {
      globalMin: prices.length ? Math.floor(Math.min(...prices)) : 0,
      globalMax: prices.length ? Math.ceil(Math.max(...prices))  : 10000,
    };
  }, [products]);

  const [priceMin, setPriceMin] = useState(globalMin);
  const [priceMax, setPriceMax] = useState(globalMax);

  // Reset ALL filters when navigating to a new category (products array changes)
  useEffect(() => {
    setPriceMin(globalMin);
    setPriceMax(globalMax);
    setSelectedSubcat('');
    setSelectedVariant('');
    setSelectedSizes([]);
    setSelectedColors([]);
    setSort('position');
    setQ('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const subcatMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p: any) => {
      const raw = p.subcategory?.trim();
      if (raw) {
        const key = normalizeSub(raw);
        if (!map.has(key)) map.set(key, raw.replace(/\b\w+/g, (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()));
      }
    });
    return map;
  }, [products]);

  const subcategories = useMemo(() =>
    Array.from(subcatMap.entries()).map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label)),
    [subcatMap]);

  const allSizes = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p: any) => { try { JSON.parse(p.extraJson ?? '{}').sizes?.forEach((x: string) => s.add(x)); } catch {} });
    return Array.from(s).sort();
  }, [products]);

  const allColors = useMemo(() => {
    const c = new Set<string>();
    products.forEach((p: any) => {
      try {
        const ex = JSON.parse(p.extraJson ?? '{}');
        ex.colors?.forEach((x: string) => c.add(x));
        ex.customColors?.forEach((x: any) => x.name && c.add(x.name));
      } catch {}
    });
    return Array.from(c).sort();
  }, [products]);

  const allVariants = useMemo(() => {
    const v = new Set<string>();
    products.forEach((p: any) => { try { const val = JSON.parse(p.extraJson ?? '{}').variant; if (val) v.add(val); } catch {} });
    return Array.from(v).sort();
  }, [products]);

  const filtered = useMemo(() => {
    let r = [...products];
    if (q) {
      const lq = q.toLowerCase();
      r = r.filter((p: any) => p.name?.toLowerCase().includes(lq) || p.description?.toLowerCase().includes(lq) || (p.subcategory ?? '').toLowerCase().includes(lq));
    }
    if (selectedSubcat) r = r.filter((p: any) => normalizeSub(p.subcategory ?? '') === normalizeSub(selectedSubcat));
    if (selectedVariant) r = r.filter((p: any) => { try { return (JSON.parse(p.extraJson ?? '{}').variant ?? '') === selectedVariant; } catch { return false; } });
    r = r.filter((p: any) => { const price = finalUnitPrice(p); return price >= priceMin && price <= priceMax; });
    if (selectedSizes.length > 0) r = r.filter((p: any) => { try { return selectedSizes.some(s => (JSON.parse(p.extraJson ?? '{}').sizes ?? []).includes(s)); } catch { return false; } });
    if (selectedColors.length > 0) r = r.filter((p: any) => { try { const ex = JSON.parse(p.extraJson ?? '{}'); const pc = [...(ex.colors ?? []), ...(ex.customColors ?? []).map((c: any) => c.name).filter(Boolean)]; return selectedColors.some(c => pc.includes(c)); } catch { return false; } });
    switch (sort) {
      case 'price-low':  r.sort((a: any, b: any) => finalUnitPrice(a) - finalUnitPrice(b)); break;
      case 'price-high': r.sort((a: any, b: any) => finalUnitPrice(b) - finalUnitPrice(a)); break;
      case 'newest':     r.sort((a: any, b: any) => b.dbId - a.dbId); break;
      case 'oldest':     r.sort((a: any, b: any) => a.dbId - b.dbId); break;
      case 'az':         r.sort((a: any, b: any) => a.name.localeCompare(b.name)); break;
      case 'za':         r.sort((a: any, b: any) => b.name.localeCompare(a.name)); break;
      case 'best':       r.sort((a: any, b: any) => (b.bestSeller ? 1 : 0) - (a.bestSeller ? 1 : 0)); break;
      case 'discount':   r.sort((a: any, b: any) => { const dA = a.discountPrice ? Math.round(((a.price - a.discountPrice) / a.price) * 100) : 0; const dB = b.discountPrice ? Math.round(((b.price - b.discountPrice) / b.price) * 100) : 0; return dB - dA; }); break;
    }
    return r;
  }, [products, q, selectedSubcat, selectedVariant, priceMin, priceMax, selectedSizes, selectedColors, sort]);

  const activeFilterCount = [selectedSubcat ? 1 : 0, selectedVariant ? 1 : 0, (priceMin > globalMin || priceMax < globalMax) ? 1 : 0, selectedSizes.length, selectedColors.length].reduce((a, b) => a + b, 0);

  const sortOptions = [
    { value: 'position',   label: 'Featured' },
    { value: 'best',       label: 'Best Selling' },
    { value: 'newest',     label: 'Date, New to Old' },
    { value: 'oldest',     label: 'Date, Old to New' },
    { value: 'az',         label: 'Alphabetically, A–Z' },
    { value: 'za',         label: 'Alphabetically, Z–A' },
    { value: 'price-low',  label: 'Price, Low to High' },
    { value: 'price-high', label: 'Price, High to Low' },
    { value: 'discount',   label: 'Discount: High to Low' },
  ];

  const clearAll = () => { setSelectedSubcat(''); setSelectedVariant(''); setSelectedSizes([]); setSelectedColors([]); setPriceMin(globalMin); setPriceMax(globalMax); setQ(''); };

  const filterProps = { products, subcategories, allVariants, allSizes, allColors, globalMin, globalMax, priceMin, priceMax, selectedSubcat, selectedVariant, selectedSizes, selectedColors, setPriceMin, setPriceMax, setSelectedSubcat, setSelectedVariant, setSelectedSizes, setSelectedColors };

  return (
    <>
      <style>{`
        .pf-range { -webkit-appearance: none; appearance: none; background: transparent; width: 100%; height: 20px; outline: none; pointer-events: none; }
        .pf-range::-webkit-slider-runnable-track { background: transparent; height: 4px; }
        .pf-range::-moz-range-track { background: transparent; height: 4px; border: none; }
        .pf-range::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #a7354d; border: 2.5px solid #fff; box-shadow: 0 1px 6px rgba(0,0,0,.25); cursor: pointer; pointer-events: all; margin-top: -8px; }
        .pf-range::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #a7354d; border: 2.5px solid #fff; box-shadow: 0 1px 6px rgba(0,0,0,.25); cursor: pointer; pointer-events: all; }

        /* ── Desktop layout ── */
        @media (min-width: 900px) {
          .pf-page { max-width: 1400px; margin: 0 auto; padding: 1.5rem 2rem; display: grid; grid-template-columns: 260px 1fr; gap: 2rem; align-items: start; }
          .pf-sidebar-desktop { display: block; position: sticky; top: 80px; background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 1rem 1.25rem; }
          .pf-mobile-bar { display: none !important; }
          .pf-sort-desktop { display: flex !important; }
          .pf-sort-mobile { display: none !important; }
          .pf-search { padding: 0 0 1rem; }
        }

        /* ── Mobile layout ── */
        @media (max-width: 899px) {
          .pf-page { display: block; }
          .pf-sidebar-desktop { display: none !important; }
          .pf-mobile-bar { display: flex !important; }
          .pf-sort-desktop { display: none !important; }
          .pf-sort-mobile { display: flex !important; }
          .pf-search { padding: 0 1rem .75rem; }
        }
      `}</style>

      <div className="pf-page">

        {/* ── Desktop Left Sidebar ── */}
        <aside className="pf-sidebar-desktop">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem', paddingBottom: '.75rem', borderBottom: '1px solid #eee' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1a1a1a' }}>Filters</span>
            {activeFilterCount > 0 && (
              <button onClick={clearAll} style={{ fontSize: '.75rem', color: '#a7354d', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Clear all ({activeFilterCount})
              </button>
            )}
          </div>
          <FilterContent {...filterProps} />
        </aside>

        {/* ── Right / Main Content ── */}
        <div>
          {/* Page heading */}
          <div style={{ padding: '0 0 .75rem' }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1a1a1a', margin: 0 }}>{title}</h1>
          </div>

          {/* Search */}
          <div className="pf-search">
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', background: '#f5f5f5', borderRadius: 10, padding: '.5rem .85rem' }}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="#aaa" strokeWidth="2"/><path d="m20 20-3-3" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/></svg>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search products..."
                style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '.88rem', color: '#333' }} />
              {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '.95rem', lineHeight: 1 }}>✕</button>}
            </div>
          </div>

          {/* ── Mobile sticky bar ── */}
          <div className="pf-mobile-bar" style={{ position: 'sticky', top: 0, zIndex: 100, background: '#fff', borderBottom: '1px solid #eee', borderTop: '1px solid #eee', alignItems: 'stretch' }}>
            <button onClick={() => setFilterOpen(true)}
              style={{ flex: 1, padding: '.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.45rem', background: 'none', border: 'none', borderRight: '1px solid #eee', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600, color: '#333' }}>
              <svg width="15" height="12" viewBox="0 0 18 14" fill="none"><path d="M1 1h16M4 7h10M7 13h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Filters
              {activeFilterCount > 0 && <span style={{ background: '#a7354d', color: '#fff', borderRadius: '50%', width: 17, height: 17, fontSize: '.65rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{activeFilterCount}</span>}
            </button>
            <button onClick={() => setSortOpen(true)}
              style={{ flex: 1, padding: '.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.35rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600, color: '#333' }}>
              Sort by <span style={{ fontSize: '.65rem' }}>▼</span>
            </button>
          </div>

          {/* Top bar: result count + desktop sort */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.5rem 0', flexWrap: 'wrap', gap: '.5rem' }}>
            <span style={{ fontSize: '.82rem', color: '#888' }}>
              {filtered.length} product{filtered.length !== 1 ? 's' : ''}
              {activeFilterCount > 0 && <button onClick={clearAll} className="pf-mobile-bar" style={{ fontSize: '.78rem', color: '#a7354d', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, marginLeft: '.5rem' }}>Clear all ✕</button>}
            </span>

            {/* Desktop sort dropdown */}
            <div className="pf-sort-desktop" style={{ alignItems: 'center', gap: '.5rem' }}>
              <span style={{ fontSize: '.82rem', color: '#888', whiteSpace: 'nowrap' }}>Sort by:</span>
              <select value={sort} onChange={e => setSort(e.target.value)}
                style={{ border: '1.5px solid #ddd', borderRadius: 8, padding: '.35rem .75rem', fontSize: '.85rem', cursor: 'pointer', color: '#333', background: '#fff' }}>
                {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Product Grid */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#888' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
              <p style={{ marginBottom: '1rem' }}>No products found.</p>
              <button onClick={clearAll} style={{ padding: '.6rem 1.5rem', background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>Clear Filters</button>
            </div>
          ) : (
            <div className="products-grid">
              {filtered.map((p: any) => <ProductCard key={p.dbId} product={p} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile Filter Drawer ── */}
      {filterOpen && (
        <>
          <div onClick={() => setFilterOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200 }} />
          <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 'min(340px, 94vw)', background: '#fff', zIndex: 201, display: 'flex', flexDirection: 'column', boxShadow: '4px 0 24px rgba(0,0,0,.18)' }}>
            <div style={{ padding: '.9rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eee', flexShrink: 0 }}>
              <span style={{ fontSize: '1rem', fontWeight: 700 }}>Filters</span>
              <button onClick={() => setFilterOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#555' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 1.25rem' }}>
              <FilterContent {...filterProps} />
            </div>
            <div style={{ padding: '.9rem 1.25rem', borderTop: '1px solid #eee', flexShrink: 0, display: 'flex', gap: '.65rem' }}>
              {activeFilterCount > 0 && (
                <button onClick={clearAll} style={{ padding: '.75rem 1rem', border: '1.5px solid #ddd', borderRadius: 10, background: '#fff', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer', color: '#555' }}>Clear</button>
              )}
              <button onClick={() => setFilterOpen(false)} style={{ flex: 1, padding: '.75rem', background: '#a7354d', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', letterSpacing: '.04em' }}>
                VIEW RESULTS ({filtered.length})
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Mobile Sort Bottom Sheet ── */}
      {sortOpen && (
        <>
          <div onClick={() => setSortOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200 }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', zIndex: 201, borderRadius: '16px 16px 0 0', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ padding: '.85rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eee' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700 }}>Sort by</span>
              <button onClick={() => setSortOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#555' }}>✕</button>
            </div>
            {sortOptions.map(({ value, label }) => (
              <button key={value} onClick={() => { setSort(value); setSortOpen(false); }}
                style={{ width: '100%', padding: '.9rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: sort === value ? '#fdf0f3' : 'none', border: 'none', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', fontSize: '.9rem', color: sort === value ? '#a7354d' : '#333', fontWeight: sort === value ? 700 : 400, textAlign: 'left' }}>
                {label}
                {sort === value && <span style={{ color: '#a7354d' }}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
