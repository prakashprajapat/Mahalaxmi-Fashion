'use client';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getCustomer, getToken, logout, setCustomer as saveCustomer, setToken } from '@/lib/auth';
import { customersApi, settingsApi } from '@/lib/api';
import type { Customer } from '@/types';

function AccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('return') || '';
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [facebookAppId, setFacebookAppId] = useState('');

  useEffect(() => {
    const c = getCustomer();
    if (c) setCustomer(c);

    settingsApi.getAll().then(r => {
      const s = r.settings ?? {};
      setGoogleClientId(s.googleClientId ?? '');
      setFacebookAppId(s.facebookAppId ?? '');
    }).catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await customersApi.login({ email: form.email, password: form.password });
      setToken(res.token);
      saveCustomer(res.customer);
      setCustomer(res.customer);
      window.dispatchEvent(new Event('auth-changed'));
      if (returnTo.startsWith('/')) router.push(returnTo);
    } catch (e) {
      setError((e as Error).message || 'Login failed. Please check your credentials.');
    } finally { setLoading(false); }
  };

  const handleLogout = () => {
    logout();
    setCustomer(null);
    window.dispatchEvent(new Event('auth-changed'));
  };

  // ── Logged-in dashboard ──────────────────────────────────────────────────────
  if (customer) return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Customer Account</p>
        <h1>My Account</h1>
        <p>Welcome back, {customer.firstName}!</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          <div className="form-card">
            <h2>Account Dashboard</h2>
            <div className="form-grid" style={{ pointerEvents: 'none' }}>
              <label>Name<input value={`${customer.firstName} ${customer.lastName}`} readOnly /></label>
              <label>Customer ID<input value={customer.customerCode || '—'} readOnly /></label>
              <label>Email<input value={customer.email ?? '—'} readOnly /></label>
              <label>Phone<input value={customer.phone} readOnly /></label>
              <label className="full-field">Address
                <input value={[customer.addrLine1, customer.addrLine2, customer.postOffice, customer.district, customer.state, customer.pincode].filter(Boolean).join(', ') || '—'} readOnly />
              </label>
              <label>Account Status
                <input value={customer.accountStatus || 'Active'} readOnly />
              </label>
            </div>
          </div>
        </section>
      </main>
    </>
  );

  // ── Login view — same design as Navbar popup ─────────────────────────────────
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const callbackUrl = `${origin}/account/social-callback`;

  return (
    <>
      <style>{`
        .mfh-account-login-wrap {
          min-height: 70vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          background: #fdf5f7;
        }
        .mfh-account-login-card {
          width: 100%;
          max-width: 680px;
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 12px 48px rgba(0,0,0,.12);
          display: grid;
          grid-template-columns: 180px 1fr;
          overflow: hidden;
        }
        .mfh-account-login-logo {
          background: linear-gradient(160deg,#7a0a22 0%,#a7354d 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.25rem;
          text-align: center;
          gap: .75rem;
        }
        .mfh-account-login-logo img {
          width: 150px; height: 150px; min-width: 150px; max-width: none;
          box-sizing: border-box; flex-shrink: 0;
          border-radius: 50%;
          border: 3px solid rgba(255,255,255,.7);
          background: #fff;
          object-fit: contain;
          padding: 12px;
        }
        .mfh-account-login-logo p { margin:0; color:#fff; font-weight:800; font-size:1rem; line-height:1.3; }
        .mfh-account-login-logo small { color:rgba(255,255,255,.7); font-size:.75rem; margin-top:.25rem; display:block; }
        .mfh-account-login-form { padding: 2rem; display:flex; flex-direction:column; gap:.9rem; }
        @media (max-width: 560px) {
          .mfh-account-login-card { grid-template-columns: 1fr; }
          .mfh-account-login-logo { flex-direction:row; padding:1rem 1.25rem; justify-content:flex-start; gap:.75rem; }
          .mfh-account-login-logo img { width:48px; height:48px; }
          .mfh-account-login-logo p { font-size:.9rem; text-align:left; }
          .mfh-account-login-logo small { display:none; }
          .mfh-account-login-form { padding:1.25rem; }
        }
      `}</style>

      <div className="mfh-account-login-wrap">
        <div className="mfh-account-login-card">

          {/* Left — branding */}
          <div className="mfh-account-login-logo">
            <img src="/logo.webp?v=4" alt="Mahalaxmi Fashion Hub" />
          </div>

          {/* Right — form */}
          <form onSubmit={handleLogin} className="mfh-account-login-form">
            <h2 style={{ margin:0, fontSize:'1.55rem', fontWeight:800, color:'#1a1a1a' }}>Welcome Back</h2>
            <p style={{ margin:'-.3rem 0 .2rem', fontSize:'.85rem', color:'#888' }}>Login to your account</p>

            <input
              type="email" required placeholder="Email" autoComplete="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              style={{ height:52, border:'1.5px solid #ddd', borderRadius:9, padding:'0 1rem', fontSize:'1rem', background:'#fff', boxSizing:'border-box' }} />

            <input
              type={showPassword ? 'text' : 'password'} required placeholder="Password" autoComplete="current-password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              style={{ height:52, border:'1.5px solid #ddd', borderRadius:9, padding:'0 1rem', fontSize:'1rem', background:'#fff', boxSizing:'border-box' }} />

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'.9rem', color:'#555' }}>
              <label style={{ display:'flex', alignItems:'center', gap:'.4rem', cursor:'pointer' }}>
                <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} />
                Show Password
              </label>
              <Link href="/forgot-password" style={{ color:'#a01836', textDecoration:'none', fontSize:'.85rem' }}>Forgot?</Link>
            </div>

            {error && <p style={{ margin:0, color:'#c0392b', fontSize:'.85rem', fontWeight:600 }}>{error}</p>}

            <button type="submit" disabled={loading}
              style={{ height:52, border:'none', borderRadius:9, background:'#a01836', color:'#fff', fontWeight:800, fontSize:'1.05rem', cursor:loading?'not-allowed':'pointer', opacity:loading?.7:1 }}>
              {loading ? 'Logging in…' : 'Login'}
            </button>

            <p style={{ margin:'.4rem 0 0', textAlign:'center', color:'#666', fontSize:'.9rem' }}>
              New customer?{' '}
              <Link href="/account/register" style={{ color:'#a01836', fontWeight:800, textDecoration:'none' }}>Create New Account</Link>
            </p>

            {/* Social login */}
            <div style={{ display:'flex', alignItems:'center', gap:'.75rem', margin:'.1rem 0' }}>
              <div style={{ flex:1, height:'1px', background:'#e0e0e0' }} />
              <span style={{ fontSize:'.78rem', color:'#aaa', whiteSpace:'nowrap' }}>or continue with</span>
              <div style={{ flex:1, height:'1px', background:'#e0e0e0' }} />
            </div>

            <div style={{ display:'flex', gap:'.6rem' }}>
              {/* Google */}
              {googleClientId ? (
                <a href={`https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=email%20profile&prompt=select_account&state=google`}
                  style={{ flex:1, height:46, borderRadius:9, background:'#fff', color:'#333', fontWeight:700, fontSize:'.85rem', textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:'.4rem', border:'1.5px solid #ddd', cursor:'pointer' }}>
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                  Google
                </a>
              ) : (
                <button type="button" disabled style={{ flex:1, height:46, borderRadius:9, background:'#f5f5f5', color:'#bbb', fontWeight:700, fontSize:'.85rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'.4rem', border:'1.5px solid #eee', cursor:'not-allowed' }}>
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#ccc" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#ccc" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#ccc" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#ccc" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                  Google
                </button>
              )}

              {/* Facebook */}
              {facebookAppId ? (
                <a href={`https://www.facebook.com/v18.0/dialog/oauth?client_id=${facebookAppId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=email,public_profile&response_type=code&state=facebook`}
                  style={{ flex:1, height:46, borderRadius:9, background:'#1877f2', color:'#fff', fontWeight:700, fontSize:'.85rem', textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:'.4rem', border:'none', cursor:'pointer' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Facebook
                </a>
              ) : (
                <button type="button" disabled style={{ flex:1, height:46, borderRadius:9, background:'#f5f5f5', color:'#bbb', fontWeight:700, fontSize:'.85rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'.4rem', border:'1.5px solid #eee', cursor:'not-allowed' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#ccc"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Facebook
                </button>
              )}

              {/* Instagram — coming soon */}
              <button type="button" disabled title="Instagram login — coming soon"
                style={{ flex:1, height:46, borderRadius:9, background:'#f5f5f5', color:'#bbb', fontWeight:700, fontSize:'.85rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'.4rem', border:'1.5px solid #eee', cursor:'not-allowed' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#ccc" stroke="none"/></svg>
                Instagram
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>}>
      <AccountContent />
    </Suspense>
  );
}
