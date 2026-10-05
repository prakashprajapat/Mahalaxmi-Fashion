'use client';
import { useEffect, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { isInApp } from '@/lib/inApp';
import { storage } from '@/lib/safeStorage';

const POPUP_KEY = 'mfh_popup_shown';
const POPUP_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export default function WelcomePopup() {
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [submitted, setSubmitted] = useState(false);
  // The code this popup is actually worth.
  //
  // It promised "exclusive offers" and then handed over nothing — the shopper
  // gave a name and a number and got a thank-you. Twelve of the sixteen people
  // on that list never came back, and there was nothing to come back FOR.
  //
  // Read from Settings rather than written here, so the shop can change the
  // code, or empty it to turn the offer off, without a deploy.
  const [welcomeCode, setWelcomeCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  useEffect(() => {
    // Never inside our own app (native Android shell, installed PWA or TWA).
    if (isInApp()) return;

    const stored = storage.get(POPUP_KEY);
    if (stored && Date.now() - Number(stored) < POPUP_TTL) return;
    const t = setTimeout(() => setVisible(true), 3500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible || welcomeCode) return;
    let alive = true;
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => { if (alive) setWelcomeCode((d?.settings?.welcomeCouponCode ?? '').trim()); })
      .catch(() => { /* no code, no offer shown — the popup still works */ });
    return () => { alive = false; };
  }, [visible, welcomeCode]);

  const close = () => {
    storage.set(POPUP_KEY, String(Date.now()));
    setVisible(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The number is the whole point of this popup. An email address on a lead
    // list is a maybe; a WhatsApp number is someone you can actually reach.
    const digits = form.phone.replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) { setPhoneError('Please enter your 10-digit WhatsApp number.'); return; }
    setPhoneError('');
    setLoading(true);
    try {
      await fetch('/api/popup-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, phone: digits }),
      });
      trackEvent('generate_lead', { source: 'welcome_popup' });   // GA4
    } catch { /* silent fail — popup is non-critical */ }
    setSubmitted(true);
    setLoading(false);
    // Long enough to read a code and write it down; the old 2.2s was not.
    setTimeout(close, welcomeCode ? 7000 : 2200);
  };

  if (!visible) return null;

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}>
      <style>{`
        @keyframes popupIn {
          from { opacity: 0; transform: scale(.93) translateY(18px); }
          to   { opacity: 1; transform: scale(1)  translateY(0); }
        }
        .mfh-welcome-popup {
          animation: popupIn .35s ease;
          width: 100%; max-width: 720px;
          max-height: 92vh;                 /* never taller than the screen */
          background: #fff; border-radius: 20px;
          display: grid; grid-template-columns: 260px 1fr;
          overflow: hidden; position: relative;
          box-shadow: 0 28px 80px rgba(0,0,0,.35);
        }
        .mfh-popup-content { min-height: 0; overflow-y: auto; }  /* scrolls on short screens */
        @media (max-width: 560px) {
          .mfh-welcome-popup { grid-template-columns: 1fr !important; }
          .mfh-popup-img { display: none !important; }
          .mfh-popup-content { padding: 1.5rem 1.25rem !important; justify-content: flex-start !important; }
        }
      `}</style>

      <div className="mfh-welcome-popup" onClick={e => e.stopPropagation()}>
        {/* Close */}
        <button
          onClick={close}
          aria-label="Close popup"
          style={{
            position: 'absolute', top: 12, right: 14, zIndex: 10,
            background: 'rgba(0,0,0,.18)', border: 'none', color: '#fff',
            width: 30, height: 30, borderRadius: '50%',
            fontSize: '1.1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>

        {/* Left — image panel */}
        <div className="mfh-popup-img" style={{
          background: 'linear-gradient(160deg,#722f37 0%,#722f37 100%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '2rem 1.25rem', textAlign: 'center', gap: '1rem',
        }}>
          <img src="/logo.webp?v=5" alt="Mahalaxmi Fashion Hub" width={180} height={180} loading="lazy" decoding="async"
            style={{ width: 180, height: 180, minWidth: 180, maxWidth: 'none', boxSizing: 'border-box', flexShrink: 0, borderRadius: '50%', border: '3px solid rgba(255,255,255,.7)', background: '#fff', objectFit: 'contain', padding: 14 }} />
          <div style={{
            background: 'rgba(255,255,255,.15)', borderRadius: 12,
            padding: '.75rem 1rem', marginTop: '.5rem',
          }}>
            <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: '1.4rem', lineHeight: 1 }}>
              🎉 Special
            </p>
            <p style={{ margin: '.3rem 0 0', color: 'rgba(255,255,255,.9)', fontSize: '.82rem', fontWeight: 600 }}>
              Offers &amp; Exclusive<br />Deals — Just For You!
            </p>
          </div>
        </div>

        {/* Right — form */}
        <div className="mfh-popup-content" style={{ padding: '2rem 1.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: '.75rem' }}>🎁</div>
              <h2 style={{ color: '#722f37', fontWeight: 800, margin: '0 0 .4rem' }}>Welcome to the Family!</h2>
              <p style={{ color: '#666', fontSize: '.9rem', margin: 0 }}>
                You&apos;ll be the first to know about new arrivals, offers and exclusive deals.
              </p>
              {welcomeCode && (
                <div style={{ marginTop: '1rem', padding: '.85rem 1rem', background: '#faf0f3',
                  border: '1.5px dashed #a7354d', borderRadius: 10 }}>
                  <div style={{ fontSize: '.78rem', color: '#777', marginBottom: '.25rem' }}>
                    Your code for this order
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#722f37', letterSpacing: '.08em' }}>
                    {welcomeCode}
                  </div>
                  <div style={{ fontSize: '.76rem', color: '#888', marginTop: '.3rem' }}>
                    Enter it at checkout
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <h2 style={{ margin: '0 0 .3rem', fontSize: '1.5rem', fontWeight: 800, color: '#1a1a1a' }}>
                Join Our Family 🛍️
              </h2>
              <p style={{ margin: '0 0 1.25rem', color: '#888', fontSize: '.85rem' }}>
                Get exclusive offers, new arrivals &amp; festive deals — directly on WhatsApp &amp; email.
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
                <input
                  type="text"
                  required
                  placeholder="Your Name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoComplete="name"
                  style={{
                    height: 50, border: '1.5px solid #ddd', borderRadius: 9,
                    padding: '0 1rem', fontSize: '.95rem', background: '#fafafa',
                    boxSizing: 'border-box', outline: 'none',
                  }} />

                <input
                  type="email"
                  required
                  placeholder="Your Email Address"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={{
                    height: 50, border: '1.5px solid #ddd', borderRadius: 9,
                    padding: '0 1rem', fontSize: '.95rem', background: '#fafafa',
                    boxSizing: 'border-box', outline: 'none',
                  }} />

                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <div style={{
                    height: 50, border: '1.5px solid #ddd', borderRadius: 9,
                    padding: '0 .75rem', background: '#fafafa',
                    display: 'flex', alignItems: 'center', gap: '.4rem',
                    fontSize: '.9rem', color: '#333', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    🇮🇳 +91
                  </div>
                  <input
                    type="tel"
                    required
                    placeholder="WhatsApp Number"
                    value={form.phone}
                    onChange={e => {
                      // Only digits go in, so a pasted "+91 94294 29880" does not
                      // silently become a number that is eight characters long.
                      setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }));
                      if (phoneError) setPhoneError('');
                    }}
                    maxLength={10}
                    inputMode="numeric"
                    aria-invalid={phoneError ? true : undefined}
                    style={{
                      flex: 1, height: 50, borderRadius: 9,
                      border: phoneError ? '1.5px solid #c0392b' : '1.5px solid #ddd',
                      padding: '0 1rem', fontSize: '.95rem', background: '#fafafa',
                      boxSizing: 'border-box', outline: 'none',
                    }} />
                </div>
                {phoneError && (
                  <p style={{ margin: '-.3rem 0 0', fontSize: '.8rem', color: '#c0392b', fontWeight: 600 }}>
                    {phoneError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    height: 50, border: 'none', borderRadius: 9,
                    background: '#a01836', color: '#fff',
                    fontWeight: 800, fontSize: '1rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? .7 : 1,
                  }}>
                  {loading ? 'Joining…' : 'Join Mahalaxmi Family →'}
                </button>
              </form>

              <button
                type="button"
                onClick={close}
                style={{
                  marginTop: '.75rem', background: 'none', border: 'none',
                  color: '#bbb', fontSize: '.8rem', cursor: 'pointer', textDecoration: 'underline',
                }}>
                No thanks, I&apos;ll miss out
              </button>

              {/* Small nudge to the Android app, under the dismiss link */}
              <div style={{ marginTop: '.55rem', display: 'flex', justifyContent: 'center' }}>
                <a
                  href="https://play.google.com/store/apps/details?id=com.mahalaxmifashionhub.www.twa"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '.4rem',
                    fontSize: '.76rem', fontWeight: 700, color: '#722f37',
                    textDecoration: 'none', border: '1px solid #f0dde2',
                    background: '#f7eff0', borderRadius: '999px', padding: '.32rem .75rem',
                  }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                    <rect x="6.2" y="2.4" width="11.6" height="19.2" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M10.4 18.5h3.2" />
                  </svg>
                  Get the Mahalaxmi app
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
