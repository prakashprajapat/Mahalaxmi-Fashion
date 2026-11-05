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
  // Whether that message is good news, kept beside it rather than read
  // back out of its first character.
  const [msgOk, setMsgOk] = useState(false);

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
      setMsgOk(true);
      setMsg(consent ? 'You are now subscribed to newsletters and offers.' : 'You have been unsubscribed.');
    } catch (e) {
      setMsgOk(false);
      setMsg('Error: ' + (e as Error).message);
    } finally { setSaving(false); }
  };

  if (!customer) return null;

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">My Account</p>
        <h1>Marketing Preferences</h1>
        <p>Choose whether we may send you offers by SMS, WhatsApp and email.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          <div className="form-card">
            <h2>SMS, WhatsApp & Email Offers</h2>
            <p style={{ color: '#666', fontSize: '.9rem', marginBottom: '1.5rem' }}>
              Tick to receive new arrivals and offers from Mahalaxmi Fashion Hub. Untick and save to stop all promotional SMS, WhatsApp and email messages. Order, delivery and OTP messages still come, because they are needed for your orders.
            </p>

            <div style={{ background: consent ? '#e8f5e9' : '#f9f9f9', borderRadius: '12px', padding: '1.25rem', border: `1.5px solid ${consent ? '#c8e6c9' : '#eee'}`, marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                  style={{ width: '18px', height: '18px', marginTop: '2px', flexShrink: 0, accentColor: '#722f37' }} />
                <div>
                  <p style={{ fontWeight: 700, marginBottom: '.25rem' }}>Send me offers by SMS, WhatsApp and email</p>
                  <p style={{ fontSize: '.85rem', color: '#666' }}>
                    New collections, seasonal offers and festive discounts. You can switch this off here at any time.
                  </p>
                </div>
              </label>
            </div>

            <div style={{ background: '#f7eff0', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem', fontSize: '.85rem', color: '#555' }}>
              <strong style={{ color: '#722f37' }}>Privacy Note:</strong> We never sell your data to third parties. Your email is used only for order updates and offers from Mahalaxmi Fashion Hub. You can unsubscribe anytime.
            </div>

            {msg && (
              <p style={{ color: msgOk ? '#27ae60' : '#c0392b', fontWeight: 600, marginBottom: '1rem', fontSize: '.9rem' }}>{msg}</p>
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
