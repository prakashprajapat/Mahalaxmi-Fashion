'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const SITE = 'https://mahalaxmifashionhub.com';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashboardData {
  name: string;
  email?: string;
  couponCode: string;
  commissionRate: number;
  platform: string;
  phone?: string;
  socialHandle?: string;
  followersCount?: string;
  niche?: string;
  category?: string;
  totalOrders: number;
  totalSales: number;
  commissionEarned: number;
  orders: { orderId: string; total: number; status: string; placedAt: string }[];
}

// ── Brand colors ──────────────────────────────────────────────────────────────
const BRAND = '#a7354d';
const BRAND_DARK = '#6b1c30';
const BRAND_LIGHT = '#fdf2f5';

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function InfluencerPage() {
  const [tab, setTab] = useState<'home' | 'login' | 'apply' | 'dashboard'>('home');
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [copied, setCopied] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', socialHandle: '', followersCount: '', niche: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  const openProfileEdit = () => {
    if (!dashData) return;
    setProfileForm({
      name: dashData.name ?? '',
      phone: dashData.phone ?? '',
      socialHandle: dashData.socialHandle ?? '',
      followersCount: dashData.followersCount ?? '',
      niche: dashData.niche ?? '',
    });
    setProfileMsg('');
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    setProfileSaving(true); setProfileMsg('');
    try {
      const creds = JSON.parse(localStorage.getItem('inf_creds') ?? '{}');
      if (!creds.email || !creds.password) { setProfileMsg('Please log out and log in again to edit your profile.'); return; }
      const res = await fetch(`${API}/api/influencers/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creds.email, password: creds.password, ...profileForm }),
      });
      const d = await res.json();
      if (!res.ok) { setProfileMsg(d.message ?? 'Update failed.'); return; }
      const updated = { ...dashData, ...profileForm } as DashboardData;
      setDashData(updated);
      localStorage.setItem('inf_session', JSON.stringify(updated));
      setEditingProfile(false);
    } catch { setProfileMsg('Network error. Try again.'); }
    finally { setProfileSaving(false); }
  };

  // Restore session from localStorage, then re-fetch fresh data so the
  // dashboard (orders / sales / earnings) is always up to date — not the stale
  // snapshot saved at login time.
  useEffect(() => {
    const saved = localStorage.getItem('inf_session');
    if (saved) {
      try { const d = JSON.parse(saved); setDashData(d); setTab('dashboard'); } catch { /**/ }
    }
    const creds = localStorage.getItem('inf_creds');
    if (creds) {
      try {
        const { email, password } = JSON.parse(creds);
        if (email && password) {
          fetch(`${API}/api/influencers/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (d) { setDashData(d); localStorage.setItem('inf_session', JSON.stringify(d)); } })
            .catch(() => {});
        }
      } catch { /**/ }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch(`${API}/api/influencers/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      if (!res.ok) { const d = await res.json(); setLoginError(d.message ?? 'Login failed'); return; }
      const data = await res.json();
      localStorage.setItem('inf_session', JSON.stringify(data));
      localStorage.setItem('inf_creds', JSON.stringify({ email: loginEmail, password: loginPassword }));
      setDashData(data);
      setTab('dashboard');
    } catch { setLoginError('Network error. Try again.'); }
    finally { setLoginLoading(false); }
  };

  const handleForgot = async () => {
    if (!loginEmail.trim()) { setForgotMsg('Please enter your registered email above first.'); return; }
    setForgotLoading(true); setForgotMsg('');
    try {
      const res = await fetch(`${API}/api/influencers/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail }),
      });
      const d = await res.json();
      setForgotMsg(d.message ?? 'Request received. We will reset your password and contact you on WhatsApp shortly.');
    } catch { setForgotMsg('Network error. Try again.'); }
    finally { setForgotLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem('inf_session');
    localStorage.removeItem('inf_creds');
    setDashData(null);
    setTab('home');
    setLoginEmail('');
    setLoginPassword('');
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const affLink = dashData ? `${SITE}?ref=${dashData.couponCode}` : '';

  // ── TOP NAV ──────────────────────────────────────────────────────────────────
  const Nav = () => (
    <div style={{
      background: '#fff', borderBottom: '1px solid #f0e0e5',
      padding: '.75rem 1.5rem', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100,
      boxShadow: '0 2px 8px rgba(167,53,77,.08)',
    }}>
      <Link href="/" style={{ textDecoration: 'none' }}>
        <span style={{ fontWeight: 800, fontSize: '1.1rem', color: BRAND }}>
          Mahalaxmi <span style={{ color: '#333' }}>Fashion Hub</span>
        </span>
      </Link>
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
        {tab === 'dashboard' ? (
          <>
            <span style={{ fontSize: '.85rem', color: '#666' }}>👋 {dashData?.name}</span>
            <button onClick={handleLogout} style={{
              background: 'none', border: `1.5px solid ${BRAND}`, color: BRAND,
              borderRadius: '20px', padding: '.3rem .9rem', fontSize: '.82rem',
              cursor: 'pointer', fontWeight: 600,
            }}>Logout</button>
          </>
        ) : (
          <>
            <button onClick={() => setTab('login')} style={{
              background: 'none', border: `1.5px solid ${BRAND}`, color: BRAND,
              borderRadius: '20px', padding: '.3rem .9rem', fontSize: '.82rem',
              cursor: 'pointer', fontWeight: 600,
            }}>Creator Login</button>
            <button onClick={() => setTab('apply')} style={{
              background: BRAND, color: '#fff', border: 'none',
              borderRadius: '20px', padding: '.35rem 1rem', fontSize: '.82rem',
              cursor: 'pointer', fontWeight: 600,
            }}>Apply Now</button>
          </>
        )}
      </div>
    </div>
  );

  // ── HOME TAB ─────────────────────────────────────────────────────────────────
  if (tab === 'home') return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <Nav />

      {/* Hero — creator banner image */}
      <section style={{ width: '100%', lineHeight: 0 }}>
        <button onClick={() => setTab('login')} aria-label="Login to Creator Dashboard"
          style={{ display: 'block', width: '100%', padding: 0, margin: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
          <img src="/creator-banner.webp" alt="Mahalaxmi Creator Program — earn by recommending what you love"
            style={{ width: '100%', height: 'auto', display: 'block' }} />
        </button>
      </section>

      {/* Intro */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '3.5rem 1.5rem 1.5rem' }}>
        <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700, color: '#232f3e', margin: '0 0 1.1rem' }}>
          Mahalaxmi Creator Program — earn by recommending what you love
        </h2>
        <p style={{ fontSize: '1.02rem', color: '#444', lineHeight: 1.75, maxWidth: 920, margin: 0 }}>
          Welcome to the Mahalaxmi Fashion Hub Creator Program. We help creators, influencers and shoppers earn by recommending the products they love. Get your own referral code and link, share it with your audience, and earn a commission on every qualifying order — all tracked live in your personal dashboard. Free to join, with approval within 48 hours.
        </p>
        <div style={{ marginTop: '1.75rem', display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setTab('apply')} style={{ background: '#ffd814', color: '#1a1f36', border: '1px solid #e0a800', borderRadius: 8, padding: '.7rem 2rem', fontWeight: 700, fontSize: '.95rem', cursor: 'pointer' }}>
            Sign up for free
          </button>
          <button onClick={() => setTab('login')} style={{ background: 'none', color: BRAND, border: 'none', fontWeight: 700, fontSize: '.92rem', cursor: 'pointer', textDecoration: 'underline' }}>
            Already a creator? Sign in
          </button>
        </div>
      </section>

      {/* Steps */}
      <section style={{ padding: '4rem 1.5rem', maxWidth: 1000, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 1.9rem)', fontWeight: 800, color: '#1a1f36', textAlign: 'center', margin: '0 0 .5rem' }}>
          Start earning in 3 simple steps
        </h2>
        <p style={{ color: '#6b7280', textAlign: 'center', margin: '0 0 3rem', fontSize: '.95rem' }}>
          It only takes a few minutes to get started.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
          {[
            ['1', 'Sign up', 'Create your free creator account by filling a short application — no fees, no commitment.'],
            ['2', 'Share your link', 'Get a unique coupon code and referral link. Share it on Instagram, WhatsApp, YouTube and more.'],
            ['3', 'Earn commission', 'Earn commission on every order placed with your code. Track everything in your dashboard.'],
          ].map(([n, title, desc]) => (
            <div key={n} style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 14, padding: '2rem 1.5rem' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#ff9900', color: '#fff', fontWeight: 800, fontSize: '1.15rem', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.1rem' }}>{n}</div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1a1f36', margin: '0 0 .5rem' }}>{title}</h3>
              <p style={{ fontSize: '.9rem', color: '#5b6472', lineHeight: 1.55, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section style={{ background: '#f7f8fa', padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 1.9rem)', fontWeight: 800, color: '#1a1f36', textAlign: 'center', margin: '0 0 3rem' }}>
            Why join the Creator Program?
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
            {[
              ['💸', 'Commission on every sale', 'Earn a commission for every order made using your referral code.'],
              ['🎁', 'Exclusive coupon code', 'Your followers get a special discount — a win for everyone.'],
              ['📊', 'Real-time dashboard', 'Track your orders, sales and earnings live, anytime.'],
              ['🤝', 'Dedicated support', 'Our team helps you grow with tips and quick WhatsApp support.'],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ background: '#fff', borderRadius: 14, padding: '1.75rem 1.5rem', border: '1px solid #e8eaed' }}>
                <div style={{ fontSize: '1.8rem', marginBottom: '.75rem' }}>{icon}</div>
                <h3 style={{ fontSize: '1.02rem', fontWeight: 700, color: '#1a1f36', margin: '0 0 .4rem' }}>{title}</h3>
                <p style={{ fontSize: '.86rem', color: '#5b6472', lineHeight: 1.5, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ background: BRAND, color: '#fff', padding: '4rem 1.5rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.1rem)', fontWeight: 800, margin: '0 0 .75rem' }}>
          Ready to start earning?
        </h2>
        <p style={{ opacity: .9, fontSize: '1.02rem', margin: '0 0 2rem' }}>
          Join hundreds of creators already earning with Mahalaxmi Fashion Hub.
        </p>
        <button onClick={() => setTab('apply')} style={{ background: '#ffd814', color: '#1a1f36', border: '1px solid #e0a800', borderRadius: 8, padding: '.95rem 2.75rem', fontWeight: 800, fontSize: '1.05rem', cursor: 'pointer' }}>
          Sign up for free
        </button>
      </section>

      {/* Creator footer */}
      <footer style={{ background: '#fff', borderTop: '1px solid #e8eaed', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '.85rem' }}>
            <button onClick={() => setTab('apply')} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '.85rem', padding: 0 }}>Become a Creator</button>
            <button onClick={() => setTab('login')} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '.85rem', padding: 0 }}>Creator Login</button>
            <Link href="/terms-conditions" style={{ color: '#555', textDecoration: 'none' }}>Terms &amp; Conditions</Link>
            <Link href="/privacy-policy" style={{ color: '#555', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link href="/contact" style={{ color: '#555', textDecoration: 'none' }}>Contact Us</Link>
          </div>
          <div style={{ fontSize: '.82rem', color: '#999' }}>© {new Date().getFullYear()} Mahalaxmi Fashion Hub</div>
        </div>
      </footer>
    </div>
  );

  // ── LOGIN TAB ────────────────────────────────────────────────────────────────
  if (tab === 'login') return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <Nav />
      <div style={{ maxWidth: '420px', margin: '4rem auto', padding: '0 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>🔐</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 .5rem' }}>Creator Login</h1>
          <p style={{ color: '#888', fontSize: '.9rem' }}>Access your dashboard</p>
        </div>
        <div style={{
          background: '#fff', borderRadius: '20px', padding: '2rem',
          boxShadow: '0 4px 24px rgba(0,0,0,.08)', border: '1px solid #f0e0e5',
        }}>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div>
              <label style={{ fontSize: '.85rem', fontWeight: 700, color: '#333', display: 'block', marginBottom: '.35rem' }}>
                Registered Email
              </label>
              <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                placeholder="you@email.com" required
                style={{ width: '100%', padding: '.75rem 1rem', border: '1.5px solid #e0e0e0', borderRadius: '12px', fontSize: '.9rem', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '.85rem', fontWeight: 700, color: '#333', display: 'block', marginBottom: '.35rem' }}>
                Password
              </label>
              <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                placeholder="Your password" required
                style={{ width: '100%', padding: '.75rem 1rem', border: '1.5px solid #e0e0e0', borderRadius: '12px', fontSize: '.9rem', boxSizing: 'border-box', outline: 'none' }}
              />
              <p style={{ fontSize: '.75rem', color: '#aaa', margin: '.3rem 0 0' }}>
                The password you set when applying.
              </p>
              <button type="button" onClick={handleForgot} disabled={forgotLoading}
                style={{ background: 'none', border: 'none', color: BRAND, fontWeight: 700, fontSize: '.78rem', cursor: forgotLoading ? 'default' : 'pointer', padding: 0, marginTop: '.45rem' }}>
                {forgotLoading ? 'Sending…' : 'Forgot password?'}
              </button>
              {forgotMsg && (
                <p style={{ fontSize: '.78rem', margin: '.4rem 0 0', fontWeight: 600, color: forgotMsg.startsWith('Request') ? '#2e7d32' : '#c0392b' }}>
                  {forgotMsg}
                </p>
              )}
            </div>
            {loginError && (
              <div style={{ background: '#fce4ec', border: '1px solid #f48fb1', borderRadius: '10px', padding: '.65rem .9rem', fontSize: '.85rem', color: '#c62828', fontWeight: 600 }}>
                ❌ {loginError}
              </div>
            )}
            <button type="submit" disabled={loginLoading} style={{
              background: loginLoading ? '#ccc' : `linear-gradient(135deg, ${BRAND}, ${BRAND_DARK})`,
              color: '#fff', border: 'none', borderRadius: '12px',
              padding: '.85rem', fontWeight: 700, fontSize: '1rem',
              cursor: loginLoading ? 'not-allowed' : 'pointer',
              boxShadow: loginLoading ? 'none' : '0 4px 14px rgba(167,53,77,.3)',
            }}>
              {loginLoading ? '⏳ Checking…' : '🚀 Open Dashboard'}
            </button>
          </form>
        </div>
        <p style={{ textAlign: 'center', color: '#888', fontSize: '.82rem', marginTop: '1.5rem' }}>
          Not a creator yet?{' '}
          <button onClick={() => setTab('apply')} style={{ background: 'none', border: 'none', color: BRAND, fontWeight: 700, cursor: 'pointer', fontSize: '.82rem' }}>
            Apply now
          </button>
        </p>
      </div>
    </div>
  );

  // ── APPLY TAB ────────────────────────────────────────────────────────────────
  if (tab === 'apply') return <ApplyForm onBack={() => setTab('home')} />;

  // ── DASHBOARD TAB ────────────────────────────────────────────────────────────
  if (tab === 'dashboard' && dashData) return (
    <div style={{ minHeight: '100vh', background: '#f7f7f9' }}>
      <Nav />

      {/* Welcome Banner */}
      <div style={{
        background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
        padding: '2.5rem 1.5rem 3.5rem', color: '#fff',
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontSize: '1.8rem', marginBottom: '.4rem' }}>👋</div>
          <h1 style={{ fontSize: 'clamp(1.3rem, 4vw, 1.8rem)', fontWeight: 800, margin: '0 0 .4rem' }}>
            Welcome, {dashData.name}!
          </h1>
          <p style={{ opacity: .85, fontSize: '.9rem' }}>
            Your {dashData.commissionRate}% commission rate is active • {dashData.platform} Creator
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '-1.5rem auto 2rem', padding: '0 1.5rem' }}>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { icon: '🛍️', label: 'Total Orders', value: dashData.totalOrders.toString(), textColor: '#2e7d32' },
            { icon: '💰', label: 'Total Sales', value: `₹${dashData.totalSales.toLocaleString('en-IN')}`, textColor: '#e65100' },
            { icon: '🎉', label: 'Commission Earned', value: `₹${dashData.commissionEarned.toLocaleString('en-IN')}`, textColor: BRAND },
            { icon: '📊', label: 'Commission Rate', value: `${dashData.commissionRate}%`, textColor: '#1565c0' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 2px 10px rgba(0,0,0,.06)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '.4rem' }}>{s.icon}</div>
              <div style={{ fontSize: '.75rem', color: '#888', marginBottom: '.2rem', fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: s.textColor }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* My Profile */}
        <div style={{ background: '#fff', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,.06)', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#1a1a1a' }}>👤 My Profile</h2>
            {!editingProfile && (
              <button onClick={openProfileEdit} style={{ background: BRAND_LIGHT, color: BRAND, border: `1.5px solid ${BRAND}`, borderRadius: '10px', padding: '.5rem 1rem', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>✏️ Edit Profile</button>
            )}
          </div>

          {!editingProfile ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.85rem', marginTop: '1.1rem', fontSize: '.85rem' }}>
              <div><div style={{ color: '#999', fontSize: '.72rem', fontWeight: 700 }}>Name</div><div style={{ fontWeight: 600 }}>{dashData.name}</div></div>
              <div><div style={{ color: '#999', fontSize: '.72rem', fontWeight: 700 }}>Email</div><div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{dashData.email ?? '—'}</div></div>
              <div><div style={{ color: '#999', fontSize: '.72rem', fontWeight: 700 }}>Phone</div><div style={{ fontWeight: 600 }}>{dashData.phone ?? '—'}</div></div>
              <div><div style={{ color: '#999', fontSize: '.72rem', fontWeight: 700 }}>Platform</div><div style={{ fontWeight: 600 }}>{dashData.platform}</div></div>
              <div><div style={{ color: '#999', fontSize: '.72rem', fontWeight: 700 }}>Handle</div><div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{dashData.socialHandle ?? '—'}</div></div>
              <div><div style={{ color: '#999', fontSize: '.72rem', fontWeight: 700 }}>Followers</div><div style={{ fontWeight: 600 }}>{dashData.followersCount ?? '—'}</div></div>
              <div style={{ gridColumn: '1 / -1' }}><div style={{ color: '#999', fontSize: '.72rem', fontWeight: 700 }}>About / Niche</div><div style={{ fontWeight: 600 }}>{dashData.niche ?? '—'}</div></div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem', marginTop: '1.1rem' }}>
              <div>
                <label style={{ fontSize: '.78rem', fontWeight: 700, display: 'block', marginBottom: '.3rem', color: '#555' }}>Name</label>
                <input value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', padding: '.6rem .8rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '.78rem', fontWeight: 700, display: 'block', marginBottom: '.3rem', color: '#555' }}>Phone</label>
                <input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                  style={{ width: '100%', padding: '.6rem .8rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '.78rem', fontWeight: 700, display: 'block', marginBottom: '.3rem', color: '#555' }}>Social Handle</label>
                <input value={profileForm.socialHandle} onChange={e => setProfileForm(f => ({ ...f, socialHandle: e.target.value }))}
                  style={{ width: '100%', padding: '.6rem .8rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '.78rem', fontWeight: 700, display: 'block', marginBottom: '.3rem', color: '#555' }}>Followers</label>
                <input value={profileForm.followersCount} onChange={e => setProfileForm(f => ({ ...f, followersCount: e.target.value }))}
                  style={{ width: '100%', padding: '.6rem .8rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '.78rem', fontWeight: 700, display: 'block', marginBottom: '.3rem', color: '#555' }}>About / Niche</label>
                <textarea value={profileForm.niche} onChange={e => setProfileForm(f => ({ ...f, niche: e.target.value }))} rows={2}
                  style={{ width: '100%', padding: '.6rem .8rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '.9rem', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <p style={{ fontSize: '.75rem', color: '#999', margin: 0 }}>Email, coupon code and commission rate are managed by admin and can&apos;t be changed here.</p>
              {profileMsg && <p style={{ fontSize: '.82rem', margin: 0, color: '#c0392b' }}>{profileMsg}</p>}
              <div style={{ display: 'flex', gap: '.6rem' }}>
                <button onClick={saveProfile} disabled={profileSaving} style={{ flex: 1, background: profileSaving ? '#ccc' : BRAND, color: '#fff', border: 'none', borderRadius: '10px', padding: '.7rem', fontWeight: 700, cursor: profileSaving ? 'not-allowed' : 'pointer' }}>{profileSaving ? 'Saving…' : '💾 Save Profile'}</button>
                <button onClick={() => setEditingProfile(false)} style={{ background: '#f0f0f0', color: '#555', border: 'none', borderRadius: '10px', padding: '.7rem 1.2rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Affiliate Link & Code */}
        <div style={{ background: '#fff', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,.06)', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem', color: '#1a1a1a' }}>
            🔗 Your Affiliate Link & Code
          </h2>

          {/* Coupon Code */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <div style={{ fontSize: '.72rem', color: '#888', fontWeight: 700, marginBottom: '.3rem', textTransform: 'uppercase' }}>Coupon Code</div>
              <div style={{
                background: BRAND_LIGHT, border: `2px dashed ${BRAND}`, borderRadius: '12px',
                padding: '.75rem 1rem', fontFamily: 'monospace', fontSize: '1.3rem',
                fontWeight: 900, color: BRAND, letterSpacing: '3px',
              }}>
                {dashData.couponCode}
              </div>
            </div>
            <button onClick={() => copy(dashData.couponCode, 'code')} style={{
              background: copied === 'code' ? '#e8f5e9' : BRAND_LIGHT,
              color: copied === 'code' ? '#2e7d32' : BRAND,
              border: `1.5px solid ${copied === 'code' ? '#66bb6a' : BRAND}`,
              borderRadius: '12px', padding: '.65rem 1rem', fontWeight: 700,
              fontSize: '.85rem', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {copied === 'code' ? '✅ Copied!' : '📋 Copy Code'}
            </button>
          </div>

          {/* Affiliate Link */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '.72rem', color: '#888', fontWeight: 700, marginBottom: '.3rem', textTransform: 'uppercase' }}>Affiliate Link</div>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{
                flex: 1, minWidth: '200px', background: '#f5f5f5', border: '1.5px solid #e0e0e0',
                borderRadius: '10px', padding: '.6rem .85rem', fontSize: '.8rem',
                color: '#555', fontFamily: 'monospace', wordBreak: 'break-all',
              }}>
                {affLink}
              </div>
              <button onClick={() => copy(affLink, 'link')} style={{
                background: copied === 'link' ? '#e8f5e9' : '#f0f4ff',
                color: copied === 'link' ? '#2e7d32' : '#1565c0',
                border: `1.5px solid ${copied === 'link' ? '#66bb6a' : '#90caf9'}`,
                borderRadius: '10px', padding: '.6rem .9rem', fontWeight: 700,
                fontSize: '.82rem', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                {copied === 'link' ? '✅ Copied!' : '📋 Copy'}
              </button>
            </div>
          </div>

          {/* Share Buttons */}
          <div>
            <div style={{ fontSize: '.72rem', color: '#888', fontWeight: 700, marginBottom: '.5rem', textTransform: 'uppercase' }}>Share</div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`👗 Shop at Mahalaxmi Fashion Hub!\n\n🛍️ Click here: ${affLink}\n\n💥 Discount code: ${dashData.couponCode}\n\n✨ Ethnic, western and trendy fashion — all in one place!`)}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  background: '#25D366', color: '#fff', textDecoration: 'none',
                  borderRadius: '10px', padding: '.55rem 1rem', fontWeight: 700,
                  fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: '.4rem',
                }}
              >
                📱 WhatsApp Share
              </a>
              <button onClick={() => {
                copy(`👗 Shop at Mahalaxmi Fashion Hub!\n\nUse my code: ${dashData.couponCode} 💥 for a discount\n\n🛍️ Link: ${affLink}`, 'caption');
              }} style={{
                background: copied === 'caption' ? '#e8f5e9' : '#f5f0ff',
                color: copied === 'caption' ? '#2e7d32' : '#6b21a8',
                border: `1.5px solid ${copied === 'caption' ? '#66bb6a' : '#d8b4fe'}`,
                borderRadius: '10px', padding: '.55rem 1rem', fontWeight: 700,
                fontSize: '.82rem', cursor: 'pointer',
              }}>
                {copied === 'caption' ? '✅ Copied!' : '📸 Copy Insta Caption'}
              </button>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(affLink)}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  background: '#1877F2', color: '#fff', textDecoration: 'none',
                  borderRadius: '10px', padding: '.55rem 1rem', fontWeight: 700,
                  fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: '.4rem',
                }}
              >
                📘 Facebook
              </a>
            </div>
          </div>
        </div>

        {/* How to Share Tips */}
        <div style={{ background: '#fff', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,.06)', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem', color: '#1a1a1a' }}>
            💡 How to Share — Tips
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {[
              {
                icon: '📸', title: 'Instagram Reels / Stories',
                tips: [
                  'Create a photo/video of the product',
                  'Mention the code: ' + dashData.couponCode + ' in the caption',
                  'Add your affiliate link in the bio',
                ],
              },
              {
                icon: '📱', title: 'WhatsApp Status / Groups',
                tips: [
                  'Share the product photo',
                  '"Use code: ' + dashData.couponCode + '" in the caption',
                  'Share the direct link from above',
                ],
              },
              {
                icon: '▶️', title: 'YouTube / Facebook Video',
                tips: [
                  'Make a haul or try-on video',
                  'Add the link in the description',
                  'Pinned comment: "Code: ' + dashData.couponCode + '"',
                ],
              },
            ].map(tip => (
              <div key={tip.title} style={{ background: BRAND_LIGHT, borderRadius: '14px', padding: '1.1rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '.4rem' }}>{tip.icon}</div>
                <div style={{ fontWeight: 700, fontSize: '.88rem', marginBottom: '.5rem', color: '#1a1a1a' }}>{tip.title}</div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#555', fontSize: '.78rem', lineHeight: 1.7 }}>
                  {tip.tips.map(t => <li key={t}>{t}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Order History */}
        <div style={{ background: '#fff', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,.06)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem', color: '#1a1a1a' }}>
            📋 Orders — Placed With Your Code
          </h2>
          {dashData.orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#aaa' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>📦</div>
              <div style={{ fontWeight: 600, marginBottom: '.3rem', color: '#999' }}>No orders yet</div>
              <div style={{ fontSize: '.82rem' }}>Share your link — orders will appear here when someone buys</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f5f5f5' }}>
                    {['Order ID', 'Amount', 'Commission', 'Status', 'Date'].map(h => (
                      <th key={h} style={{ padding: '.65rem .75rem', textAlign: 'left', fontWeight: 700, color: '#888', fontSize: '.75rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashData.orders.map((o, i) => (
                    <tr key={o.orderId} style={{ borderBottom: i < dashData.orders.length - 1 ? '1px solid #f5f5f5' : undefined }}>
                      <td style={{ padding: '.65rem .75rem', fontFamily: 'monospace', fontSize: '.78rem', color: '#555' }}>{o.orderId}</td>
                      <td style={{ padding: '.65rem .75rem', fontWeight: 600 }}>₹{o.total.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '.65rem .75rem', fontWeight: 700, color: '#2e7d32' }}>
                        ₹{(o.total * dashData.commissionRate / 100).toFixed(0)}
                      </td>
                      <td style={{ padding: '.65rem .75rem' }}>
                        <span style={{
                          background: o.status === 'Delivered' ? '#e8f5e9' : o.status === 'Processing' ? '#fff3e0' : '#f5f5f5',
                          color: o.status === 'Delivered' ? '#2e7d32' : o.status === 'Processing' ? '#e65100' : '#666',
                          padding: '.2rem .55rem', borderRadius: '10px', fontSize: '.75rem', fontWeight: 700,
                        }}>{o.status}</span>
                      </td>
                      <td style={{ padding: '.65rem .75rem', color: '#888', whiteSpace: 'nowrap' }}>{o.placedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Help Section */}
        <div style={{ marginTop: '1.5rem', background: BRAND_LIGHT, borderRadius: '16px', padding: '1.25rem', textAlign: 'center', border: `1px solid #f0d0d9` }}>
          <div style={{ fontWeight: 700, marginBottom: '.3rem', color: '#1a1a1a' }}>💬 Need Help?</div>
          <p style={{ color: '#666', fontSize: '.85rem', margin: '0 0 .75rem' }}>WhatsApp us for commission payments, orders, or any questions</p>
          <a href="https://wa.me/919876543210" target="_blank" rel="noopener noreferrer"
            style={{ background: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: '20px', padding: '.5rem 1.2rem', fontWeight: 700, fontSize: '.85rem' }}>
            📱 WhatsApp Support
          </a>
        </div>
      </div>
    </div>
  );

  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// APPLY FORM COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
function ApplyForm({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', socialHandle: '',
    platform: 'Instagram', followersCount: '', category: '', niche: '', password: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/influencers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setResult({ ok: res.ok, msg: data.message ?? (res.ok ? 'Submitted!' : 'Error. Try again.') });
    } catch { setResult({ ok: false, msg: 'Network error. Try again.' }); }
    finally { setSubmitting(false); }
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '.7rem .9rem', border: '1.5px solid #e0e0e0',
    borderRadius: '12px', fontSize: '.9rem', outline: 'none',
    fontFamily: 'inherit', background: '#fafafa', boxSizing: 'border-box',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontWeight: 700, fontSize: '.82rem', color: '#444', marginBottom: '.3rem',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <div style={{
        background: '#fff', borderBottom: '1px solid #f0e0e5',
        padding: '.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem',
        position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(167,53,77,.08)',
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: '.9rem' }}>
          ← Back
        </button>
        <span style={{ fontWeight: 800, color: BRAND }}>Creator Application</span>
      </div>

      <div style={{ maxWidth: '620px', margin: '0 auto', padding: '2.5rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>📝</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 .5rem' }}>Become a Creator</h1>
          <p style={{ color: '#888', fontSize: '.9rem' }}>Fill in your details — our team will contact you within 2-3 days</p>
        </div>

        {result ? (
          <div style={{
            padding: '2.5rem', borderRadius: '20px', textAlign: 'center',
            background: result.ok ? '#f0fdf4' : '#fff5f5',
            border: `1.5px solid ${result.ok ? '#86efac' : '#fca5a5'}`,
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>{result.ok ? '🎉' : '❌'}</div>
            <p style={{ fontWeight: 700, color: result.ok ? '#166534' : '#991b1b', margin: '0 0 .5rem', fontSize: '1.1rem' }}>
              {result.ok ? 'Application Submitted!' : 'Something Went Wrong'}
            </p>
            <p style={{ color: '#555', fontSize: '.88rem', margin: '0 0 1.5rem' }}>{result.msg}</p>
            {result.ok && (
              <p style={{ color: '#555', fontSize: '.85rem', marginBottom: '1.5rem' }}>
                📧 We&apos;ll contact you by email or WhatsApp within 2-3 business days.
              </p>
            )}
            <button onClick={onBack} style={{
              background: BRAND, color: '#fff', border: 'none', borderRadius: '20px',
              padding: '.65rem 1.5rem', fontWeight: 700, cursor: 'pointer',
            }}>
              ← Back to Home
            </button>
          </div>
        ) : (
          <div style={{
            background: '#fff', borderRadius: '20px', padding: '2rem',
            boxShadow: '0 4px 24px rgba(0,0,0,.06)', border: '1px solid #f0e0e5',
          }}>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={lbl}>Full Name <span style={{ color: BRAND }}>*</span></label>
                  <input style={inp} placeholder="Your name" value={form.name}
                    onChange={e => set('name', e.target.value)} required />
                </div>
                <div>
                  <label style={lbl}>Email <span style={{ color: BRAND }}>*</span></label>
                  <input type="email" style={inp} placeholder="you@email.com" value={form.email}
                    onChange={e => set('email', e.target.value)} required />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={lbl}>WhatsApp / Phone</label>
                  <input style={inp} placeholder="+91 98765 43210" value={form.phone}
                    onChange={e => set('phone', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Primary Platform</label>
                  <select style={inp} value={form.platform} onChange={e => set('platform', e.target.value)}>
                    {['Instagram', 'YouTube', 'Facebook', 'Pinterest', 'Other'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={lbl}>Social Handle / URL</label>
                  <input style={inp} placeholder="@your_handle" value={form.socialHandle}
                    onChange={e => set('socialHandle', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Approx. Followers</label>
                  <select style={inp} value={form.followersCount} onChange={e => set('followersCount', e.target.value)}>
                    <option value="">Select range</option>
                    {['1K–5K', '5K–10K', '10K–50K', '50K–1L', '1L–5L', '5L+'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Content Category</label>
                <select style={inp} value={form.category} onChange={e => set('category', e.target.value)}>
                  <option value="">Select a category</option>
                  {['Fashion & Style', 'Ethnic Wear', 'Beauty & Makeup', 'Lifestyle', 'Saree Lover', 'Mom & Family', 'Other'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Tell us about your content</label>
                <textarea style={{ ...inp, minHeight: '90px', resize: 'vertical' }}
                  placeholder="What content do you create? Who is your audience? Why do you want to work with Mahalaxmi?"
                  value={form.niche} onChange={e => set('niche', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Create a Password <span style={{ color: BRAND }}>*</span></label>
                <input type="password" style={inp} placeholder="Choose a password for your dashboard login"
                  value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} />
                <p style={{ fontSize: '.72rem', color: '#aaa', margin: '.3rem 0 0' }}>
                  You&apos;ll log in to your creator dashboard with your email + this password.
                </p>
              </div>
              <button type="submit" disabled={submitting} style={{
                padding: '.9rem', borderRadius: '14px', border: 'none',
                background: submitting ? '#ccc' : `linear-gradient(135deg, ${BRAND}, ${BRAND_DARK})`,
                color: '#fff', fontWeight: 800, fontSize: '1rem',
                cursor: submitting ? 'not-allowed' : 'pointer',
                boxShadow: submitting ? 'none' : '0 4px 14px rgba(167,53,77,.35)',
                marginTop: '.5rem',
              }}>
                {submitting ? '⏳ Submitting…' : '🚀 Apply Now'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
