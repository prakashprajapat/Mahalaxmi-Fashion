'use client';
import { useRef, useState } from 'react';

/* WhatsApp-DP style circular cropper: drag to move, slider to zoom,
   then exports a square JPEG of the visible circle. No external library. */
const VIEW = 280; // crop viewport (px)
const OUT = 400;  // exported image size (px)

export default function ImageCropper({ src, onCancel, onCrop }: {
  src: string;
  onCancel: () => void;
  onCrop: (blob: Blob) => void;
}) {
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const nat = useRef({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const clamp = (x: number, y: number, s: number) => {
    const w = nat.current.w * s, h = nat.current.h * s;
    return { x: Math.min(0, Math.max(VIEW - w, x)), y: Math.min(0, Math.max(VIEW - h, y)) };
  };

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    nat.current = { w: img.naturalWidth, h: img.naturalHeight };
    const base = Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight);
    setMinScale(base);
    setScale(base);
    setPos(clamp((VIEW - img.naturalWidth * base) / 2, (VIEW - img.naturalHeight * base) / 2, base));
    setReady(true);
  };

  const onZoom = (s: number) => {
    const cx = VIEW / 2, cy = VIEW / 2;
    const ix = (cx - pos.x) / scale, iy = (cy - pos.y) / scale;
    setPos(clamp(cx - ix * s, cy - iy * s, s));
    setScale(s);
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos(clamp(drag.current.ox + (e.clientX - drag.current.x), drag.current.oy + (e.clientY - drag.current.y), scale));
  };
  const onUp = () => { drag.current = null; };

  const save = () => {
    const img = imgRef.current;
    if (!img) return;
    const sx = (-pos.x) / scale, sy = (-pos.y) / scale, sSize = VIEW / scale;
    const canvas = document.createElement('canvas');
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    canvas.toBlob(b => { if (b) onCrop(b); }, 'image/jpeg', 0.9);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <p style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem' }}>Move &amp; zoom to fit</p>
      <div
        style={{ position: 'relative', width: VIEW, height: VIEW, borderRadius: '50%', overflow: 'hidden', touchAction: 'none', boxShadow: '0 0 0 3px #fff', cursor: 'grab', background: '#333' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={src} alt="" onLoad={onLoad} draggable={false}
          style={{ position: 'absolute', left: pos.x, top: pos.y, width: nat.current.w * scale, height: nat.current.h * scale, maxWidth: 'none', userSelect: 'none', opacity: ready ? 1 : 0 }} />
      </div>
      <input type="range" min={minScale} max={minScale * 3} step="any" value={scale}
        onChange={e => onZoom(parseFloat(e.target.value))}
        style={{ width: VIEW, margin: '1.25rem 0', accentColor: '#a7354d' }} aria-label="Zoom" />
      <div style={{ display: 'flex', gap: '.75rem' }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '.6rem 1.4rem', borderRadius: 10, border: '1.5px solid #fff', background: 'transparent', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
        <button type="button" onClick={save}
          style={{ padding: '.6rem 1.8rem', borderRadius: 10, border: 'none', background: '#a7354d', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Set Photo</button>
      </div>
    </div>
  );
}
