'use client';
import { useEffect, useState } from 'react';

/**
 * Registers the service worker and shows an "Add to Home Screen" prompt.
 * - Android/Chrome: uses the native beforeinstallprompt → one-tap Install.
 * - iOS/Safari: shows a hint to use Share → Add to Home Screen (no native prompt exists).
 */
export default function PwaInstaller() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const onBIP = (e: any) => { e.preventDefault(); setDeferred(e); setShow(true); };
    window.addEventListener('beforeinstallprompt', onBIP);

    // iOS has no beforeinstallprompt — show a manual hint (unless already installed / dismissed).
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    let dismissed = false;
    try { dismissed = localStorage.getItem('mfh_pwa_dismissed') === '1'; } catch {}
    if (isIos && !isStandalone && !dismissed) { setIosHint(true); setShow(true); }

    return () => window.removeEventListener('beforeinstallprompt', onBIP);
  }, []);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    setDeferred(null); setShow(false);
  };
  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem('mfh_pwa_dismissed', '1'); } catch {}
  };

  if (!show) return null;
  return (
    <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 16, zIndex: 1000, background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,.18)', borderRadius: 12, padding: '.7rem .9rem', display: 'flex', alignItems: 'center', gap: '.75rem', maxWidth: '92%', border: '1px solid #eee' }}>
      <img src="/icon-192.png" alt="" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
      {iosHint ? (
        <span style={{ fontSize: '.82rem', color: '#333' }}>Install the app: tap <b>Share</b> ⬆️ then <b>Add to Home Screen</b>.</span>
      ) : (
        <span style={{ fontSize: '.85rem', color: '#333', fontWeight: 600 }}>Add Mahalaxmi to your home screen</span>
      )}
      {!iosHint && (
        <button onClick={install} style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: 8, padding: '.45rem .9rem', fontWeight: 700, cursor: 'pointer', fontSize: '.82rem', whiteSpace: 'nowrap' }}>Install</button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
    </div>
  );
}
