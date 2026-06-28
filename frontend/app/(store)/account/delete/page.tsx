'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCustomer, getToken, logout } from '@/lib/auth';
import { customersApi } from '@/lib/api';

export default function DeleteAccountPage() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState('');
  const [deleted, setDeleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getCustomer()) { router.push('/account'); }
  }, [router]);

  const canDelete = confirmText === 'DELETE';

  const handleDelete = async () => {
    if (!canDelete) { setError('Please type DELETE to confirm.'); return; }
    setLoading(true); setError('');
    try {
      const customer = getCustomer();
      if (!customer) throw new Error('Please login again.');
      await customersApi.delete(customer.id, getToken() ?? '');
      setDeleted(true);
      setTimeout(() => { logout(); router.push('/'); }, 3000);
    } catch (e) {
      setError((e as Error).message || 'Failed to delete account. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">My Account</p>
        <h1>Delete Account</h1>
        <p>Permanently delete your Mahalaxmi Fashion Hub account.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          {deleted ? (
            <div className="form-card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🗑️</div>
              <h2 style={{ color: '#c0392b' }}>Account Deleted</h2>
              <p style={{ color: '#666', marginTop: '.5rem' }}>Your account has been permanently deleted. You will be logged out shortly.</p>
            </div>
          ) : (
            <div className="form-card">
              <div style={{ background: '#fdecea', border: '1.5px solid #f44336', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                <strong style={{ color: '#c62828' }}>🚨 Permanent Action — Cannot be Undone</strong>
                <ul style={{ fontSize: '.88rem', color: '#c62828', marginTop: '.5rem', paddingLeft: '1.25rem', lineHeight: 1.8 }}>
                  <li>All your order history will be permanently removed</li>
                  <li>Your address and profile information will be deleted</li>
                  <li>Wishlist and saved items will be lost</li>
                  <li>You will not be able to recover your account</li>
                </ul>
              </div>

              <h2>Confirm Account Deletion</h2>
              <p style={{ fontSize: '.9rem', color: '#666', marginBottom: '1.25rem' }}>
                To confirm, please type <strong>DELETE</strong> in the box below:
              </p>

              <div style={{ marginBottom: '1.5rem' }}>
                <input
                  value={confirmText}
                  onChange={e => { setConfirmText(e.target.value); setError(''); }}
                  placeholder="Type DELETE here"
                  style={{ width: '100%', border: `1.5px solid ${confirmText === 'DELETE' ? '#27ae60' : '#ddd'}`, borderRadius: '8px', padding: '.75rem 1rem', fontSize: '1rem', boxSizing: 'border-box', fontWeight: 700, letterSpacing: '.05em' }}
                />
                {confirmText.length > 0 && confirmText !== 'DELETE' && (
                  <p style={{ color: '#c0392b', fontSize: '.8rem', marginTop: '.3rem' }}>Must match exactly: DELETE</p>
                )}
              </div>

              {error && <p style={{ color: '#c0392b', fontSize: '.88rem', marginBottom: '1rem' }}>{error}</p>}

              <div className="form-actions">
                <button
                  className="button primary"
                  disabled={loading || !canDelete}
                  onClick={handleDelete}
                  style={{ background: canDelete ? '#c0392b' : '#ccc', borderColor: canDelete ? '#c0392b' : '#ccc', cursor: canDelete ? 'pointer' : 'not-allowed' }}>
                  {loading ? 'Deleting…' : '🗑️ Delete My Account'}
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
