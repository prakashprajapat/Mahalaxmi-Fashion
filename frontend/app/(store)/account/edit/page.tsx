'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCustomer, getToken, setCustomer as saveCustomer } from '@/lib/auth';
import { customersApi } from '@/lib/api';
import type { Customer } from '@/types';

const INDIA_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Chandigarh',
  'Andaman and Nicobar Islands','Dadra and Nagar Haveli and Daman and Diu',
  'Lakshadweep','Puducherry'
];

export default function AccountEditPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    firstName: '', lastName: '', gender: '', email: '', phone: '',
    dateOfBirth: '', marriageDate: '',
    addrLine1: '', addrLine2: '', pincode: '', postOffice: '', state: '', district: '',
    marketingConsent: false,
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const c = getCustomer();
    if (!c) { router.push('/account'); return; }
    setCustomer(c);
    setForm({
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
      gender: c.gender ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      dateOfBirth: c.dateOfBirth ?? '',
      marriageDate: c.marriageDate ?? '',
      addrLine1: c.addrLine1 ?? '',
      addrLine2: c.addrLine2 ?? '',
      pincode: c.pincode ?? '',
      postOffice: c.postOffice ?? '',
      state: c.state ?? '',
      district: c.district ?? '',
      marketingConsent: c.marketingConsent ?? false,
    });
  }, [router]);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: (e.target as HTMLInputElement).type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const handleSave = async () => {
    if (!customer) return;
    if (!form.firstName.trim()) { setError('First name is required.'); return; }
    if (!form.addrLine1.trim()) { setError('Address is required.'); return; }
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) { setError('Pincode must be 6 digits.'); return; }
    setLoading(true); setError(''); setMsg('');
    try {
      const updated = await customersApi.updateProfile(customer.id, {
        ...form,
      }, getToken() ?? '');
      saveCustomer({ ...customer, ...form });
      window.dispatchEvent(new Event('auth-changed'));
      setMsg('Profile updated successfully!');
    } catch (e) { setError((e as Error).message || 'Update failed.'); }
    finally { setLoading(false); }
  };

  if (!customer) return null;

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">My Account</p>
        <h1>Edit Profile</h1>
        <p>Update your personal details and address information.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          <div className="form-card">
            <h2>Personal Information</h2>
            <div className="form-grid">
              <label>
                First Name *
                <input value={form.firstName} onChange={set('firstName')} placeholder="First name" />
              </label>
              <label>
                Last Name
                <input value={form.lastName} onChange={set('lastName')} placeholder="Last name" />
              </label>
              <label>
                Gender
                <select value={form.gender} onChange={set('gender')}>
                  <option value="">Select</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                Email Address
                <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
              </label>
              <label className="full-field">
                Mobile Number
                <input type="tel" value={form.phone} onChange={set('phone')} placeholder="e.g. 9876543210" maxLength={15} inputMode="numeric" />
              </label>
            </div>

            <h2 style={{ marginTop: '1.5rem' }}>Address</h2>
            <div className="form-grid">
              <label className="full-field">
                Address Line 1 *
                <input value={form.addrLine1} onChange={set('addrLine1')} placeholder="House no., Street, Area" />
              </label>
              <label className="full-field">
                Address Line 2
                <input value={form.addrLine2} onChange={set('addrLine2')} placeholder="Landmark, Colony (optional)" />
              </label>
              <label>
                Pincode
                <input value={form.pincode} onChange={set('pincode')} maxLength={6} placeholder="6-digit pincode" />
              </label>
              <label>
                Post Office
                <input value={form.postOffice} onChange={set('postOffice')} placeholder="Post office name" />
              </label>
              <label>
                City / District *
                <input value={form.district} onChange={set('district')} placeholder="District" />
              </label>
              <label>
                State
                <select value={form.state} onChange={set('state')}>
                  <option value="">Select state</option>
                  {INDIA_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
            </div>

            <label className="checkbox-field" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.marketingConsent} onChange={set('marketingConsent')} />
              <span style={{ fontSize: '.88rem' }}>I agree to receive offers, newsletters, and updates from Mahalaxmi Fashion Hub.</span>
            </label>

            <h2 style={{ marginTop: '1.75rem' }}>🎁 Special Offers</h2>
            <p style={{ color: '#666', fontSize: '.88rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
              Share your special dates to receive exclusive Birthday &amp; Anniversary discounts and surprises. This is completely optional!
            </p>
            <div className="form-grid">
              <label>
                🎂 Date of Birth
                <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')}
                  disabled={!!customer?.dateOfBirth}
                  style={customer?.dateOfBirth ? { background: '#f2f2f2', cursor: 'not-allowed', color: '#666' } : undefined} />
                {customer?.dateOfBirth && (
                  <span style={{ fontSize: '.72rem', color: '#999', marginTop: '.25rem', display: 'block' }}>
                    🔒 Saved and locked — contact support to change.
                  </span>
                )}
              </label>
              <label>
                💍 Marriage Anniversary
                <input type="date" value={form.marriageDate} onChange={set('marriageDate')}
                  disabled={!!customer?.marriageDate}
                  style={customer?.marriageDate ? { background: '#f2f2f2', cursor: 'not-allowed', color: '#666' } : undefined} />
                {customer?.marriageDate && (
                  <span style={{ fontSize: '.72rem', color: '#999', marginTop: '.25rem', display: 'block' }}>
                    🔒 Saved and locked — contact support to change.
                  </span>
                )}
              </label>
            </div>

            {error && <p className="wiz-message" style={{ color: '#c0392b', marginTop: '1rem' }}>{error}</p>}
            {msg && <p className="wiz-message" style={{ color: '#27ae60', marginTop: '1rem' }}>{msg}</p>}

            <div className="form-actions" style={{ marginTop: '1.25rem' }}>
              <button onClick={handleSave} className="button primary" disabled={loading}>
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
              <Link href="/account" className="button secondary">Cancel</Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
