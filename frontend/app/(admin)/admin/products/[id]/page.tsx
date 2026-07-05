'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ['Women','Men','Kids','Beauty','Fabrics','More'];
const SIZES_PRESET = ['XS','S','M','L','XL','XXL','XXXL','Free Size','28','30','32','34','36','38','40','42'];
const COLORS_PRESET = ['Red','Blue','Green','Black','White','Yellow','Pink','Orange','Purple','Grey','Navy','Maroon'];
const GST_RATES = [0, 5, 12, 18];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ─── Types ────────────────────────────────────────────────────────────────────
type CustomColour = { name: string; code: string; photo: string; columnLetter: string };
type PackColumn   = { letter: string; front: string; side: string; back: string; zoomed: string };
type MainPhotos   = { front: string; side: string; back: string; zoomed: string };
type AddOn        = { name: string; price: string };
type Variant      = { name: string; price: string; stock: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '';
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `RGB(${r},${g},${b})`;
}

function getPackOfNumber(value: string | number): number {
  const n = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(26, n) : 0;
}

function hasPackPhoto(col: PackColumn): boolean {
  return Boolean(col.front || col.side || col.back || col.zoomed);
}

function normalizePackColumns(cols: PackColumn[], packOf: number): PackColumn[] {
  const extraCount = packOf >= 2 ? packOf - 1 : 0;
  return Array.from({ length: extraCount }, (_, i) => ({
    ...(cols[i] ?? { front:'', side:'', back:'', zoomed:'' }),
    letter: LETTERS[i] ?? String(i + 1),
  }));
}

function splitList(value: string): string[] {
  return value.split(',').map(v => v.trim()).filter(Boolean);
}

function stockStatusFromQty(qty: number): 'In Stock' | 'Limited Stock' | 'Out of Stock' {
  if (qty <= 0) return 'Out of Stock';
  if (qty < 5) return 'Limited Stock';
  return 'In Stock';
}

// ─── AVIF → JPEG Converter ───────────────────────────────────────────────────
interface ConvResult { dataUrl: string; fmt: string; origKB: number; outKB: number; }

function base64Bytes(dataUrl: string): number {
  const b64 = dataUrl.split(',')[1] ?? '';
  return Math.round((b64.length * 3) / 4 / 1024);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target?.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

async function convertToAvif(file: File, maxPx = 1200, quality = 0.82): Promise<ConvResult> {
  const origKB = Math.round(file.size / 1024);

  // Load image
  const srcUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = srcUrl;
  });

  // Resize if needed
  let { width, height } = img;
  if (width > maxPx || height > maxPx) {
    if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
    else                { width  = Math.round(width  * maxPx / height); height = maxPx; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

  // Collect candidates: try AVIF, WebP, JPEG
  const candidates: { blob: Blob; fmt: string }[] = [];

  try {
    const b = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/avif', 0.80));
    if (b && b.type === 'image/avif') candidates.push({ blob: b, fmt: 'AVIF' });
  } catch {}

  try {
    const b = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', 0.85));
    if (b && b.type === 'image/webp') candidates.push({ blob: b, fmt: 'WebP' });
  } catch {}

  try {
    const b = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (b && b.type === 'image/jpeg') candidates.push({ blob: b, fmt: 'JPEG' });
  } catch {}

  // Pick smallest candidate that is actually smaller than original
  const best = candidates
    .filter(c => c.blob.size < file.size)
    .sort((a, b) => a.blob.size - b.blob.size)[0];

  if (best) {
    const dataUrl = await blobToDataUrl(best.blob);
    return { dataUrl, fmt: best.fmt, origKB, outKB: Math.round(best.blob.size / 1024) };
  }

  // Nothing smaller — return original untouched
  return { dataUrl: srcUrl, fmt: file.type.split('/')[1]?.toUpperCase() || 'ORIG', origKB, outKB: origKB };
}

// ─── Photo Slot ───────────────────────────────────────────────────────────────
function PhotoSlot({
  label, value, onChange, isFirst = false,
}: { label: string; value: string; onChange: (v: string) => void; isFirst?: boolean }) {
  const [showUrl, setShowUrl] = useState(false);
  const [report, setReport]   = useState<ConvResult | null>(null);
  const [converting, setConverting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setConverting(true); setReport(null);
    convertToAvif(file)
      .then(r => { onChange(r.dataUrl); setReport(r); })
      .catch(() => {
        const rd = new FileReader();
        rd.onload = e => onChange(e.target?.result as string);
        rd.readAsDataURL(file);
      })
      .finally(() => setConverting(false));
  };

  const icon = label.includes('SIDE') ? '↔️' : label.includes('BACK') ? '🔄' : label.includes('ZOOM') ? '🔍' : '📷';

  return (
    <div style={{ border: isFirst ? '2px solid #1a1a2e' : '2px dashed #ddd', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      <div style={{ background: isFirst ? '#1a1a2e' : '#555', color: '#fff', fontSize: '.68rem', fontWeight: 700, textAlign: 'center', padding: '.35rem', letterSpacing: '.06em' }}>
        {label}{isFirst ? ' ★' : ''}
      </div>
      <div
        style={{ minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f9f9f9', padding: '.25rem' }}
        onClick={() => fileRef.current?.click()}
      >
        {value
          ? <img src={value} alt="" style={{ maxWidth: '100%', maxHeight: '100px', objectFit: 'contain' }} onError={e => (e.target as HTMLImageElement).style.display='none'} />
          : <span style={{ fontSize: '1.8rem' }}>{icon}</span>}
      </div>
      <div style={{ borderTop: '1px solid #eee', padding: '.35rem .5rem', display: 'flex', gap: '.25rem', alignItems: 'center', background: '#fff', flexWrap: 'wrap' }}>
        <button onClick={() => fileRef.current?.click()}
          style={{ fontSize: '.68rem', background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontWeight: 600 }}>
          {converting ? '⏳' : 'Upload'}
        </button>
        <button onClick={() => setShowUrl(v => !v)}
          style={{ fontSize: '.68rem', background: '#f0f0f0', border: 'none', cursor: 'pointer', padding: '.15rem .4rem', borderRadius: '4px', fontWeight: 600 }}>URL</button>
        {value && (
          <button onClick={() => { onChange(''); setReport(null); }}
            style={{ fontSize: '.72rem', background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', marginLeft: 'auto' }}>✕</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
      </div>
      {/* Conversion Report Badge */}
      {report && (
        <div style={{ padding: '.3rem .5rem', background: report.fmt === 'AVIF' ? '#e8f5e9' : report.fmt === 'WebP' ? '#e3f2fd' : '#fff8e1', borderTop: '1px solid #eee', fontSize: '.65rem', fontWeight: 700, display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: report.fmt === 'AVIF' ? '#2e7d32' : report.fmt === 'WebP' ? '#1565c0' : '#e65100', background: report.fmt === 'AVIF' ? '#c8e6c9' : report.fmt === 'WebP' ? '#bbdefb' : '#ffe0b2', padding: '.1rem .35rem', borderRadius: '4px' }}>
            ✓ {report.fmt}
          </span>
          <span style={{ color: '#555' }}>{report.origKB}KB → {report.outKB}KB</span>
          <span style={{ color: '#27ae60', fontWeight: 800 }}>
            -{Math.max(0, Math.round((1 - report.outKB / report.origKB) * 100))}% saved
          </span>
        </div>
      )}
      {showUrl && (
        <div style={{ padding: '.35rem .5rem', borderTop: '1px solid #eee' }}>
          <input value={value} onChange={e => onChange(e.target.value)}
            placeholder="https://..."
            style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '6px', padding: '.3rem .5rem', fontSize: '.72rem', boxSizing: 'border-box' }} />
        </div>
      )}
    </div>
  );
}

// ─── Hex → nearest colour name ───────────────────────────────────────────────
const NAMED_COLOURS: [string, number, number, number][] = [
  ['Red',         220, 30,  30 ], ['Dark Red',    139, 0,   0  ], ['Crimson',     220, 20,  60 ],
  ['Maroon',      128, 0,   0  ], ['Rose',        255, 102, 130], ['Coral',       255, 127, 80 ],
  ['Salmon',      250, 128, 114], ['Light Pink',  255, 182, 193], ['Pink',        255, 105, 180],
  ['Hot Pink',    255, 20,  147], ['Deep Pink',   200, 0,   100], ['Peach',       255, 200, 150],
  ['Orange',      255, 140, 0  ], ['Dark Orange', 210, 100, 0  ], ['Amber',       255, 180, 0  ],
  ['Gold',        255, 215, 0  ], ['Yellow',      255, 230, 0  ], ['Lemon',       255, 245, 100],
  ['Olive',       128, 128, 0  ], ['Light Green', 144, 238, 144], ['Green',       34,  139, 34 ],
  ['Dark Green',  0,   100, 0  ], ['Mint',        152, 251, 152], ['Teal',        0,   128, 128],
  ['Turquoise',   64,  224, 208], ['Cyan',        0,   200, 200], ['Sky Blue',    135, 206, 235],
  ['Light Blue',  173, 216, 230], ['Blue',        30,  80,  200], ['Royal Blue',  65,  105, 225],
  ['Navy Blue',   0,   0,   128], ['Dark Blue',   0,   0,   100], ['Indigo',      75,  0,   130],
  ['Violet',      148, 0,   211], ['Purple',      128, 0,   128], ['Dark Purple', 80,  0,   80 ],
  ['Lavender',    190, 160, 210], ['Plum',        142, 69,  133], ['Mauve',       200, 150, 170],
  ['Brown',       139, 69,  19 ], ['Dark Brown',  100, 40,  10 ], ['Chocolate',   80,  40,  20 ],
  ['Tan',         210, 180, 140], ['Beige',       245, 225, 195], ['Camel',       193, 154, 107],
  ['Cream',       255, 253, 208], ['Ivory',       255, 250, 240], ['Off White',   245, 240, 230],
  ['White',       255, 255, 255], ['Silver',      192, 192, 192], ['Light Grey',  211, 211, 211],
  ['Grey',        128, 128, 128], ['Dark Grey',   64,  64,  64 ], ['Black',       20,  20,  20 ],
  ['Rust',        183, 65,  14 ], ['Brick Red',   156, 50,  30 ], ['Wine',        114, 47,  55 ],
  ['Burgundy',    128, 0,   32 ], ['Mustard',     210, 175, 10 ], ['Khaki',       189, 183, 107],
  ['Copper',      184, 115, 51 ], ['Bronze',      150, 100, 50 ],
];
function hexToColorName(hex: string): string {
  const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
  if (isNaN(r)||isNaN(g)||isNaN(b)) return '';
  let best = NAMED_COLOURS[0][0], bestDist = Infinity;
  for (const [name, cr, cg, cb] of NAMED_COLOURS) {
    const d = (r-cr)**2+(g-cg)**2+(b-cb)**2;
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return best;
}

// ─── Custom Colour Modal ──────────────────────────────────────────────────────
function CustomColourModal({
  nextLetter, onAdd, onClose,
}: { nextLetter: string; onAdd: (c: CustomColour) => void; onClose: () => void }) {
  const [colName, setColName]         = useState('');
  const [nameEdited, setNameEdited]   = useState(false);
  const [code, setCode]               = useState('#cccccc');
  const [colPhoto, setColPhoto]       = useState('');
  const [colConverting, setColConverting] = useState(false);
  const [showUrlBox, setShowUrlBox]   = useState(false);
  const [urlVal, setUrlVal]           = useState('');
  const [eyedropSrc, setEyedropSrc]  = useState('');
  const [locked, setLocked]           = useState(false);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const colFileRef = useRef<HTMLInputElement>(null);
  const eyeFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!eyedropSrc || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current!;
      c.width = 280; c.height = 180;
      c.getContext('2d')!.drawImage(img, 0, 0, 280, 180);
    };
    img.src = eyedropSrc;
  }, [eyedropSrc]);

  const applyCode = (hex: string) => {
    setCode(hex);
    if (!nameEdited) setColName(hexToColorName(hex));
  };

  const pickColour = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (locked) return;
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (c.width / rect.width));
    const y = Math.floor((e.clientY - rect.top)  * (c.height / rect.height));
    const px = c.getContext('2d')!.getImageData(x, y, 1, 1).data;
    applyCode('#' + [px[0],px[1],px[2]].map(v => v.toString(16).padStart(2,'0')).join(''));
  };

  const readFile = (file: File, cb: (dataUrl: string) => void) => {
    const rd = new FileReader();
    rd.onload = e => cb(e.target?.result as string);
    rd.readAsDataURL(file);
  };

  const handleAdd = () => {
    // Colour Name is required only when NOT using a photo (i.e. a colour-code
    // colour). With a photo, auto-name from the column letter if left blank.
    const name = colName.trim() || (colPhoto ? `Design ${nextLetter}` : '');
    if (!name) { alert('Colour Name is required when using a colour code.'); return; }
    // A custom colour is EITHER a photo (column) OR a colour code — not both.
    onAdd({ name, code: colPhoto ? '' : code, photo: colPhoto, columnLetter: nextLetter });
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600, padding:'1rem', overflowY:'auto' }}>
      <div style={{ background:'#fff', borderRadius:'16px', padding:'1.25rem', width:'100%', maxWidth:'460px', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <h3 style={{ fontWeight:700, fontSize:'1rem', margin:0 }}>🎨 Add Custom Colour</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.3rem', cursor:'pointer', color:'#888', lineHeight:1 }}>✕</button>
        </div>

        <div style={{ background:'#f9f9f9', borderRadius:'10px', padding:'1rem', marginBottom:'1rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'.75rem' }}>
            <span style={{ fontSize:'.85rem', fontWeight:700 }}>🖼️ Colour Photo</span>
            <span style={{ background:'#a7354d', color:'#fff', fontSize:'.68rem', fontWeight:700, padding:'.15rem .45rem', borderRadius:'4px' }}>Column {nextLetter}</span>
          </div>
          <div style={{ display:'flex', gap:'1rem', alignItems:'flex-start' }}>
            <div style={{ width:'72px', height:'72px', background:'#eee', borderRadius:'8px', overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem' }}>
              {colPhoto ? <img src={colPhoto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <span>{nextLetter}</span>}
            </div>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'.45rem' }}>
              <button onClick={() => colFileRef.current?.click()}
                style={{ background:'#fdecea', color:'#a7354d', border:'1.5px solid #f5c6cb', borderRadius:'8px', padding:'.45rem', fontSize:'.8rem', fontWeight:600, cursor:'pointer' }}>
                {colConverting ? '⏳ Converting...' : '📤 Upload Photo'}
              </button>
              <button onClick={() => setShowUrlBox(v => !v)}
                style={{ background:'#fff', color:'#555', border:'1.5px solid #ddd', borderRadius:'8px', padding:'.45rem', fontSize:'.8rem', fontWeight:600, cursor:'pointer' }}>
                🔗 Use URL
              </button>
              <input ref={colFileRef} type="file" accept="image/*" hidden
                onChange={e => { if (e.target.files?.[0]) { setColConverting(true); convertToAvif(e.target.files[0]).then(r => setColPhoto(r.dataUrl)).finally(() => setColConverting(false)); } }} />
            </div>
          </div>
          {showUrlBox && (
            <input value={urlVal} onChange={e => { setUrlVal(e.target.value); setColPhoto(e.target.value); }}
              placeholder="https://..."
              style={{ width:'100%', marginTop:'.5rem', border:'1.5px solid #ddd', borderRadius:'8px', padding:'.45rem .65rem', fontSize:'.8rem', boxSizing:'border-box' }} />
          )}
          <button onClick={handleAdd}
            style={{ width:'100%', marginTop:'.75rem', background:'#a7354d', color:'#fff', border:'none', borderRadius:'8px', padding:'.5rem', fontSize:'.82rem', fontWeight:700, cursor:'pointer' }}>
            ✓ Add Column {nextLetter}
          </button>
        </div>

        <div style={{ background:'#f9f9f9', borderRadius:'10px', padding:'1rem', marginBottom:'1rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'.75rem' }}>
            <span style={{ fontSize:'.85rem', fontWeight:700 }}>🎯 Colour Code</span>
            <span style={{ fontSize:'.72rem', color:'#888' }}>(for the circle)</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'.6rem', marginBottom:'.75rem', flexWrap:'wrap' }}>
            <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:code, border:'2px solid #ddd', flexShrink:0 }} />
            <input value={code} onChange={e => applyCode(e.target.value)} placeholder="#cccccc"
              style={{ width:'100px', border:'1.5px solid #ddd', borderRadius:'8px', padding:'.4rem .55rem', fontSize:'.82rem', fontFamily:'monospace', boxSizing:'border-box' }} />
            <div style={{ width:'28px', height:'28px', background:code, border:'2px solid #ddd', borderRadius:'4px', flexShrink:0 }} />
            <span style={{ fontSize:'.72rem', color:'#888' }}>{hexToRgb(code)}</span>
          </div>
          <button onClick={() => eyeFileRef.current?.click()}
            style={{ width:'100%', background:'#fdecea', color:'#a7354d', border:'1.5px solid #f5c6cb', borderRadius:'8px', padding:'.45rem', fontSize:'.8rem', fontWeight:600, cursor:'pointer', marginBottom:'.4rem' }}>
            📷 Upload a photo and pick the colour
          </button>
          <input ref={eyeFileRef} type="file" accept="image/*" hidden
            onChange={e => { if (e.target.files?.[0]) { readFile(e.target.files[0], setEyedropSrc); setLocked(false); } }} />
          {eyedropSrc && (
            <>
              <p style={{ fontSize:'.7rem', color:'#888', margin:'.2rem 0 .3rem' }}>
                📌 Hover to preview. <strong>Click</strong> to {locked ? 'unlock 🔓' : 'lock 🔒'}
              </p>
              <canvas ref={canvasRef} onMouseMove={pickColour} onClick={() => setLocked(l => !l)}
                style={{ width:'100%', borderRadius:'8px', cursor: locked ? 'default' : 'crosshair', border:'1.5px solid #ddd', display:'block' }} />
            </>
          )}
        </div>

        <div style={{ marginBottom:'1rem' }}>
          <label style={{ fontSize:'.82rem', fontWeight:700, display:'block', marginBottom:'.3rem' }}>
            Colour Name {colPhoto
              ? <span style={{ fontWeight:400, color:'#888', fontSize:'.72rem' }}>(optional — photo added)</span>
              : <span style={{ color:'#c62828' }}>*</span>}
          </label>
          <input value={colName}
            onChange={e => { setColName(e.target.value); setNameEdited(true); }}
            placeholder="e.g. Maroon, Sky Blue, Golden..."
            onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus
            style={{ width:'100%', border:'1.5px solid #ddd', borderRadius:'8px', padding:'.6rem .75rem', fontSize:'.88rem', boxSizing:'border-box',
              background: nameEdited ? '#fff' : '#f0fdf4',
            }} />
        </div>
        <button onClick={handleAdd}
          style={{ width:'100%', background:'#a7354d', color:'#fff', border:'none', borderRadius:'8px', padding:'.7rem', fontSize:'.95rem', fontWeight:700, cursor:'pointer' }}>
          ✓ Add Colour
        </button>
      </div>
    </div>
  );
}

// ─── Main Edit Page ───────────────────────────────────────────────────────────
const lbl: React.CSSProperties = { fontSize:'.82rem', fontWeight:600, display:'block', marginBottom:'.3rem', color:'#444' };
const inp: React.CSSProperties = { width:'100%', border:'1.5px solid #ddd', borderRadius:'8px', padding:'.6rem .75rem', fontSize:'.88rem', boxSizing:'border-box' };

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = Number(params.id);

  const [loadingProduct, setLoadingProduct] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Basic fields
  const [sku, setSku]             = useState('');
  const [hsnCode, setHsnCode]     = useState('6211');
  const [name, setName]           = useState('');
  const [category, setCategory]   = useState('Women');
  const [sub, setSub]             = useState('');
  const [price, setPrice]         = useState('');
  const [discPct, setDiscPct]     = useState('');
  const [discPrice, setDiscPrice] = useState('');
  const [shipCharge, setShipCharge] = useState('');
  const [gstRate, setGstRate]     = useState('5');
  const [totalQty, setTotalQty]   = useState('');
  const [packOf, setPackOf]       = useState('');
  const [bestSeller, setBestSeller] = useState(false);
  const [availColours, setAvailColours] = useState('');
  const [desc, setDesc]           = useState('');
  const [saving, setSaving]       = useState(false);

  // Sizes / colours
  const [selSizes, setSelSizes]         = useState<string[]>([]);
  const [customSizes, setCustomSizes]   = useState<string[]>([]);
  const [selColors, setSelColors]       = useState<string[]>([]);
  const [customColours, setCustomColours] = useState<CustomColour[]>([]);
  const [variantStock, setVariantStock] = useState<Record<string, string>>({});
  const [showColModal, setShowColModal] = useState(false);

  const [packCols, setPackCols]     = useState<PackColumn[]>([]);
  const [mainPhotos, setMainPhotos] = useState<MainPhotos>({ front:'', side:'', back:'', zoomed:'' });
  const [addOns, setAddOns]         = useState<AddOn[]>([]);

  // Variants
  const [variants, setVariants] = useState<Variant[]>([]);

  // Subcategory
  const [localSubcats, setLocalSubcats] = useState<string[]>([]);
  const [hiddenSubcats, setHiddenSubcats] = useState<Set<string>>(new Set());
  const [subcatOpen, setSubcatOpen] = useState(false);

  // Subcategory autocomplete
  const [allSubcats, setAllSubcats] = useState<{ cat: string; sub: string }[]>([]);
  useEffect(() => {
    productsApi.getAll({ pageSize: 1000 })
      .then(r => {
        const seen = new Set<string>();
        const pairs = (r.products as any[])
          .filter(p => p.subcategory?.trim())
          .reduce<{ cat: string; sub: string }[]>((acc, p) => {
            const key = (p.category ?? '').toLowerCase() + '|' + (p.subcategory as string).toLowerCase();
            if (!seen.has(key)) { seen.add(key); acc.push({ cat: (p.category ?? '').toLowerCase(), sub: p.subcategory as string }); }
            return acc;
          }, []);
        setAllSubcats(pairs);
      })
      .catch(() => {});
  }, []);

  // ── Load existing product ──
  useEffect(() => {
    if (!productId) { setNotFound(true); setLoadingProduct(false); return; }
    const token = getAdminToken() ?? '';
    productsApi.getById(productId)
      .then((res: any) => {
        const p = res.product ?? res;
        setSku(p.sku ?? '');
        setHsnCode(p.hsnCode ?? p.hsn_code ?? '6211');
        setName(p.name ?? '');
        setCategory(p.category ?? 'Saree');
        setSub(p.subcategory ?? '');
        setPrice(String(p.price ?? ''));
        if (p.discountPrice && p.price > 0) {
          const pct = Math.round(((p.price - p.discountPrice) / p.price) * 100);
          setDiscPct(String(pct));
          setDiscPrice(String(p.discountPrice));
        }
        if (p.shippingCharge ?? p.shipping_charge) setShipCharge(String(p.shippingCharge ?? p.shipping_charge));
        setGstRate(String(p.gstRate ?? p.gst_rate ?? 5));
        setBestSeller(p.bestSeller ?? p.best_seller ?? false);
        setDesc(p.description ?? '');

        // Parse extraJson
        try {
          const ex = typeof p.extraJson === 'string'
            ? JSON.parse(p.extraJson)
            : (p.extraJson ?? {});

          // Sizes
          const exSizes: string[] = ex.sizes ?? [];
          const presetSet = new Set(SIZES_PRESET);
          setSelSizes(exSizes.filter((s: string) => presetSet.has(s)));
          setCustomSizes(exSizes.filter((s: string) => !presetSet.has(s)));

          // Colours
          const exColors: string[] = ex.colors ?? [];
          const presetColSet = new Set(COLORS_PRESET);
          setSelColors(exColors.filter((c: string) => presetColSet.has(c)));
          setCustomColours(ex.customColors ?? []);
          setAvailColours(ex.availColours ?? '');

          // Variant stock
          const matrix = ex.variantMatrix ?? {};
          setVariantStock(Object.fromEntries(
            Object.entries(matrix).map(([k, v]) => [k, String(v ?? '')])
          ));

          // Pack
          const n = getPackOfNumber(ex.packOf ?? p.packOf ?? 0);
          setPackOf(n >= 2 ? String(n) : '');
          const rawCols = (ex.packColumnPhotos ?? ex.packImages ?? ex.variantColumns ?? []) as Array<Partial<PackColumn> & { label?: string; url?: string }>;
          const existing: PackColumn[] = rawCols.map((col, i) => ({
            letter: col.letter ?? col.label ?? LETTERS[i] ?? String(i + 1),
            front:  col.front  ?? (col as any).url ?? '',
            side:   col.side   ?? '',
            back:   col.back   ?? '',
            zoomed: col.zoomed ?? '',
          }));
          setPackCols(normalizePackColumns(existing, n));

          // Main product photos
          const pp = ex.productPhotos ?? {};
          setMainPhotos({
            front:  pp.front  ?? p.image ?? '',
            side:   pp.side   ?? '',
            back:   pp.back   ?? '',
            zoomed: pp.zoomed ?? '',
          });

          // Qty
          setTotalQty(String(ex.qty ?? p.qty ?? ''));

          // Add-ons
          setAddOns(
            (ex.addOns ?? []).map((a: any) => ({ name: String(a.name ?? ''), price: String(a.price ?? '') }))
          );

          // Variants
          setVariants(
            (ex.variants ?? []).map((v: any) => ({ name: String(v.name ?? ''), price: String(v.price ?? ''), stock: String(v.stock ?? '') }))
          );
        } catch {
          setMainPhotos({ front: p.image ?? '', side:'', back:'', zoomed:'' });
          setTotalQty(String(p.qty ?? ''));
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingProduct(false));
  }, [productId]);

  // ── Pack of change ──
  const handlePackOfChange = (value: string) => {
    setPackOf(value);
    const safe = getPackOfNumber(value);
    setPackCols(prev => normalizePackColumns(prev, safe));
  };

  // ── Discount calc ──
  const handleDiscPct = (pct: string) => {
    setDiscPct(pct);
    const n = parseFloat(pct);
    if (!isNaN(n) && n > 0 && n < 100 && price)
      setDiscPrice(String(Math.round(Number(price) * (1 - n / 100))));
  };

  // ── Size / colour toggles ──
  const toggleSize  = (s: string) => setSelSizes(p  => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const toggleColor = (c: string) => setSelColors(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);

  const addCustomSize = () => {
    const s = window.prompt('Enter custom size:');
    if (s?.trim()) {
      const value = s.trim();
      setCustomSizes(p => p.includes(value) ? p : [...p, value]);
      setSelSizes(p => p.includes(value) ? p : [...p, value]);
    }
  };

  const updateCol = (idx: number, field: keyof PackColumn, val: string) =>
    setPackCols(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c));

  // ── Save ──
  const handleSave = async () => {
    if (!name.trim())            { alert('Product name is required.'); return; }
    if (!price || Number(price) <= 0) { alert('Price must be greater than 0.'); return; }
    setSaving(true);
    try {
      const packValue     = getPackOfNumber(packOf);
      const normalizedPackCols = normalizePackColumns(packCols, packValue);
      const filledPackCols = normalizedPackCols.filter(hasPackPhoto);
      const galleryImages  = [mainPhotos.front, mainPhotos.side, mainPhotos.back, mainPhotos.zoomed].filter(Boolean);
      const stockMatrix    = Object.fromEntries(stockKeys.map(key => [key, Number(variantStock[key]) || 0]));
      const saveQty        = stockKeys.length > 0 ? stockTotal : (Number(totalQty) || 0);
      const packImages     = filledPackCols.map(col => ({
        label: col.letter, letter: col.letter,
        url: col.front, front: col.front, side: col.side, back: col.back, zoomed: col.zoomed,
      }));
      const extraJson = JSON.stringify({
        sizes:            [...selSizes, ...customSizes],
        colors:           selectedColours,
        customColors:     customColours,
        images:           galleryImages,
        productPhotos:    mainPhotos,
        addOns:           addOns.filter(a => a.name.trim()),
        variants:         variants.filter(v => v.name.trim()),
        availColours:     availColours.trim() || undefined,
        qty:              saveQty,
        packOf:           packValue >= 2 ? packValue : undefined,
        packColumnPhotos: packValue >= 2 ? normalizedPackCols : undefined,
        packImages:       packImages.length ? packImages : undefined,
        variantColumns:   packImages.length ? packImages : undefined,
        variantMatrix:    stockKeys.length  ? stockMatrix : undefined,
        stockMode:        stockKeys.length  ? (selectedColours.length ? 'size_colour' : 'size') : undefined,
      });
      await productsApi.update(productId, {
        name: name.trim(),
        category,
        subcategory:   sub.trim() || undefined,
        price:         Number(price),
        discountPrice: discPrice ? Number(discPrice) : undefined,
        shippingCharge: shipCharge ? Number(shipCharge) : 0,
        stock:         stockStatusFromQty(saveQty),
        sku:           sku.trim() || undefined,
        description:   desc.trim() || undefined,
        image:         mainPhotos.front || filledPackCols[0]?.front || undefined,
        bestSeller,
        hsnCode:       hsnCode.trim() || '6211',
        gstRate:       Number(gstRate),
        qty:           saveQty,
        packOf:        packValue >= 2 ? packValue : undefined,
        extraJson,
      }, getAdminToken() ?? '');
      alert('✅ Product updated successfully!');
      router.push('/admin/products');
    } catch (e) { alert('❌ ' + (e as Error).message); }
    finally { setSaving(false); }
  };

  const allSizes = [...SIZES_PRESET, ...customSizes];
  const packValue = getPackOfNumber(packOf);
  const selectedColours = packValue >= 2
    ? []
    : [...new Set([...selColors, ...customColours.map(c => c.name), ...splitList(availColours)])];
  const stockKeys = selSizes.length > 0
    ? (selectedColours.length > 0
        ? selSizes.flatMap(size => selectedColours.map(colour => `${size}|${colour}`))
        : selSizes)
    : [];
  const stockTotal = stockKeys.reduce((sum, key) => sum + (Number(variantStock[key]) || 0), 0);
  const effectiveQty = stockKeys.length > 0 ? stockTotal : (Number(totalQty) || 0);
  const effectiveStockStatus = stockStatusFromQty(effectiveQty);

  useEffect(() => {
    setVariantStock(prev => {
      const next: Record<string, string> = {};
      stockKeys.forEach(key => { next[key] = prev[key] ?? ''; });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selSizes.join('|'), selectedColours.join('|')]);

  // ── Loading / not found states ──
  if (loadingProduct) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', flexDirection:'column', gap:'1rem' }}>
        <div style={{ width:'40px', height:'40px', border:'4px solid #f0f0f0', borderTopColor:'#a7354d', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <p style={{ color:'#888', fontSize:'.9rem' }}>Loading product…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ textAlign:'center', padding:'4rem 2rem' }}>
        <p style={{ fontSize:'2rem', marginBottom:'1rem' }}>😕</p>
        <h2 style={{ fontWeight:700, marginBottom:'.5rem' }}>Product not found</h2>
        <Link href="/admin/products" style={{ color:'#a7354d', fontWeight:600 }}>← Back to Products</Link>
      </div>
    );
  }

  return (
    <div>
      {/* ── Page Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
        <div>
          <p style={{ fontSize:'.75rem', fontWeight:700, color:'#a7354d', textTransform:'uppercase', letterSpacing:'.08em', margin:'0 0 .25rem' }}>CATALOG MANAGER</p>
          <h1 style={{ fontSize:'1.5rem', fontWeight:700, color:'#1a1a1a', margin:0 }}>✏️ Edit Product</h1>
          <p style={{ fontSize:'.8rem', color:'#888', margin:'.25rem 0 0' }}>SKU: {sku || '—'}</p>
        </div>
        <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap' }}>
          <Link href="/admin/products/add"
            style={{ background:'#555', color:'#fff', borderRadius:'8px', padding:'.5rem 1rem', fontSize:'.82rem', fontWeight:600, textDecoration:'none', display:'inline-block' }}>
            ➕ Add New Product
          </Link>
          <Link href="/admin/products"
            style={{ background:'#1a1a2e', color:'#fff', borderRadius:'8px', padding:'.5rem 1rem', fontSize:'.82rem', fontWeight:600, textDecoration:'none', display:'inline-block' }}>
            ← View Product Listing
          </Link>
        </div>
      </div>

      <div style={{ background:'#fff', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 4px rgba(0,0,0,.07)' }}>

        {/* ── Basic Fields Grid ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>

          <div>
            <label style={lbl}>SKU ID <span style={{ fontSize:'.72rem', color:'#888', fontWeight:400 }}>(auto-generated, cannot change)</span></label>
            <input
              value={sku}
              readOnly
              style={{ ...inp, background:'#f5f5f5', color:'#888', cursor:'not-allowed', border:'1px solid #ddd' }}
              title="SKU ID cannot be changed after creation"
            />
          </div>

          <div>
            <label style={lbl}>HSN Code</label>
            <input value={hsnCode} onChange={e => setHsnCode(e.target.value)} placeholder="e.g. 6211" style={inp} />
          </div>

          <div style={{ gridColumn:'1 / -1' }}>
            <label style={lbl}>Product Name <span style={{ color:'#c62828' }}>*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} style={inp} />
          </div>

          <div>
            <label style={lbl}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ position:'relative' }}>
            <label style={lbl}>Subcategory</label>
            <div style={{ display:'flex', gap:'.4rem', alignItems:'center' }}>
              <div style={{ position:'relative', flex:1 }}>
                <input
                  value={sub}
                  onChange={e => { setSub(e.target.value); setSubcatOpen(true); }}
                  onFocus={() => setSubcatOpen(true)}
                  onBlur={() => setTimeout(() => setSubcatOpen(false), 180)}
                  placeholder="Type a subcategory..."
                  style={{ ...inp, width:'100%', boxSizing:'border-box' }}
                />
                {subcatOpen && (() => {
                  const all = [...new Set([
                    ...allSubcats.filter(s => s.cat === category.toLowerCase()).map(s => s.sub),
                    ...localSubcats,
                  ])].filter(s => !hiddenSubcats.has(s));
                  const filtered = sub.trim()
                    ? all.filter(s => s.toLowerCase().includes(sub.toLowerCase()))
                    : all;
                  return filtered.length > 0 ? (
                    <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1.5px solid #ddd', borderRadius:'8px', boxShadow:'0 4px 16px rgba(0,0,0,.12)', zIndex:200, maxHeight:'200px', overflowY:'auto' }}>
                      {filtered.map(s => (
                        <div key={s} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'.48rem .75rem', borderBottom:'1px solid #f5f5f5', background: sub===s ? '#fdf0f3' : '#fff' }}>
                          <span onMouseDown={() => setSub(s)} style={{ fontSize:'.85rem', fontWeight: sub===s ? 700 : 400, color: sub===s ? '#a7354d' : '#333', cursor:'pointer', flex:1 }}>{s}</span>
                          <button onMouseDown={e => { e.preventDefault(); setHiddenSubcats(p => new Set([...p, s])); setLocalSubcats(p => p.filter(x => x!==s)); if (sub===s) setSub(''); }}
                            style={{ background:'#fdecea', border:'none', borderRadius:'4px', color:'#c0392b', fontSize:'.72rem', fontWeight:700, cursor:'pointer', padding:'.15rem .45rem', marginLeft:'.5rem', whiteSpace:'nowrap' }}>
                            🗑 Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
              <button
                onMouseDown={e => { e.preventDefault(); const v = sub.trim(); if (v && !localSubcats.includes(v)) setLocalSubcats(p => [...p, v]); }}
                title="Save to list"
                style={{ background:'#a7354d', color:'#fff', border:'none', borderRadius:'8px', padding:'.6rem .95rem', fontSize:'1.15rem', fontWeight:700, cursor:'pointer', flexShrink:0, lineHeight:1 }}>
                +
              </button>
            </div>
            {sub.trim() && [...new Set([
              ...allSubcats.filter(s => s.cat === category.toLowerCase()).map(s => s.sub),
              ...localSubcats,
            ])].filter(s => !hiddenSubcats.has(s)).some(s => s.toLowerCase() === sub.trim().toLowerCase()) && (
              <span style={{ fontSize:'.75rem', color:'#e67e22', fontWeight:600, marginTop:'.25rem', display:'block' }}>
                ⚠️ This subcategory is already in the list
              </span>
            )}
          </div>

          {/* ── Variants ── */}
          <div style={{ gridColumn:'1 / -1', marginTop:'.25rem' }}>
            <label style={lbl}>Variants <span style={{ fontWeight:400, color:'#888', fontSize:'.75rem' }}>Optional — names of different options (e.g. Single, Double Set, 6 Pcs)</span></label>
            {variants.map((v, i) => (
              <div key={i} style={{ display:'flex', gap:'.5rem', marginBottom:'.4rem', alignItems:'center' }}>
                <input value={v.name} onChange={e => setVariants(p => p.map((x,j) => j===i ? {...x, name:e.target.value} : x))}
                  placeholder="Variant name (e.g. Small Pack, Premium, 6 Pcs Set)" style={{ ...inp, flex:1 }} />
                <button onClick={() => setVariants(p => p.filter((_,j) => j!==i))}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#c62828', fontSize:'1.1rem', flexShrink:0 }}>✕</button>
              </div>
            ))}
            <button onClick={() => setVariants(p => [...p, { name:'', price:'', stock:'' }])}
              style={{ width:'100%', border:'1.5px dashed #ddd', background:'#fafafa', borderRadius:'8px', padding:'.5rem', fontSize:'.85rem', cursor:'pointer', color:'#888' }}>
              + Add Variant
            </button>
          </div>

          <div>
            <label style={lbl}>Price (₹) <span style={{ color:'#c62828' }}>*</span></label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={inp} />
          </div>

          <div>
            <label style={lbl}>Discount % <span style={{ fontWeight:400, color:'#888', fontSize:'.75rem' }}>Enter % → auto price</span></label>
            <input type="number" value={discPct} onChange={e => handleDiscPct(e.target.value)} placeholder="e.g. 20" style={inp} />
          </div>

          <div>
            <label style={lbl}>Discount Price (₹)</label>
            <input type="number" value={discPrice} onChange={e => setDiscPrice(e.target.value)} placeholder="Optional" style={inp} />
          </div>

          <div>
            <label style={lbl}>
              Shipping Charge (₹) <span style={{ fontWeight:400, color:'#888', fontSize:'.75rem' }}>Hidden from customer — added into final rate</span>
            </label>
            <input type="number" min={0} value={shipCharge} onChange={e => setShipCharge(e.target.value)} placeholder="0" style={inp} />
            {(() => {
              const base = discPrice ? Number(discPrice) : Number(price || 0);
              const ship = Number(shipCharge || 0);
              const final = base + ship;
              if (!base) return null;
              return (
                <p style={{ fontSize:'.78rem', color:'#166534', marginTop:'.35rem', fontWeight:600 }}>
                  Final rate customer pays: ₹{final.toLocaleString('en-IN')}
                  {ship > 0 && <span style={{ color:'#888', fontWeight:400 }}> &nbsp;(₹{base.toLocaleString('en-IN')} + ₹{ship.toLocaleString('en-IN')} shipping)</span>}
                </p>
              );
            })()}
          </div>

          <div>
            <label style={lbl}>
              Final Rate Customer Pays (₹) <span style={{ fontWeight:400, color:'#888', fontSize:'.75rem' }}>Auto — yahi customer ko dikhega</span>
            </label>
            <input
              type="text"
              readOnly
              value={`₹${((discPrice ? Number(discPrice) : Number(price || 0)) + Number(shipCharge || 0)).toLocaleString('en-IN')}`}
              style={{ ...inp, background:'#f0fdf4', color:'#166534', fontWeight:800, cursor:'not-allowed', borderColor:'#86efac' }}
            />
          </div>

          <div>
            <label style={lbl}>GST Rate</label>
            <select value={gstRate} onChange={e => setGstRate(e.target.value)} style={inp}>
              {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
            </select>
          </div>

          <div>
            <label style={lbl}>Total Quantity (pcs)</label>
            <input type="number" value={totalQty} onChange={e => setTotalQty(e.target.value)} placeholder="e.g. 50" style={inp} />
          </div>

          <div>
            <label style={lbl}>
              Pack of <span style={{ fontWeight:400, color:'#888', fontSize:'.75rem' }}>Blank / 0 = normal, 2+ = bundle</span>
            </label>
            <input type="number" min={0} max={26} value={packOf}
              onChange={e => handlePackOfChange(e.target.value)}
              placeholder="Blank / 0" style={inp} />
          </div>

        </div>

        {/* ── Pack Column Photos ── */}
        {getPackOfNumber(packOf) >= 2 && packCols.length > 0 && (
          <div style={{ marginTop:'1.5rem', borderTop:'1px solid #f0f0f0', paddingTop:'1.5rem' }}>
            <p style={{ fontSize:'.75rem', fontWeight:700, color:'#a7354d', textTransform:'uppercase', letterSpacing:'.06em', margin:'0 0 .25rem' }}>
              PACK COLUMN PHOTOS
            </p>
            <p style={{ fontSize:'.8rem', color:'#888', marginBottom:'1.25rem' }}>
              Pack of {getPackOfNumber(packOf)} = columns {packCols.map(c=>c.letter).join(', ')}
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
              {packCols.map((col, idx) => (
                <div key={col.letter}>
                  <div style={{ display:'flex', alignItems:'center', gap:'.6rem', marginBottom:'.75rem' }}>
                    <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'#a7354d', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'1rem', flexShrink:0 }}>
                      {col.letter}
                    </div>
                    <span style={{ fontWeight:700, fontSize:'.92rem' }}>Column {col.letter}</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'.75rem' }}>
                    <PhotoSlot label="FRONT VIEW" value={col.front}  onChange={v => updateCol(idx,'front',v)}  isFirst />
                    <PhotoSlot label="SIDE VIEW"  value={col.side}   onChange={v => updateCol(idx,'side',v)} />
                    <PhotoSlot label="BACK VIEW"  value={col.back}   onChange={v => updateCol(idx,'back',v)} />
                    <PhotoSlot label="ZOOMED IN"  value={col.zoomed} onChange={v => updateCol(idx,'zoomed',v)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Size & Colour Stock ── */}
        <div style={{ marginTop:'1.5rem', borderTop:'1px solid #f0f0f0', paddingTop:'1.5rem' }}>
          <p style={{ fontSize:'.82rem', fontWeight:600, color:'#444', marginBottom:'.25rem' }}>
            Size & Colour Stock <span style={{ fontWeight:400, color:'#888' }}>{packValue >= 2 ? 'Pack products: only Size is shown' : 'Select sizes and/or colours'}</span>
          </p>

          {/* Sizes */}
          <div style={{ display:'flex', alignItems:'center', gap:'.4rem', flexWrap:'wrap', marginBottom:'.85rem' }}>
            <span style={{ fontSize:'.82rem', fontWeight:600, color:'#555', minWidth:'50px' }}>Sizes:</span>
            {allSizes.map(s => (
              <button key={s} onClick={() => toggleSize(s)}
                style={{
                  border:`1.5px solid ${selSizes.includes(s) ? '#a7354d' : '#ddd'}`,
                  background: selSizes.includes(s) ? '#fdf0f3' : '#fff',
                  color: selSizes.includes(s) ? '#a7354d' : '#555',
                  borderRadius:'20px', padding:'.28rem .7rem', fontSize:'.8rem', fontWeight:600, cursor:'pointer',
                }}>
                {s}
              </button>
            ))}
            <button onClick={addCustomSize}
              style={{ border:'1.5px dashed #ddd', background:'#fff', color:'#888', borderRadius:'20px', padding:'.28rem .7rem', fontSize:'.8rem', cursor:'pointer' }}>
              + Custom
            </button>
          </div>

          {/* Colours */}
          <div style={{ display:'flex', alignItems:'center', gap:'.4rem', flexWrap:'wrap', marginBottom:'.5rem' }}>
            <span style={{ fontSize:'.82rem', fontWeight:600, color:'#555', minWidth:'96px' }}>Colour/Design:</span>
            {COLORS_PRESET.map(c => (
              <button key={c} onClick={() => toggleColor(c)} title={c} aria-label={c}
                style={{
                  width:'32px', height:'32px', borderRadius:'50%', padding:0, flexShrink:0, cursor:'pointer',
                  background: c.toLowerCase(),
                  border: selColors.includes(c) ? '3px solid #a7354d' : '1.5px solid #ccc',
                  boxShadow: selColors.includes(c) ? '0 0 0 2px #fdf0f3' : 'none',
                }} />
            ))}
            <button onClick={() => setShowColModal(true)}
              style={{ border:'1.5px dashed #ddd', background:'#fff', color:'#888', borderRadius:'20px', padding:'.28rem .7rem', fontSize:'.8rem', cursor:'pointer' }}>
              + Custom
            </button>
          </div>

          {/* Custom colour chips */}
          {customColours.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'.4rem', paddingLeft:'100px', marginBottom:'.5rem' }}>
              {customColours.map((c, i) => (
                <div key={i} title={c.name} style={{ display:'flex', alignItems:'center', gap:'.25rem', background:'#f9f9f9', border:'1.5px solid #eee', borderRadius:'20px', padding:'.2rem .35rem' }}>
                  {c.photo
                    ? <img src={c.photo} alt={c.name} style={{ width:'22px', height:'22px', borderRadius:'50%', objectFit:'cover', border:'1.5px solid #ddd', flexShrink:0 }} />
                    : <div style={{ width:'22px', height:'22px', borderRadius:'50%', background:c.code, border:'1.5px solid #ddd', flexShrink:0 }} />}
                  <button onClick={() => setCustomColours(p => p.filter((_,j) => j !== i))}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#c62828', fontSize:'.8rem', padding:'0 .15rem', lineHeight:1 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Variant stock matrix */}
          {stockKeys.length > 0 && (
            <div style={{ marginTop:'.85rem', border:'1.5px solid #eee', borderRadius:'10px', overflow:'auto' }}>
              <div style={{ background:'#fafafa', padding:'.65rem .85rem', display:'flex', justifyContent:'space-between', gap:'.75rem', alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:'.84rem', fontWeight:700, color:'#444' }}>
                  📦 Stock by {selectedColours.length ? 'Size × Colour/Design' : 'Size'}
                </span>
                <span style={{ fontSize:'.78rem', color:'#888' }}>Total: {stockTotal} pcs</span>
              </div>
              {selectedColours.length > 0 ? (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.78rem' }}>
                  <thead>
                    <tr>
                      <th style={{ background:'#a7354d', color:'#fff', padding:'.45rem .6rem', textAlign:'left', fontWeight:700, whiteSpace:'nowrap' }}>Size ↓ / Colour →</th>
                      {selectedColours.map(col => (
                        <th key={col} style={{ background:'#a7354d', color:'#fff', padding:'.45rem .6rem', textAlign:'center', fontWeight:700, whiteSpace:'nowrap' }}>{col}</th>
                      ))}
                      <th style={{ background:'#7b2a3a', color:'#fff', padding:'.45rem .6rem', textAlign:'center', fontWeight:700 }}>Row Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selSizes.map((size, si) => {
                      const rowTotal = selectedColours.reduce((s, col) => s + (Number(variantStock[`${size}|${col}`]) || 0), 0);
                      return (
                        <tr key={size} style={{ background: si % 2 === 0 ? '#fff' : '#fdf5f7' }}>
                          <td style={{ padding:'.35rem .6rem', fontWeight:700, color:'#a7354d', borderBottom:'1px solid #f0e0e4', whiteSpace:'nowrap' }}>{size}</td>
                          {selectedColours.map(col => {
                            const key = `${size}|${col}`;
                            return (
                              <td key={col} style={{ padding:'.25rem .4rem', borderBottom:'1px solid #f0e0e4', textAlign:'center' }}>
                                <input type="number" min={0} value={variantStock[key] ?? ''}
                                  onChange={e => setVariantStock(p => ({ ...p, [key]: e.target.value }))}
                                  placeholder="0"
                                  style={{ width:'60px', border:'1.5px solid #ddd', borderRadius:'6px', padding:'.3rem', fontSize:'.8rem', textAlign:'center', boxSizing:'border-box' }} />
                              </td>
                            );
                          })}
                          <td style={{ padding:'.35rem .6rem', textAlign:'center', fontWeight:700, color:'#555', borderBottom:'1px solid #f0e0e4', background:'#f9f0f2' }}>{rowTotal}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background:'#f9f0f2' }}>
                      <td style={{ padding:'.35rem .6rem', fontWeight:700, color:'#555' }}>Col Total</td>
                      {selectedColours.map(col => {
                        const colTotal = selSizes.reduce((s, size) => s + (Number(variantStock[`${size}|${col}`]) || 0), 0);
                        return <td key={col} style={{ padding:'.35rem .4rem', textAlign:'center', fontWeight:700, color:'#555' }}>{colTotal}</td>;
                      })}
                      <td style={{ padding:'.35rem .6rem', textAlign:'center', fontWeight:800, color:'#a7354d' }}>{stockTotal}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div style={{ display:'flex', flexWrap:'wrap', gap:'.5rem', padding:'.85rem' }}>
                  {selSizes.map(size => (
                    <label key={size} style={{ display:'flex', alignItems:'center', gap:'.5rem', border:'1px solid #eee', borderRadius:'8px', padding:'.4rem .6rem', background:'#fff' }}>
                      <span style={{ fontSize:'.8rem', fontWeight:700, color:'#a7354d', minWidth:'32px' }}>{size}</span>
                      <input type="number" min={0} value={variantStock[size] ?? ''}
                        onChange={e => setVariantStock(p => ({ ...p, [size]: e.target.value }))}
                        placeholder="0"
                        style={{ width:'70px', border:'1.5px solid #ddd', borderRadius:'6px', padding:'.3rem .4rem', fontSize:'.82rem', textAlign:'center', boxSizing:'border-box' }} />
                      <span style={{ fontSize:'.72rem', color:'#888' }}>pcs</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Auto stock bar */}
          <div style={{ display:'flex', alignItems:'center', gap:'.75rem', background:'#f9f9f9', borderRadius:'8px', padding:'.55rem 1rem', marginTop:'.5rem' }}>
            <span style={{ fontSize:'.8rem', fontWeight:600, color:'#555' }}>Auto stock:</span>
            <span style={{ background: effectiveStockStatus === 'Out of Stock' ? '#c0392b' : effectiveStockStatus === 'Limited Stock' ? '#e67e22' : '#27ae60', color:'#fff', fontSize:'.73rem', fontWeight:700, padding:'.15rem .5rem', borderRadius:'10px' }}>{effectiveStockStatus}</span>
            <span style={{ fontSize:'.8rem', color:'#888' }}>| Total: {effectiveQty} pcs</span>
          </div>

          {/* Best Seller */}
          <label style={{ display:'flex', alignItems:'center', gap:'.5rem', marginTop:'.6rem', background:'#f9f9f9', borderRadius:'8px', padding:'.55rem 1rem', cursor:'pointer' }}>
            <input type="checkbox" checked={bestSeller} onChange={e => setBestSeller(e.target.checked)} style={{ width:'15px', height:'15px' }} />
            <span style={{ fontWeight:600, fontSize:'.88rem' }}>⭐ Show in Best Sellers</span>
          </label>
        </div>

        {/* ── Available Colours (text) ── */}
        <div style={{ marginTop:'1.25rem' }}>
          <label style={lbl}>Available Colours <span style={{ fontWeight:400, color:'#888' }}>(comma-separated)</span></label>
          <input value={availColours} onChange={e => setAvailColours(e.target.value)}
            placeholder="e.g. Red, Blue, Green..." style={inp} />
        </div>

        {/* ── Add-ons ── */}
        <div style={{ marginTop:'1.25rem' }}>
          <label style={lbl}>Add-ons <span style={{ fontWeight:400, color:'#888' }}>(name & price)</span></label>
          {addOns.map((a, i) => (
            <div key={i} style={{ display:'flex', gap:'.5rem', marginBottom:'.5rem', alignItems:'center' }}>
              <input value={a.name}
                onChange={e => setAddOns(p => p.map((x,j) => j===i ? {...x, name:e.target.value} : x))}
                placeholder="Add-on name (e.g. Blouse piece)"
                style={{ ...inp, flex:2 }} />
              <input type="number" value={a.price}
                onChange={e => setAddOns(p => p.map((x,j) => j===i ? {...x, price:e.target.value} : x))}
                placeholder="₹ Price"
                style={{ ...inp, flex:1 }} />
              <button onClick={() => setAddOns(p => p.filter((_,j) => j!==i))}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#c62828', fontSize:'1rem' }}>✕</button>
            </div>
          ))}
          <button onClick={() => setAddOns(p => [...p, { name:'', price:'' }])}
            style={{ width:'100%', border:'1.5px dashed #ddd', background:'#fafafa', borderRadius:'8px', padding:'.55rem', fontSize:'.85rem', cursor:'pointer', color:'#888' }}>
            + Add Item
          </button>
        </div>

        {/* ── Description ── */}
        <div style={{ marginTop:'1.25rem' }}>
          <label style={lbl}>Product Description</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Product details, fabric, use case, styling notes"
            rows={4}
            style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} />
        </div>

        {/* ── Product Photos ── */}
        <div style={{ marginTop:'1.5rem', borderTop:'1px solid #f0f0f0', paddingTop:'1.5rem' }}>
          <p style={{ fontSize:'.82rem', fontWeight:600, color:'#444', marginBottom:'.25rem' }}>
            Product Photos <span style={{ fontWeight:400, color:'#888' }}>Front · Side · Back · Zoomed</span>
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'.75rem', marginTop:'.75rem' }}>
            <PhotoSlot label="FRONT VIEW" value={mainPhotos.front}  onChange={v => setMainPhotos(p => ({...p, front:v}))}  isFirst />
            <PhotoSlot label="SIDE VIEW"  value={mainPhotos.side}   onChange={v => setMainPhotos(p => ({...p, side:v}))} />
            <PhotoSlot label="BACK VIEW"  value={mainPhotos.back}   onChange={v => setMainPhotos(p => ({...p, back:v}))} />
            <PhotoSlot label="ZOOMED IN"  value={mainPhotos.zoomed} onChange={v => setMainPhotos(p => ({...p, zoomed:v}))} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'.75rem', marginTop:'1rem' }}>
            <span style={{ fontSize:'.82rem', color:'#888', fontWeight:600, whiteSpace:'nowrap' }}>Or paste URL:</span>
            <input placeholder="https://..."
              onChange={e => setMainPhotos(p => ({ ...p, front: e.target.value }))}
              style={{ ...inp, flex:1 }} />
          </div>
        </div>

        {/* ── Action Buttons ── */}
        <div style={{ display:'flex', gap:'.75rem', marginTop:'1.5rem' }}>
          <button onClick={handleSave} disabled={saving}
            style={{ background:'#a7354d', color:'#fff', border:'none', borderRadius:'8px', padding:'.7rem 2rem', fontSize:'.95rem', fontWeight:700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
            {saving ? 'Saving…' : '✅ Update Product'}
          </button>
          <Link href="/admin/products"
            style={{ background:'#f5f5f5', color:'#555', border:'none', borderRadius:'8px', padding:'.7rem 2rem', fontSize:'.95rem', fontWeight:700, cursor:'pointer', textDecoration:'none', display:'inline-block' }}>
            Cancel
          </Link>
        </div>
      </div>

      {/* ── Custom Colour Modal ── */}
      {showColModal && (
        <CustomColourModal
          nextLetter={LETTERS[customColours.length] ?? 'A'}
          onAdd={c => setCustomColours(p => [...p, c])}
          onClose={() => setShowColModal(false)}
        />
      )}
    </div>
  );
}
