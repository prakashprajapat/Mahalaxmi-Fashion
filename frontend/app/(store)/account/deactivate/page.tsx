'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCustomer, getToken, logout, setCustomer as saveCustomer } from '@/lib/auth';
import { customersApi } from '@/lib/api';

const REASONS = ['Too many emails', 'Taking a break', 'Found a better store', 'Quality issues', 'Other'];

export default function DeactivatePage() {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getCustomer()) { router.push('/account'); }
  }, [router]);

  const handleSubmit = async () => {
    if (!reason) { setError('Please select a reason.'); return; }
    setLoading(true); setError('');
    try {
      const customer = getCustomer();
      if (!customer) throw new Error('Please login again.');
      const res = await customersApi.deactivate(customer.id, reason, getToken() ?? '');
      saveCustomer(res.customer);
      setSubmitted(true);
      setTimeout(() => { logout(); router.push('/'); }, 3000);
    } catch (e) {
      setError((e as Error).message || 'Failed to deactivate. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">My Account</p>
        <h1>Deactivate Account</h1>
        <p>Temporarily deactivate your Mahalaxmi Fashion Hub account.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          {submitted ? (
            <div className="form-card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏸️</div>
              <h2 style={{ color: '#e67e22' }}>Account Deactivated</h2>
              <p style={{ color: '#666', marginTop: '.5rem' }}>Your account has been deactivated. You will be logged out shortly.</p>
            </div>
          ) : (
            <div className="form-card">
              <div style={{ background: '#fff3cd', border: '1.5px solid #ffc107', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                <strong style={{ color: '#856404' }}>⚠️ Warning</strong>
                <p style={{ fontSize: '.9rem', color: '#856404', marginTop: '.35rem' }}>
                  Deactivating your account will hide your profile and pause all notifications. You can reactivate by logging in again.
                </p>
              </div>

              <h2>Why are you deactivating?</h2>
              <p style={{ fontSize: '.9rem', color: '#666', marginBottom: '1.25rem' }}>Please let us know so we can improve.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', marginBottom: '1.5rem' }}>
                {REASONS.map(r => (
                  <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem 1rem', border: `1.5px solid ${reason === r ? '#a7354d' : '#eee'}`, borderRadius: '8px', cursor: 'pointer', background: reason === r ? '#fdf0f3' : '#fff' }}>
                    <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => { setReason(r); setError(''); }}
                      style={{ accentColor: '#a7354d' }} />
                    <span style={{ fontSize: '.9rem' }}>{r}</span>
                  </label>
                ))}
              </div>

              {error && <p style={{ color: '#c0392b', fontSize: '.88rem', marginBottom: '1rem' }}>{error}</p>}

              <div className="form-actions">
                <button className="button primary" disabled={loading} onClick={handleSubmit}
                  style={{ background: '#e67e22', borderColor: '#e67e22' }}>
                  {loading ? 'Deactivating…' : 'Deactivate Account'}
                </button>
                <Link href="/account" className="button secondary">Cancel</Link>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
