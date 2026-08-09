'use client';
import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';
const DISMISS_KEY = 'mfh_push_dismissed_at';
const DISMISS_DAYS = 14; // don't nag: re-ask at most every 2 weeks

// VAPID public key is base64url — convert to the byte array the browser needs.
// Built over a fresh ArrayBuffer so the result is a Uint8Array<ArrayBuffer>, which
// satisfies PushManager.subscribe's `BufferSource` type on the newer TS lib
// (where a plain `Uint8Array` widens to ArrayBufferLike and fails the build).
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    // PWARegister already registers /sw.js; wait for it to be ready.
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

// Fetch the VAPID public key, subscribe via PushManager, and POST the subscription
// to the backend so the admin can broadcast to this device.
async function subscribe(): Promise<boolean> {
  const reg = await getRegistration();
  if (!reg || !reg.pushManager) return false;

  let publicKey = '';
  try {
    const r = await fetch(`${API_BASE}/push/public-key`);
    const d = await r.json();
    publicKey = (d && d.publicKey) || '';
  } catch { return false; }
  if (!publicKey) return false;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    } catch { return false; }
  }

  const json = sub.toJSON();
  try {
    await fetch(`${API_BASE}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      }),
    });
    return true;
  } catch {
    return false;
  }
}

// A small, dismissible opt-in banner for browser/app push notifications.
// - If the visitor already granted permission, we silently (re)subscribe so the
//   backend always has an up-to-date endpoint.
// - Otherwise we show a soft prompt after a short delay (once every 2 weeks).
export default function PushOptIn() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

    // Already allowed on this browser — keep the subscription fresh, no UI.
    if (Notification.permission === 'granted') {
      subscribe();
      return;
    }
    // Permanently blocked — never nag.
    if (Notification.permission === 'denied') return;

    // Respect a recent dismissal.
    try {
      const last = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (last && Date.now() - last < DISMISS_DAYS * 864e5) return;
    } catch {}

    const t = setTimeout(() => setShow(true), 9000);
    return () => clearTimeout(t);
  }, []);

  const allow = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') await subscribe();
    } catch {}
    setBusy(false);
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Enable notifications"
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)',
        bottom: 'calc(74px + env(safe-area-inset-bottom, 0px))',
        zIndex: 480, width: 'min(420px, calc(100vw - 24px))',
        background: '#fff', borderRadius: 14,
        boxShadow: '0 10px 34px rgba(92,26,40,.28)', border: '1px solid #f0e0e4',
        padding: '.9rem 1rem', display: 'flex', alignItems: 'center', gap: '.85rem',
      }}
    >
      <div style={{
        flexShrink: 0, width: 42, height: 42, borderRadius: '50%',
        background: 'linear-gradient(180deg,#7a0a22,#5c1420)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem',
      }}>🔔</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '.92rem', color: '#3a1219' }}>
          Get offers &amp; order updates
        </p>
        <p style={{ margin: '.15rem 0 0', fontSize: '.8rem', color: '#7a6b6e', lineHeight: 1.35 }}>
          Be first to know about sales, new arrivals &amp; your order status.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', flexShrink: 0 }}>
        <button onClick={allow} disabled={busy}
          style={{ background: '#7a0a22', color: '#fff', border: 'none', borderRadius: 8, padding: '.45rem .8rem', fontWeight: 700, fontSize: '.82rem', cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
          {busy ? '…' : 'Allow'}
        </button>
        <button onClick={dismiss}
          style={{ background: 'none', color: '#9a8b8e', border: 'none', fontSize: '.75rem', cursor: 'pointer', padding: 0 }}>
          Not now
        </button>
      </div>
    </div>
  );
}
