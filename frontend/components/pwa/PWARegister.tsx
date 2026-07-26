'use client';

import { useEffect, useState } from 'react';

// PWA bootstrap (client-only):
//  1. Registers the service worker (/sw.js) so the site is installable + push-capable.
//  2. Captures the browser's install prompt and shows a tasteful, dismissible
//     "Install app" banner (only once per session, never nags).
// Works on Android/Chrome/Edge. iOS Safari has no beforeinstallprompt, so we show
// a one-line "Add to Home Screen" hint there instead.

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = 'mfh_pwa_dismissed';
const MAROON = '#7a0a22';

export default function PWARegister() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    // Register the service worker.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Already installed (standalone) → never show the banner.
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (standalone) return;

    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {}
    if (dismissed) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const onInstalled = () => {
      setShow(false);
      setIosHint(false);
    };
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari: no install prompt event — show a gentle "Add to Home Screen" hint.
    const ua = window.navigator.userAgent || '';
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|chrome/i.test(ua);
    if (isIOS && isSafari) {
      const t = setTimeout(() => setIosHint(true), 4000);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onPrompt);
        window.removeEventListener('appinstalled', onInstalled);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setShow(false);
    setIosHint(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {}
    setDeferred(null);
    setShow(false);
  };

  if (!show && !iosHint) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Mahalaxmi Fashion Hub app"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '16px',
        transform: 'translateX(-50%)',
        zIndex: 2147483000,
        width: 'calc(100% - 24px)',
        maxWidth: '460px',
        background: '#fff',
        border: '1px solid #ecd9df',
        borderRadius: '14px',
        boxShadow: '0 10px 30px rgba(0,0,0,.18)',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontFamily: 'inherit',
      }}
    >
      <img
        src="/icon-192.png"
        alt=""
        width={44}
        height={44}
        style={{ borderRadius: '10px', flex: '0 0 auto' }}
      />
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: MAROON, fontSize: '.95rem', lineHeight: 1.2 }}>
          Install Mahalaxmi App
        </div>
        <div style={{ color: '#555', fontSize: '.8rem', lineHeight: 1.35, marginTop: '2px' }}>
          {iosHint
            ? 'Tap the Share icon, then “Add to Home Screen”.'
            : 'Faster shopping, works offline, one-tap access.'}
        </div>
      </div>
      {!iosHint && (
        <button
          onClick={install}
          style={{
            flex: '0 0 auto',
            background: MAROON,
            color: '#fff',
            border: 'none',
            borderRadius: '999px',
            padding: '.5rem 1rem',
            fontWeight: 700,
            fontSize: '.85rem',
            cursor: 'pointer',
          }}
        >
          Install
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          flex: '0 0 auto',
          background: 'transparent',
          border: 'none',
          color: '#999',
          fontSize: '1.25rem',
          lineHeight: 1,
          cursor: 'pointer',
          padding: '2px 4px',
        }}
      >
        ×
      </button>
    </div>
  );
}
