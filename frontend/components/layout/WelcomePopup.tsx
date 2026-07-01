'use client';
import { useEffect, useState } from 'react';

const POPUP_KEY = 'mfh_popup_shown';
const POPUP_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export default function WelcomePopup() {
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(POPUP_KEY);
    if (stored && Date.now() - Number(stored) < POPUP_TTL) return;
    const t = setTimeout(() => setVisible(true), 3500);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    localStorage.setItem(POPUP_KEY, String(Date.now()));
    setVisible(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/popup-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone }),
      });
    } catch { /* silent fail — popup is non-critical */ }
    setSubmitted(true);
    setLoading(false);
    setTimeout(close, 2200);
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
          background: #fff; border-radius: 20px;
          display: grid; grid-template-columns: 260px 1fr;
          overflow: hidden; position: relative;
          box-shadow: 0 28px 80px rgba(0,0,0,.35);
        }
        @media (max-width: 560px) {
          .mfh-welcome-popup { grid-template-columns: 1fr !important; }
          .mfh-popup-img { display: none !important; }
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
          background: 'linear-gradient(160deg,#7a0a22 0%,#a7354d 100%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '2rem 1.25rem', textAlign: 'center', gap: '1rem',
        }}>
          <img src="/logo.webp?v=4" alt="Mahalaxmi Fashion Hub"
            style={{ width: 200, height: 150, borderRadius: 16, border: '3px solid rgba(255,255,255,.7)', background: '#fff', objectFit: 'contain', padding: 10 }} />
          <div>
            <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: '1.1rem', lineHeight: 1.3 }}>
              Mahalaxmi<br />Fashion Hub
            </p>
            <p style={{ margin: '.4rem 0 0', color: 'rgba(255,255,255,.8)', fontSize: '.78rem' }}>
              Every Look, A New Experience
            </p>
          </div>
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
        <div style={{ padding: '2rem 1.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: '.75rem' }}>🎁</div>
              <h2 style={{ color: '#a7354d', fontWeight: 800, margin: '0 0 .4rem' }}>Welcome to the Family!</h2>
              <p style={{ color: '#666', fontSize: '.9rem', margin: 0 }}>
                You'll be the first to know about new arrivals, offers and exclusive deals.
              </p>
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
                    placeholder="WhatsApp Number"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    maxLength={10}
                    inputMode="numeric"
                    style={{
                      flex: 1, height: 50, border: '1.5px solid #ddd', borderRadius: 9,
                      padding: '0 1rem', fontSize: '.95rem', background: '#fafafa',
                      boxSizing: 'border-box', outline: 'none',
                    }} />
                </div>

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
                No thanks, I'll miss out
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
