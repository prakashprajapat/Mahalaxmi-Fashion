'use client';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getCart, cartCount } from '@/lib/cart';
import { getCustomer, setCustomer as saveCustomer, setToken, logout } from '@/lib/auth';
import { customersApi, settingsApi } from '@/lib/api';

// Module-level settings cache — survives re-renders and SPA navigation
let _settingsCache: Record<string, string> | null = null;
let _settingsExpiry = 0;

export default function Navbar() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [cartBounce, setCartBounce] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [showWaLogin, setShowWaLogin] = useState(true);
  const [enableGoogleLogin, setEnableGoogleLogin] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [enableFacebookLogin, setEnableFacebookLogin] = useState(false);
  const [facebookAppId, setFacebookAppId] = useState('');
  const prevCountRef = useRef(0);

  useEffect(() => {
    const update = () => {
      const newCount = cartCount(getCart());
      // Bounce animation when item is added
      if (newCount > prevCountRef.current) {
        setCartBounce(true);
        setTimeout(() => setCartBounce(false), 650);
      }
      prevCountRef.current = newCount;
      setCount(newCount);
      const c = getCustomer();
      setIsLoggedIn(!!c);
      setCustomerName(c ? c.firstName : '');
    };
    update();
    window.addEventListener('cart-updated', update);
    window.addEventListener('auth-changed', update);
    return () => {
      window.removeEventListener('cart-updated', update);
      window.removeEventListener('auth-changed', update);
    };
  }, []);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, []);

  // Load login settings — cached for 5 min to avoid repeated API calls
  useEffect(() => {
    const applySettings = (s: Record<string, string>) => {
      setShowWaLogin(s.showWhatsappLogin !== 'false');
      setEnableGoogleLogin(s.enableGoogleLogin === 'true');
      setGoogleClientId(s.googleClientId ?? '');
      setEnableFacebookLogin(s.enableFacebookLogin === 'true');
      setFacebookAppId(s.facebookAppId ?? '');
    };

    // Serve from cache if still fresh
    if (_settingsCache && Date.now() < _settingsExpiry) {
      applySettings(_settingsCache);
      return;
    }

    settingsApi.getAll()
      .then(r => {
        const s = r.settings ?? {};
        _settingsCache = s;
        _settingsExpiry = Date.now() + 5 * 60 * 1000; // 5-min TTL
        applySettings(s);
      })
      .catch(() => {});
  }, []);

  const openLogin = () => {
    setMenuOpen(false);
    setLoginError('');
    setLoginOpen(true);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await customersApi.login({ email: loginForm.email, password: loginForm.password });
      setToken(res.token);
      saveCustomer(res.customer);
      setIsLoggedIn(true);
      setLoginOpen(false);
      window.dispatchEvent(new Event('auth-changed'));
    } catch (err) {
      setLoginError((err as Error).message || 'Login failed. Please check your credentials.');
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <p>Welcome to Mahalaxmi Fashion Hub!</p>
        <p>Order / Return / Exchange / Customization / Bulk Orders:{' '}
          <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer">WhatsApp +91 9429429880</a>
        </p>
      </div>

      {/* Offer Strip */}
      <section className="premium-offer-strip">
        <span>🚚 Free Shipping on orders above ₹999</span>
        <Link href="/products?bestSeller=true">Shop Now</Link>
      </section>

      {/* Header */}
      <header className="site-header">
        <nav className="policy-nav">
          <Link href="/cancellation-policy">Cancellation Policy</Link>
          <Link href="/return-policy">Return Policy</Link>
          <Link href="/return-exchange">Refund &amp; Exchange Policy</Link>
          <Link href="/privacy-policy">Privacy Policy</Link>
          <Link href="/safety-center">Safety Center</Link>
        </nav>

        <div className="brand-row">
          <Link href="/" className="brand" aria-label="Mahalaxmi Fashion Hub home">
            <span className="brand-mark">
              <img src="/logo-color.webp" alt="Mahalaxmi Fashion Hub logo" width="48" height="48" loading="eager" />
            </span>
            <span>
              <strong>Mahalaxmi Fashion Hub</strong>
              <span className="brand-tagline">Every Look, A New Experience</span>
            </span>
          </Link>

          <form className="search" role="search"
            onSubmit={e => { e.preventDefault(); if (search.trim()) router.push(`/products?q=${encodeURIComponent(search)}`); }}>
            <input
              id="searchInput"
              name="q"
              type="search"
              placeholder="Search saree, nighty, petticoat..."
              aria-label="Search products"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button type="submit">Search</button>
          </form>

          <div className="brand-actions">
            <Link className="cart-link" href="/cart" style={{ position: 'relative' }}>
              Cart{' '}
              <span className={`cart-count${cartBounce ? ' cart-bounce' : ''}`}
                style={{ display: 'inline-block', minWidth: '20px', transition: 'background .2s' }}>
                {count > 0 ? count : 0}
              </span>
            </Link>
            <style>{`
              @keyframes cartBounce {
                0%,100% { transform: scale(1); }
                30%      { transform: scale(1.5); }
                60%      { transform: scale(.85); }
                80%      { transform: scale(1.15); }
              }
              .cart-bounce { animation: cartBounce .6s ease; background: #27ae60 !important; }
            `}</style>
            {isLoggedIn ? (
              <Link className="account-cta" href="/account">My Account</Link>
            ) : (
              <button type="button" className="account-cta" onClick={openLogin}
                style={{ border: 'none', cursor: 'pointer' }}>
                Login / Signup
              </button>
            )}
          </div>
        </div>

      </header>

      {/* Department Nav — sticky independently so only icons bar stays fixed on scroll */}
      <nav className="department-nav" aria-label="Shop by department">
        {/* Hamburger button — always visible in sticky bar */}
        <button
          className="dept-nav-menu-btn"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Open menu"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '.08rem', padding: '.6rem .75rem', background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--brand)', flexShrink: 0,
            borderRight: '1px solid var(--border)', marginRight: '.25rem',
            minWidth: 52,
          }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ display: 'block', width: 20, height: 2, background: 'currentColor', borderRadius: 2 }} />
            <span style={{ display: 'block', width: 20, height: 2, background: 'currentColor', borderRadius: 2 }} />
            <span style={{ display: 'block', width: 20, height: 2, background: 'currentColor', borderRadius: 2 }} />
          </span>
          <span style={{ fontSize: '.72rem', fontWeight: 500, whiteSpace: 'nowrap', marginTop: '.15rem' }}>Menu</span>
        </button>

        {[
          { href: '/', img: '/nav-icons/home.webp', emoji: '🏠', label: 'Home' },
          { href: '/best-sellers', img: '/nav-icons/best-sellers.webp', emoji: '⭐', label: 'Best Sellers' },
          { href: '/women', img: '/nav-icons/women.webp', emoji: '👩', label: 'Women' },
          { href: '/men', img: '/nav-icons/men.webp', emoji: '👔', label: 'Men' },
          { href: '/kids', img: '/nav-icons/kids.webp', emoji: '👶', label: 'Kids' },
          { href: '/beauty', img: '/nav-icons/beauty.webp', emoji: '💄', label: 'Beauty' },
          { href: '/fabrics', img: '/nav-icons/fabrics.webp', emoji: '🧵', label: 'Fabrics' },
          { href: '/more', img: '/nav-icons/more.webp', emoji: '🛍️', label: 'More' },
        ].map(item => (
          <Link key={item.href} href={item.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", minWidth: 60 }}>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Mobile Menu Drawer */}
      {menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={() => setMenuOpen(false)} />
          <nav style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: '280px',
            background: '#fff', padding: '1.5rem 0', overflowY: 'auto',
            boxShadow: '4px 0 16px rgba(0,0,0,.15)',
          }}>
            <div style={{ padding: '0 1.25rem 1rem', borderBottom: '1px solid #eee', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: '#a7354d' }}>Mahalaxmi Fashion Hub</strong>
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#888' }}><span aria-hidden="true">✕</span></button>
            </div>

            {isLoggedIn ? (
              <div style={{ padding: '0 1.25rem 1rem', borderBottom: '1px solid #eee', marginBottom: '1rem' }}>
                <p style={{ fontSize: '.75rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.25rem' }}>My Account</p>
                {customerName && <p style={{ fontSize: '.85rem', fontWeight: 600, color: '#a7354d', marginBottom: '.5rem' }}>👋 {customerName}</p>}
                {[
                  { href: '/account', label: '🏠 Dashboard' },
                  { href: '/orders', label: '📦 My Orders' },
                  { href: '/wishlist', label: '❤️ Wishlist' },
                  { href: '/cart', label: '🛒 Cart' },
                  { href: '/account/address', label: '📍 My Address' },
                  { href: '/account/edit', label: '✏️ Edit Profile' },
                  { href: '/account/pan', label: '🪪 PAN Card' },
                  { href: '/account/newsletter', label: '📧 Newsletter' },
                  { href: '/account/saved-cards', label: '💳 Saved Cards' },
                  { href: '/account/downloads', label: '📥 Downloads' },
                  { href: '/reviews', label: '⭐ My Reviews' },
                  { href: '/tracking', label: '🚚 Track Order' },
                ].map(l => (
                  <Link key={l.href + l.label} href={l.href} onClick={() => setMenuOpen(false)}
                    style={{ display: 'block', padding: '.45rem .25rem', color: '#555', fontSize: '.9rem', textDecoration: 'none' }}>
                    {l.label}
                  </Link>
                ))}
                <div style={{ borderTop: '1px solid #f0f0f0', marginTop: '.5rem', paddingTop: '.5rem' }}>
                  <button type="button"
                    onClick={() => { logout(); setMenuOpen(false); window.dispatchEvent(new Event('auth-changed')); router.push('/account'); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.45rem .25rem', color: '#e67e22', fontSize: '.9rem', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                    🔓 Logout
                  </button>
                  <Link href="/account/deactivate" onClick={() => setMenuOpen(false)}
                    style={{ display: 'block', padding: '.4rem .25rem', color: '#c0392b', fontSize: '.82rem', textDecoration: 'none' }}>
                    ⏸️ Deactivate Account
                  </Link>
                  <Link href="/account/delete" onClick={() => setMenuOpen(false)}
                    style={{ display: 'block', padding: '.4rem .25rem', color: '#c0392b', fontSize: '.82rem', textDecoration: 'none' }}>
                    🗑️ Delete Account
                  </Link>
                </div>
              </div>
            ) : (
              <div style={{ padding: '0 1.25rem 1rem', borderBottom: '1px solid #eee', marginBottom: '1rem' }}>
                <button type="button" onClick={openLogin}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.5rem', color: '#a7354d', fontSize: '.95rem', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  🔑 Login / Signup
                </button>
                <Link href="/wishlist" onClick={() => setMenuOpen(false)}
                  style={{ display: 'block', padding: '.5rem', color: '#555', fontSize: '.9rem', textDecoration: 'none' }}>❤️ Wishlist</Link>
                <Link href="/cart" onClick={() => setMenuOpen(false)}
                  style={{ display: 'block', padding: '.5rem', color: '#555', fontSize: '.9rem', textDecoration: 'none' }}>🛒 Cart ({count})</Link>
                <Link href="/tracking" onClick={() => setMenuOpen(false)}
                  style={{ display: 'block', padding: '.5rem', color: '#555', fontSize: '.9rem', textDecoration: 'none' }}>🚚 Track Order</Link>
              </div>
            )}

            <div style={{ padding: '0 1.25rem' }}>
              <p style={{ fontSize: '.75rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>Shop by Category</p>
              {[
                { href: '/best-sellers', label: '⭐ Best Sellers' },
                { href: '/women', label: '👩 Women' },
                { href: '/men', label: '👔 Men' },
                { href: '/kids', label: '👶 Kids' },
                { href: '/beauty', label: '💄 Beauty' },
                { href: '/fabrics', label: '🧵 Fabrics' },
                { href: '/more', label: '🛍️ More' },
              ].map(l => (
                <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                  style={{ display: 'block', padding: '.5rem', color: '#333', fontSize: '.9rem', textDecoration: 'none', fontWeight: 500 }}>
                  {l.label}
                </Link>
              ))}
            </div>

            <div style={{ padding: '1rem 1.25rem 0', borderTop: '1px solid #eee', marginTop: '1rem' }}>
              <p style={{ fontSize: '.75rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>Help &amp; Policies</p>
              {[
                { href: '/cancellation-policy', label: 'Cancellation Policy' },
                { href: '/return-policy', label: 'Return Policy' },
                { href: '/return-exchange', label: 'Refund & Exchange' },
                { href: '/privacy-policy', label: 'Privacy Policy' },
                { href: '/safety-center', label: 'Safety Center' },
                { href: '/contact', label: 'Contact Us' },
              ].map(l => (
                <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                  style={{ display: 'block', padding: '.4rem', color: '#666', fontSize: '.85rem', textDecoration: 'none' }}>
                  {l.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      )}

      {loginOpen && (
        <div
          onClick={() => setLoginOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <style>{`
            .mfh-login-modal {
              width: 100%; max-width: 640px; background: #fff; border-radius: 20px;
              box-shadow: 0 24px 80px rgba(0,0,0,.3); padding: 0;
              position: relative; display: grid; grid-template-columns: 170px 1fr;
              gap: 0; align-items: stretch; overflow: hidden;
            }
            .mfh-login-logo {
              background: linear-gradient(160deg, #7a0a22 0%, #a7354d 100%);
              display: flex; flex-direction: column; align-items: center;
              justify-content: center; padding: 2rem 1.25rem; text-align: center; gap: .75rem;
            }
            .mfh-login-logo img {
              width: 90px; height: 90px; border-radius: 50%;
              border: 3px solid rgba(255,255,255,.7); background: #fff; object-fit: contain;
            }
            .mfh-login-logo p {
              margin: 0; color: #fff; font-weight: 800; font-size: 1rem; line-height: 1.3;
              letter-spacing: .01em;
            }
            .mfh-login-logo small {
              color: rgba(255,255,255,.7); font-size: .75rem; margin-top: .25rem; display: block;
            }
            .mfh-login-form { padding: 2rem 2rem; }
            @media (max-width: 520px) {
              .mfh-login-modal { grid-template-columns: 1fr !important; border-radius: 16px !important; }
              .mfh-login-logo {
                flex-direction: row !important; padding: 1rem 1.25rem !important;
                justify-content: flex-start !important; gap: .75rem !important;
              }
              .mfh-login-logo img { width: 48px !important; height: 48px !important; }
              .mfh-login-logo p { font-size: .9rem !important; text-align: left !important; }
              .mfh-login-logo small { display: none !important; }
              .mfh-login-form { padding: 1.25rem !important; }
            }
          `}</style>
          <div
            onClick={e => e.stopPropagation()}
            className="mfh-login-modal">
            <button onClick={() => setLoginOpen(false)} aria-label="Close login"
              style={{ position: 'absolute', right: 14, top: 14, background: 'rgba(0,0,0,.15)', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1, zIndex: 10, width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ×
            </button>
            <div className="mfh-login-logo">
              <img src="/logo-color.webp" alt="Mahalaxmi Fashion Hub" />
              <div>
                <p>Mahalaxmi<br />Fashion Hub</p>
                <small>Every Look, A New Experience</small>
              </div>
            </div>
            <form onSubmit={handleLogin} className="mfh-login-form" style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#1a1a1a' }}>Welcome Back</h2>
              <p style={{ margin: '-.4rem 0 .2rem', fontSize: '.85rem', color: '#888' }}>Login to your account</p>
              <input type="email" required placeholder="Email" autoComplete="email"
                value={loginForm.email}
                onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                style={{ height: 54, border: '1.5px solid #ddd', borderRadius: 9, padding: '0 1rem', fontSize: '1.05rem', background: '#fff', boxSizing: 'border-box' }} />
              <input type={showPassword ? 'text' : 'password'} required placeholder="Password" autoComplete="current-password"
                value={loginForm.password}
                onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                style={{ height: 52, border: '1.5px solid #ddd', borderRadius: 9, padding: '0 1rem', fontSize: '1.05rem', background: '#fff', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', color: '#555', fontSize: '.95rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} />
                  Show Password
                </label>
                <Link href="/forgot-password" onClick={() => setLoginOpen(false)} style={{ color: '#a01836', textDecoration: 'none' }}>Forgot?</Link>
              </div>
              {loginError && <p style={{ margin: 0, color: '#c0392b', fontSize: '.85rem', fontWeight: 600 }}>{loginError}</p>}
              <button type="submit" disabled={loginLoading}
                style={{ height: 54, border: 'none', borderRadius: 9, background: '#a01836', color: '#fff', fontWeight: 800, fontSize: '1.05rem', cursor: loginLoading ? 'not-allowed' : 'pointer', opacity: loginLoading ? .7 : 1 }}>
                {loginLoading ? 'Logging in...' : 'Login'}
              </button>
              <p style={{ margin: '.6rem 0 0', textAlign: 'center', color: '#666' }}>
                New customer? <Link href="/account/register" onClick={() => setLoginOpen(false)} style={{ color: '#a01836', fontWeight: 800, textDecoration: 'none' }}>Create New Account</Link>
              </p>

              {/* Social Login Buttons — always visible */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', margin: '.25rem 0' }}>
                <div style={{ flex: 1, height: '1px', background: '#e0e0e0' }} />
                <span style={{ fontSize: '.78rem', color: '#aaa', whiteSpace: 'nowrap' }}>or continue with</span>
                <div style={{ flex: 1, height: '1px', background: '#e0e0e0' }} />
              </div>
              <div style={{ display: 'flex', gap: '.6rem' }}>
                {/* Google */}
                {googleClientId ? (
                  <a href={`https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin + '/account/social-callback' : '')}&response_type=code&scope=email%20profile&prompt=select_account&state=google`}
                    title="Continue with Google"
                    style={{ flex: 1, height: 46, borderRadius: 9, background: '#fff', color: '#333', fontWeight: 700, fontSize: '.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem', border: '1.5px solid #ddd', cursor: 'pointer' }}>
                    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                    Google
                  </a>
                ) : (
                  <button type="button" disabled title="Google login not configured"
                    style={{ flex: 1, height: 46, borderRadius: 9, background: '#f5f5f5', color: '#bbb', fontWeight: 700, fontSize: '.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem', border: '1.5px solid #eee', cursor: 'not-allowed' }}>
                    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#ccc" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#ccc" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#ccc" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#ccc" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                    Google
                  </button>
                )}

                {/* Facebook */}
                {facebookAppId ? (
                  <a href={`https://www.facebook.com/v18.0/dialog/oauth?client_id=${facebookAppId}&redirect_uri=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin + '/account/social-callback' : '')}&scope=email,public_profile&response_type=code&state=facebook`}
                    title="Continue with Facebook"
                    style={{ flex: 1, height: 46, borderRadius: 9, background: '#1877f2', color: '#fff', fontWeight: 700, fontSize: '.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem', border: 'none', cursor: 'pointer' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    Facebook
                  </a>
                ) : (
                  <button type="button" disabled title="Facebook login not configured"
                    style={{ flex: 1, height: 46, borderRadius: 9, background: '#f5f5f5', color: '#bbb', fontWeight: 700, fontSize: '.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem', border: '1.5px solid #eee', cursor: 'not-allowed' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#ccc"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    Facebook
                  </button>
                )}

                {/* Instagram */}
                <button type="button" disabled title="Instagram login — coming soon"
                  style={{ flex: 1, height: 46, borderRadius: 9, background: 'linear-gradient(135deg,#f5f5f5,#f5f5f5)', color: '#bbb', fontWeight: 700, fontSize: '.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem', border: '1.5px solid #eee', cursor: 'not-allowed' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#ccc" stroke="none"/></svg>
                  Instagram
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );
}
