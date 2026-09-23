'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { settingsApi } from '@/lib/api';

// Right-side hero media — auto-sliding carousel.
// Slide 1 = current look (admin video, warna logo). Uske baad admin-uploaded
// photos (Settings → Homepage Hero → Hero Photo 1/2/3) slides ban ke aati hain.
// Koi photo set nahi → bilkul pehle jaisa static video/logo. Photos aate hi
// har 3.5s me apne aap slide hota hai.
export default function HeroMedia() {
  const [video, setVideo] = useState<string | null>(null);
  const [imgs, setImgs] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    settingsApi.getAll()
      .then(r => {
        const s = r.settings ?? {};
        const valid = (v?: string) => /^(https?:\/\/|\/)/.test((v || '').trim());
        const v = (s.heroVideoUrl || '').trim();
        setVideo(valid(v) ? v : null);
        setImgs([s.heroImg1, s.heroImg2, s.heroImg3].filter(valid) as string[]);
      })
      .catch(() => {});
  }, []);

  // The logo card used to be slide 0 whenever there was no video, so the first
  // thing anyone saw of the shop was the logo on a cream card — a logo that is
  // already printed on the banner behind it, together with the tagline. It also
  // showed small: the logo is 547x300 and the box is 4:3, so "contain" left
  // cream all around it, while the uploaded banners are 1206x905, exactly 4:3,
  // and fill the box completely. With photos set, the banner leads now.
  const showFirst = Boolean(video) || imgs.length === 0;
  const slideCount = (showFirst ? 1 : 0) + imgs.length;

  // Auto-advance only when photos exist
  useEffect(() => {
    // Settings arrive after the first render, so the number of slides can shrink
    // under a position we are already on — without this the track would sit on
    // an empty frame until the next tick.
    setIdx(i => (i < slideCount ? i : 0));
    if (slideCount <= 1) return;
    const t = setInterval(() => {
      if (!paused.current) setIdx(i => (i + 1) % slideCount);
    }, 3500);
    return () => clearInterval(t);
  }, [slideCount]);

  // ── Slide 0 content: video ya logo (bilkul pehle jaisa) ──
  const firstSlide = video ? (
    <video src={video} autoPlay muted loop playsInline preload="metadata"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  ) : (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.webp?v=5" alt="Mahalaxmi Fashion Hub"
        style={{ maxWidth: '92%', maxHeight: '92%', width: 'auto', height: 'auto', objectFit: 'contain' }} />
    </div>
  );

  // Photos nahi → static, pehle jaisa hi look (logo bina box ke)
  if (imgs.length === 0) {
    if (video) {
      return (
        <div style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden', boxShadow: '0 12px 34px rgba(92,26,40,.15)' }}>
          {firstSlide}
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'clamp(150px, 20vw, 260px)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp?v=5" alt="Mahalaxmi Fashion Hub"
          style={{ maxWidth: '92%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }} />
      </div>
    );
  }

  // ── Carousel: logo/video + photos, sliding left ──
  return (
    <div
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
      style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden', position: 'relative', boxShadow: '0 12px 34px rgba(92,26,40,.15)' }}>

      {/* sliding track */}
      <div style={{
        display: 'flex', height: '100%',
        transform: `translateX(-${idx * 100}%)`,
        transition: 'transform .65s ease',
      }}>
        {showFirst && <div style={{ flex: '0 0 100%', height: '100%' }}>{firstSlide}</div>}
        {imgs.map((src, i) => (
          <div key={i} style={{ flex: '0 0 100%', height: '100%' }}>
            <Image src={src} alt={`Mahalaxmi Fashion Hub collection ${i + 1}`}
              width={1200} height={520}
              priority={!showFirst && i === 0} fetchPriority={!showFirst && i === 0 ? 'high' : undefined}
              sizes="100vw"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        ))}
      </div>

      {/* dots */}
      <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 7 }}>
        {Array.from({ length: slideCount }).map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`}
            style={{
              width: idx === i ? 22 : 9, height: 9, borderRadius: 5, border: 'none', cursor: 'pointer',
              background: idx === i ? '#fff' : 'rgba(255,255,255,.5)', transition: 'all .3s', padding: 0,
              boxShadow: '0 1px 4px rgba(0,0,0,.35)',
            }} />
        ))}
      </div>
    </div>
  );
}
