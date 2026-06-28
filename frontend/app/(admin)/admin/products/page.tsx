'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { exportProducts } from '@/lib/exportExcel';
import type { Product } from '@/types';

const CATEGORIES = ['Women','Men','Kids','Beauty','Fabrics','More'];
const SIZES_PRESET = ['XS','S','M','L','XL','XXL','XXXL','Free Size','28','30','32','34','36','38','40','42'];
const COLORS_PRESET = ['Red','Blue','Green','Yellow','Pink','Orange','Purple','Grey','Black','White','Navy','Maroon'];

interface PackCol { letter: string; front: string; side: string; back: string; zoomed: string; }
type CustomColour = { name: string; code: string; photo: string; columnLetter: string };
const COL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function emptyPackCol(i: number): PackCol {
  return { letter: COL_LETTERS[i] ?? String(i+1), front:'', side:'', back:'', zoomed:'' };
}

function getPackOfNumber(value: string | number | undefined | null): number {
  const n = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(26, n) : 0;
}

function hasPackPhoto(col: PackCol): boolean {
  return Boolean(col.front || col.side || col.back || col.zoomed);
}

function normalizePackColumns(cols: PackCol[], packOf: number): PackCol[] {
  const extraCount = packOf >= 2 ? packOf - 1 : 0;
  return Array.from({ length: extraCount }, (_, i) => ({
    ...(cols[i] ?? emptyPackCol(i)),
    letter: COL_LETTERS[i] ?? String(i + 1),
  }));
}

function stockStatusFromQty(qty: number): 'In Stock' | 'Limited Stock' | 'Out of Stock' {
  if (qty <= 0) return 'Out of Stock';
  if (qty < 5) return 'Limited Stock';
  return 'In Stock';
}

function generateSku(): string {
  return `MFH${String(Date.now()).slice(-8)}`;
}

function hexToRgb(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '';
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `RGB(${r},${g},${b})`;
}

function PhotoSlotMini({ label, value, onChange }: { label: string; value: string; onChange: (v:string)=>void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = (file: File) => {
    const rd = new FileReader();
    rd.onload = e => onChange(e.target?.result as string);
    rd.readAsDataURL(file);
  };
  return (
    <div style={{ border: '1.5px dashed #ddd', borderRadius: '8px', overflow: 'hidden', background: '#fff', marginBottom: '.4rem' }}>
      <div style={{ background: '#555', color: '#fff', fontSize: '.6rem', fontWeight: 700, textAlign: 'center', padding: '.2rem', letterSpacing: '.05em' }}>
        {label}
      </div>
      <div style={{ minHeight: '55px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f9f9f9', padding: '.2rem' }}
        onClick={() => fileRef.current?.click()}>
        {value
          ? <img src={value} alt="" style={{ maxWidth: '100%', maxHeight: '55px', objectFit: 'contain' }} onError={e=>(e.target as HTMLImageElement).style.display='none'} />
          : <span style={{ fontSize: '1.3rem', color: '#ccc' }}>📷</span>}
      </div>
      <div style={{ borderTop: '1px solid #eee', padding: '.2rem .3rem', display: 'flex', gap: '.25rem', alignItems: 'center', background: '#fff' }}>
        <button onClick={() => fileRef.current?.click()}
          style={{ fontSize: '.62rem', background: '#fdecea', color: '#a7354d', border: '1px solid #f5c6cb', borderRadius: '4px', cursor: 'pointer', padding: '.12rem .35rem', fontWeight: 600 }}>
          Upload
        </button>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="https://..."
          style={{ flex: 1, border: '1px solid #ddd', borderRadius: '4px', padding: '.18rem .3rem', fontSize: '.62rem', boxSizing: 'border-box', minWidth: 0 }} />
        {value && (
          <button onClick={() => onChange('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', fontSize: '.7rem', padding: 0 }}>✕</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
      </div>
    </div>
  );
}

function PhotoSlotFull({ label, value, onChange, isFirst = false }: { label: string; value: string; onChange: (v:string)=>void; isFirst?: boolean }) {
  const [showUrl, setShowUrl] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = (file: File) => {
    const rd = new FileReader();
    rd.onload = e => onChange(e.target?.result as string);
    rd.readAsDataURL(file);
  };
  const icon = label.includes('SIDE') ? '↔️' : label.includes('BACK') ? '🔄' : label.includes('ZOOM') ? '🔍' : '📷';
  return (
    <div style={{ border: isFirst ? '2px solid #1a1a2e' : '2px dashed #ddd', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      <div style={{ background: isFirst ? '#1a1a2e' : '#555', color: '#fff', fontSize: '.65rem', fontWeight: 700, textAlign: 'center', padding: '.3rem', letterSpacing: '.05em' }}>
        {label}{isFirst ? ' ★' : ''}
      </div>
      <div style={{ minHeight: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f9f9f9', padding: '.25rem' }}
        onClick={() => fileRef.current?.click()}>
        {value
          ? <img src={value} alt="" style={{ maxWidth: '100%', maxHeight: '90px', objectFit: 'contain' }} onError={e => (e.target as HTMLImageElement).style.display='none'} />
          : <span style={{ fontSize: '1.6rem' }}>{icon}</span>}
      </div>
      <div style={{ borderTop: '1px solid #eee', padding: '.3rem .4rem', display: 'flex', gap: '.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => fileRef.current?.click()}
          style={{ fontSize: '.65rem', background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontWeight: 600 }}>Upload</button>
        <button onClick={() => setShowUrl(v => !v)}
          style={{ fontSize: '.65rem', background: '#f0f0f0', border: 'none', cursor: 'pointer', padding: '.12rem .35rem', borderRadius: '4px', fontWeight: 600 }}>URL</button>
        {value && (
          <button onClick={() => onChange('')}
            style={{ fontSize: '.7rem', background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', marginLeft: 'auto' }}>✕</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
      </div>
      {showUrl && (
        <div style={{ padding: '.3rem .4rem', borderTop: '1px solid #eee' }}>
          <input value={value} onChange={e => onChange(e.target.value)} placeholder="https://..."
            style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '6px', padding: '.28rem .45rem', fontSize: '.7rem', boxSizing: 'border-box' }} />
        </div>
      )}
    </div>
  );
}

// ── Custom Colour Modal (same as Add Product page) ──────────────────────────
function CustomColourModal({ nextLetter, onAdd, onClose }: { nextLetter: string; onAdd: (c: CustomColour) => void; onClose: () => void }) {
  const [colName, setColName]       = useState('');
  const [code, setCode]             = useState('#cccccc');
  const [colPhoto, setColPhoto]     = useState('');
  const [showUrlBox, setShowUrlBox] = useState(false);
  const [urlVal, setUrlVal]         = useState('');
  const [eyedropSrc, setEyedropSrc] = useState('');
  const [locked, setLocked]         = useState(false);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const colFileRef = useRef<HTMLInputElement>(null);
  const eyeFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!eyedropSrc || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => { const c = canvasRef.current!; c.width=280; c.height=180; c.getContext('2d')!.drawImage(img,0,0,280,180); };
    img.src = eyedropSrc;
  }, [eyedropSrc]);

  const pickColour = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (locked) return;
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (c.width / rect.width));
    const y = Math.floor((e.clientY - rect.top)  * (c.height / rect.height));
    const px = c.getContext('2d')!.getImageData(x,y,1,1).data;
    setCode('#' + [px[0],px[1],px[2]].map(v=>v.toString(16).padStart(2,'0')).join(''));
  };

  const readFile = (file: File, cb: (d:string)=>void) => { const rd=new FileReader(); rd.onload=e=>cb(e.target?.result as string); rd.readAsDataURL(file); };

  const handleAdd = () => {
    if (!colName.trim()) { alert('Colour Name required'); return; }
    onAdd({ name: colName.trim(), code, photo: colPhoto, columnLetter: nextLetter });
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600, padding:'1rem', overflowY:'auto' }}>
      <div style={{ background:'#fff', borderRadius:'16px', padding:'1.25rem', width:'100%', maxWidth:'460px', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <h3 style={{ fontWeight:700, fontSize:'1rem', margin:0 }}>🎨 Add New Custom Colour</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.3rem', cursor:'pointer', color:'#888' }}>✕</button>
        </div>

        {/* Colour Photo */}
        <div style={{ background:'#f9f9f9', borderRadius:'10px', padding:'1rem', marginBottom:'1rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'.75rem' }}>
            <span style={{ fontSize:'.85rem', fontWeight:700 }}>🖼️ Colour Photo</span>
            <span style={{ background:'#a7354d', color:'#fff', fontSize:'.68rem', fontWeight:700, padding:'.15rem .45rem', borderRadius:'4px' }}>Column {nextLetter}</span>
            <span style={{ fontSize:'.72rem', color:'#888' }}>(product card par square box)</span>
          </div>
          <div style={{ display:'flex', gap:'1rem', alignItems:'flex-start' }}>
            <div style={{ width:'72px', height:'72px', background:'#eee', borderRadius:'8px', overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem' }}>
              {colPhoto ? <img src={colPhoto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <span>{nextLetter}</span>}
            </div>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'.45rem' }}>
              <button onClick={() => colFileRef.current?.click()}
                style={{ background:'#fdecea', color:'#a7354d', border:'1.5px solid #f5c6cb', borderRadius:'8px', padding:'.45rem', fontSize:'.8rem', fontWeight:600, cursor:'pointer' }}>
                📤 Upload Photo
              </button>
              <button onClick={() => setShowUrlBox(v=>!v)}
                style={{ background:'#fff', color:'#555', border:'1.5px solid #ddd', borderRadius:'8px', padding:'.45rem', fontSize:'.8rem', fontWeight:600, cursor:'pointer' }}>
                🔗 Use URL
              </button>
              <input ref={colFileRef} type="file" accept="image/*" hidden onChange={e => { if (e.target.files?.[0]) readFile(e.target.files[0], setColPhoto); }} />
            </div>
          </div>
          {showUrlBox && (
            <input value={urlVal} onChange={e => { setUrlVal(e.target.value); setColPhoto(e.target.value); }}
              placeholder="https://..."
              style={{ width:'100%', marginTop:'.5rem', border:'1.5px solid #ddd', borderRadius:'8px', padding:'.45rem .65rem', fontSize:'.8rem', boxSizing:'border-box' }} />
          )}
          <button style={{ width:'100%', marginTop:'.75rem', background:'#a7354d', color:'#fff', border:'none', borderRadius:'8px', padding:'.5rem', fontSize:'.82rem', fontWeight:700, cursor:'pointer' }}>
            ✓ Add Column {nextLetter}
          </button>
        </div>

        {/* Colour Code + Eyedropper */}
        <div style={{ background:'#f9f9f9', borderRadius:'10px', padding:'1rem', marginBottom:'1rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'.75rem' }}>
            <span style={{ fontSize:'.85rem', fontWeight:700 }}>🎯 Colour Code</span>
            <span style={{ fontSize:'.72rem', color:'#888' }}>(circle ke liye)</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'.6rem', marginBottom:'.75rem', flexWrap:'wrap' }}>
            <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:code, border:'2px solid #ddd', flexShrink:0, transition:'background .15s' }} />
            <input value={code} onChange={e=>setCode(e.target.value)} placeholder="#cccccc"
              style={{ width:'100px', border:'1.5px solid #ddd', borderRadius:'8px', padding:'.4rem .55rem', fontSize:'.82rem', fontFamily:'monospace', boxSizing:'border-box' }} />
            <div style={{ width:'28px', height:'28px', background:code, border:'2px solid #ddd', borderRadius:'4px', flexShrink:0 }} />
            <span style={{ fontSize:'.72rem', color:'#888' }}>{hexToRgb(code)}</span>
          </div>
          <button onClick={() => eyeFileRef.current?.click()}
            style={{ width:'100%', background:'#fdecea', color:'#a7354d', border:'1.5px solid #f5c6cb', borderRadius:'8px', padding:'.45rem', fontSize:'.8rem', fontWeight:600, cursor:'pointer', marginBottom:'.4rem' }}>
            📷 Photo Upload karke Colour Pick karo
          </button>
          <input ref={eyeFileRef} type="file" accept="image/*" hidden onChange={e => { if (e.target.files?.[0]) { readFile(e.target.files[0], setEyedropSrc); setLocked(false); } }} />
          {eyedropSrc && (
            <>
              <p style={{ fontSize:'.7rem', color:'#888', margin:'.2rem 0 .3rem' }}>📌 Photo hover karo to colour preview. <strong>Click</strong> to {locked ? 'unlock 🔓' : 'lock 🔒'}</p>
              <canvas ref={canvasRef} onMouseMove={pickColour} onClick={() => setLocked(l=>!l)}
                style={{ width:'100%', borderRadius:'8px', cursor: locked ? 'default' : 'crosshair', border:'1.5px solid #ddd', display:'block' }} />
            </>
          )}
        </div>

        {/* Colour Name */}
        <div style={{ marginBottom:'1rem' }}>
          <label style={{ fontSize:'.82rem', fontWeight:700, display:'block', marginBottom:'.3rem' }}>Colour Name <span style={{ color:'#c62828' }}>*</span></label>
          <input value={colName} onChange={e=>setColName(e.target.value)} placeholder="e.g. Maroon, Sky Blue, Golden..."
            onKeyDown={e=>e.key==='Enter'&&handleAdd()} autoFocus
            style={{ width:'100%', border:'1.5px solid #ddd', borderRadius:'8px', padding:'.6rem .75rem', fontSize:'.88rem', boxSizing:'border-box' }} />
        </div>
        <button onClick={handleAdd}
          style={{ width:'100%', background:'#a7354d', color:'#fff', border:'none', borderRadius:'8px', padding:'.7rem', fontSize:'.95rem', fontWeight:700, cursor:'pointer' }}>
          ✓ Add Colour
        </button>
      </div>
    </div>
  );
}

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

const emptyProduct = (): Partial<Product> => ({
  name: '', category: 'Women', subcategory: '', price: 0, discountPrice: undefined,
  stock: 'Out of Stock', sku: generateSku(), description: '', image: '', bestSeller: false,
  hsnCode: '6211', gstRate: 5,
} as any);

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discountPct, setDiscountPct] = useState('');
  // Pack / Photo state
  const [packOf, setPackOf] = useState('');
  const [packCols, setPackCols] = useState<PackCol[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [customColors, setCustomColors] = useState<CustomColour[]>([]);
  const [variantStock, setVariantStock] = useState<Record<string, string>>({});
  const [showColourModal, setShowColourModal] = useState(false);
  // Missing fields (same as Add page)
  const [mainPhotos, setMainPhotos] = useState({ front:'', side:'', back:'', zoomed:'' });
  const [addOns, setAddOns] = useState<Array<{ name: string; price: string }>>([]);
  const [availColours, setAvailColours] = useState('');
  const [totalQty, setTotalQty] = useState('');
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLLabelElement>(null);

  const fetchProducts = () =>
    productsApi.getAll({ pageSize: 500 })
      .then(r => setProducts(r.products))
      .finally(() => setLoading(false));

  useEffect(() => { fetchProducts(); }, []);

  const categories = CATEGORIES;
  const filtered = products.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.subcategory ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || p.category === catFilter;
    return matchSearch && matchCat;
  });
  const packValue = getPackOfNumber(packOf);
  const selectedColorsForStock = packValue >= 2
    ? []
    : [...new Set([...colors, ...customColors.map(c => c.name)])];
  const stockKeys = sizes.length > 0
    ? (selectedColorsForStock.length > 0
        ? sizes.flatMap(size => selectedColorsForStock.map(colour => `${size}|${colour}`))
        : sizes)
    : [];
  const stockTotal = stockKeys.reduce((sum, key) => sum + (Number(variantStock[key]) || 0), 0);
  const effectiveStockStatus = stockStatusFromQty(stockTotal);

  useEffect(() => {
    setVariantStock(prev => {
      const next: Record<string, string> = {};
      stockKeys.forEach(key => { next[key] = prev[key] ?? ''; });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes.join('|'), selectedColorsForStock.join('|')]);

  const handleSave = async () => {
    if (!editing || !editing.name?.trim()) { alert('Product name is required.'); return; }
    if (!editing.price || editing.price <= 0) { alert('Price must be greater than 0.'); return; }
    setSaving(true);
    const token = getAdminToken() ?? '';
    const packValue = getPackOfNumber(packOf);
    const normalizedPackCols = normalizePackColumns(packCols, packValue);
    const filledPackCols = normalizedPackCols.filter(hasPackPhoto);
    const stockMatrix = Object.fromEntries(stockKeys.map(key => [key, Number(variantStock[key]) || 0]));
    const saveQty = stockKeys.length > 0 ? stockTotal : (Number(totalQty) || Number((editing as any).qty ?? 0));
    const packImages = filledPackCols.map(col => ({
      label: col.letter,
      letter: col.letter,
      url: col.front,
      front: col.front,
      side: col.side,
      back: col.back,
      zoomed: col.zoomed,
    }));
    const galleryImages = [mainPhotos.front, mainPhotos.side, mainPhotos.back, mainPhotos.zoomed].filter(Boolean);
    // Build extraJson with all fields (same as Add page)
    const extraJson = JSON.stringify({
      sizes,
      colors,
      customColors,
      images: galleryImages,
      productPhotos: mainPhotos,
      addOns: addOns.filter(a => a.name.trim()),
      availColours: availColours.trim() || undefined,
      qty: saveQty,
      packOf: packValue >= 2 ? packValue : undefined,
      packColumnPhotos: packValue >= 2 ? normalizedPackCols : undefined,
      packImages: packImages.length ? packImages : undefined,
      variantColumns: packImages.length ? packImages : undefined,
      variantMatrix: stockKeys.length ? stockMatrix : undefined,
      stockMode: stockKeys.length ? (selectedColorsForStock.length ? 'size_colour' : 'size') : undefined,
    });
    // Use front photo as main image if available
    const mainImage = mainPhotos.front || filledPackCols[0]?.front || editing.image || '';
    const payload = { ...editing, stock: stockStatusFromQty(saveQty), qty: saveQty, packOf: packValue >= 2 ? packValue : undefined, extraJson, image: mainImage };
    try {
      if (isNew) {
        await productsApi.bulkSave([payload], token);
      } else if ((editing as Product).dbId > 0) {
        await productsApi.update((editing as Product).dbId, payload, token);
      }
      await fetchProducts();
      setEditing(null);
      setIsNew(false);
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleInactive = async (id: number, sku: string) => {
    if (!confirm(`Product SKU ${sku} ko Inactive mark karein?\nYe product website se hat jayega lekin delete nahi hoga.`)) return;
    const token = getAdminToken() ?? '';
    await productsApi.update(id, { stock: 'Inactive' }, token).catch(e => alert(e.message));
    await fetchProducts();
  };

  const handleMarkAll = async (stock: 'In Stock' | 'Out of Stock') => {
    if (!confirm(`Mark all ${products.length} products as "${stock}"?`)) return;
    const token = getAdminToken() ?? '';
    for (const p of products) {
      await productsApi.update(p.dbId, { ...p, stock }, token).catch(() => {});
    }
    await fetchProducts();
    alert(`All products marked as ${stock}.`);
  };

  // CSV file handling
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
      const products = csvPreview.map(row => ({
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
      await productsApi.bulkSave(products, getAdminToken() ?? '');
      await fetchProducts();
      setCsvPreview([]); setCsvHeaders([]);
      setBulkStatus(`✅ Successfully imported ${products.length} products.`);
    } catch (e) { setBulkStatus('❌ Import failed: ' + (e as Error).message); }
    finally { setImporting(false); }
  };

  const openEdit = (p: Product) => {
    setEditing({ ...p });
    setIsNew(false);
    setDiscountPct(p.discountPrice && p.price > 0
      ? String(Math.round(((p.price - p.discountPrice) / p.price) * 100)) : '');
    // Parse extraJson for pack/photo/size/color data
    try {
      const ex = typeof p.extraJson === 'string' ? JSON.parse(p.extraJson) : (p.extraJson ?? {});
      const n = getPackOfNumber(ex.packOf ?? (p as any).packOf);
      setPackOf(n >= 2 ? String(n) : '');
      const rawExisting = (ex.packColumnPhotos ?? ex.packImages ?? ex.variantColumns ?? []) as Array<Partial<PackCol> & { label?: string; url?: string }>;
      const existing: PackCol[] = rawExisting.map((col, i) => ({
        letter: col.letter ?? col.label ?? COL_LETTERS[i] ?? String(i + 1),
        front: col.front ?? col.url ?? '',
        side: col.side ?? '',
        back: col.back ?? '',
        zoomed: col.zoomed ?? '',
      }));
      setPackCols(normalizePackColumns(existing, n));
      setSizes(ex.sizes ?? []);
      setColors(ex.colors ?? []);
      setCustomColors(ex.customColors ?? []);
      const matrix = ex.variantMatrix ?? {};
      setVariantStock(Object.fromEntries(Object.entries(matrix).map(([key, val]) => [key, String(val ?? '')])));
      // Parse missing fields
      const pp = ex.productPhotos ?? {};
      setMainPhotos({
        front:  pp.front  ?? p.image ?? '',
        side:   pp.side   ?? '',
        back:   pp.back   ?? '',
        zoomed: pp.zoomed ?? '',
      });
      setAddOns((ex.addOns ?? []).map((a: any) => ({ name: String(a.name ?? ''), price: String(a.price ?? '') })));
      setAvailColours(ex.availColours ?? '');
      setTotalQty(String(ex.qty ?? (p as any).qty ?? ''));
    } catch {
      setPackOf(''); setPackCols([]); setSizes([]); setColors([]); setCustomColors([]); setVariantStock({});
      setMainPhotos({ front: p.image ?? '', side:'', back:'', zoomed:'' });
      setAddOns([]); setAvailColours(''); setTotalQty('');
    }
  };

  const openNew = () => {
    setEditing(emptyProduct());
    setIsNew(true);
    setDiscountPct('');
    setPackOf(''); setPackCols([]); setSizes([]); setColors([]); setCustomColors([]); setVariantStock({});
    setMainPhotos({ front:'', side:'', back:'', zoomed:'' });
    setAddOns([]); setAvailColours(''); setTotalQty('');
  };

  const handlePackOfChange = (value: string) => {
    setPackOf(value);
    const safe = getPackOfNumber(value);
    setPackCols(prev => normalizePackColumns(prev, safe));
  };

  const updateCol = (i: number, field: keyof PackCol, val: string) =>
    setPackCols(prev => prev.map((c, idx) => idx===i ? {...c, [field]: val} : c));

  const toggleSize = (s: string) =>
    setSizes(prev => prev.includes(s) ? prev.filter(x=>x!==s) : [...prev, s]);

  const toggleColor = (c: string) =>
    setColors(prev => prev.includes(c) ? prev.filter(x=>x!==c) : [...prev, c]);

  const handlePctChange = (pct: string) => {
    setDiscountPct(pct);
    const n = parseFloat(pct);
    if (!isNaN(n) && n > 0 && n < 100 && editing?.price) {
      setEditing(p => ({ ...p!, discountPrice: Math.round((editing!.price! * (1 - n / 100))) }));
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a1a' }}>Products ({filtered.length})</h1>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => handleMarkAll('In Stock')}
            style={{ background: '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            ✅ Mark All In Stock
          </button>
          <button onClick={() => handleMarkAll('Out of Stock')}
            style={{ background: '#e67e22', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            🏖️ Mark All Out of Stock
          </button>
          <button onClick={() => exportProductsCSV(filtered)}
            style={{ background: '#555', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            ⬇️ CSV
          </button>
          <button onClick={() => exportProducts(filtered)}
            style={{ background: '#1b5e20', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            📊 Export Excel
          </button>
          <button onClick={() => setShowBulk(v => !v)}
            style={{ background: '#1565c0', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            📤 Bulk Import
          </button>
          <Link href="/admin/products/add"
            style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1.25rem', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}>
            + Add Product
          </Link>
        </div>
      </div>

      {/* Bulk Import Panel */}
      {showBulk && (
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', padding: '1.25rem', marginBottom: '1.25rem' }}>
          <h3 style={{ fontWeight: 700, marginBottom: '.75rem' }}>📤 Bulk CSV/Excel Import</h3>
          <p style={{ fontSize: '.85rem', color: '#666', marginBottom: '1rem' }}>
            Upload a CSV file with columns: <code>name, category, subcategory, price, discountPrice, stock, sku, description, image, bestSeller, hsnCode, gstRate</code>
          </p>
          <label ref={dropRef} style={{
            display: 'block', border: '2px dashed #ddd', borderRadius: '12px', padding: '2rem',
            textAlign: 'center', cursor: 'pointer', marginBottom: '1rem',
            background: '#fafafa', transition: 'border-color .2s',
          }}
            onDragOver={e => { e.preventDefault(); if (dropRef.current) dropRef.current.style.borderColor = '#a7354d'; }}
            onDragLeave={() => { if (dropRef.current) dropRef.current.style.borderColor = '#ddd'; }}
            onDrop={e => { e.preventDefault(); if (dropRef.current) dropRef.current.style.borderColor = '#ddd'; const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>📁</div>
            <p style={{ fontWeight: 600, marginBottom: '.25rem' }}>Drop CSV file here or click to browse</p>
            <p style={{ fontSize: '.82rem', color: '#888' }}>Supported: .csv files</p>
            <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
          </label>
          <input type="hidden" onClick={() => csvRef.current?.click()} />
          <button onClick={() => csvRef.current?.click()}
            style={{ background: '#f5f5f5', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem 1.25rem', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer', marginBottom: '1rem' }}>
            Browse File
          </button>

          {bulkStatus && (
            <p style={{ fontSize: '.88rem', color: bulkStatus.startsWith('✅') ? '#27ae60' : bulkStatus.startsWith('❌') ? '#c0392b' : '#555', marginBottom: '1rem', fontWeight: 600 }}>
              {bulkStatus}
            </p>
          )}

          {csvPreview.length > 0 && (
            <>
              <div style={{ overflowX: 'auto', marginBottom: '1rem', maxHeight: '200px', border: '1px solid #eee', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
                  <thead style={{ background: '#f9f9f9', position: 'sticky', top: 0 }}>
                    <tr>{csvHeaders.map(h => <th key={h} style={{ padding: '.4rem .75rem', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600, color: '#555' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {csvPreview.slice(0, 10).map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f5f5f5' }}>
                        {csvHeaders.map(h => <td key={h} style={{ padding: '.4rem .75rem', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row[h]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvPreview.length > 10 && <p style={{ fontSize: '.8rem', color: '#888', marginBottom: '.75rem' }}>Showing first 10 of {csvPreview.length} rows</p>}
              <button onClick={handleBulkImport} disabled={importing}
                style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.65rem 1.5rem', fontSize: '.9rem', fontWeight: 600, cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? .7 : 1 }}>
                {importing ? 'Importing...' : `Apply Import (${csvPreview.length} products)`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', marginBottom: '1rem', alignItems: 'center' }}>
        <input placeholder="Search name, SKU, subcategory..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.88rem', width: '280px' }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.88rem' }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Product Table */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
            <thead style={{ background: '#f9f9f9' }}>
              <tr>
                {['Image','SKU','Name','Category','Price','Discount','Stock','Best Seller','Actions'].map(h => (
                  <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '.72rem', color: '#888', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>Loading products…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>No products found.</td></tr>
              ) : filtered.map((p, i) => {
                const isInactive = p.stock === 'Inactive';
                return (
                <tr key={p.dbId} style={{ borderTop: i > 0 ? '1px solid #f5f5f5' : undefined, opacity: isInactive ? 0.45 : 1 }}>
                  <td style={{ padding: '.65rem 1rem' }}>
                    {p.image
                      ? <img src={p.image} alt={p.name} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: '6px', filter: isInactive ? 'grayscale(1)' : 'none' }} />
                      : <div style={{ width: 48, height: 48, background: '#f5f5f5', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>👗</div>}
                  </td>
                  <td style={{ padding: '.65rem 1rem', fontFamily: 'monospace', fontSize: '.75rem', color: '#888' }}>{p.sku || '—'}</td>
                  <td style={{ padding: '.65rem 1rem', fontWeight: 500, maxWidth: '200px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    {p.subcategory && <div style={{ fontSize: '.72rem', color: '#aaa' }}>{p.subcategory}</div>}
                    {isInactive && <div style={{ fontSize: '.68rem', color: '#e65100', fontWeight: 700 }}>🚫 INACTIVE — Website pe nahi dikhega</div>}
                  </td>
                  <td style={{ padding: '.65rem 1rem', fontSize: '.8rem' }}>{p.category}</td>
                  <td style={{ padding: '.65rem 1rem', fontWeight: 600 }}>₹{p.price.toLocaleString('en-IN')}</td>
                  <td style={{ padding: '.65rem 1rem', fontSize: '.8rem', color: p.discountPrice ? '#27ae60' : '#ccc' }}>
                    {p.discountPrice ? `₹${p.discountPrice.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td style={{ padding: '.65rem 1rem' }}>
                    <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '.2rem .55rem', borderRadius: '10px',
                      background: isInactive ? '#f3e5f5' : p.stock === 'In Stock' ? '#e8f5e9' : '#fdecea',
                      color: isInactive ? '#6a1b9a' : p.stock === 'In Stock' ? '#2e7d32' : '#c62828' }}>
                      {p.stock}
                    </span>
                  </td>
                  <td style={{ padding: '.65rem 1rem', textAlign: 'center' }}>
                    {p.bestSeller ? '⭐' : '—'}
                  </td>
                  <td style={{ padding: '.65rem 1rem' }}>
                    <div style={{ display: 'flex', gap: '.4rem' }}>
                      <Link href={`/admin/products/${p.dbId}`}
                        style={{ color: '#1565c0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600, textDecoration: 'none' }}>Edit</Link>
                      {isInactive ? (
                        <button onClick={async () => {
                          if (!confirm(`${p.sku ?? p.name} ko wapas Active karein?`)) return;
                          await productsApi.update(p.dbId, { stock: 'In Stock' }, getAdminToken() ?? '').catch(e => alert(e.message));
                          await fetchProducts();
                        }} style={{ color: '#2e7d32', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600 }}>Activate</button>
                      ) : (
                        <button onClick={() => handleInactive(p.dbId, p.sku ?? p.name)}
                          style={{ color: '#e65100', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600 }}>Inactive</button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {/* Custom Colour Modal */}
      {showColourModal && (
        <CustomColourModal
          nextLetter={COL_LETTERS[customColors.length] ?? 'A'}
          onAdd={c => setCustomColors(prev => [...prev, c])}
          onClose={() => setShowColourModal(false)}
        />
      )}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, padding: '1rem', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '700px', marginTop: '2rem', marginBottom: '2rem' }}>
            <h3 style={{ fontWeight: 700, marginBottom: '1.25rem', fontSize: '1.15rem' }}>
              {isNew ? '➕ Add New Product' : '✏️ Edit Product'}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* SKU */}
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>SKU ID</label>
                <input value={editing.sku ?? ''} onChange={e => setEditing(p => ({ ...p!, sku: e.target.value }))}
                  placeholder="MFH1001"
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
              </div>
              {/* HSN Code */}
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>HSN Code</label>
                <input value={(editing as any).hsnCode ?? '6211'} onChange={e => setEditing(p => ({ ...p!, hsnCode: e.target.value } as any))}
                  placeholder="6211"
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
              </div>
              {/* Name */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Product Name *</label>
                <input value={editing.name ?? ''} onChange={e => setEditing(p => ({ ...p!, name: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
              </div>
              {/* Category */}
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Category *</label>
                <select value={editing.category ?? 'Women'} onChange={e => setEditing(p => ({ ...p!, category: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem' }}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {/* Subcategory */}
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Subcategory</label>
                <input value={editing.subcategory ?? ''} onChange={e => setEditing(p => ({ ...p!, subcategory: e.target.value }))}
                  placeholder="Optional (e.g. Cotton, Designer)"
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
              </div>
              {/* Price */}
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Price (₹) *</label>
                <input type="number" min="1" value={editing.price ?? ''} onChange={e => setEditing(p => ({ ...p!, price: Number(e.target.value) }))}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
              </div>
              {/* Discount % */}
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Discount % <span style={{ fontWeight: 400, color: '#888' }}>(auto-calculates price)</span></label>
                <input type="number" min="1" max="99" value={discountPct} onChange={e => handlePctChange(e.target.value)}
                  placeholder="e.g. 20"
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
              </div>
              {/* Discount Price */}
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Discount Price (₹)</label>
                <input type="number" min="1" value={editing.discountPrice ?? ''} onChange={e => setEditing(p => ({ ...p!, discountPrice: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="Optional"
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
              </div>
              {/* GST Rate */}
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>GST Rate</label>
                <select value={(editing as any).gstRate ?? 5} onChange={e => setEditing(p => ({ ...p!, gstRate: Number(e.target.value) } as any))}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem' }}>
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                </select>
              </div>
              {/* Stock */}
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Stock Status</label>
                <select value={editing.stock ?? 'In Stock'} onChange={e => setEditing(p => ({ ...p!, stock: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem' }}>
                  <option>In Stock</option>
                  <option>Out of Stock</option>
                  <option>Limited Stock</option>
                </select>
              </div>
              {/* Image URL */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Product Image URL</label>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  <input value={editing.image ?? ''} onChange={e => setEditing(p => ({ ...p!, image: e.target.value }))}
                    placeholder="https://..."
                    style={{ flex: 1, border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
                  {editing.image && (
                    <img src={editing.image} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
                  )}
                </div>
              </div>
              {/* Description */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Description</label>
                <textarea value={editing.description ?? ''} onChange={e => setEditing(p => ({ ...p!, description: e.target.value }))}
                  rows={3} placeholder="Product details, fabric, use case, styling notes..."
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              {/* Best Seller */}
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <input type="checkbox" id="chkBestSeller" checked={editing.bestSeller ?? false}
                  onChange={e => setEditing(p => ({ ...p!, bestSeller: e.target.checked }))} style={{ width: '16px', height: '16px' }} />
                <label htmlFor="chkBestSeller" style={{ fontSize: '.88rem', fontWeight: 600, cursor: 'pointer' }}>
                  ⭐ Mark as Best Seller
                </label>
              </div>

              {/* ── Total Quantity ── */}
              <div>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Total Quantity (pcs)</label>
                <input type="number" value={totalQty} onChange={e => setTotalQty(e.target.value)}
                  placeholder="e.g. 50"
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
              </div>

              {/* ── Pack of N ── */}
              <div style={{ gridColumn: '1 / -1', borderTop: '1.5px solid #f0f0f0', paddingTop: '1rem', marginTop: '.5rem' }}>
                <label style={{ fontSize: '.85rem', fontWeight: 700, display: 'block', marginBottom: '.5rem' }}>📦 Pack of</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <input type="number" min="0" max="26" value={packOf}
                    onChange={e => handlePackOfChange(e.target.value)}
                    placeholder="Blank / 0"
                    style={{ width: '80px', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .6rem', fontSize: '.9rem', textAlign: 'center' }} />
                  <span style={{ fontSize: '.82rem', color: '#888' }}>
                    Blank / 0 = normal product. {getPackOfNumber(packOf) >= 2 ? `Pack photos: ${packCols.map(c => c.letter).join(', ')}` : 'Pack photos hidden'}
                  </span>
                </div>
              </div>

              {/* ── Pack Column Photos ── */}
              {getPackOfNumber(packOf) >= 2 && packCols.map((col, i) => (
                <div key={col.letter} style={{ gridColumn: '1 / -1', background: '#fafafa', border: '1.5px solid #eee', borderRadius: '10px', padding: '.85rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.6rem' }}>
                    <span style={{ background: '#a7354d', color: '#fff', borderRadius: '6px', padding: '.15rem .5rem', fontSize: '.78rem', fontWeight: 700 }}>Col {col.letter}</span>
                    <span style={{ fontSize: '.82rem', fontWeight: 600 }}>Photos for column {col.letter}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem .75rem' }}>
                    <PhotoSlotMini label="Front" value={col.front} onChange={v => updateCol(i,'front',v)} />
                    <PhotoSlotMini label="Side" value={col.side} onChange={v => updateCol(i,'side',v)} />
                    <PhotoSlotMini label="Back" value={col.back} onChange={v => updateCol(i,'back',v)} />
                    <PhotoSlotMini label="Zoomed" value={col.zoomed} onChange={v => updateCol(i,'zoomed',v)} />
                  </div>
                </div>
              ))}

              {/* ── Sizes ── */}
              <div style={{ gridColumn: '1 / -1', borderTop: '1.5px solid #f0f0f0', paddingTop: '1rem', marginTop: '.25rem' }}>
                <label style={{ fontSize: '.85rem', fontWeight: 700, display: 'block', marginBottom: '.5rem' }}>📐 Sizes</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginBottom: '.5rem' }}>
                  {SIZES_PRESET.map(s => (
                    <button key={s} type="button" onClick={() => toggleSize(s)}
                      style={{ padding: '.3rem .65rem', fontSize: '.78rem', borderRadius: '6px', border: '1.5px solid', fontWeight: 600, cursor: 'pointer',
                        borderColor: sizes.includes(s) ? '#a7354d' : '#ddd',
                        background: sizes.includes(s) ? '#fdf0f3' : '#fff',
                        color: sizes.includes(s) ? '#a7354d' : '#555' }}>
                      {s}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => {
                  const v = prompt('Custom size (e.g. 44, 46)');
                  if (v?.trim()) setSizes(prev => [...new Set([...prev, v.trim()])]);
                }}
                  style={{ fontSize: '.78rem', color: '#1565c0', background: 'none', border: '1px dashed #1565c0', borderRadius: '6px', padding: '.25rem .65rem', cursor: 'pointer' }}>
                  + Custom Size
                </button>
                {sizes.length > 0 && (
                  <p style={{ fontSize: '.75rem', color: '#888', marginTop: '.4rem' }}>Selected: {sizes.join(', ')}</p>
                )}
              </div>

              {/* ── Colors ── */}
              <div style={{ gridColumn: '1 / -1', borderTop: '1.5px solid #f0f0f0', paddingTop: '1rem' }}>
                <label style={{ fontSize: '.85rem', fontWeight: 700, display: 'block', marginBottom: '.5rem' }}>🎨 Colour / Design</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginBottom: '.5rem' }}>
                  {COLORS_PRESET.map(c => (
                    <button key={c} type="button" onClick={() => toggleColor(c)}
                      style={{ padding: '.3rem .65rem', fontSize: '.78rem', borderRadius: '6px', border: '1.5px solid', fontWeight: 600, cursor: 'pointer',
                        borderColor: colors.includes(c) ? '#a7354d' : '#ddd',
                        background: colors.includes(c) ? '#fdf0f3' : '#fff',
                        color: colors.includes(c) ? '#a7354d' : '#555' }}>
                      {c}
                    </button>
                  ))}
                </div>
                {colors.length > 0 && (
                  <p style={{ fontSize: '.75rem', color: '#888', marginBottom: '.5rem' }}>Selected: {colors.join(', ')}</p>
                )}

                {/* Custom Colours with photo+eyedropper */}
                <div style={{ borderTop: '1px dashed #eee', paddingTop: '.75rem', marginTop: '.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                    <span style={{ fontSize: '.82rem', fontWeight: 700 }}>🎨 Custom Colours (with photo &amp; eyedropper)</span>
                    <button type="button" onClick={() => setShowColourModal(true)}
                      style={{ fontSize: '.78rem', color: '#fff', background: '#a7354d', border: 'none', borderRadius: '6px', padding: '.3rem .75rem', cursor: 'pointer', fontWeight: 600 }}>
                      + Add Custom Colour
                    </button>
                  </div>
                  {customColors.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
                      {customColors.map((cc, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', background: '#f9f9f9', border: '1.5px solid #eee', borderRadius: '8px', padding: '.3rem .55rem' }}>
                          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: cc.code, border: '1.5px solid #ddd', flexShrink: 0 }} />
                          {cc.photo && <img src={cc.photo} alt="" style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: '4px' }} onError={e=>(e.target as HTMLImageElement).style.display='none'} />}
                          <span style={{ fontSize: '.75rem', fontWeight: 600 }}>{cc.name}</span>
                          <span style={{ fontSize: '.65rem', color: '#888' }}>Col {cc.columnLetter}</span>
                          <button type="button" onClick={() => setCustomColors(prev => prev.filter((_,j)=>j!==i))}
                            style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: '.8rem', lineHeight: 1, padding: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {stockKeys.length > 0 && (
                <div style={{ gridColumn: '1 / -1', borderTop: '1.5px solid #f0f0f0', paddingTop: '1rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:'.75rem', alignItems:'center', flexWrap:'wrap', marginBottom:'.65rem' }}>
                    <label style={{ fontSize: '.85rem', fontWeight: 700 }}>Stock by {selectedColorsForStock.length ? 'Size + Colour/Design' : 'Size'}</label>
                    <span style={{ fontSize:'.78rem', color:'#888' }}>Auto status: <strong>{effectiveStockStatus}</strong> ({stockTotal} pcs)</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'.55rem' }}>
                    {stockKeys.map(key => (
                      <label key={key} style={{ display:'grid', gridTemplateColumns:'1fr 76px', alignItems:'center', gap:'.45rem', border:'1px solid #eee', borderRadius:'8px', padding:'.45rem .55rem', background:'#fafafa' }}>
                        <span style={{ fontSize:'.76rem', fontWeight:600, color:'#555' }}>{key.replace('|', ' / ')}</span>
                        <input type="number" min={0} value={variantStock[key] ?? ''}
                          onChange={e => setVariantStock(p => ({ ...p, [key]: e.target.value }))}
                          placeholder="0"
                          style={{ width:'100%', border:'1.5px solid #ddd', borderRadius:'6px', padding:'.35rem .45rem', fontSize:'.8rem', textAlign:'center', boxSizing:'border-box' }} />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Auto Stock Status Bar ── */}
              <div style={{ gridColumn: '1 / -1', display:'flex', alignItems:'center', gap:'.75rem', background:'#f9f9f9', borderRadius:'8px', padding:'.5rem .85rem' }}>
                <span style={{ fontSize:'.8rem', fontWeight:600, color:'#555' }}>Auto stock:</span>
                <span style={{ background: effectiveStockStatus === 'Out of Stock' ? '#c0392b' : effectiveStockStatus === 'Limited Stock' ? '#e67e22' : '#27ae60', color:'#fff', fontSize:'.72rem', fontWeight:700, padding:'.14rem .45rem', borderRadius:'10px' }}>{effectiveStockStatus}</span>
                <span style={{ fontSize:'.78rem', color:'#888' }}>| Total: {stockKeys.length > 0 ? stockTotal : (Number(totalQty) || 0)} pcs</span>
              </div>

              {/* ── Available Colours (text) ── */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Available Colours <span style={{ fontWeight:400, color:'#888' }}>(comma-separated)</span></label>
                <input value={availColours} onChange={e => setAvailColours(e.target.value)}
                  placeholder="e.g. Red, Blue, Green..."
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
              </div>

              {/* ── Add-ons ── */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.5rem' }}>Add-ons <span style={{ fontWeight:400, color:'#888' }}>(name & price)</span></label>
                {addOns.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: '.5rem', marginBottom: '.45rem', alignItems: 'center' }}>
                    <input value={a.name}
                      onChange={e => setAddOns(p => p.map((x,j) => j===i ? {...x, name:e.target.value} : x))}
                      placeholder="Add-on name (e.g. Blouse piece)"
                      style={{ flex:2, border:'1.5px solid #ddd', borderRadius:'8px', padding:'.55rem .7rem', fontSize:'.85rem', boxSizing:'border-box' }} />
                    <input type="number" value={a.price}
                      onChange={e => setAddOns(p => p.map((x,j) => j===i ? {...x, price:e.target.value} : x))}
                      placeholder="₹ Price"
                      style={{ flex:1, border:'1.5px solid #ddd', borderRadius:'8px', padding:'.55rem .7rem', fontSize:'.85rem', boxSizing:'border-box' }} />
                    <button onClick={() => setAddOns(p => p.filter((_,j) => j!==i))}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#c62828', fontSize:'1rem' }}>✕</button>
                  </div>
                ))}
                <button onClick={() => setAddOns(p => [...p, { name:'', price:'' }])}
                  style={{ width:'100%', border:'1.5px dashed #ddd', background:'#fafafa', borderRadius:'8px', padding:'.5rem', fontSize:'.83rem', cursor:'pointer', color:'#888' }}>
                  + Add Item
                </button>
              </div>

              {/* ── Product Photos ── */}
              <div style={{ gridColumn: '1 / -1', borderTop: '1.5px solid #f0f0f0', paddingTop: '1rem' }}>
                <label style={{ fontSize: '.85rem', fontWeight: 700, display: 'block', marginBottom: '.5rem' }}>
                  📷 Product Photos <span style={{ fontWeight:400, color:'#888', fontSize:'.78rem' }}>Front · Side · Back · Zoomed</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.6rem' }}>
                  <PhotoSlotFull label="FRONT VIEW" value={mainPhotos.front}  onChange={v => setMainPhotos(p => ({...p, front:v}))}  isFirst />
                  <PhotoSlotFull label="SIDE VIEW"  value={mainPhotos.side}   onChange={v => setMainPhotos(p => ({...p, side:v}))} />
                  <PhotoSlotFull label="BACK VIEW"  value={mainPhotos.back}   onChange={v => setMainPhotos(p => ({...p, back:v}))} />
                  <PhotoSlotFull label="ZOOMED IN"  value={mainPhotos.zoomed} onChange={v => setMainPhotos(p => ({...p, zoomed:v}))} />
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'.75rem', marginTop:'.75rem' }}>
                  <span style={{ fontSize:'.8rem', color:'#888', fontWeight:600, whiteSpace:'nowrap' }}>Or paste URL:</span>
                  <input placeholder="https://..."
                    onChange={e => setMainPhotos(p => ({ ...p, front: e.target.value }))}
                    style={{ flex:1, border:'1.5px solid #ddd', borderRadius:'8px', padding:'.55rem .7rem', fontSize:'.85rem', boxSizing:'border-box' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => { setEditing(null); setIsNew(false); }}
                style={{ flex: 1, background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', padding: '.65rem', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 2, background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.65rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: saving ? .7 : 1 }}>
                {saving ? 'Saving...' : isNew ? 'Add Product' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
