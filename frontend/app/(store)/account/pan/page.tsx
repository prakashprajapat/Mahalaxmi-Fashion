'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCustomer, getToken, setCustomer as saveCustomer } from '@/lib/auth';
import { customersApi } from '@/lib/api';
import type { Customer } from '@/types';

const PAN_KEY = 'mfh-pan';

export default function PanPage() {
  const router = useRouter();
  const [panNumber, setPanNumber] = useState('');
  const [panName, setPanName] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const c = getCustomer();
    if (!c) { router.push('/account'); return; }
    setCustomer(c);
    if (c.panNumber) {
      setPanNumber(c.panNumber);
      setPanName(c.panName ?? '');
      setSaved(true);
    }
    try {
      const data = JSON.parse(localStorage.getItem(PAN_KEY) ?? '{}');
      if (data.panNumber) { setPanNumber(data.panNumber); setPanName(data.panName ?? ''); setSaved(true); }
    } catch {}
  }, [router]);

  const handleSave = async () => {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!panRegex.test(panNumber.toUpperCase())) {
      setMsg('Invalid PAN format. Expected: ABCDE1234F'); return;
    }
    if (!panName.trim()) { setMsg('Please enter name as on PAN card.'); return; }
    setSaving(true);
    try {
      const next = { panNumber: panNumber.toUpperCase(), panName };
      localStorage.setItem(PAN_KEY, JSON.stringify(next));
      if (customer) {
        const res = await customersApi.updateProfile(customer.id, { ...customer, ...next, panStatus: 'Pending Verification' }, getToken() ?? '');
        saveCustomer(res.customer);
        setCustomer(res.customer);
      }
      setSaved(true);
      setMsg('PAN details saved successfully.');
    } catch (e) {
      setMsg('Error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    localStorage.removeItem(PAN_KEY);
    setPanNumber(''); setPanName(''); setSaved(false); setMsg('PAN details removed.');
    if (customer) {
      const res = await customersApi.updateProfile(customer.id, { ...customer, panNumber: '', panName: '', panStatus: 'Pending Verification' }, getToken() ?? '');
      saveCustomer(res.customer);
      setCustomer(res.customer);
    }
  };

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">My Account</p>
        <h1>PAN Card</h1>
        <p>Manage your PAN card details for orders above ₹2,000.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          <div className="form-card">
            <h2>PAN Card Details</h2>
            <p style={{ fontSize: '.9rem', color: '#666', marginBottom: '1.5rem' }}>
              As per government regulations, PAN is required for transactions above ₹2,000. Your PAN is stored locally on your device only.
            </p>

            {saved && (
              <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem', fontSize: '.9rem', color: '#2e7d32' }}>
                ✓ PAN details are saved: <strong>{panNumber}</strong> — {panName}
              </div>
            )}

            <div className="form-grid">
              <label className="full-field">
                PAN Number
                <input
                  value={panNumber}
                  onChange={e => { setPanNumber(e.target.value.toUpperCase()); setMsg(''); }}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  style={{ textTransform: 'uppercase' }}
                />
              </label>
              <label className="full-field">
                Name as on PAN Card
                <input
                  value={panName}
                  onChange={e => { setPanName(e.target.value); setMsg(''); }}
                  placeholder="Full Name"
                />
              </label>
            </div>

            {msg && (
              <p style={{ color: msg.includes('success') || msg.includes('saved') ? '#27ae60' : msg.includes('removed') ? '#888' : '#c0392b', fontSize: '.88rem', marginTop: '.5rem' }}>
                {msg}
              </p>
            )}

            <div className="form-actions" style={{ marginTop: '1.25rem' }}>
              <button className="button primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save PAN Details'}</button>
              {saved && <button className="button secondary" onClick={handleClear}>Remove PAN</button>}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
