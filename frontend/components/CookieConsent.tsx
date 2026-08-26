'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

// Cookie-consent banner (privacy compliance).
//   • Tracking (Google Analytics / Ads / Meta Pixel) starts DENIED by default via
//     Google Consent Mode set in layout.tsx.
//   • Only when the visitor clicks "Accept" do we flip consent to granted.
//   • The choice is remembered in localStorage so the banner shows only once.
const STORAGE_KEY = 'mfh_cookie_consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
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

  const decline = () => {
    // Consent stays denied (the Consent Mode default). Just remember the choice.
    save('declined');
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 1200,
        maxWidth: 560, margin: '0 auto',
        background: '#fff', border: '1px solid #eadfe2', borderRadius: 14,
        boxShadow: '0 10px 30px rgba(0,0,0,.15)',
        padding: '1rem 1.1rem',
      }}>
      <p style={{ margin: 0, fontSize: '.9rem', fontWeight: 700, color: '#1a1a1a' }}>
        🍪 We value your privacy
      </p>
      <p style={{ margin: '.35rem 0 .8rem', fontSize: '.82rem', color: '#666', lineHeight: 1.5 }}>
        We use cookies to keep the site working and, with your permission, for analytics and
        marketing to improve your shopping experience. You can accept or decline non-essential
        cookies. Read our{' '}
        <Link href="/privacy-policy" style={{ color: '#a01836', fontWeight: 600, textDecoration: 'underline' }}>
          Privacy Policy
        </Link>.
      </p>
      <div style={{ display: 'flex', gap: '.6rem' }}>
        <button
          onClick={decline}
          style={{
            flex: 1, height: 42, borderRadius: 9, background: '#fff', color: '#a01836',
            border: '1.5px solid #ddd', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer',
          }}>
          Decline
        </button>
        <button
          onClick={accept}
          style={{
            flex: 1, height: 42, borderRadius: 9, background: '#a01836', color: '#fff',
            border: 'none', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer',
          }}>
          Accept
        </button>
      </div>
    </div>
  );
}
