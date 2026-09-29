'use client';

// Jis product ka koi ek fix colour nahi hai (print, pattern, stripe) uske liye
// colour picker. Har circle par click karke colour bhar do — naam apne aap
// Google-safe list me se aa jata hai. Zyada se zyada 3 colours, primary pehle,
// aur neeche live dikhta hai ki Google ko exactly kya jayega.
//
// 3 tarike se colour bhar sakte hain:
//   • circle par click  → system ka colour chart
//   • "Photo se colour" → product ki apni photo me se sabse zyada dikhne wale
//                         colours utha leta hai (background hata kar)
//   • "Screen se colour"→ eyedropper, screen me kahin se bhi (Chrome/Edge)
//   • "Photo ka hissa"  → tasveer par chaukor kheench kar, sirf usi hisse ke
//                         rang. Print wali nighty par yahi sahi hai: poori
//                         tasveer me zameen ka rang jeet jata hai aur phoolon
//                         ke rang — jo grahak sabse pehle dekhta hai — ginti
//                         me peeche reh jate hain.

import { useEffect, useRef, useState } from 'react';
import {
  colourProblem, joinColourValue, nearestColourName, splitColourValue,
  colourNameToHex, colourDistance, hexToRgb, rgbToHex,
} from '@/lib/googleColours';
import PhotoColourRegion from '@/components/admin/PhotoColourRegion';

type Slot = { hex: string; name: string };

const MAX = 3;

/** Photo me se top colours — background (kinaare ka colour) chhod kar. */
async function dominantColours(src: string, want = 3): Promise<string[]> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();

  const W = 96, H = 96;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const at = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };
  // Studio photos ka background chaaron kone me hota hai — uska average nikaal
  // kar us se milte-julte pixels hata dete hain, warna har product "White".
  const corners = [at(1, 1), at(W - 2, 1), at(1, H - 2), at(W - 2, H - 2)];
  const bg = {
    r: corners.reduce((s, c) => s + c.r, 0) / 4,
    g: corners.reduce((s, c) => s + c.g, 0) / 4,
    b: corners.reduce((s, c) => s + c.b, 0) / 4,
  };

  const collect = (dropBackground: boolean) => {
    const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let y = Math.round(H * 0.18); y < H * 0.82; y++) {
      for (let x = Math.round(W * 0.18); x < W * 0.82; x++) {
        const p = at(x, y);
        if (p.a < 200) continue;
        if (dropBackground && colourDistance(p, bg) < 46) continue;
        const k = (p.r >> 4) * 256 + (p.g >> 4) * 16 + (p.b >> 4);
        const cur = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
        cur.n++; cur.r += p.r; cur.g += p.g; cur.b += p.b;
        bins.set(k, cur);
      }
    }
    return [...bins.values()].sort((a, b) => b.n - a.n);
  };

  let ranked = collect(true);
  const centrePixels = Math.round(W * 0.64) * Math.round(H * 0.64);
  // Agar background hatane ke baad kuch bacha hi nahi (plain product), to
  // background wapas shaamil kar lo.
  if (ranked.reduce((s, b) => s + b.n, 0) < centrePixels * 0.12) ranked = collect(false);

  const picked: { r: number; g: number; b: number }[] = [];
  for (const b of ranked) {
    const c = { r: b.r / b.n, g: b.g / b.n, b: b.b / b.n };
    if (picked.every(p => colourDistance(p, c) > 70)) picked.push(c);
    if (picked.length >= want) break;
  }
  return picked.map(c => rgbToHex(c.r, c.g, c.b));
}

export default function GoogleColourPicker({
  value, shades, photo, onChange, compact = false,
}: {
  value: string;
  shades?: string[];
  photo?: string;
  onChange: (value: string, shades: string[]) => void;
  compact?: boolean;
}) {
  const fromProps = (): Slot[] => {
    const names = splitColourValue(value);
    if (names.length === 0) return [];
    return names.map((name, i) => ({
      name,
      hex: shades?.[i] || colourNameToHex(name) || '#cccccc',
    }));
  };

  const [slots, setSlots] = useState<Slot[]>(fromProps);
  const [busy, setBusy] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [note, setNote] = useState('');
  const emitted = useRef(value);

  // Bahar se value badle (product load hua, reset hua) to wapas sync kar lo —
  // lekin apni hi emit ki hui value par nahi, warna typing beech me kat jaye.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setSlots(fromProps());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, (shades ?? []).join('|')]);

  const push = (next: Slot[]) => {
    const capped = next.slice(0, MAX);
    setSlots(capped);
    const joined = joinColourValue(capped.map(s => s.name));
    emitted.current = joined;
    onChange(joined, capped.map(s => s.hex));
  };

  const setHex = (i: number, hex: string) => {
    push(slots.map((s, idx) => idx === i ? { hex, name: nearestColourName(hex) || s.name } : s));
  };
  const setName = (i: number, name: string) => {
    const hex = colourNameToHex(name);
    push(slots.map((s, idx) => idx === i ? { ...s, name, hex: hex ?? s.hex } : s));
  };
  const addSlot = () => push([...slots, { hex: '#1b2a4a', name: nearestColourName('#1b2a4a') }]);
  const removeSlot = (i: number) => push(slots.filter((_, idx) => idx !== i));

  const fromPhoto = async () => {
    if (!photo) return;
    setBusy(true); setNote('');
    try {
      const hexes = await dominantColours(photo, MAX);
      if (hexes.length === 0) { setNote('No colours found in the photo — click a circle and set them yourself.'); return; }
      push(hexes.map(hex => ({ hex, name: nearestColourName(hex) })));
      setNote('Filled in from the photo — change a name if it does not look right.');
    } catch {
      setNote('That photo could not be read. Click a circle and pick the colours yourself.');
    } finally { setBusy(false); }
  };

  const fromRegion = (hexes: string[]) => {
    push(hexes.map(hex => ({ hex, name: nearestColourName(hex) })));
    setNote('Filled in from the area you picked — change a name if it does not look right.');
  };

  const fromScreen = async (i: number) => {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!ED) { setNote('This browser has no eyedropper — it works in Chrome and Edge.'); return; }
    try {
      const res = await new ED().open();
      if (res?.sRGBHex) setHex(i, res.sRGBHex);
    } catch { /* user ne cancel kiya */ }
  };

  const joined = joinColourValue(slots.map(s => s.name));
  const problem = slots.length === 0 ? null : colourProblem(joined);
  const gradient = slots.length > 1
    ? `linear-gradient(135deg, ${slots.map((s, i) =>
        `${s.hex} ${Math.round((i / slots.length) * 100)}%, ${s.hex} ${Math.round(((i + 1) / slots.length) * 100)}%`).join(', ')})`
    : slots[0]?.hex ?? '#eee';

  const circle = (bg: string, size = 46): React.CSSProperties => ({
    width: size, height: size, borderRadius: '50%', background: bg,
    border: '2px solid #fff', boxShadow: '0 0 0 1.5px #d9d9d9, 0 1px 3px rgba(0,0,0,.18)',
    display: 'inline-block', cursor: 'pointer', flexShrink: 0,
  });

  return (
    <div style={{ border: '1px solid #eadfe1', borderRadius: 10, padding: compact ? '.6rem' : '.85rem', background: '#fffdfd' }}>
      {!compact && (
        <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#722f37', marginBottom: '.5rem' }}>
          🎨 Print / multi-colour — circle par click karke colour bharein
        </div>
      )}

      <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {slots.map((s, i) => (
          <div key={i} style={{ width: 92, textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <label style={circle(s.hex)} title="Colour chart kholein">
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(s.hex) ? s.hex : '#cccccc'}
                  onChange={e => setHex(i, e.target.value)}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
              </label>
              <button
                type="button" onClick={() => removeSlot(i)} title="Hatao"
                style={{
                  position: 'absolute', top: -4, right: -6, width: 18, height: 18, borderRadius: '50%',
                  border: 'none', background: '#c0392b', color: '#fff', fontSize: '.7rem',
                  lineHeight: '18px', padding: 0, cursor: 'pointer',
                }}
              >×</button>
            </div>
            <input
              value={s.name}
              onChange={e => setName(i, e.target.value)}
              placeholder="Colour"
              style={{
                width: '100%', marginTop: '.3rem', padding: '.25rem .3rem', textAlign: 'center',
                border: '1px solid #ddd', borderRadius: 5, fontSize: '.72rem', fontWeight: 600,
              }}
            />
            <button
              type="button" onClick={() => fromScreen(i)}
              style={{ marginTop: '.2rem', border: 'none', background: 'none', color: '#888', fontSize: '.66rem', cursor: 'pointer' }}
            >💧 screen se</button>
          </div>
        ))}

        {slots.length < MAX && (
          <button
            type="button" onClick={addSlot} title="Colour jodo"
            style={{ ...circle('#fff'), border: '2px dashed #c9a9b0', color: '#a7354d', fontSize: '1.3rem', lineHeight: '42px', padding: 0 }}
          >+</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.6rem' }}>
        {photo && (
          <button
            type="button" onClick={fromPhoto} disabled={busy}
            style={{
              border: '1px solid #c9a9b0', background: '#fff', color: '#722f37', borderRadius: 6,
              padding: '.28rem .6rem', fontSize: '.73rem', fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
            }}
          >{busy ? '⏳ Reading…' : '📷 Fill colours from the photo'}</button>
        )}
        {photo && (
          <button
            type="button" onClick={() => setRegionOpen(true)}
            style={{
              border: '1px solid #c9a9b0', background: '#fff', color: '#722f37', borderRadius: 6,
              padding: '.28rem .6rem', fontSize: '.73rem', fontWeight: 700, cursor: 'pointer',
            }}
          >🎯 Pick part of the photo</button>
        )}
      </div>

      {regionOpen && photo && (
        <PhotoColourRegion src={photo} onPick={fromRegion} onClose={() => setRegionOpen(false)} />
      )}

      {slots.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem', marginTop: '.6rem' }}>
          <span style={circle(gradient, 26)} />
          <div style={{ fontSize: '.74rem', lineHeight: 1.35 }}>
            <div style={{ color: '#666' }}>
              Google ko jayega: <strong style={{ color: '#222' }}>{joined || '—'}</strong>
            </div>
            <div style={{ color: problem ? '#c0392b' : '#1e7a3c', fontWeight: 600 }}>
              {problem ? `✗ ${problem}` : '✓ Meets Google\'s rules — primary colour first'}
            </div>
          </div>
        </div>
      )}

      {note && <div style={{ fontSize: '.72rem', color: '#8a6d3b', marginTop: '.4rem' }}>{note}</div>}
    </div>
  );
}
