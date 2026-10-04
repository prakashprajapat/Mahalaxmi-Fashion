'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getToken, getKnownName } from '@/lib/auth';
import { isInApp } from '@/lib/inApp';
import { storage } from '@/lib/safeStorage';
import { trackEvent } from '@/lib/analytics';

// The app opens on a signed-out shop.
//
// "Join Our Family" is switched off inside the app on purpose — it is a
// browser's nudge, and asking someone who has already installed the app to
// join is the wrong sentence. But switching it off left nothing in its place:
// the app opened on a signed-out catalogue, with the Login button sitting
// quietly in the header, and a customer who HAD an account went on browsing as
// a stranger — no saved address, no wallet, no order history, and no welcome
// code for the ones who had no account at all.
//
// So the app gets its own greeting instead. Someone who has signed in on this
// phone before is welcomed back by name; someone who never has is told, in one
// line, what an account is actually worth.
const SNOOZE_KEY = 'mfh_app_login_prompt';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;   // asked again after three days, not every launch

// Pages where this would be in the way: anything under /account (the login form
// lives on /account itself, with register and the rest beneath it), the password
// reset, and checkout, which does its own asking at the right moment.
const QUIET_PATHS = ['/account', '/forgot-password', '/checkout', '/admin'];

export default function AppLoginPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [offer, setOffer] = useState('');

  useEffect(() => {
    if (!isInApp()) return;                                   // browser tabs keep the join popup
    if (getToken()) return;                                   // already signed in
    if (QUIET_PATHS.some(p => (pathname ?? '').startsWith(p))) return;

    const snoozed = storage.get(SNOOZE_KEY);
    if (snoozed && Date.now() - Number(snoozed) < SNOOZE_MS) return;

    setName(getKnownName());
    const t = setTimeout(() => setVisible(true), 1200);       // let the first screen paint first
    return () => clearTimeout(t);
  }, [pathname]);

  // What a new account is worth, in the shop's own words. Read from Settings so
  // the code can change without a deploy; blank means no offer is claimed.
  useEffect(() => {
    if (!visible || name || offer) return;
    let alive = true;
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => { if (alive) setOffer((d?.settings?.welcomeCouponCode ?? '').trim()); })
      .catch(() => { /* no offer line, the prompt still works */ });
    return () => { alive = false; };
  }, [visible, name, offer]);

  if (!visible) return null;

  const dismiss = () => {
    storage.set(SNOOZE_KEY, String(Date.now()));
    setVisible(false);
    trackEvent('app_login_prompt_dismissed', { returning: name ? 1 : 0 });
  };

  const went = (where: string) => {
    storage.set(SNOOZE_KEY, String(Date.now()));
    setVisible(false);
    trackEvent('app_login_prompt_click', { to: where });
  };

  const returning = Boolean(name);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mfh-applogin-t"
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(30,22,20,.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 env(safe-area-inset-bottom)',
      }}
    >
      {/* A sheet from the bottom, not a box in the middle: a thumb reaches the
          buttons without the hand moving. */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: '#fff',
          borderRadius: '18px 18px 0 0', padding: '1.5rem 1.35rem 1.75rem',
          boxShadow: '0 -8px 40px rgba(0,0,0,.25)',
          animation: 'mfhAppLoginUp .28s ease-out',
        }}
      >
        <style>{`@keyframes mfhAppLoginUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

        <div style={{ width: 38, height: 4, borderRadius: 4, background: '#e6ded9', margin: '0 auto .95rem' }} />

        <div style={{ textAlign: 'center' }}>
          <img src="/logo.webp?v=5" alt="" width={64} height={64} loading="lazy" decoding="async"
               style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'contain',
                        border: '2px solid #f0e6e8', padding: 6, background: '#fff' }} />

          <h2 id="mfh-applogin-t" style={{ margin: '.7rem 0 .3rem', color: '#722f37', fontSize: '1.3rem', fontWeight: 800 }}>
            {returning ? `Welcome back, ${name}!` : 'Welcome to Mahalaxmi'}
          </h2>

          <p style={{ margin: 0, color: '#6b615c', fontSize: '.88rem', lineHeight: 1.55 }}>
            {returning
              ? 'Log in to see your orders, your saved address and your wallet.'
              : offer
                ? 'Make an account and your welcome code is yours straight away — along with your saved address, wallet and order tracking.'
                : 'Make an account to track your orders, save your address and keep your wishlist.'}
          </p>
        </div>

        <div style={{ display: 'grid', gap: '.6rem', marginTop: '1.25rem' }}>
          <Link
            href={returning ? '/account' : '/account/register'}
            onClick={() => went(returning ? 'login' : 'register')}
            style={{
              display: 'block', textAlign: 'center', background: '#a7354d', color: '#fff',
              padding: '.85rem 1rem', borderRadius: 10, fontWeight: 700, textDecoration: 'none',
              fontSize: '.95rem',
            }}
          >
            {returning ? 'Log in' : 'Create my account'}
          </Link>

          <Link
            href={returning ? '/account/register' : '/account'}
            onClick={() => went(returning ? 'register' : 'login')}
            style={{
              display: 'block', textAlign: 'center', background: '#fff', color: '#722f37',
              border: '1.5px solid #e8d9dd', padding: '.8rem 1rem', borderRadius: 10,
              fontWeight: 700, textDecoration: 'none', fontSize: '.92rem',
            }}
          >
            {returning ? 'Use a different account' : 'I already have an account'}
          </Link>

          <button
            onClick={dismiss}
            style={{
              background: 'none', border: 'none', color: '#9a908a', fontSize: '.85rem',
              padding: '.5rem', cursor: 'pointer', fontWeight: 600,
            }}
          >
            Keep browsing
          </button>
        </div>
      </div>
    </div>
  );
}
