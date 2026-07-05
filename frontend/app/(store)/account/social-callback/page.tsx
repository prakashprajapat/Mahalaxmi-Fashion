'use client';
import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setToken, setCustomer } from '@/lib/auth';

function SocialCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state'); // "google" or "facebook"
    const errorParam = params.get('error');

    if (errorParam) {
      setError('Login was cancelled or denied. Please try again.');
      setStatus('error');
      return;
    }

    if (!code || !state) {
      setError('Invalid callback — missing code or provider info.');
      setStatus('error');
      return;
    }

    const redirectUri = window.location.origin + '/account/social-callback';

    fetch('/api/customers/social-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: state, code, redirectUri }),
    })
      .then(async res => {
        let data: { success?: boolean; message?: string; token?: string; customer?: unknown } = {};
        try { data = await res.json(); } catch { /* non-JSON response */ }
        if (!res.ok || !data.success) {
          throw new Error(data.message || `Login failed (${res.status}). Please try again or use email/password.`);
        }
        setToken(data.token as string);
        setCustomer(data.customer as import('@/types').Customer);
        window.dispatchEvent(new Event('auth-changed'));
        router.replace('/');
      })
      .catch(e => {
        const msg = (e as Error).message || 'Social login failed. Please try again.';
        setError(msg);
        setStatus('error');
      });
  }, [params, router]);

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
      {status === 'loading' ? (
        <>
          <div style={{ width: 48, height: 48, border: '4px solid #eee', borderTopColor: '#a7354d', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#555', fontSize: '1rem', fontWeight: 600 }}>Completing login…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      ) : (
        <>
          <p style={{ color: '#c0392b', fontSize: '1rem', fontWeight: 700 }}>Login failed</p>
          <p style={{ color: '#555', fontSize: '.9rem', textAlign: 'center', maxWidth: '380px' }}>{error}</p>
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => router.replace('/account')}
              style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.65rem 1.5rem', fontWeight: 600, cursor: 'pointer', fontSize: '.95rem' }}>
              Try Email Login
            </button>
            <button
              onClick={() => router.replace('/')}
              style={{ background: '#f5f5f5', color: '#333', border: '1px solid #ddd', borderRadius: '8px', padding: '.65rem 1.5rem', fontWeight: 600, cursor: 'pointer', fontSize: '.95rem' }}>
              Go to Home
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function SocialCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 48, height: 48, border: '4px solid #eee', borderTopColor: '#a7354d', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <SocialCallbackInner />
    </Suspense>
  );
}
