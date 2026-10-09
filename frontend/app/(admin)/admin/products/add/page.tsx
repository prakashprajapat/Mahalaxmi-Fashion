'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { productsApi, settingsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { checkProduct } from '@/lib/productGate';
import PublishPanel from '@/components/admin/PublishPanel';
import { getTaxonomy } from '@/lib/womenTaxonomy';
import { runProductQC, type QcIssue } from '@/lib/productQC';
import QcPanel from '@/components/admin/QcPanel';
import TaxonomyCombo from '@/components/admin/TaxonomyCombo';
import { PageHeader } from '@/components/admin/Ui';
import { colourProblem, colourNameToHex, pickColourNames } from '@/lib/googleColours';
import { fetchAllProducts } from '@/lib/adminPaged';
import { useOwnerView } from '@/lib/useOwnerView';
import { warmProductImages } from '@/lib/warmImages';
import { MAX_EXTRA, MAX_PHOTOS, asNumberedExtras } from '@/lib/photoExtras';

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ['Women','Men','Kids','Beauty','Fabrics','More'];
const SIZES_PRESET = ['XS','S','M','L','XL','XXL','XXXL','Free Size','28','30','32','34','36','38','40','42'];
// Bachchon ke kapdon ka naap number se nahi, umar se chuna jata hai - maa ko
// "24" se kuch pata nahi chalta, "24 (3-4 Years)" se chalta hai. Ye poora text
// hi size ka naam hai, isliye order, label aur stock sab me wahi jata hai.
//
// Ye saved sizes ki saanjhi suchi me nahi daale jaate: button hamesha yahan
// hai, to daalne ka koi fayada nahi - aur daal dete to saree ke product par
// bhi aath bachchon wale chips lag jate.
const KIDS_SIZES_PRESET = ['20 (1-2 Years)','22 (2-3 Years)','24 (3-4 Years)','26 (5-6 Years)',
  '28 (7-8 Years)','30 (9-10 Years)','32 (11-12 Years)','34 (13-14 Years)'];
const COLORS_PRESET = ['Red','Blue','Green','Black','White','Yellow','Pink','Orange','Purple','Grey'];
const GST_RATES = [0, 5, 12, 18];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ─── Types ────────────────────────────────────────────────────────────────────
// `photo` is the FRONT view (column thumbnail); side/back/zoomed are the rest of that
// design's gallery (shown on the storefront when the customer picks this colour/design).
type CustomColour = { name: string; code: string; photo: string; columnLetter: string; side?: string; back?: string; zoomed?: string; extra?: string[] };
type PackColumn  = { letter: string; colour: string; front: string; side: string; back: string; zoomed: string; extra: string[] };
// Front, side, back and zoomed are the four a product should always have, so
// they keep their names and their places. Everything past them is just "another
// photo" - a fabric close-up, the label, the same dress on a different person -
// and those have no name worth giving, so they are a list.
type MainPhotos  = { front: string; side: string; back: string; zoomed: string; extra: string[] };

type AddOn       = { name: string; price: string };
type Variant     = { name: string; price: string; stock: string };

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
  return Boolean(col.front || col.side || col.back || col.zoomed || (col.extra ?? []).some(Boolean));
}

function normalizePackColumns(cols: PackColumn[], packOf: number): PackColumn[] {
  const extraCount = packOf >= 2 ? packOf - 1 : 0;
  return Array.from({ length: extraCount }, (_, i) => ({
    ...(cols[i] ?? { colour:'', front:'', side:'', back:'', zoomed:'', extra: [] }),
    extra: cols[i]?.extra ?? [],
    letter: LETTERS[i] ?? String(i + 1),
  }));
}

/**
 * A column on its way into extra_json: the four named views, then extra1..extraN.
 *
 * Exactly the shape the main Product Photos use, on purpose. The storefront
 * gallery reads both out of the same helper, so a photo added to a pack column
 * needs no second reader and cannot be the one that gets forgotten.
 */
function packColStored(col: PackColumn): Record<string, string> {
  return {
    letter: col.letter,
    // This item's colour, which is also the column's name. A pack counts its
    // stock by size alone, never by colour, so these never reach the colour
    // picker - and Google wants a colour on every garment, so this is the only
    // place a pack can say what colours are in it.
    colour: col.colour,
    front:  col.front,
    side:   col.side,
    back:   col.back,
    zoomed: col.zoomed,
    ...asNumberedExtras(col.extra),
  };
}

/** Every photo in a column, for the duplicate-photo check and the QC gate. */
function packColPhotos(col: PackColumn): string[] {
  return [col.front, col.side, col.back, col.zoomed, ...(col.extra ?? [])].filter(Boolean);
}

function splitList(value: string): string[] {
  return value.split(',').map(v => v.trim()).filter(Boolean);
}

function stockStatusFromQty(qty: number): 'In Stock' | 'Limited Stock' | 'Out of Stock' {
  if (qty <= 0) return 'Out of Stock';
  if (qty < 5) return 'Limited Stock';
  return 'In Stock';
}

async function fetchNextSku(): Promise<string> {
  // Try authenticated endpoint first
  try {
    const token = getAdminToken() ?? '';
    if (token) {
      const res = await productsApi.nextSku(token);
      if (res.sku) return res.sku;
    }
  } catch { /* fall through to public list */ }

  // Fallback: compute from public products list (no auth needed)
  try {
    const res = await productsApi.getAll({ pageSize: 500 }, getAdminToken() ?? undefined);
    const nums = (res.products ?? [])
      .map((p: any) => (p.sku ?? '') as string)
      .filter((s: string) => /^MFH\d{4,5}$/.test(s))
      .map((s: string) => parseInt(s.substring(3), 10))
      .filter((n: number) => !isNaN(n));
    const max = nums.length > 0 ? Math.max(...nums) : 1000;
    return `MFH${max + 1}`;
  } catch {
    return 'MFH1001';
  }
}

// ─── AVIF → JPEG Converter ───────────────────────────────────────────────────
interface ConvResult { dataUrl: string; fmt: string; origKB: number; outKB: number; w: number; h: number; padded: boolean; }

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


// ─── Every product photo comes out the same shape ────────────────────────────
// The shop shows photos in a 3:4 portrait frame. A photo of any other shape
// used to go in as it was and then sat small inside that frame, which is how a
// few products ended up looking different from their neighbours. So the shape
// is fixed here, once, at upload — not left to whoever made the photo.
//
// Nothing is cropped: a wide photo keeps every pixel and the space around it is
// filled with a blurred, over-scaled copy of the photo itself, so it reads as
// part of the picture rather than a grey band. Because this is baked into the
// saved file, it holds everywhere the photo goes — the shop, the app, and any
// feed sent to Meta or Google.
const CARD_RATIO = 3 / 4;

function fitToCardShape(img: HTMLImageElement, maxPx: number): { canvas: HTMLCanvasElement; padded: boolean } {
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Already the right shape — resize only, and leave the pixels alone.
  if (Math.abs(natW / natH - CARD_RATIO) < 0.02) {
    let w = natW, h = natH;
    if (w > maxPx || h > maxPx) {
      const k = maxPx / Math.max(w, h);
      w = Math.round(w * k); h = Math.round(h * k);
    }
    canvas.width = w; canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, padded: false };
  }

  const H = Math.min(maxPx, Math.max(natH, Math.round(natW / CARD_RATIO)));
  const W = Math.round(H * CARD_RATIO);
  canvas.width = W; canvas.height = H;

  // Blurred copy behind, scaled past the edges so no seam shows.
  const cover = Math.max(W / natW, H / natH) * 1.2;
  const cw = natW * cover, ch = natH * cover;
  ctx.filter = 'blur(28px)';
  ctx.drawImage(img, (W - cw) / 2, (H - ch) / 2, cw, ch);
  ctx.filter = 'none';

  // The real photo on top, whole.
  const fit = Math.min(W / natW, H / natH);
  const fw = natW * fit, fh = natH * fit;
  ctx.drawImage(img, (W - fw) / 2, (H - fh) / 2, fw, fh);
  return { canvas, padded: true };
}

// force = true: Compress wala batan. Tab chhoti photo rakhi hi jati hai, chahe
// original usse bhi chhota ho - batan dabane ka matlab hi yahi hai.
async function convertToAvif(file: File, maxPx = 1200, quality = 0.82, force = false): Promise<ConvResult> {
  const origKB = Math.round(file.size / 1024);

  // Load image
  const srcUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = srcUrl;
  });

  const { canvas, padded } = fitToCardShape(img, maxPx);
  const width = canvas.width, height = canvas.height;

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

  // Phone se upload par screen "278KB → 278KB, -0% saved" dikha rahi thi.
  //
  // Wajah: upar ke teenon daud me se koi bhi original se chhota nahi nikla, to
  // neeche wala niyam (chhota ho tabhi rakho) sab ko chhod deta hai aur original
  // hi jata hai. Yeh tab hota hai jab photo pehle se theek-thaak compressed ho
  // aur browser WebP/AVIF na likh paye — bachta hai sirf JPEG 0.82, jo utna hi
  // bada ban jata hai.
  //
  // Isliye ab quality ghata kar dobara likhte hain, jab tak koi daud TARGET se
  // neeche na aa jaye. Jahan WebP pehle hi chhota nikal aata hai (desktop
  // Chrome) wahan yeh hissa chalta hi nahi.
  const TARGET = 200 * 1024;
  if (!candidates.some(c => c.blob.size <= TARGET)) {
    for (const q of [0.70, 0.60, 0.50]) {
      try {
        const b = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', q));
        if (b && b.type === 'image/jpeg') {
          candidates.push({ blob: b, fmt: 'JPEG' });
          if (b.size <= TARGET) break;
        }
      } catch { break; }
    }
  }

  // Smallest candidate. Normally it also has to beat the original file, but a
  // reshaped photo must be kept whatever it weighs — handing back the original
  // would quietly undo the reshaping this function just did.
  const sorted = candidates.sort((a, b) => a.blob.size - b.blob.size);
  const best = (padded || force) ? sorted[0] : sorted.filter(c => c.blob.size < file.size)[0];

  if (best) {
    const dataUrl = await blobToDataUrl(best.blob);
    return { dataUrl, fmt: best.fmt, origKB, outKB: Math.round(best.blob.size / 1024), w: width, h: height, padded };
  }

  // No encoder gave us anything usable. Keep the reshaped canvas if there is
  // one; otherwise the original is the honest answer.
  if (padded) {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    return { dataUrl, fmt: 'JPEG', origKB, outKB: base64Bytes(dataUrl), w: width, h: height, padded };
  }
  return { dataUrl: srcUrl, fmt: file.type.split('/')[1]?.toUpperCase() || 'ORIG', origKB, outKB: origKB, w: width, h: height, padded };
}

// ─── Photo Slot ───────────────────────────────────────────────────────────────
function PhotoSlot({
  label, value, onChange, isFirst = false,
}: { label: string; value: string; onChange: (v: string) => void; isFirst?: boolean }) {
  const [showUrl, setShowUrl]         = useState(false);
  const [report, setReport]           = useState<ConvResult | null>(null);
  const [converting, setConverting]   = useState(false);
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

  // Jo photo pehle se chadh chuki hai use chhota karna.
  //
  // Phone se chadhi photo aksar badi reh jati hai: Safari canvas se WebP nahi
  // likh pata aur JPEG 0.82 par wo original jitni hi bani rehti hai, to purana
  // niyam (chhoti ho tabhi rakho) use chhod deta hai. Ab wo photo yahin se
  // dobara nichodi ja sakti hai - jo bhi roop sabse chhota nikle, wahi rakha
  // jata hai, chahe original usse bhi chhota ho.
  //
  // value data: URL bhi ho sakta hai (abhi chuni hui) aur /product-images/...
  // ka pata bhi (pehle se chadhi hui) - fetch dono padh leta hai, aur dono apne
  // hi domain se aate hain.
  const compressNow = async () => {
    if (!value || converting) return;
    setConverting(true); setReport(null);
    try {
      // Pehle server. Wahan sharp hai, aur wahi photo ko sach me WebP banata
      // hai — chahe browser kuch bhi ho. Safari canvas se WebP likh hi nahi
      // sakta, isliye phone se ki gayi koshish JPEG par hi ruk jati thi.
      const srv = await fetch('/image-tools/webp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken() ?? ''}` },
        body: JSON.stringify({ image: value }),
      }).catch(() => null);

      if (srv?.ok) {
        const j = await srv.json().catch(() => null) as
          { success?: boolean; path?: string; origKB?: number; outKB?: number; width?: number; height?: number } | null;
        if (j?.success && j.path) {
          onChange(j.path);
          setReport({
            dataUrl: j.path, fmt: 'WebP',
            origKB: j.origKB ?? 0, outKB: j.outKB ?? 0,
            w: j.width ?? 0, h: j.height ?? 0, padded: false,
          });
          return;
        }
      }

      // Server se na bane to browser me hi kar lete hain — kam se kam size to
      // ghat jaye. Yahan roop browser tay karta hai: Chrome par WebP, Safari
      // par JPEG.
      const blob = await (await fetch(value)).blob();
      const file = new File([blob], 'photo', { type: blob.type || 'image/jpeg' });
      const r = await convertToAvif(file, 1200, 0.72, true);
      onChange(r.dataUrl);
      setReport(r);
    } catch {
      alert('Could not read this photo to compress it. If it was added by URL from another website, download it first and upload the file.');
    } finally {
      setConverting(false);
    }
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
          <button onClick={compressNow} disabled={converting}
            title="Make this photo smaller without changing how it looks"
            style={{ fontSize: '.68rem', background: '#e8f5e9', color: '#2e7d32', border: 'none',
                     cursor: converting ? 'wait' : 'pointer', padding: '.15rem .4rem', borderRadius: '4px', fontWeight: 700 }}>
            {converting ? '⏳' : 'Compress'}
          </button>
        )}
        {value && (
          <button onClick={() => { onChange(''); setReport(null); }}
            style={{ fontSize: '.72rem', background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', marginLeft: 'auto' }}>✕</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
      </div>
      {/* Conversion Report Badge */}
      {report?.padded && (
        <div style={{ padding: '.35rem .5rem', background: '#e3f2fd', borderTop: '1px solid #bbdefb', fontSize: '.65rem', lineHeight: 1.5, color: '#1565c0', fontWeight: 600 }}>
          ↔ Reshaped to {report.w}×{report.h} so it matches the other product cards.
          Nothing was cut — the gap is filled with a blurred copy of the photo.
        </div>
      )}
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
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '';
  let best = NAMED_COLOURS[0][0];
  let bestDist = Infinity;
  for (const [name, cr, cg, cb] of NAMED_COLOURS) {
    const d = (r-cr)**2 + (g-cg)**2 + (b-cb)**2;
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return best;
}

// ─── Custom Colour Modal ──────────────────────────────────────────────────────
function CustomColourModal({
  nextLetter, usedLetters = [], onAdd, onClose,
}: { nextLetter: string; usedLetters?: string[]; onAdd: (c: CustomColour) => void; onClose: () => void }) {
  const [colName, setColName]         = useState('');
  const [nameEdited, setNameEdited]   = useState(false);
  const [code, setCode]               = useState('#cccccc');
  const [colPhoto, setColPhoto]       = useState('');
  // Column ka naam ab tay nahi hai. Ye sirf ek label hai - stock matrix
  // colour ke NAAM par chalta hai, letter par nahi - isliye ise badalna
  // kisi hisaab ko nahi chhuta. Checkout ke order aur Excel export me yahi
  // label jata hai, bas.
  const [letter, setLetter]           = useState(nextLetter);
  // Us rang ke baaki view. Shuru me chhupe rehte hain: zyadatar rang ke paas
  // ek hi photo hoti hai, aur khali dabbe dikhana kaam nahi dikhana hai.
  const [showMore, setShowMore]       = useState(false);
  const [side, setSide]               = useState('');
  const [back, setBack]               = useState('');
  const [zoomed, setZoomed]           = useState('');
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [eyedropSrc, setEyedropSrc]  = useState('');
  const [locked, setLocked]           = useState(false);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const eyeFileRef = useRef<HTMLInputElement>(null);

  // Draw eyedrop image onto canvas
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

  // Update code + auto-fill name if user hasn't manually edited it
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
    const hex = '#' + [px[0],px[1],px[2]].map(v => v.toString(16).padStart(2,'0')).join('');
    applyCode(hex);
  };

  const readFile = (file: File, cb: (dataUrl: string) => void) => {
    const rd = new FileReader();
    rd.onload = e => cb(e.target?.result as string);
    rd.readAsDataURL(file);
  };

  const handleAdd = () => {
    const lbl = letter.trim() || nextLetter;
    // Do rang ka ek hi label order aur export dono me uljhan banata hai.
    if (usedLetters.some(l => (l ?? '').trim().toLowerCase() === lbl.toLowerCase())) {
      alert(`Column "${lbl}" is already used on this product. Please choose a different label.`); return;
    }
    // Colour Name is required only when NOT using a photo (i.e. a colour-code
    // colour). With a photo, auto-name from the column letter if left blank.
    const name = colName.trim() || (colPhoto ? `Design ${lbl}` : '');
    if (!name) { alert('Colour Name is required when using a colour code.'); return; }
    // A custom colour is EITHER a photo (column) OR a colour code — not both.
    onAdd({
      name, code: colPhoto ? '' : code, photo: colPhoto, columnLetter: lbl,
      side, back, zoomed, extra: extraPhotos.filter(v => v.trim() !== ''),
    });
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600, padding:'1rem', overflowY:'auto' }}>
      <div style={{ background:'#fff', borderRadius:'16px', padding:'1.25rem', width:'100%', maxWidth:'460px', maxHeight:'90vh', overflowY:'auto' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <h3 style={{ fontWeight:700, fontSize:'1rem', margin:0 }}>🎨 Add New Custom Colour</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.3rem', cursor:'pointer', color:'#888', lineHeight:1 }}>✕</button>
        </div>

        {/* ── Colour Photo ──
             Yahan pehle haath se banaye teen button the. Ab wahi PhotoSlot hai
             jo neeche product form me chalta hai, to compress (server par sharp
             se asli WebP), photo hatana aur "130KB -> 18KB" wali report teeno
             apne aap mil jate hain - aur aage PhotoSlot sudhra to yeh bhi. */}
        <div style={{ background:'#f9f9f9', borderRadius:'10px', padding:'1rem', marginBottom:'1rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'.75rem', flexWrap:'wrap' }}>
            <span style={{ fontSize:'.85rem', fontWeight:700 }}>&#128444;&#65039; Colour Photo</span>
            <label style={{ display:'flex', alignItems:'center', gap:'.3rem', fontSize:'.72rem', color:'#888' }}>
              Column
              <input value={letter} onChange={e => setLetter(e.target.value.slice(0, 8))}
                placeholder={nextLetter} title="Label for this design - you can change it"
                style={{ width:'54px', textAlign:'center', background:'#a7354d', color:'#fff',
                  border:'none', borderRadius:'4px', padding:'.18rem .3rem',
                  fontSize:'.72rem', fontWeight:700, boxSizing:'border-box' }} />
            </label>
            <span style={{ fontSize:'.72rem', color:'#888' }}>(product card par square box)</span>
          </div>

          <PhotoSlot label="FRONT" value={colPhoto} onChange={setColPhoto} isFirst />

          {!showMore && (
            <button onClick={() => setShowMore(true)}
              style={{ width:'100%', marginTop:'.6rem', background:'#fff', color:'#722f37',
                border:'1.5px dashed #d8cfca', borderRadius:'8px', padding:'.45rem',
                fontSize:'.8rem', fontWeight:600, cursor:'pointer' }}>
              + Add more photos (Side, Back, Zoomed&hellip;)
              <span style={{ display:'block', fontWeight:400, fontSize:'.7rem', color:'#8a7f76', marginTop:'.15rem' }}>
                Add even one photo besides FRONT and this colour gets its own gallery
              </span>
            </button>
          )}

          {showMore && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'.6rem', marginTop:'.6rem' }}>
              <PhotoSlot label="SIDE VIEW" value={side}   onChange={setSide} />
              <PhotoSlot label="BACK VIEW" value={back}   onChange={setBack} />
              <PhotoSlot label="ZOOMED IN" value={zoomed} onChange={setZoomed} />

              {extraPhotos.map((img, k) => (
                <div key={k} style={{ position:'relative' }}>
                  <PhotoSlot label={`PHOTO ${k + 5}`} value={img}
                    onChange={v => setExtraPhotos(prev => prev.map((x, m) => (m === k ? v : x)))} />
                  <button type="button"
                    onClick={() => setExtraPhotos(prev => prev.filter((_, m) => m !== k))}
                    title="Remove this photo"
                    style={{ position:'absolute', top:4, right:4, zIndex:3, width:22, height:22,
                      lineHeight:'20px', textAlign:'center', borderRadius:'50%', border:'none',
                      background:'rgba(0,0,0,.55)', color:'#fff', fontSize:'.8rem', cursor:'pointer', padding:0 }}>
                    &times;
                  </button>
                </div>
              ))}

              {extraPhotos.length < MAX_EXTRA && (
                <button type="button" onClick={() => setExtraPhotos(prev => [...prev, ''])}
                  style={{ minHeight:150, borderRadius:10, cursor:'pointer', border:'2px dashed #d8cfca',
                    background:'#fcfaf9', color:'#722f37', fontWeight:700, fontSize:'.85rem' }}>
                  + Add a photo
                  <span style={{ display:'block', fontWeight:400, fontSize:'.72rem', color:'#8a7f76', marginTop:'.2rem' }}>
                    {4 + extraPhotos.length} of {MAX_PHOTOS} used
                  </span>
                </button>
              )}
            </div>
          )}

          <button onClick={handleAdd}
            style={{ width:'100%', marginTop:'.75rem', background:'#a7354d', color:'#fff', border:'none', borderRadius:'8px', padding:'.5rem', fontSize:'.82rem', fontWeight:700, cursor:'pointer' }}>
            &#10003; Add Column {letter.trim() || nextLetter}
          </button>
        </div>

        {/* ── Colour Code ── */}
        <div style={{ background:'#f9f9f9', borderRadius:'10px', padding:'1rem', marginBottom:'1rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'.75rem' }}>
            <span style={{ fontSize:'.85rem', fontWeight:700 }}>🎯 Colour Code</span>
            <span style={{ fontSize:'.72rem', color:'#888' }}>(for the circle)</span>
          </div>

          {/* Circle + hex + swatch + RGB */}
          <div style={{ display:'flex', alignItems:'center', gap:'.6rem', marginBottom:'.75rem', flexWrap:'wrap' }}>
            <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:code, border:'2px solid #ddd', flexShrink:0, transition:'background .15s' }} />
            <input value={code} onChange={e => applyCode(e.target.value)}
              placeholder="#cccccc"
              style={{ width:'100px', border:'1.5px solid #ddd', borderRadius:'8px', padding:'.4rem .55rem', fontSize:'.82rem', fontFamily:'monospace', boxSizing:'border-box' }} />
            {/* Native RGB colour chart — click to open the full colour gradient / RGB picker */}
            <input type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(code) ? code : '#cccccc'}
              onChange={e => applyCode(e.target.value)}
              title="Pick from colour chart"
              style={{ width:'40px', height:'36px', border:'1.5px solid #ddd', borderRadius:'8px', padding:0, background:'#fff', cursor:'pointer', flexShrink:0 }} />
            <div style={{ width:'28px', height:'28px', background:code, border:'2px solid #ddd', borderRadius:'4px', flexShrink:0, transition:'background .15s' }} />
            <span style={{ fontSize:'.72rem', color:'#888' }}>{hexToRgb(code)}</span>
          </div>

          {/* Eyedropper from uploaded photo */}
          <button onClick={() => eyeFileRef.current?.click()}
            style={{ width:'100%', background:'#fdecea', color:'#a7354d', border:'1.5px solid #f5c6cb', borderRadius:'8px', padding:'.45rem', fontSize:'.8rem', fontWeight:600, cursor:'pointer', marginBottom:'.4rem' }}>
            📷 Upload a photo and pick the colour
          </button>
          <input ref={eyeFileRef} type="file" accept="image/*" hidden
            onChange={e => { if (e.target.files?.[0]) { readFile(e.target.files[0], setEyedropSrc); setLocked(false); } }} />

          {eyedropSrc && (
            <>
              <p style={{ fontSize:'.7rem', color:'#888', margin:'.2rem 0 .3rem' }}>
                📌 Hover over a photo to preview the colour. <strong>Click</strong> to {locked ? 'unlock 🔓' : 'lock 🔒'}
              </p>
              <canvas ref={canvasRef}
                onMouseMove={pickColour}
                onClick={() => setLocked(l => !l)}
                style={{ width:'100%', borderRadius:'8px', cursor: locked ? 'default' : 'crosshair', border:'1.5px solid #ddd', display:'block' }} />
            </>
          )}
        </div>

        {/* Colour Name */}
        <div style={{ marginBottom:'1rem' }}>
          <label style={{ fontSize:'.82rem', fontWeight:700, display:'block', marginBottom:'.3rem' }}>
            Colour Name {colPhoto
              ? <span style={{ fontWeight:400, color:'#888', fontSize:'.72rem' }}>(optional — photo added)</span>
              : <span style={{ color:'#c62828' }}>*</span>}
          </label>
          <input value={colName}
            onChange={e => { setColName(e.target.value); setNameEdited(true); }}
            placeholder="e.g. Maroon, Sky Blue, Golden..."
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            autoFocus
            style={{ width:'100%', border:'1.5px solid #ddd', borderRadius:'8px', padding:'.6rem .75rem', fontSize:'.88rem', boxSizing:'border-box',
              background: nameEdited ? '#fff' : '#f0fdf4',  // green tint = auto-filled
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

// ─── Searchable multi-select "filter" for sizes / colours (single + multiple) ───
function PickFilter({ label, options, selectedValues, onToggle }: {
  label: string;
  options: { value: string; label: string; code?: string }[];
  selectedValues: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = options.filter(o => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const count = options.filter(o => selectedValues.includes(o.value)).length;
  return (
    <div style={{ position:'relative', display:'inline-block' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ border:'1.5px solid #a7354d', background: count > 0 ? '#fdf0f3' : '#fff', color:'#a7354d', borderRadius:'20px', padding:'.28rem .8rem', fontSize:'.8rem', fontWeight:700, cursor:'pointer' }}>
        🔍 {label}{count > 0 ? ` (${count})` : ''} ▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:40 }} />
          <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:50, background:'#fff', border:'1.5px solid #ddd', borderRadius:10, boxShadow:'0 6px 20px rgba(0,0,0,.15)', width:240, maxHeight:300, overflowY:'auto', padding:'.5rem' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
              style={{ width:'100%', border:'1.5px solid #eee', borderRadius:8, padding:'.4rem .55rem', fontSize:'.82rem', marginBottom:'.4rem', boxSizing:'border-box' }} />
            {filtered.length === 0 && <p style={{ fontSize:'.78rem', color:'#999', padding:'.3rem' }}>No match</p>}
            {filtered.map(o => (
              <label key={o.value} style={{ display:'flex', alignItems:'center', gap:'.5rem', padding:'.32rem .25rem', cursor:'pointer', fontSize:'.83rem' }}>
                <input type="checkbox" checked={selectedValues.includes(o.value)} onChange={() => onToggle(o.value)} />
                {o.code && <span style={{ width:16, height:16, borderRadius:'50%', background:o.code, border:'1px solid #ccc', flexShrink:0 }} />}
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const lbl: React.CSSProperties = { fontSize:'.82rem', fontWeight:600, display:'block', marginBottom:'.3rem', color:'#444' };
const inp: React.CSSProperties = { width:'100%', border:'1.5px solid #ddd', borderRadius:'8px', padding:'.6rem .75rem', fontSize:'.88rem', boxSizing:'border-box' };

export default function AddProductPage() {
  const router = useRouter();

  // The Total-Quantity auto-fill should only kick in once the admin edits the stock matrix,
  // so a manually typed Total isn't wiped the moment any cell changes.
  const matrixTouched = useRef(false);

  // Basic fields
  const [sku, setSku]           = useState('MFH…');
  const [hsnCode, setHsnCode]   = useState('');
  const [shopName, setShopName] = useState('');
  const [name, setName]         = useState('');
  const [category, setCategory] = useState('Women');
  const [sub, setSub]           = useState('');
  const [taxVariant, setTaxVariant] = useState('');
  const [price, setPrice]       = useState('');
  const [discPct, setDiscPct]   = useState('');
  const [discPrice, setDiscPrice] = useState('');
  const [shipCharge, setShipCharge] = useState('');
  const [gstRate, setGstRate]   = useState('5');
  const [totalQty, setTotalQty] = useState('');
  const [packOf, setPackOf]     = useState('');
  const [bestSeller, setBestSeller] = useState(false);
  const [availColours, setAvailColours] = useState('');
  const [desc, setDesc]         = useState('');
  // The optional Product Details rows, in the order they appear on the site.
  // Anything left blank is simply not shown there.
  const SPEC_FIELDS = [
    { key: 'color',       label: 'Colour',       placeholder: 'blank = colours chosen above' },
    { key: 'fabric',      label: 'Fabric',       placeholder: 'blank = read from the name' },
    { key: 'pattern',     label: 'Pattern',      placeholder: 'e.g. Floral Print' },
    { key: 'type',        label: 'Type',         placeholder: 'blank = subcategory' },
    { key: 'suitableFor', label: 'Suitable For', placeholder: 'e.g. Women' },
    { key: 'design',      label: 'Design',       placeholder: 'e.g. Embroidered' },
    { key: 'idealFor',    label: 'Ideal For',    placeholder: 'e.g. Daily Wear' },
    { key: 'occasion',    label: 'Occasion',     placeholder: 'e.g. Casual, Festive' },
    { key: 'size',        label: 'Size',         placeholder: 'blank = sizes chosen above' },
  ];
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [serverGate, setServerGate] = useState<{
    heldAsDraft: boolean;
    errors: { field: string; message: string }[];
    /** Which product this was about — the form is empty by the time it is read. */
    savedName?: string;
    savedSku?: string;
  } | null>(null);

  const [saving, setSaving]     = useState(false);
  const [qcIssues, setQcIssues] = useState<QcIssue[]>([]);
  const [qcOpen, setQcOpen]     = useState(false);

  // Subcategory autocomplete
  const [allSubcats, setAllSubcats] = useState<{ cat: string; sub: string }[]>([]);

  // Sizes / colours
  const [selSizes, setSelSizes]       = useState<string[]>([]);
  const [customSizes, setCustomSizes] = useState<string[]>([]);
  const [selColors, setSelColors]     = useState<string[]>([]);
  const [customColours, setCustomColours] = useState<CustomColour[]>([]);
  // Print / multi-colour: jis product ka koi ek fix colour nahi hota (print,
  // pattern, stripe). Google ko "Navy/White/Red" bhejte hain — primary pehle.
  const [printColour, setPrintColour] = useState('');
  const [printShades, setPrintShades] = useState<string[]>([]);
  // Reusable catalog saved in the DB (so custom colours/sizes appear on every new product).
  const [savedSizes, setSavedSizes]     = useState<string[]>([]);
  const [savedColours, setSavedColours] = useState<{ name: string; code: string }[]>([]);
  const [variantStock, setVariantStock] = useState<Record<string, string>>({});
  const [showColModal, setShowColModal]   = useState(false);

  // Pack column photos are generated from Pack of. Pack of 2 creates column A.
  const [packCols, setPackCols] = useState<PackColumn[]>([]);
  const [staffPrice, setStaffPrice]   = useState('');
  const [platformFee, setPlatformFee] = useState('');
  const ownerView = useOwnerView();
  // Staff price plus the owner's fee: what this is meant to sell for. The
  // actual selling price is whatever is in the boxes above, which may differ -
  // the warning below is for exactly that gap.
  const suggestedPrice = Math.round((Number(staffPrice) || 0) + (Number(platformFee) || 0));
  const staffUnit      = Number(staffPrice) || 0;
  const actualSelling  = Number(discPrice || price || 0);


  // Main photos are used for normal products and as the primary image for pack products.
  const [mainPhotos, setMainPhotos] = useState<MainPhotos>({ front:'', side:'', back:'', zoomed:'', extra: [] });

  // Add-ons
  const [addOns, setAddOns] = useState<AddOn[]>([]);

  // Variants
  const [variants, setVariants] = useState<Variant[]>([]);

  // ── Fetch next SKU + HSN memory + subcategory list on mount ──
  useEffect(() => {
    fetchNextSku().then(setSku);
    // Restore last-used HSN code from localStorage
    const lastHsn = typeof window !== 'undefined' ? localStorage.getItem('mfh_lastHsnCode') ?? '' : '';
    setHsnCode(lastHsn);
    // Restore last-used Category / Subcategory / Variant from localStorage
    if (typeof window !== 'undefined') {
      const lastCat = localStorage.getItem('mfh_lastCategory');
      if (lastCat) setCategory(lastCat);
      setSub(localStorage.getItem('mfh_lastSub') ?? '');
      setTaxVariant(localStorage.getItem('mfh_lastVariant') ?? '');
    }
    // Fetch all products to build subcategory suggestions
    productsApi.getAll({ pageSize: 1000 }, getAdminToken() ?? undefined)
      .then(r => {
        const pairs = (r.products as any[])
          .filter(p => p.subcategory?.trim())
          .map(p => ({ cat: (p.category ?? '').toLowerCase(), sub: p.subcategory as string }));
        // deduplicate by cat+sub
        const seen = new Set<string>();
        setAllSubcats(pairs.filter(p => {
          const key = p.cat + '|' + p.sub.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }));
      })
      .catch(() => {});
  }, []);

  // QC ke liye poori soochi — panna khulte hi, background me.
  //
  // Pehle yeh save dabane ke BAAD mangi jati thi, isliye har save me 140
  // product ka poora jawab utarne ka intezar hota tha, aur usi ke baad asli
  // save shuru hota tha. Ab jab tak form bhara jata hai, soochi aa chuki hoti
  // hai; handleSave sirf is wade ka intezar karta hai, jo aam taur par pehle
  // hi pura ho chuka hota hai.
  const qcList = useRef<Promise<import('@/lib/productQC').ExistingProduct[]> | null>(null);
  useEffect(() => {
    qcList.current = fetchAllProducts({}, getAdminToken() ?? undefined)
      .then(ps => ps.map(p => ({ id: p.dbId, name: p.name, image: p.image, extraJson: p.extraJson })))
      .catch(() => []);
  }, []);

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

  // ── Load reusable catalog (custom colours & sizes saved earlier) ──
  useEffect(() => {
    settingsApi.getAll().then(r => {
      const s = (r as any).settings ?? {};
      try { const sz = JSON.parse(s.catalogSizes || '[]'); if (Array.isArray(sz)) setSavedSizes(sz.filter((x: any) => typeof x === 'string')); } catch {}
      try { const cl = JSON.parse(s.catalogColours || '[]'); if (Array.isArray(cl)) setSavedColours(cl.filter((x: any) => x && x.name)); } catch {}
    }).catch(() => {});
  }, []);

  const persistSizes = (list: string[]) => {
    setSavedSizes(list);
    try { settingsApi.upsert('catalogSizes', JSON.stringify(list), getAdminToken() ?? ''); } catch {}
  };
  const persistColours = (list: { name: string; code: string }[]) => {
    setSavedColours(list);
    try { settingsApi.upsert('catalogColours', JSON.stringify(list), getAdminToken() ?? ''); } catch {}
  };

  // ── Size / colour toggles ──
  const toggleSize  = (s: string) => setSelSizes(p  => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const toggleColor = (c: string) => setSelColors(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);

  // Add a saved colour (from the reusable catalog) into this product's colour list.
  const addSavedColour = (sc: { name: string; code: string }) =>
    setCustomColours(p => p.some(c => c.name.toLowerCase() === sc.name.toLowerCase())
      ? p : [...p, { name: sc.name, code: sc.code || '', photo: '', columnLetter: LETTERS[p.length] ?? 'A' }]);

  const addCustomSize = () => {
    const s = window.prompt('Enter custom size (separate several with commas, e.g. 42,41,63):');
    if (s?.trim()) {
      // Split on comma so "42,41,63" becomes three separate sizes: 42, 41, 63.
      const values = s.split(',').map(v => v.trim()).filter(Boolean);
      if (values.length === 0) return;
      setCustomSizes(p => [...p, ...values.filter(v => !p.includes(v))]);
      setSelSizes(p  => [...p, ...values.filter(v => !p.includes(v))]);
      // Save new sizes to the reusable catalog so they show on every future product.
      const merged = [...savedSizes];
      values.forEach(v => { if (!merged.includes(v)) merged.push(v); });
      if (merged.length !== savedSizes.length) persistSizes(merged);
    }
  };

  // Ek click me bachchon ke saare naap chip ban jate hain; chunna phir bhi
  // haath se, kyunki har product har umar me nahi hota.
  const addKidsSizes = () =>
    setCustomSizes(p => [...p, ...KIDS_SIZES_PRESET.filter(v => !p.includes(v) && !SIZES_PRESET.includes(v))]);

  // ── Pack column photo update ──
  const updateCol = (idx: number, field: 'front' | 'side' | 'back' | 'zoomed', val: string) =>
    setPackCols(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c));

  const updateColColour = (idx: number, val: string) =>
    setPackCols(prev => prev.map((c, i) => i === idx ? { ...c, colour: val } : c));

  // ── Pack column: the photos past the four named views ──
  const updateColExtra = (idx: number, slot: number, val: string) =>
    setPackCols(prev => prev.map((c, i) => i === idx
      ? { ...c, extra: (c.extra ?? []).map((x, j) => (j === slot ? val : x)) }
      : c));

  const addColExtra = (idx: number) =>
    setPackCols(prev => prev.map((c, i) => i === idx && c.extra.length < MAX_EXTRA
      ? { ...c, extra: [...c.extra, ''] }
      : c));

  const removeColExtra = (idx: number, slot: number) =>
    setPackCols(prev => prev.map((c, i) => i === idx
      ? { ...c, extra: c.extra.filter((_, j) => j !== slot) }
      : c));

  // ── Colour/Design gallery photo update (Front/Side/Back/Zoomed per photo-design) ──
  // Rang ka naam badalna.
  //
  // Ab tak jodne ke baad naam badla hi nahi ja sakta tha - sirf mitakar dobara
  // jodna. Jab photo ke saath naam khali chhoda jaye to wo apne aap "Design A"
  // ban jata hai, aur Google "Design A" ko colour nahi maanta: product Draft me
  // ruk jata hai aur usi naam ko theek karne ka koi rasta nahi hota.
  //
  // Naam sirf label nahi hai - size x colour wale stock table ki keys usi se
  // bani hoti hain ("Free Size|Design A"). Isliye naam ke saath wo keys bhi
  // badalni padti hain, warna us variant ka stock peeche chhoot jata hai.
  // (Yahi kaam Colour Fix screen bulk me karti hai.)
  const renameCustomColour = (idx: number, next: string) => {
    const prevName = (customColours[idx]?.name ?? '').trim();
    setCustomColours(p => p.map((c, i) => (i === idx ? { ...c, name: next } : c)));
    const nextName = next.trim();
    if (!prevName || !nextName || prevName === nextName) return;
    setVariantStock(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => {
      const cut = k.lastIndexOf('|');
      return cut >= 0 && k.slice(cut + 1) === prevName
        ? [`${k.slice(0, cut)}|${nextName}`, v] : [k, v];
    })));
  };

  const updateDesignPhoto = (idx: number, field: 'photo' | 'side' | 'back' | 'zoomed', val: string) =>
    setCustomColours(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c));

  // Chaar naam wale view ke baad ki photos - wahi hisaab jo main photos aur
  // pack columns ka hai, taki teeno jagah ek hi niyam rahe.
  const setDesignExtra = (idx: number, slot: number, val: string) =>
    setCustomColours(prev => prev.map((c, i) => i === idx
      ? { ...c, extra: (c.extra ?? []).map((x, j) => (j === slot ? val : x)) } : c));
  const addDesignExtra = (idx: number) =>
    setCustomColours(prev => prev.map((c, i) => i === idx && (c.extra ?? []).length < MAX_EXTRA
      ? { ...c, extra: [...(c.extra ?? []), ''] } : c));
  const removeDesignExtra = (idx: number, slot: number) =>
    setCustomColours(prev => prev.map((c, i) => i === idx
      ? { ...c, extra: (c.extra ?? []).filter((_, j) => j !== slot) } : c));

  // ── Save (with automatic QC gate) ──
  // force=true means the admin chose "Upload anyway" on a warnings-only result.
  const handleSave = async (force = false) => {
    setSaving(true);
    try {
      // Pricing guard: price must be > 0 and a discount price can never be ≥ the MRP (or negative).
      const priceNum = Number(price);
      if (!priceNum || priceNum <= 0) { alert('Please enter a valid price greater than 0.'); setSaving(false); return; }
      if (discPrice && Number(discPrice) < 0) { alert('Discount price cannot be negative.'); setSaving(false); return; }
      if (discPrice && Number(discPrice) >= priceNum) { alert('Discount price must be LESS than the MRP (price). Please fix it.'); setSaving(false); return; }

      const packValue = getPackOfNumber(packOf);
      const normalizedPackCols = normalizePackColumns(packCols, packValue);
      const filledPackCols = normalizedPackCols.filter(hasPackPhoto);
      const galleryImages = [mainPhotos.front, mainPhotos.side, mainPhotos.back, mainPhotos.zoomed, ...mainPhotos.extra].filter(Boolean);

      // ── QC GATE: Duplicate Name / Duplicate Photo / Description / SEO checks ──
      const allPhotos = [
        ...galleryImages,
        ...filledPackCols.flatMap(packColPhotos),
      ];
      // Soochi panna khulte hi mangwa li gayi thi (neeche wala effect), isliye
      // yahan aam taur par intezar hota hi nahi. Pehle yeh poori soochi save
      // dabane ke BAAD mangi jati thi — har save me wahi intezar, har baar.
      let existingProducts: import('@/lib/productQC').ExistingProduct[] = [];
      try { existingProducts = (await qcList.current) ?? []; }
      catch { /* offline — QC still runs on this product's own fields */ }

      const qc = runProductQC(
        { name, description: desc, price: Number(price) || 0, sku, photos: allPhotos, category },
        existingProducts
      );
      // Duplicate photo ki jaanch ab server par hoti hai.
      //
      // Yahan har purane product ki har photo browser me utar kar hash ki jati
      // thi — chaar sau se zyada photo, har save par. Server ke paas wahi photo
      // apni hi disk par padi hai: use utarna nahi padta, aur wo pehle size
      // milata hai, hash sirf tab nikalta hai jab size bhi wahi ho. Wahan ye
      // kaam palak jhapakte hota hai.
      // ── Blank size/colour stock table ──
      // This table is what checkout deducts from. If sizes/colours are selected
      // but every cell is left empty, the old code still saved a table of zeros:
      // the website showed "In Stock" (that status comes from Total Qty) while
      // every COD order was rejected with "just went out of stock". So warn here,
      // and below save the product as untracked instead of with a zero table.
      const blankStockTable = stockKeys.length > 0
        && stockKeys.every(key => !(Number(variantStock[key]) > 0))
        && (Number(totalQty) || 0) > 0;
      if (blankStockTable) qc.push({
        level: 'warn',
        message: 'The size/colour stock table is empty — size-wise stock will NOT be tracked for this product, only the Total Qty above. Fill the table in if you want size-wise stock.',
      });

      // ── Google ke colour rules ──
      // Apparel ke liye colour free listings me zaruri hai, aur Google generic
      // values ("MultiColour", "Design C", hex code, akela letter) reject kar
      // deta hai. Aise product ka Shopping listing disapprove ho jata hai,
      // isliye save yahin rok dete hain.
      // Spec: https://support.google.com/merchants/answer/6324487
      for (const c of selectedColours) {
        const colourIssue = colourProblem(c);
        if (colourIssue) qc.push({ level: 'fail', message: `Colour "${c}" — ${colourIssue}` });
      }
      const fails = qc.filter(i => i.level === 'fail');

      // Pehle yahan kaam ruk jata tha: ek bhi kami mili to QC panel khulta aur
      // save hota hi nahi. Chhe cheezein theek karni hain to chhe baar yahi
      // rukna. Ab rukta nahi — save hamesha hota hai, bas jagah badal jati hai:
      //
      //   sab theek  →  website par
      //   kuch kami  →  Draft me, apne aap, kami ki soochi ke saath
      //
      // Draft wala product site par dikhta nahi, isliye adhoora product grahak
      // tak nahi pahunchta — par mehnat bachi rehti hai. Theek karke dobara save
      // karte hi wo khud website par chala jata hai.
      setQcIssues(qc);
      setQcOpen(qc.length > 0);
      const holdAsDraft = fails.length > 0;
      // Jawab panne ke sabse upar chhapta hai (QcPanel + PublishPanel), aur
      // Save ka batan sabse neeche hai. Save dabane par kuch hota hua dikhta
      // hi nahi tha: product chupchap Draft me chala jata aur jo soochi batati
      // hai ki kyun, wo do hazar pixel upar padi rehti. Suchi me likha bhi
      // yahi hai - "open it to see what Google is missing" - aur kholne par
      // jawab parde se bahar. Isliye jab padhne ko kuch ho, tabhi upar le jao.
      if (qc.length > 0 || holdAsDraft) {
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      const stockMatrix = Object.fromEntries(stockKeys.map(key => [key, Number(variantStock[key]) || 0]));
      // An all-zero table is not stock data — save as untracked (see blankStockTable above).
      const trackVariants = stockKeys.length > 0 && Object.values(stockMatrix).some(n => n > 0);
      const saveQty = stockKeys.length > 0
        ? (Number(totalQty) || stockKeys.reduce((sum, key) => sum + (Number(variantStock[key]) || 0), 0))
        : (Number(totalQty) || 0);
      // packImages is the one the storefront reads FIRST (packImages ??
      // packColumnPhotos ?? variantColumns), so the extra photos have to be in
      // here as well. Writing them to packColumnPhotos alone would have saved
      // them perfectly and shown none of them.
      const packImages = filledPackCols.map(col => ({
        label: col.letter,
        url: col.front,
        ...packColStored(col),
      }));
      // Only the rows the merchant actually filled in reach the site.
      const cleanSpecs = Object.fromEntries(Object.entries(specs).filter(([, v]) => v.trim()));

      // Pack product ka rang kahin to likha jaye.
      //
      // selectedColours pack par jaanbujh kar khali rehta hai (neeche dekhiye) -
      // kyunki pack ka stock sirf size se ginti hai, rang x size se nahi. Lekin
      // Colour/Design wala picker pack par bhi dikhta hai aur chunne bhi deta
      // hai, to shop rang chunti thi, save dabati thi, aur wo rang chupchap gir
      // jata tha. Phir backend ka gate "No colour is set" kehkar product ko
      // Draft me rok deta tha - theek usi cheez ki shikayat jo abhi bhari gayi
      // thi. Ek aisi form jo input lekar phenk de, usse bura kuch nahi.
      //
      // Backend pack ke liye specs.Colour padhta hai (ProductQualityGate), to
      // chuna hua rang wahin likh dete hain. Jo shop ne khud Colour box me
      // likha ho use chhute nahi - uski baat upar rehti hai. Google zyada se
      // zyada 3 rang leta hai, primary pehle, "/" se juda - isliye 3 par rok.
      if (packValue >= 2 && !String(cleanSpecs.Colour ?? '').trim()) {
        // Column names first: for a pack, the column name IS the colour. The
        // picker entries come behind them, so a product that was filled in
        // before columns had names still keeps working.
        const packColours = pickColourNames([
          ...normalizedPackCols.map(c => c.colour),
          ...selColors,
          ...customColours.map(c => c.name),
          ...(printColour ? [printColour] : []),
          ...splitList(availColours),
        ]);
        if (packColours.length > 0) cleanSpecs.Colour = packColours.join('/');
      }
      const extraJson = JSON.stringify({
        specs: Object.keys(cleanSpecs).length ? cleanSpecs : undefined,
        // Only the currently-SELECTED sizes (selSizes). Using the union with customSizes
        // re-added sizes the admin had de-selected, advertising a size with no stock entry.
        sizes: [...new Set(selSizes)],
        colors: selectedColours,
        colorCodes: Object.keys(colourCodeMap).length ? colourCodeMap : undefined,
        colorShades: printColour && printShades.length > 1 ? { [printColour]: printShades } : undefined,
        // `extra` admin me ek list hai, par store me wo extra1..extraN banti hai -
        // bilkul productPhotos aur har pack column ki tarah. Ek hi aakar, ek hi
        // padhne wala (lib/photoExtras).
        customColors: customColours.map(({ extra: ex, ...c }) => ({
          ...c, ...asNumberedExtras(ex ?? []),
        })),
        images: galleryImages,
        packOf: packValue >= 2 ? packValue : undefined,
        packColumnPhotos: packValue >= 2 ? normalizedPackCols.map(packColStored) : undefined,
        packImages: packImages.length ? packImages : undefined,
        variantColumns: packImages.length ? packImages : undefined,
        variantMatrix: trackVariants ? stockMatrix : undefined,
        stockMode: trackVariants ? (selectedColours.length ? 'size_colour' : 'size') : undefined,
        productPhotos: {
          front: mainPhotos.front, side: mainPhotos.side,
          back: mainPhotos.back, zoomed: mainPhotos.zoomed,
          ...asNumberedExtras(mainPhotos.extra),
        },
        addOns: addOns.filter(a => a.name.trim()),
        variants: variants.filter(v => v.name.trim()),
        variant: getTaxonomy(category).length > 0 && taxVariant ? taxVariant : undefined,
      });
      const finalHsn = hsnCode.trim();
      const res = await productsApi.bulkSave([{
        name: name.trim(),
        category,
        subcategory: sub.trim() || '',
        price: Number(price),
        discountPrice: discPrice ? Number(discPrice) : undefined,
        // Blank means "leave whatever is stored alone", not "set it to zero" -
        // same rule as shopName just below. The Add screen shows a staff member
        // no fee box at all, so without this an edit by staff would wipe the
        // owner's fee every time they touched the product.
        ...(staffPrice.trim() ? { staffPrice: Number(staffPrice) } : {}),
        ...(platformFee.trim() ? { platformFee: Number(platformFee) } : {}),
        shippingCharge: shipCharge ? Number(shipCharge) : 0,
        stock: holdAsDraft ? 'Draft' : stockStatusFromQty(saveQty),
        sku: sku.trim() || undefined,
        description: desc.trim() || undefined,
        image: mainPhotos.front || filledPackCols[0]?.front || undefined,
        bestSeller,
        hsnCode: finalHsn || '',
        // Khali ho to bhejte hi nahi — tab server us staff ki dukaan laga
        // deta hai jisne ye product banaya. Khali string bhejne par wo "koi
        // dukaan nahi" samajh leta aur apne aap bharna band ho jata.
        ...(shopName.trim() ? { shopName: shopName.trim() } : {}),
        gstRate: Number(gstRate),
        qty: saveQty,
        packOf: packValue >= 2 ? packValue : undefined,
        extraJson,
      }], getAdminToken() ?? '');
      // Saved. Now get the server to build the resized copies of these
      // photos, while he is still at this screen, rather than leaving the
      // first shopper who opens the product to wait for it.
      warmProductImages(galleryImages);

      // Remember last used HSN code, Category, Subcategory and Variant
      if (finalHsn) localStorage.setItem('mfh_lastHsnCode', finalHsn);
      localStorage.setItem('mfh_lastCategory', category);
      localStorage.setItem('mfh_lastSub', sub);
      localStorage.setItem('mfh_lastVariant', taxVariant);
      const held = (res as { held?: { name: string; errors: string[] }[] })?.held ?? [];
      if (held.length > 0) {
        // Saved, but not on the website. The panel above says why; a popup
        // would vanish the moment it was dismissed.
        //
        // And the form is emptied, because the product IS saved. It used to
        // be left sitting there full, which reads as "that did not work" -
        // so the natural thing to do is press Save again, on a product the
        // shop already has. Fixing it belongs on the Drafts screen, where
        // the saved record is; this screen's job is the next product.
        //
        // The subcategory and variant are put back afterwards: products are
        // added a supplier batch at a time, and making him pick the same
        // shelf again for every one of twenty is its own small tax.
        const keepSub = sub;
        const keepVariant = taxVariant;
        clearAll();
        setSub(keepSub);
        setTaxVariant(keepVariant);

        setServerGate({
          heldAsDraft: true,
          errors: (held[0].errors ?? []).map(m => ({ field: '', message: m })),
          savedName: held[0].name,
          savedSku: sku.trim() || undefined,
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setServerGate(null);
      router.push('/admin/products');
    } catch (e) { alert('❌ ' + (e as Error).message); }
    finally { setSaving(false); }
  };

  const clearAll = () => {
    setName(''); fetchNextSku().then(setSku); setPrice(''); setDiscPct(''); setDiscPrice(''); setShipCharge(''); setDesc('');
    setSelSizes([]); setSelColors([]); setCustomSizes([]); setCustomColours([]);
    setPrintColour(''); setPrintShades([]);
    setVariantStock({});
    setMainPhotos({ front:'', side:'', back:'', zoomed:'', extra: [] });
    setStaffPrice('');
    setPlatformFee('');
    setPackOf(''); setPackCols([]);
    setAddOns([]); setVariants([]); setSub(''); setTaxVariant('');
    setAvailColours(''); setBestSeller(false); setTotalQty('');
  };

  const allSizes = [...new Set([...SIZES_PRESET, ...savedSizes, ...customSizes])];
  const packValue = getPackOfNumber(packOf);
  const selectedSizes = [...new Set(selSizes)];
  const selectedColours = packValue >= 2
    ? []
    : [...new Set([...selColors, ...customColours.map(c => c.name),
                   ...(printColour ? [printColour] : []), ...splitList(availColours)])];
  // Colour ka naam → hex, taaki storefront ka swatch circle sahi rang se bhare.
  // Print wale colour ke liye saare shades bhi jaate hain (multi-colour circle).
  // What a pack product is offering as colours: the column names.
  //
  // The gate and the save read this one list on purpose. They used to work it
  // out separately, and the screen went on saying "no colour is set" over
  // colours already typed into the columns - the save could see them, the
  // warning could not.
  const packColumnColours = packValue >= 2
    ? pickColourNames([
        ...packCols.map(c => c.colour),
        ...selColors,
        ...customColours.map(c => c.name),
        ...(printColour ? [printColour] : []),
        ...splitList(availColours),
      ])
    : [];
  const colourCodeMap: Record<string, string> = {};
  for (const c of customColours) if (c.name && c.code) colourCodeMap[c.name] = c.code;
  for (const n of selColors) { const h = colourNameToHex(n); if (h) colourCodeMap[n] = h; }
  if (printColour && printShades[0]) colourCodeMap[printColour] = printShades[0];

  // The rules the server applies on save, run here while the form is being
  // filled. A combo pack keeps its colours per photo column, so the free-text
  // "Colour" and "Size" boxes under Product Details count too.
  const gate = checkProduct({
    name,
    description: desc,
    price: Number(price) || 0,
    discountPrice: discPrice ? Number(discPrice) : undefined,
    image: mainPhotos.front || normalizePackColumns(packCols, getPackOfNumber(packOf)).filter(hasPackPhoto)[0]?.front || '',
    category,
    subcategory: sub,
    sizes: selectedSizes.length ? selectedSizes : splitList(specs['Size'] ?? ''),
    colours: selectedColours.length ? selectedColours
      : (splitList(specs['Colour'] ?? '').length ? splitList(specs['Colour'] ?? '') : packColumnColours),
    sku,
    hsnCode,
  });

  // Options + toggle for the colour multi-select filter (presets + saved custom colours).
  const colourFilterOptions = [
    ...COLORS_PRESET.map(c => ({ value: c, label: c, code: c.toLowerCase() })),
    ...savedColours
      .filter(sc => !COLORS_PRESET.some(p => p.toLowerCase() === sc.name.toLowerCase()))
      .map(sc => ({ value: sc.name, label: sc.name, code: sc.code || '#ccc' })),
  ];
  const colourSelectedValues = [...selColors, ...customColours.map(c => c.name)];
  const toggleColourValue = (val: string) => {
    if (COLORS_PRESET.includes(val)) { toggleColor(val); return; }
    if (customColours.some(c => c.name.toLowerCase() === val.toLowerCase()))
      setCustomColours(p => p.filter(c => c.name.toLowerCase() !== val.toLowerCase()));
    else {
      const sc = savedColours.find(s => s.name === val);
      addSavedColour({ name: val, code: sc?.code || '#ccc' });
    }
  };

  const stockKeys = selectedSizes.length > 0
    ? (selectedColours.length > 0
        ? selectedSizes.flatMap(size => selectedColours.map(colour => `${size}|${colour}`))
        : selectedSizes)
    : [];
  const stockTotal = stockKeys.reduce((sum, key) => sum + (Number(variantStock[key]) || 0), 0);
  const effectiveQty = stockKeys.length > 0 ? (Number(totalQty) || stockTotal) : (Number(totalQty) || 0);
  const effectiveStockStatus = stockStatusFromQty(effectiveQty);

  // Auto-fill Total Quantity from the size×colour matrix grand total (still editable).
  // Only after the admin actually edits the matrix, so a manually typed Total isn't clobbered.
  useEffect(() => {
    if (matrixTouched.current && stockKeys.length > 0) setTotalQty(String(stockTotal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockTotal, stockKeys.length]);

  useEffect(() => {
    setVariantStock(prev => {
      const allowed = new Set(stockKeys);
      const next: Record<string, string> = {};
      stockKeys.forEach(key => { next[key] = prev[key] ?? ''; });
      Object.keys(prev).forEach(key => {
        if (!allowed.has(key)) return;
        next[key] = prev[key];
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSizes.join('|'), selectedColours.join('|')]);

  return (
    <div className="admin-page">
      {/* ── Automatic QC checklist (Duplicate Name/Photo, Description, SEO) ── */}
      {qcOpen && (
        <QcPanel
          issues={qcIssues}
          checking={saving}
          onRecheck={() => handleSave(false)}
          onForceUpload={() => handleSave(true)}
          onClose={() => setQcOpen(false)}
        />
      )}

      {/* Why this product will or will not go on the website — shown before saving, not after. */}
      <PublishPanel gate={gate} serverSaid={serverGate} />

      {/* Two buttons used to sit here, "Mark All In Stock" and "Mark All Out of
          Stock", with no onClick on either — nothing happened when you pressed
          them. They also had no business on the page for adding one product;
          the working versions live on the Products list, where the whole
          catalogue is in front of you. Removed rather than wired up. */}
      <PageHeader
        title="Add a product"
        sub="Everything Google needs, in one pass. The panel above says whether it will go on the website when you save."
        right={<Link className="adm-btn" href="/admin/products">All products</Link>}
      />

      <div className="adm-card" style={{ padding:'1.15rem 1.2rem' }}>

        {/* ── Basic Fields Grid ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>

          <div>
            <label style={lbl}>SKU ID</label>
            <input value={sku} onChange={e => setSku(e.target.value)} placeholder="MFH1001" style={inp} />
          </div>

          <div>
            <label style={lbl}>HSN Code</label>
            <input value={hsnCode} onChange={e => setHsnCode(e.target.value)} placeholder="e.g. 6211" style={inp} />
          </div>

          <div style={{ gridColumn:'1 / -1' }}>
            <label style={lbl}>Product Name</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inp} />
          </div>

          <div>
            <label style={lbl}>Category</label>
            <select value={category} onChange={e => { setCategory(e.target.value); setSub(''); setTaxVariant(''); }} style={inp}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {getTaxonomy(category).length > 0 ? (
          <>
          <TaxonomyCombo
            label="Subcategory"
            value={sub}
            onChange={(v) => { setSub(v); setTaxVariant(''); }}
            baseOptions={getTaxonomy(category).map(g => g.name)}
            storageKey={`sub_${category.toLowerCase()}`}
            canDelete={(name) => (getTaxonomy(category).find(g => g.name === name)?.variants.length ?? 0) === 0}
            // Renaming only this list would leave every product that already
            // carries the old spelling behind, with its own page still live on
            // the website. These two move the products with the name.
            onRename={async (from, to) => {
              const token = getAdminToken();
              if (!token) throw new Error('Signed out — sign in again and retry.');
              await productsApi.renameSubcategory({ category, from, to }, token);
            }}
            countUsers={async (name) => {
              const token = getAdminToken();
              if (!token) return 0;
              const r = await productsApi.renameSubcategory({ category, from: name, dryRun: true }, token);
              return r.count ?? 0;
            }}
            placeholder="Type or select subcategory…"
            inpStyle={inp}
            labelStyle={lbl}
          />
          <TaxonomyCombo
            label="Variant"
            value={taxVariant}
            onChange={setTaxVariant}
            baseOptions={getTaxonomy(category).find(g => g.name.toLowerCase() === sub.trim().toLowerCase())?.variants ?? []}
            storageKey={`var_${category.toLowerCase()}_${sub.toLowerCase()}`}
            canDelete={() => true}
            disabled={!sub}
            placeholder={sub ? 'Type or select variant…' : 'Select a subcategory first'}
            inpStyle={inp}
            labelStyle={lbl}
          />
          </>
          ) : (
          /* A category with no fixed taxonomy (the names come from what the
             catalogue already uses) gets the same combo, so Modify / Merge /
             Delete behave identically everywhere. */
          <TaxonomyCombo
            label="Subcategory"
            value={sub}
            onChange={setSub}
            baseOptions={allSubcats.filter(x => x.cat === category.toLowerCase()).map(x => x.sub)}
            storageKey={`sub_${category.toLowerCase()}`}
            placeholder="Type or select subcategory…"
            inpStyle={inp}
            labelStyle={lbl}
            onRename={async (from, to) => {
              const token = getAdminToken();
              if (!token) throw new Error('Signed out — sign in again and retry.');
              await productsApi.renameSubcategory({ category, from, to }, token);
              setAllSubcats(prev => prev.map(x =>
                x.cat === category.toLowerCase() && x.sub === from ? { ...x, sub: to } : x));
            }}
            countUsers={async (name) => {
              const token = getAdminToken();
              if (!token) return 0;
              const r = await productsApi.renameSubcategory({ category, from: name, dryRun: true }, token);
              return r.count ?? 0;
            }}
          />
          )}

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
            <label style={lbl}>Price (₹)</label>
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

          {/* ── What the shop is owed, and what we keep ───────────────────
              Neither number is ever sent to the storefront - they come back
              through an admin-only call, not on the product record, so there is
              no filter standing between a cost and the open internet.

              The fee box is drawn for the owner alone. A staff member sees his
              own price and the two read-only lines under it; the server drops a
              fee he sends anyway, so hiding the box is politeness, not the
              lock. */}
          <div style={{ gridColumn: '1 / -1', background: '#fbf7f4', border: '1px solid #ecdfd8', borderRadius: 12, padding: '.9rem 1rem' }}>
            <p style={{ margin: '0 0 .7rem', fontSize: '.78rem', fontWeight: 700, color: '#722f37', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Shop settlement
            </p>
            <div style={{ display: 'grid', gap: '.8rem', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              <div>
                <label style={lbl}>Staff price (₹) <span style={{ fontWeight:400, color:'#888', fontSize:'.75rem' }}>per piece</span></label>
                <input type="number" min={0} value={staffPrice} onChange={e => setStaffPrice(e.target.value)} placeholder="What the shop wants" style={inp} />
              </div>
              {ownerView && (
                <div>
                  <label style={lbl}>Platform fee (₹) <span style={{ fontWeight:400, color:'#888', fontSize:'.75rem' }}>your share</span></label>
                  <input type="number" min={0} value={platformFee} onChange={e => setPlatformFee(e.target.value)} placeholder="0" style={inp} />
                </div>
              )}
              <div>
                <label style={lbl}>Should sell for</label>
                <div style={{ padding: '.55rem .75rem', border: '1.5px solid #ecdfd8', borderRadius: 8, background: '#fff', fontSize: '.95rem', fontWeight: 700, color: '#2c2724' }}>
                  {suggestedPrice > 0 ? `₹${suggestedPrice.toLocaleString('en-IN')}` : '—'}
                </div>
                {suggestedPrice > 0 && Number(discPrice || price || 0) !== suggestedPrice && (
                  <button type="button"
                    onClick={() => { if (discPrice) setDiscPrice(String(suggestedPrice)); else setPrice(String(suggestedPrice)); }}
                    style={{ marginTop: '.35rem', border: '1px solid #722f37', background: '#fff', color: '#722f37', borderRadius: 8, padding: '.3rem .6rem', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>
                    Use this price
                  </button>
                )}
              </div>
            </div>

            {/* The line that earns this block. The arrangement is that the shop
                gets its full price whatever happens, so a discount comes out of
                the fee - and once the discount is deep enough, out of pocket.
                Said here, before saving, rather than discovered on a
                settlement screen next month. */}
            {staffUnit > 0 && actualSelling > 0 && (
              <p style={{ margin: '.7rem 0 0', fontSize: '.8rem', fontWeight: 600,
                          color: actualSelling < staffUnit ? '#9c2f28' : '#2f6b3d' }}>
                {actualSelling < staffUnit
                  ? `Selling at ₹${actualSelling.toLocaleString('en-IN')} but the shop is owed ₹${staffUnit.toLocaleString('en-IN')} — you lose ₹${(staffUnit - actualSelling).toLocaleString('en-IN')} on every piece.`
                  : `At ₹${actualSelling.toLocaleString('en-IN')} you keep ₹${(actualSelling - staffUnit).toLocaleString('en-IN')} a piece, the shop gets ₹${staffUnit.toLocaleString('en-IN')}.`}
              </p>
            )}
            <p style={{ margin: '.5rem 0 0', fontSize: '.74rem', color: '#8a817b', lineHeight: 1.55 }}>
              Customer never sees either number. The shop is paid once the order is delivered and its return window has closed.
            </p>
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
            <label style={lbl}>
              Total Quantity (pcs)
              {stockKeys.length > 0 && <span style={{ fontWeight:400, color:'#888', fontSize:'.75rem' }}> — auto from stock table (editable)</span>}
            </label>
            <input type="number" value={totalQty} onChange={e => setTotalQty(e.target.value)} placeholder="e.g. 50" style={inp} />
          </div>

          <div>
            <label style={lbl}>
              Pack of <span style={{ fontWeight:400, color:'#888', fontSize:'.75rem' }}>Blank / 0 = normal product, 2+ = bundle</span>
            </label>
            <input type="number" min={0} max={26} value={packOf}
              onChange={e => handlePackOfChange(e.target.value)}
              placeholder="Blank / 0" style={inp} />
          </div>

        </div>

        {/* ── Pack Column Photos ── shown when packOf > 1 (extra columns B, C, D...) */}
        {getPackOfNumber(packOf) >= 2 && packCols.length > 0 && (
          <div style={{ marginTop:'1.5rem', borderTop:'1px solid #f0f0f0', paddingTop:'1.5rem' }}>
            <p style={{ fontSize:'.75rem', fontWeight:700, color:'#a7354d', textTransform:'uppercase', letterSpacing:'.06em', margin:'0 0 .25rem' }}>
              PACK COLUMN PHOTOS
            </p>
            <p style={{ fontSize:'.8rem', color:'#888', marginBottom:'1.25rem' }}>
              Pack of {getPackOfNumber(packOf)} = {packCols.length} items. Name each one by its colour &mdash; that name is what Google reads and what the customer sees. Each item can carry up to {MAX_PHOTOS} photos of its own.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
              {packCols.map((col, idx) => (
                <div key={col.letter}>
                  <div style={{ display:'flex', alignItems:'center', gap:'.6rem', marginBottom:'.75rem' }}>
                    <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'#a7354d', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'1rem', flexShrink:0 }}>
                      {col.letter}
                    </div>
                    {/* This item's colour, and the only name it has. The border
                        turns amber the moment Google would refuse the name, so
                        the mistake is seen while typing rather than days later
                        with the product stuck in Draft. */}
                    <input value={col.colour}
                      onChange={e => updateColColour(idx, e.target.value)}
                      placeholder={`Column ${col.letter} \u2014 type its colour`}
                      title="This column's name is its colour. It goes to Google and it is what the customer sees."
                      style={{ flex:1, maxWidth:'300px', background:'#fff', color:'#333',
                        border:`1.5px solid ${col.colour.trim() && colourProblem(col.colour) ? '#e0a200' : '#e4dedb'}`,
                        borderRadius:'10px', padding:'.4rem .6rem',
                        fontSize:'.92rem', fontWeight:700, boxSizing:'border-box' }} />
                    {col.colour.trim() && colourProblem(col.colour) && (
                      <span style={{ fontSize:'.74rem', color:'#8a6d1f' }}>
                        {colourProblem(col.colour)}
                      </span>
                    )}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'.75rem' }}>
                    <PhotoSlot label="FRONT" value={col.front}  onChange={v => updateCol(idx,'front',v)}  isFirst />
                    <PhotoSlot label="SIDE VIEW"  value={col.side}   onChange={v => updateCol(idx,'side',v)} />
                    <PhotoSlot label="BACK VIEW"  value={col.back}   onChange={v => updateCol(idx,'back',v)} />
                    <PhotoSlot label="ZOOMED IN"  value={col.zoomed} onChange={v => updateCol(idx,'zoomed',v)} />

                    {/* The ones past the four named views, for THIS design.
                        A pack of four designs is four garments sharing one
                        page: a shopper who picks design C and sees four
                        photographs of design A has been shown the wrong
                        clothes. */}
                    {col.extra.map((img, slot) => (
                      <div key={slot} style={{ position:'relative' }}>
                        <PhotoSlot
                          label={`PHOTO ${slot + 5}`}
                          value={img}
                          onChange={v => updateColExtra(idx, slot, v)} />
                        <button type="button"
                          onClick={() => removeColExtra(idx, slot)}
                          title="Remove this photo"
                          style={{
                            position:'absolute', top:4, right:4, zIndex:3,
                            width:22, height:22, lineHeight:'20px', textAlign:'center',
                            borderRadius:'50%', border:'none', background:'rgba(0,0,0,.55)',
                            color:'#fff', fontSize:'.8rem', cursor:'pointer', padding:0,
                          }}>
                          &times;
                        </button>
                      </div>
                    ))}

                    {col.extra.length < MAX_EXTRA && (
                      <button type="button"
                        onClick={() => addColExtra(idx)}
                        style={{
                          minHeight:150, borderRadius:10, cursor:'pointer',
                          border:'2px dashed #d8cfca', background:'#fcfaf9', color:'#722f37',
                          fontWeight:700, fontSize:'.85rem',
                        }}>
                        + Add a photo
                        <span style={{ display:'block', fontWeight:400, fontSize:'.72rem', color:'#8a7f76', marginTop:'.2rem' }}>
                          {4 + col.extra.length} of {MAX_PHOTOS} used
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Size & Colour Stock ── */}
        <div style={{ marginTop:'1.5rem', borderTop:'1px solid #f0f0f0', paddingTop:'1.5rem' }}>
          <p style={{ fontSize:'.82rem', fontWeight:600, color:'#444', marginBottom:'.25rem' }}>
            Size & Colour Stock <span style={{ fontWeight:400, color:'#888' }}>{getPackOfNumber(packOf) >= 2 ? 'Pack products: only Size is shown in the catalogue' : 'Select sizes and/or colours'}</span>
          </p>

          {/* Sizes row */}
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
            <button onClick={addKidsSizes} title="20 (1-2 Years), 22 (2-3 Years), 24 (3-4 Years)…"
              style={{ border:'1.5px dashed #c9a227', background:'#fffdf5', color:'#8a6d1f', borderRadius:'20px', padding:'.28rem .7rem', fontSize:'.8rem', fontWeight:600, cursor:'pointer' }}>
              + Kids (by age)
            </button>
            <PickFilter label="Select sizes" options={allSizes.map(s => ({ value: s, label: s }))}
              selectedValues={selSizes} onToggle={toggleSize} />
          </div>

          {/* Colours row */}
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
            {/* Saved custom colours (reusable catalog) — click to add to this product */}
            {savedColours
              .filter(sc => !COLORS_PRESET.some(p => p.toLowerCase() === sc.name.toLowerCase()))
              .map((sc, i) => {
                const active = customColours.some(c => c.name.toLowerCase() === sc.name.toLowerCase());
                return (
                  <button key={'saved-' + i} onClick={() => addSavedColour(sc)} title={sc.name} aria-label={sc.name}
                    style={{
                      width:'32px', height:'32px', borderRadius:'50%', padding:0, flexShrink:0, cursor:'pointer',
                      background: sc.code || '#ccc',
                      border: active ? '3px solid #a7354d' : '1.5px solid #ccc',
                      boxShadow: active ? '0 0 0 2px #fdf0f3' : 'none',
                    }} />
                );
              })}
            <button onClick={() => setShowColModal(true)}
              style={{ border:'1.5px dashed #ddd', background:'#fff', color:'#888', borderRadius:'20px', padding:'.28rem .7rem', fontSize:'.8rem', cursor:'pointer' }}>
              + Custom
            </button>
            <PickFilter label="Select colours" options={colourFilterOptions}
              selectedValues={colourSelectedValues} onToggle={toggleColourValue} />
          </div>

          {/* Print / multi-colour ka picker yahan se hata diya gaya.
              Rang chunne ke do raaste the aur dono ek hi jagah khade the:
              upar ke gole, aur neeche ye picker. Roz ke kaam me pehla hi
              chahiye hota hai. Jis product ka ek fix rang nahi hota (print,
              pattern, stripe) uske liye wahi picker alag se maujood hai —
              Products → Colour Fix.

              State (printColour / printShades) jaan-boojh kar rakhi gayi hai:
              jis product me pehle se "Navy/White/Red" jaisa rang darj hai, wo
              load hokar waise hi save hota rehta hai. Hatane se wo rang Google
              ke feed se gir jata. */}

          {/* Custom colour chips (added) */}
          {customColours.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'.4rem', paddingLeft:'68px', marginBottom:'.5rem' }}>
              {customColours.map((c, i) => (
                <div key={i} title={c.name} style={{ display:'flex', alignItems:'center', gap:'.25rem', background:'#f9f9f9', border:'1.5px solid #eee', borderRadius:'20px', padding:'.2rem .35rem' }}>
                  {c.photo
                    ? <img src={c.photo} alt={c.name} style={{ width:'22px', height:'22px', borderRadius:'50%', objectFit:'cover', border:'1.5px solid #ddd', flexShrink:0 }} />
                    : <div style={{ width:'22px', height:'22px', borderRadius:'50%', background:c.code, border:'1.5px solid #ddd', flexShrink:0 }} />}
                  <input value={c.name}
                    title="Colour name - this is what Google reads"
                    placeholder="Colour name"
                    onChange={e => renameCustomColour(i, e.target.value)}
                    style={{ width:'96px', background:'#fff', color:'#333',
                      border:`1.5px solid ${colourProblem(c.name) ? '#e0a200' : '#e4dedb'}`,
                      borderRadius:'10px', padding:'.1rem .35rem',
                      fontSize:'.72rem', fontWeight:600, boxSizing:'border-box' }} />
                  {/* Column ka label - jodne ke baad bhi badla ja sakta hai. Ye
                      sirf label hai: stock matrix colour ke NAAM par chalta hai,
                      isliye ise badalne se kisi ka hisaab nahi badalta. */}
                  <input value={c.columnLetter ?? ''}
                    title="Column label - you can change it"
                    onChange={e => {
                      const v = e.target.value.slice(0, 8);
                      setCustomColours(p => p.map((x, j) => (j === i ? { ...x, columnLetter: v } : x)));
                    }}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      const clash = v !== '' && customColours.some((x, j) =>
                        j !== i && (x.columnLetter ?? '').trim().toLowerCase() === v.toLowerCase());
                      if (clash) {
                        alert(`Column "${v}" is already used on this product. Please choose a different label.`);
                        setCustomColours(p => p.map((x, j) =>
                          (j === i ? { ...x, columnLetter: LETTERS[i] ?? '' } : x)));
                      }
                    }}
                    style={{ width:'46px', textAlign:'center', background:'#fff', color:'#555',
                      border:'1.5px solid #e4dedb', borderRadius:'10px', padding:'.1rem .2rem',
                      fontSize:'.7rem', fontWeight:700, boxSizing:'border-box' }} />
                  <button onClick={() => setCustomColours(p => p.filter((_,j) => j !== i))}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#c62828', fontSize:'.8rem', padding:'0 .15rem', lineHeight:1 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {stockKeys.length > 0 && (
            <div style={{ marginTop:'.85rem', border:'1.5px solid #eee', borderRadius:'10px', overflow:'auto' }}>
              <div style={{ background:'#fafafa', padding:'.65rem .85rem', display:'flex', justifyContent:'space-between', gap:'.75rem', alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:'.84rem', fontWeight:700, color:'#444' }}>
                  📦 Stock by {selectedColours.length ? 'Size × Colour/Design' : 'Size'}
                </span>
                <span style={{ fontSize:'.78rem', color:'#888' }}>Total: {stockTotal} pcs</span>
              </div>
              {selectedColours.length > 0 ? (
                /* ── Matrix Table: Sizes (rows) × Colours (cols) ── */
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
                    {selectedSizes.map((size, si) => {
                      const rowTotal = selectedColours.reduce((s, col) => s + (Number(variantStock[`${size}|${col}`]) || 0), 0);
                      return (
                        <tr key={size} style={{ background: si % 2 === 0 ? '#fff' : '#fdf5f7' }}>
                          <td style={{ padding:'.35rem .6rem', fontWeight:700, color:'#a7354d', borderBottom:'1px solid #f0e0e4', whiteSpace:'nowrap' }}>{size}</td>
                          {selectedColours.map(col => {
                            const key = `${size}|${col}`;
                            return (
                              <td key={col} style={{ padding:'.25rem .4rem', borderBottom:'1px solid #f0e0e4', textAlign:'center' }}>
                                <input type="number" min={0} value={variantStock[key] ?? ''}
                                  onChange={e => { matrixTouched.current = true; const v = e.target.value; setVariantStock(p => ({ ...p, [key]: v === '' ? '' : String(Math.max(0, Number(v) || 0)) })); }}
                                  placeholder="0"
                                  style={{ width:'60px', border:'1.5px solid #ddd', borderRadius:'6px', padding:'.3rem', fontSize:'.8rem', textAlign:'center', boxSizing:'border-box' }} />
                              </td>
                            );
                          })}
                          <td style={{ padding:'.35rem .6rem', textAlign:'center', fontWeight:700, color:'#555', borderBottom:'1px solid #f0e0e4', background:'#f9f0f2' }}>{rowTotal}</td>
                        </tr>
                      );
                    })}
                    {/* Column totals row */}
                    <tr style={{ background:'#f9f0f2' }}>
                      <td style={{ padding:'.35rem .6rem', fontWeight:700, color:'#555' }}>Col Total</td>
                      {selectedColours.map(col => {
                        const colTotal = selectedSizes.reduce((s, size) => s + (Number(variantStock[`${size}|${col}`]) || 0), 0);
                        return <td key={col} style={{ padding:'.35rem .4rem', textAlign:'center', fontWeight:700, color:'#555' }}>{colTotal}</td>;
                      })}
                      <td style={{ padding:'.35rem .6rem', textAlign:'center', fontWeight:800, color:'#a7354d' }}>{stockTotal}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                /* ── Only sizes, no colours — simple list ── */
                <div style={{ display:'flex', flexWrap:'wrap', gap:'.5rem', padding:'.85rem' }}>
                  {selectedSizes.map(size => (
                    <label key={size} style={{ display:'flex', alignItems:'center', gap:'.5rem', border:'1px solid #eee', borderRadius:'8px', padding:'.4rem .6rem', background:'#fff' }}>
                      <span style={{ fontSize:'.8rem', fontWeight:700, color:'#a7354d', minWidth:'32px' }}>{size}</span>
                      <input type="number" min={0} value={variantStock[size] ?? ''}
                        onChange={e => { matrixTouched.current = true; const v = e.target.value; setVariantStock(p => ({ ...p, [size]: v === '' ? '' : String(Math.max(0, Number(v) || 0)) })); }}
                        placeholder="0"
                        style={{ width:'70px', border:'1.5px solid #ddd', borderRadius:'6px', padding:'.3rem .4rem', fontSize:'.82rem', textAlign:'center', boxSizing:'border-box' }} />
                      <span style={{ fontSize:'.72rem', color:'#888' }}>pcs</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Colour / Design Photos ── Front/Side/Back/Zoomed gallery for the 2nd photo-column
               design onward (Column B, C…). The FIRST design (Column A) uses the main Product
               Photos below, so it needs no separate gallery here. */}
          {getPackOfNumber(packOf) < 2 && (() => {
            const designs = customColours.map((c, i) => ({ c, i })).filter(x => x.c.photo);
            const extra = designs.slice(1);   // skip Column A (the default design)
            if (extra.length === 0) return null;
            return (
              <div style={{ marginTop:'1.5rem', borderTop:'1px solid #f0f0f0', paddingTop:'1.5rem' }}>
                <p style={{ fontSize:'.75rem', fontWeight:700, color:'#a7354d', textTransform:'uppercase', letterSpacing:'.06em', margin:'0 0 .25rem' }}>
                  COLOUR / DESIGN PHOTOS
                </p>
                <p style={{ fontSize:'.8rem', color:'#888', marginBottom:'1.25rem' }}>
                  The first design (Column A) uses the main Product Photos. For the other designs (Column B, C…) you can add Front, Side, Back, Zoomed and up to {MAX_EXTRA} more here — {MAX_PHOTOS} in all. (FRONT = the column&apos;s own photo.)
                </p>
                <p style={{ fontSize:'.8rem', color:'#888', marginBottom:'1.25rem' }}>
                  <b>Important:</b> a design only gets its own gallery on the storefront once at least one photo besides FRONT is filled in. With only FRONT filled, customers keep seeing the main Product Photos — exactly as today.
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
                  {extra.map(({ c, i }) => (
                    <div key={i}>
                      <div style={{ display:'flex', alignItems:'center', gap:'.6rem', marginBottom:'.75rem' }}>
                        <img src={c.photo} alt={c.name} style={{ width:'34px', height:'34px', borderRadius:'50%', objectFit:'cover', border:'2px solid #a7354d', flexShrink:0 }} />
                        <span style={{ fontWeight:700, fontSize:'.92rem' }}>{c.name}</span>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'.75rem' }}>
                        <PhotoSlot label="FRONT"     value={c.photo}     onChange={v => updateDesignPhoto(i,'photo',v)} isFirst />
                        <PhotoSlot label="SIDE VIEW" value={c.side || ''}   onChange={v => updateDesignPhoto(i,'side',v)} />
                        <PhotoSlot label="BACK VIEW" value={c.back || ''}   onChange={v => updateDesignPhoto(i,'back',v)} />
                        <PhotoSlot label="ZOOMED IN" value={c.zoomed || ''} onChange={v => updateDesignPhoto(i,'zoomed',v)} />

                        {(c.extra ?? []).map((img, slot) => (
                          <div key={slot} style={{ position:'relative' }}>
                            <PhotoSlot label={`PHOTO ${slot + 5}`} value={img}
                              onChange={v => setDesignExtra(i, slot, v)} />
                            <button type="button" onClick={() => removeDesignExtra(i, slot)}
                              title="Remove this photo"
                              style={{ position:'absolute', top:4, right:4, zIndex:3,
                                width:22, height:22, lineHeight:'20px', textAlign:'center',
                                borderRadius:'50%', border:'none', background:'rgba(0,0,0,.55)',
                                color:'#fff', fontSize:'.8rem', cursor:'pointer', padding:0 }}>
                              ×
                            </button>
                          </div>
                        ))}

                        {(c.extra ?? []).length < MAX_EXTRA && (
                          <button type="button" onClick={() => addDesignExtra(i)}
                            style={{ minHeight:150, borderRadius:10, cursor:'pointer',
                              border:'2px dashed #d8cfca', background:'#fcfaf9', color:'#722f37',
                              fontWeight:700, fontSize:'.85rem' }}>
                            + Add a photo
                            <span style={{ display:'block', fontWeight:400, fontSize:'.72rem', color:'#8a7f76', marginTop:'.2rem' }}>
                              {4 + (c.extra ?? []).length} of {MAX_PHOTOS} used
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Auto stock bar */}
          <div style={{ display:'flex', alignItems:'center', gap:'.75rem', background:'#f9f9f9', borderRadius:'8px', padding:'.55rem 1rem', marginTop:'.5rem' }}>
            <span style={{ fontSize:'.8rem', fontWeight:600, color:'#555' }}>Auto stock:</span>
            <span style={{ background: effectiveStockStatus === 'Out of Stock' ? '#c0392b' : effectiveStockStatus === 'Limited Stock' ? '#e67e22' : '#27ae60', color:'#fff', fontSize:'.73rem', fontWeight:700, padding:'.15rem .5rem', borderRadius:'10px' }}>{effectiveStockStatus}</span>
            <span style={{ fontSize:'.8rem', color:'#888' }}>| Total: {effectiveQty || 0} pcs</span>
          </div>

          {/* Best Seller */}
          <label style={{ display:'flex', alignItems:'center', gap:'.5rem', marginTop:'.6rem', background:'#f9f9f9', borderRadius:'8px', padding:'.55rem 1rem', cursor:'pointer' }}>
            <input type="checkbox" checked={bestSeller} onChange={e => setBestSeller(e.target.checked)} style={{ width:'15px', height:'15px' }} />
            <span style={{ fontWeight:600, fontSize:'.88rem' }}>Show in Best Sellers</span>
          </label>
        </div>

        {/* ── Available Colours (text) ── */}
        <div style={{ marginTop:'1.25rem' }}>
          <label style={lbl}>Available Colours <span style={{ fontWeight:400, color:'#888' }}>(Enter or comma to add)</span></label>
          <input value={availColours} onChange={e => setAvailColours(e.target.value)}
            placeholder="e.g. Red, Blue..." style={inp} />
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
            placeholder="Add product details, fabric, use case, styling notes"
            rows={4}
            style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} />
        </div>

        {/* ── Product Details (every row optional) ── */}
        <div style={{ marginTop:'1.25rem' }}>
          <label style={lbl}>
            Product Details{' '}
            <span style={{ fontWeight:400, color:'#888' }}>— optional. A blank box is not shown on the site.</span>
          </label>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(190px, 1fr))', gap:'.65rem' }}>
            {SPEC_FIELDS.map(f => (
              <div key={f.key}>
                <span style={{ display:'block', fontSize:'.76rem', color:'#666', marginBottom:'.22rem' }}>{f.label}</span>
                <input
                  value={specs[f.key] ?? ''}
                  onChange={e => setSpecs(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={inp} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Product Photos ── */}
        <div style={{ marginTop:'1.5rem', borderTop:'1px solid #f0f0f0', paddingTop:'1.5rem' }}>
          <p style={{ fontSize:'.82rem', fontWeight:600, color:'#444', marginBottom:'.25rem' }}>
            Product Photos{' '}
            <span style={{ fontWeight:400, color:'#888' }}>
              Front · Side · Back · Zoomed, and up to {MAX_EXTRA} more
            </span>
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'.75rem', marginTop:'.75rem' }}>
            <PhotoSlot label="FRONT VIEW" value={mainPhotos.front}  onChange={v => setMainPhotos(p => ({...p, front:v}))}  isFirst />
            <PhotoSlot label="SIDE VIEW"  value={mainPhotos.side}   onChange={v => setMainPhotos(p => ({...p, side:v}))} />
            <PhotoSlot label="BACK VIEW"  value={mainPhotos.back}   onChange={v => setMainPhotos(p => ({...p, back:v}))} />
            <PhotoSlot label="ZOOMED IN"  value={mainPhotos.zoomed} onChange={v => setMainPhotos(p => ({...p, zoomed:v}))} />

            {/* The ones past the four named views. A fabric close-up, the label,
                the same dress on somebody else - all worth showing, none worth a
                name, so they are numbered and each can be taken away again. */}
            {mainPhotos.extra.map((img, i) => (
              <div key={i} style={{ position:'relative' }}>
                <PhotoSlot
                  label={`PHOTO ${i + 5}`}
                  value={img}
                  onChange={v => setMainPhotos(p => ({
                    ...p, extra: p.extra.map((x, j) => (j === i ? v : x)),
                  }))} />
                <button type="button"
                  onClick={() => setMainPhotos(p => ({ ...p, extra: p.extra.filter((_, j) => j !== i) }))}
                  title="Remove this photo"
                  style={{
                    position:'absolute', top:4, right:4, zIndex:3,
                    width:22, height:22, lineHeight:'20px', textAlign:'center',
                    borderRadius:'50%', border:'none', background:'rgba(0,0,0,.55)',
                    color:'#fff', fontSize:'.8rem', cursor:'pointer', padding:0,
                  }}>
                  ×
                </button>
              </div>
            ))}

            {mainPhotos.extra.length < MAX_EXTRA && (
              <button type="button"
                onClick={() => setMainPhotos(p => ({ ...p, extra: [...p.extra, ''] }))}
                style={{
                  minHeight:150, borderRadius:10, cursor:'pointer',
                  border:'2px dashed #d8cfca', background:'#fcfaf9', color:'#722f37',
                  fontWeight:700, fontSize:'.85rem',
                }}>
                + Add a photo
                <span style={{ display:'block', fontWeight:400, fontSize:'.72rem', color:'#8a7f76', marginTop:'.2rem' }}>
                  {4 + mainPhotos.extra.length} of {MAX_PHOTOS} used
                </span>
              </button>
            )}
          </div>

          {/* Or paste URL */}
          <div style={{ display:'flex', alignItems:'center', gap:'.75rem', marginTop:'1rem' }}>
            <span style={{ fontSize:'.82rem', color:'#888', fontWeight:600, whiteSpace:'nowrap' }}>Or paste URL:</span>
            <input placeholder="https://..."
              onChange={e => setMainPhotos(p => ({ ...p, front: e.target.value }))}
              style={{ ...inp, flex:1 }} />
          </div>
        </div>

        {/* Dukaan ka naam — neeche, chhota, aur raaste se hata hua.
            Pehle ye SKU ke theek neeche poori chaudai ka khana tha, yaani har
            product bharte waqt saamne. Par ise bharna hota hi nahi: jis staff
            ke khaate me dukaan likhi hai, uske banaye har product par ye apne
            aap chhap jata hai. Yahan sirf isliye hai ki purane products me,
            jinpar koi naam nahi hai, maalik haath se bhar sake. */}
        <div className="shop-tag-row">
          <span className="shop-tag-l">Shop</span>
          <input value={shopName} onChange={e => setShopName(e.target.value)}
                 placeholder="auto from your login" className="shop-tag-in" />
          <span className="shop-tag-note">
            Fills in on its own from the staff login that lists the product, and stays on it afterwards.
            Shown on the order so you know where to source the item.
          </span>
        </div>

        {/* ── Action Buttons ── */}
        <div style={{ display:'flex', gap:'.75rem', marginTop:'1.5rem' }}>
          {/* Deliberately still clickable when the checks fail — a half-finished
              product has to be saveable, and that is what a draft is. */}
          <button onClick={() => handleSave()} disabled={saving}
            style={{ background: saving ? '#bbb' : gate.passed ? '#2e7d32' : '#c26a12', color:'#fff', border:'none', borderRadius:'8px', padding:'.7rem 2rem', fontSize:'.95rem', fontWeight:700, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Adding…' : gate.passed ? '✅ Add & publish' : `💾 Add as draft (${gate.blocking.length} to fix)`}
          </button>
          <button onClick={clearAll}
            style={{ background:'#f5f5f5', color:'#555', border:'none', borderRadius:'8px', padding:'.7rem 2rem', fontSize:'.95rem', fontWeight:700, cursor:'pointer' }}>
            Clear Fields
          </button>
        </div>
      </div>

      {/* ── Custom Colour Modal ── */}
      {showColModal && (
        <CustomColourModal
          nextLetter={LETTERS[customColours.length] ?? 'A'}
          usedLetters={customColours.map(c => c.columnLetter)}
          onAdd={c => {
            setCustomColours(p => [...p, c]);
            // Save the colour (name + code only, no photo) to the reusable catalog.
            if (!savedColours.some(x => x.name.toLowerCase() === c.name.toLowerCase()))
              persistColours([...savedColours, { name: c.name, code: c.code || '' }]);
          }}
          onClose={() => setShowColModal(false)}
        />
      )}
    </div>
  );
}
