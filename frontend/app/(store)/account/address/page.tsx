'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCustomer, getToken, setCustomer as saveCustomer } from '@/lib/auth';
import { customersApi } from '@/lib/api';
import type { Customer } from '@/types';
import { INDIA_STATES, getDistrictsForState } from '@/lib/indianLocations';

function getPincodeState(pincode: string): string {
  if (pincode.length < 2) return '';
  const prefix = parseInt(pincode.substring(0, 2), 10);
  if (prefix === 11) return 'Delhi';
  if (prefix >= 12 && prefix <= 13) return 'Haryana';
  if (prefix >= 14 && prefix <= 16) return 'Punjab';
  if (prefix === 17) return 'Himachal Pradesh';
  if (prefix >= 18 && prefix <= 19) return 'Jammu and Kashmir';
  if (prefix >= 20 && prefix <= 28) return 'Uttar Pradesh';
  if (prefix >= 30 && prefix <= 34) return 'Rajasthan';
  if (prefix >= 36 && prefix <= 39) return 'Gujarat';
  if (prefix >= 40 && prefix <= 44) return 'Maharashtra';
  if (prefix >= 45 && prefix <= 49) return 'Madhya Pradesh';
  if (prefix >= 50 && prefix <= 53) return 'Telangana';
  if (prefix >= 56 && prefix <= 59) return 'Karnataka';
  if (prefix >= 60 && prefix <= 64) return 'Tamil Nadu';
  if (prefix >= 67 && prefix <= 69) return 'Kerala';
  if (prefix >= 70 && prefix <= 74) return 'West Bengal';
  if (prefix >= 75 && prefix <= 77) return 'Odisha';
  if (prefix === 78) return 'Assam';
  if (prefix >= 80 && prefix <= 85) return 'Bihar';
  return '';
}

export default function AddressPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    addrLine1: '', addrLine2: '', pincode: '', postOffice: '', state: '', district: '',
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const districts = getDistrictsForState(form.state);

  useEffect(() => {
    const c = getCustomer();
    if (!c) { router.push('/account'); return; }
    setCustomer(c);
    setForm({
      addrLine1: c.addrLine1 ?? '',
      addrLine2: c.addrLine2 ?? '',
      pincode: c.pincode ?? '',
      postOffice: c.postOffice ?? '',
      state: c.state ?? '',
      district: c.district ?? '',
    });
  }, [router]);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const state = e.target.value;
    setForm(f => ({ ...f, state, district: '' }));
  };

  const handlePincodeChange = (val: string) => {
    const state = val.length >= 2 ? getPincodeState(val) : '';
    setForm(f => ({ ...f, pincode: val, ...(state ? { state, district: '' } : {}) }));
  };

  const handleSave = async () => {
    if (!customer) return;
    if (!form.addrLine1.trim()) { setError('Address Line 1 is required.'); return; }
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) { setError('Pincode must be 6 digits.'); return; }
    setLoading(true); setError(''); setMsg('');
    try {
      await customersApi.updateProfile(customer.id, {
        ...customer,
        ...form,
      }, getToken() ?? '');
      saveCustomer({ ...customer, ...form });
      window.dispatchEvent(new Event('auth-changed'));
      setMsg('Address updated successfully!');
      setEditing(false);
    } catch (e) { setError((e as Error).message || 'Update failed.'); }
    finally { setLoading(false); }
  };

  if (!customer) return null;

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">My Account</p>
        <h1>My Address</h1>
        <p>Manage your saved delivery address.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          <div className="form-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ margin: 0 }}>Saved Address</h2>
              {!editing && (
                <button onClick={() => setEditing(true)} className="button secondary" style={{ padding: '.4rem 1rem', fontSize: '.85rem' }}>
                  ✏️ Edit
                </button>
              )}
            </div>

            {!editing ? (
              /* View mode */
              form.addrLine1 ? (
                <div style={{ background: '#fdf0f3', borderRadius: '10px', padding: '1.25rem', border: '1.5px solid #f5c6cb' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>📍</span>
                    <div>
                      <p style={{ fontWeight: 700, marginBottom: '.25rem' }}>{customer.firstName} {customer.lastName}</p>
                      <p style={{ color: '#555', marginBottom: '.15rem' }}>{form.addrLine1}</p>
                      {form.addrLine2 && <p style={{ color: '#555', marginBottom: '.15rem' }}>{form.addrLine2}</p>}
                      {form.postOffice && <p style={{ color: '#555', marginBottom: '.15rem' }}>PO: {form.postOffice}</p>}
                      <p style={{ color: '#555', marginBottom: '.15rem' }}>{[form.district, form.state, form.pincode].filter(Boolean).join(', ')}</p>
                      <p style={{ color: '#888', fontSize: '.85rem' }}>📞 {customer.phone}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>📍</div>
                  <p style={{ marginBottom: '1rem' }}>No saved address found.</p>
                  <button onClick={() => setEditing(true)} className="button primary">Add Address</button>
                </div>
              )
            ) : (
              /* Edit mode */
              <div className="form-grid">
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Address Line 1 *</label>
                  <input value={form.addrLine1} onChange={set('addrLine1')}
                    placeholder="House no., Street, Area"
                    style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Address Line 2</label>
                  <input value={form.addrLine2} onChange={set('addrLine2')}
                    placeholder="Landmark, Colony (optional)"
                    style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Pincode</label>
                  <input value={form.pincode} maxLength={6} onChange={e => handlePincodeChange(e.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit pincode"
                    style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Post Office</label>
                  <input value={form.postOffice} onChange={set('postOffice')}
                    placeholder="Post office name"
                    style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>City / District *</label>
                  <select value={form.district} onChange={set('district')} disabled={!form.state}
                    style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }}>
                    <option value="">{form.state ? 'Select district' : 'Select state first'}</option>
                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>State</label>
                  <select value={form.state} onChange={handleStateChange}
                    style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem' }}>
                    <option value="">Select state</option>
                    {INDIA_STATES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>

                {error && <p style={{ color: '#c0392b', fontSize: '.88rem', gridColumn: '1 / -1' }}>{error}</p>}
                {msg && <p style={{ color: '#27ae60', fontSize: '.88rem', gridColumn: '1 / -1' }}>{msg}</p>}

                <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                  <button onClick={handleSave} className="button primary" disabled={loading}>
                    {loading ? 'Saving…' : 'Save Address'}
                  </button>
                  <button onClick={() => { setEditing(false); setError(''); }} className="button secondary">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
