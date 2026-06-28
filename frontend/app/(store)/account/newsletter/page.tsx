'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCustomer, getToken, setCustomer as saveCustomer } from '@/lib/auth';
import { customersApi } from '@/lib/api';
import type { Customer } from '@/types';

export default function NewsletterPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const c = getCustomer();
    if (!c) { router.push('/account'); return; }
    setCustomer(c);
    setConsent(c.marketingConsent ?? false);
  }, [router]);

  const handleSave = async () => {
    if (!customer) return;
    setSaving(true); setMsg('');
    try {
      await customersApi.updateProfile(customer.id, { ...customer, marketingConsent: consent }, getToken() ?? '');
      saveCustomer({ ...customer, marketingConsent: consent });
      window.dispatchEvent(new Event('auth-changed'));
      setMsg(consent ? '✅ You are now subscribed to newsletters and offers.' : '✅ You have been unsubscribed.');
    } catch (e) {
      setMsg('❌ Error: ' + (e as Error).message);
    } finally { setSaving(false); }
  };

  if (!customer) return null;

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">My Account</p>
        <h1>Newsletter Preferences</h1>
        <p>Manage your email subscription and marketing preferences.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          <div className="form-card">
            <h2>Email & Marketing Preferences</h2>
            <p style={{ color: '#666', fontSize: '.9rem', marginBottom: '1.5rem' }}>
              Choose whether you want to receive emails about new arrivals, offers, and updates from Mahalaxmi Fashion Hub.
            </p>

            <div style={{ background: consent ? '#e8f5e9' : '#f9f9f9', borderRadius: '12px', padding: '1.25rem', border: `1.5px solid ${consent ? '#c8e6c9' : '#eee'}`, marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                  style={{ width: '18px', height: '18px', marginTop: '2px', flexShrink: 0, accentColor: '#a7354d' }} />
                <div>
                  <p style={{ fontWeight: 700, marginBottom: '.25rem' }}>Subscribe to Newsletter & Offers</p>
                  <p style={{ fontSize: '.85rem', color: '#666' }}>
                    Receive updates about new saree collections, seasonal offers, festive discounts, and exclusive deals via email and WhatsApp.
                  </p>
                </div>
              </label>
            </div>

            <div style={{ background: '#fdf0f3', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem', fontSize: '.85rem', color: '#555' }}>
              <strong style={{ color: '#a7354d' }}>Privacy Note:</strong> We never sell your data to third parties. Your email is used only for order updates and offers from Mahalaxmi Fashion Hub. You can unsubscribe anytime.
            </div>

            {msg && (
              <p style={{ color: msg.startsWith('✅') ? '#27ae60' : '#c0392b', fontWeight: 600, marginBottom: '1rem', fontSize: '.9rem' }}>{msg}</p>
            )}

            <div className="form-actions">
              <button onClick={handleSave} className="button primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Preferences'}
              </button>
              <Link href="/account" className="button secondary">Back</Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
