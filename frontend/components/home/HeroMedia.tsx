'use client';
import { useEffect, useState } from 'react';
import { settingsApi } from '@/lib/api';

// Right-side hero media. Plays the admin-set video (Settings → Homepage Hero → Hero Video URL);
// if no valid video is configured, shows the brand logo on a soft background as a fallback.
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

  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '4 / 3',
      borderRadius: 14, overflow: 'hidden',
      background: 'linear-gradient(135deg, #faf1de 0%, #f0dcb6 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 10px 30px rgba(92,26,40,.12)',
    }}>
      {url ? (
        <video src={url} autoPlay muted loop playsInline preload="metadata"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/logo.webp?v=4" alt="Mahalaxmi Fashion Hub"
          style={{ maxWidth: '68%', maxHeight: '68%', width: 'auto', height: 'auto', objectFit: 'contain' }} />
      )}
    </div>
  );
}
