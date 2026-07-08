'use client';
import { useEffect, useState } from 'react';
import { settingsApi } from '@/lib/api';

// Right-side hero media. Plays the admin-set video (Settings → Homepage Hero → Hero Video URL).
// If no valid video is configured, shows the brand logo cleanly (no box/border) so it blends
// into the hero background.
export default function HeroMedia() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    settingsApi.getAll()
      .then(r => {
        const v = (r.settings?.heroVideoUrl || '').trim();
        setUrl(/^(https?:\/\/|\/)/.test(v) ? v : null);
      })
      .catch(() => {});
  }, []);

  if (url) {
    // Video fills the right side in a soft rounded frame.
    return (
      <div style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden', boxShadow: '0 12px 34px rgba(92,26,40,.15)' }}>
        <video src={url} autoPlay muted loop playsInline preload="metadata"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }

  // Logo fallback — no box, no border, blends with the hero background.
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'clamp(220px, 30vw, 420px)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.webp?v=4" alt="Mahalaxmi Fashion Hub"
        style={{ maxWidth: '92%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }} />
    </div>
  );
}
