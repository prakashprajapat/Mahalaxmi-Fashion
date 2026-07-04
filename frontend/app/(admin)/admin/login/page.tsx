'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { setAdminToken } from '@/lib/auth';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true); setError('');
    try {
      const res = await authApi.adminLogin(email, password);
      setAdminToken(res.token);
      window.location.href = '/admin';
    } catch (e) {
      setError((e as Error).message || 'Login failed. Please check your credentials.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Private Access</p>
        <h1>Admin / Staff Login</h1>
        <p>Full admin can manage the store. Staff users can access only products and order management.</p>
      </section>

      <main className="admin-shell">
        <div className="admin-grid">
          <article className="admin-panel">
            <h2>Secure Sign In</h2>
            <div className="form-grid">
              <label className="full-field">
                Email / Username
                <input type="text" autoComplete="username" placeholder="Email or username"
                  value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} required />
              </label>
              <label className="full-field">
                Password
                <input type="password" autoComplete="current-password" placeholder="Enter password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} required />
              </label>
              {error && <p className="wiz-message full-field">{error}</p>}
              <div className="form-actions">
                <button className="button primary" type="button" onClick={handleLogin} disabled={loading}>
                  {loading ? 'Logging in…' : 'Login'}
                </button>
                <Link className="button secondary" href="/">Back to Website</Link>
              </div>
              <p style={{ textAlign: 'center', marginTop: '.75rem', fontSize: '.85rem' }}>
                <Link href="/admin/login/recover" style={{ color: '#a7354d', fontWeight: 600 }}>
                  Forgot admin password?
                </Link>
              </p>
            </div>
          </article>

          <article className="admin-panel" style={{ background: '#fdf0f3' }}>
            <h2>Access Note</h2>
            <p style={{ color: '#555', marginBottom: '.75rem', fontSize: '.92rem' }}>
              <strong>Owner access</strong> is for store settings, reports, and password management.
            </p>
            <p style={{ color: '#555', marginBottom: '.75rem', fontSize: '.92rem' }}>
              <strong>Staff access</strong> opens a limited workspace for Add Product, Product Listing, and Order Management only.
            </p>
            <p style={{ color: '#555', fontSize: '.92rem' }}>
              Use separate staff credentials so daily work can continue without sharing the full owner password.
            </p>
          </article>
        </div>
      </main>
    </>
  );
}
