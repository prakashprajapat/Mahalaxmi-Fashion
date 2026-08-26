'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

// Cookie-consent banner (privacy compliance).
//   • Tracking (Google Analytics / Ads / Meta Pixel) starts DENIED by default via
//     Google Consent Mode set in layout.tsx.
//   • Only when the visitor clicks "Accept" do we flip consent to granted.
//   • The choice is remembered in localStorage so the banner shows only once.
//   • Not shown inside the installed mobile app (TWA/PWA standalone).
const STORAGE_KEY = 'mfh_cookie_consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show inside the installed app — it runs in standalone display-mode.
    const inApp = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true
      || document.referrer.startsWith('android-app://');
    if (inApp) return;

    let choice: string | null = null;
    try { choice = localStorage.getItem(STORAGE_KEY); } catch {}
    if (!choice) setVisible(true);
  }, []);

  const save = (value: 'accepted' | 'declined') => {
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
    setVisible(false);
  };

  const accept = () => {
    const w = window as any;
    try {
      if (typeof w.gtag === 'function') {
        w.gtag('consent', 'update', {
          ad_storage: 'granted',
          analytics_storage: 'granted',
          ad_user_data: 'granted',
          ad_personalization: 'granted',
        });
      }
      if (typeof w.fbq === 'function') w.fbq('consent', 'grant');
    } catch {}
    save('accepted');
  };

  const decline = () => save('declined'); // consent stays denied (Consent Mode default)

  if (!visible) return null;

  const btn: React.CSSProperties = {
    height: 30, padding: '0 .9rem', borderRadius: 7,
    fontWeight: 700, fontSize: '.74rem', cursor: 'pointer',
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed', left: 14, bottom: 14, zIndex: 1200,
        width: 300, maxWidth: 'calc(100vw - 28px)',
        background: '#fff', border: '1px solid #eadfe2', borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,.14)',
        padding: '.7rem .8rem',
      }}>
      <p style={{ margin: 0, fontSize: '.8rem', fontWeight: 700, color: '#1a1a1a' }}>
        🍪 We value your privacy
      </p>
      <p style={{ margin: '.25rem 0 .55rem', fontSize: '.72rem', color: '#666', lineHeight: 1.45 }}>
        We use cookies for analytics &amp; a better experience. Read our{' '}
        <Link href="/privacy-policy" style={{ color: '#a01836', fontWeight: 600, textDecoration: 'underline' }}>
          Privacy Policy
        </Link>.
      </p>
      <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
        <button onClick={decline}
          style={{ ...btn, background: '#fff', color: '#a01836', border: '1.5px solid #ddd' }}>
          Decline
        </button>
        <button onClick={accept}
          style={{ ...btn, background: '#a01836', color: '#fff', border: 'none' }}>
          Accept
        </button>
      </div>
    </div>
  );
}
