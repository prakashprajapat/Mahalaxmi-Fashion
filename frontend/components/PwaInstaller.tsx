'use client';
import { useEffect, useState } from 'react';

/**
 * Small "Create Shortcut" button that adds the site to the home screen.
 * - Android/Chrome: uses the native install prompt (one tap).
 * - iOS/Safari: shows a tiny hint (Share → Add to Home Screen), since iOS has no install API.
 */
export default function PwaInstaller() {
  const [deferred, setDeferred] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    let dismissed = false;
    try { dismissed = localStorage.getItem('mfh_pwa_dismissed') === '1'; } catch {}
    if (standalone || dismissed) return; // already installed or user dismissed

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIos(ios);
    if (ios) setVisible(true); // iOS: show the button so the user can add manually

    const onBIP = (e: any) => { e.preventDefault(); setDeferred(e); setVisible(true); };
    window.addEventListener('beforeinstallprompt', onBIP);
    return () => window.removeEventListener('beforeinstallprompt', onBIP);
  }, []);

  const handleClick = async () => {
    if (deferred) {                 // Android — trigger the real install prompt
      deferred.prompt();
      try { await deferred.userChoice; } catch {}
      setDeferred(null); setVisible(false);
      return;
    }
    if (isIos) setShowHint(h => !h); // iOS — toggle the manual hint
  };

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem('mfh_pwa_dismissed', '1'); } catch {}
  };

  if (!visible) return null;
  return (
    <div style={{ position: 'fixed', right: 12, bottom: 78, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {showHint && isIos && (
        <div style={{ background: '#fff', color: '#333', borderRadius: 10, padding: '.55rem .7rem', fontSize: '.75rem', boxShadow: '0 4px 16px rgba(0,0,0,.18)', maxWidth: 220, lineHeight: 1.4, border: '1px solid #eee' }}>
          Tap <b>Share</b> ⬆️ then <b>Add to Home Screen</b>.
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={handleClick}
          style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: 22, padding: '.5rem .85rem', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer', boxShadow: '0 3px 12px rgba(0,0,0,.2)', whiteSpace: 'nowrap' }}>
          📲 Create Shortcut
        </button>
        <button onClick={dismiss} aria-label="Dismiss"
          style={{ background: '#fff', color: '#999', border: '1px solid #eee', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', fontSize: '.95rem', lineHeight: 1, boxShadow: '0 2px 8px rgba(0,0,0,.12)' }}>
          ×
        </button>
      </div>
    </div>
  );
}
