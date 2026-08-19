'use client';
import { useEffect, useState } from 'react';

// Their real app is an Android (Play Store) app. So:
//  • Android phones  → nudge to install the Play Store app.
//  • iPhone & desktop → no app prompt; they just use the website.
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.mahalaxmifashionhub.www.twa';

export default function PwaInstaller() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Keep the service worker registered (push notifications / offline caching).
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

    const ua = navigator.userAgent || '';
    const isAndroid = /android/i.test(ua);
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    let dismissed = false;
    try { dismissed = localStorage.getItem('mfh_app_dismissed') === '1'; } catch {}

    // Only Android phones (not already in the app, not dismissed) see the "Get the App" nudge.
    if (isAndroid && !standalone && !dismissed) setShow(true);
  }, []);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem('mfh_app_dismissed', '1'); } catch {}
  };

  if (!show) return null;
  return (
    <div style={{ position: 'fixed', right: 12, bottom: 78, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 6 }}>
      <a href={PLAY_STORE} target="_blank" rel="noopener noreferrer"
        onClick={dismiss}
        style={{ background: '#a7354d', color: '#fff', borderRadius: 22, padding: '.5rem .9rem', fontWeight: 700, fontSize: '.8rem', textDecoration: 'none', boxShadow: '0 3px 12px rgba(0,0,0,.2)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
          <path d="M3 3.5v17c0 .82.92 1.3 1.6.86l13.98-8.5c.63-.38.63-1.34 0-1.72L4.6 2.64C3.92 2.2 3 2.68 3 3.5z"/>
        </svg>
        Get the App
      </a>
      <button onClick={dismiss} aria-label="Dismiss"
        style={{ background: '#fff', color: '#999', border: '1px solid #eee', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', fontSize: '.95rem', lineHeight: 1, boxShadow: '0 2px 8px rgba(0,0,0,.12)' }}>
        ×
      </button>
    </div>
  );
}
