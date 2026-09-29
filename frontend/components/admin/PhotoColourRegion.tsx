'use client';

// Photo ka ek hissa chuniye — usi hisse ke rang nikal aayenge.
//
// "Photo se colour bharo" poori tasveer dekhta hai aur background hata kar
// andaza lagata hai. Print wali nighty par wo andaza kaam ka nahi rehta: poori
// tasveer me navy ka raaj hai, isliye phoolon ka laal aur hara — jo grahak ko
// sabse pehle dikhte hain — ginti me kahin peeche reh jate hain.
//
// Yahan aap khud batate hain kahan dekhna hai. Kapde ke us hisse par chaukor
// kheenchiye jahan asli design hai; rang wahin se, bina kisi andaze ke.
//
// Jo naam banega wo "Multi Colour" NAHI hoga — Google use colour maanta hi
// nahi aur aisa product feed se bahar kar deta hai. Jo banega wo top teen rang
// hain, sabse pramukh pehle: "Navy/Red/Green". Yahi Google ka apna tarika hai.

import { useRef, useState } from 'react';
import { colourDistance, rgbToHex } from '@/lib/googleColours';

type Rect = { x: number; y: number; w: number; h: number };

/** Chune hue hisse ke top colours. Background hatane ki koshish nahi — jo
 *  chuna gaya hai wahi dekha jata hai, kyunki chunne wala insaan hai. */
async function coloursInRegion(src: string, r: Rect, want = 3): Promise<string[]> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();

  const sw = Math.max(8, Math.round(r.w));
  const sh = Math.max(8, Math.round(r.h));
  const W = Math.min(120, sw), H = Math.min(120, sh);

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, Math.round(r.x), Math.round(r.y), sw, sh, 0, 0, W, H);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, W, H).data;
  } catch {
    // Tasveer doosre domain se aayi aur CORS header nahi tha — canvas "taint"
    // ho jata hai aur padha nahi ja sakta. Khali lautana behtar hai; bulane
    // wala keh dega ki nahi ho paya.
    return [];
  }

  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const R = data[i], G = data[i + 1], B = data[i + 2];
    const k = (R >> 4) * 256 + (G >> 4) * 16 + (B >> 4);
    const cur = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n++; cur.r += R; cur.g += G; cur.b += B;
    bins.set(k, cur);
  }

  const picked: { r: number; g: number; b: number }[] = [];
  for (const b of [...bins.values()].sort((a, z) => z.n - a.n)) {
    const c = { r: b.r / b.n, g: b.g / b.n, b: b.b / b.n };
    // Paas-paas ke shade alag rang nahi hain. 70 wahi doori hai jo poori
    // tasveer wala rasta istemal karta hai, taki dono ek jaisa chunein.
    if (picked.every(p => colourDistance(p, c) > 70)) picked.push(c);
    if (picked.length >= want) break;
  }
  return picked.map(c => rgbToHex(c.r, c.g, c.b));
}

export default function PhotoColourRegion({
  src, onPick, onClose,
}: {
  src: string;
  onPick: (hexes: string[]) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [sel, setSel] = useState<Rect | null>(null);   // dikhne wale pixels me
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pointAt = (e: React.PointerEvent) => {
    const b = boxRef.current?.getBoundingClientRect();
    if (!b) return { x: 0, y: 0 };
    return {
      x: Math.min(Math.max(0, e.clientX - b.left), b.width),
      y: Math.min(Math.max(0, e.clientY - b.top), b.height),
    };
  };

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    start.current = pointAt(e);
    setSel(null);
    setErr('');
  };
  const move = (e: React.PointerEvent) => {
    if (!start.current) return;
    const p = pointAt(e);
    setSel({
      x: Math.min(start.current.x, p.x),
      y: Math.min(start.current.y, p.y),
      w: Math.abs(p.x - start.current.x),
      h: Math.abs(p.y - start.current.y),
    });
  };
  const up = () => { start.current = null; };

  async function use() {
    const img = imgRef.current;
    const b = boxRef.current?.getBoundingClientRect();
    if (!img || !b || !sel || sel.w < 6 || sel.h < 6) {
      setErr('Drag a slightly bigger box, over the printed part.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      // Dikhne wale pixels se asli tasveer ke pixels — tasveer chhoti karke
      // dikhayi jati hai, isliye seedha naap galat hoga.
      const scaleX = img.naturalWidth / b.width;
      const scaleY = img.naturalHeight / b.height;
      const hexes = await coloursInRegion(src, {
        x: sel.x * scaleX, y: sel.y * scaleY, w: sel.w * scaleX, h: sel.h * scaleY,
      });
      if (hexes.length === 0) {
        setErr('No colours came out of that area. Try another part.');
        setBusy(false);
        return;
      }
      onPick(hexes);
      onClose();
    } catch {
      setErr('That photo could not be read.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Pick part of the photo"
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(20,14,16,.62)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 14, padding: '1rem', maxWidth: 560, width: '100%',
        maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.3)',
      }}>
        <div style={{ fontWeight: 800, fontSize: '.95rem', color: '#1e1b19', marginBottom: '.2rem' }}>
          Drag a box over the printed part
        </div>
        <div style={{ fontSize: '.78rem', color: '#7d736d', marginBottom: '.7rem', lineHeight: 1.5 }}>
          Over the pattern itself. Across the whole photo the background colour wins
          the count, so the colours in the print get left out.
        </div>

        <div
          ref={boxRef}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{
            position: 'relative', borderRadius: 10, overflow: 'hidden', cursor: 'crosshair',
            background: '#f3efea', touchAction: 'none', userSelect: 'none',
          }}
        >
          {/* Plain <img>: yahan naap asli pixels me chahiye, isliye next/image
              ka resize beech me nahi aana chahiye. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef} src={src} alt="" crossOrigin="anonymous" draggable={false}
            style={{ display: 'block', width: '100%', height: 'auto', pointerEvents: 'none' }}
          />
          {sel && sel.w > 2 && sel.h > 2 && (
            <div style={{
              position: 'absolute', left: sel.x, top: sel.y, width: sel.w, height: sel.h,
              border: '2px solid #fff', boxShadow: '0 0 0 9999px rgba(20,14,16,.45)',
              pointerEvents: 'none',
            }} />
          )}
        </div>

        {err && (
          <div style={{ marginTop: '.6rem', fontSize: '.78rem', color: '#c0392b', fontWeight: 600 }}>{err}</div>
        )}

        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.8rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ border: '1px solid #e5dcdd', background: '#fff', color: '#555', borderRadius: 8, padding: '.45rem .9rem', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={use} disabled={busy}
            style={{ border: 'none', background: '#722f37', color: '#fff', borderRadius: 8, padding: '.45rem 1rem', fontSize: '.82rem', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? .7 : 1 }}>
            {busy ? 'Reading…' : 'Use these colours'}
          </button>
        </div>
      </div>
    </div>
  );
}
