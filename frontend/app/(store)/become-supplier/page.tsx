'use client';
import { useState } from 'react';
import Link from 'next/link';
import { suppliersApi } from '@/lib/api';
import { trackEvent } from '@/lib/analytics';

const INDIA_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Chandigarh',
  'Andaman and Nicobar Islands','Dadra and Nagar Haveli and Daman and Diu',
  'Lakshadweep','Puducherry',
];

const BLANK = {
  firmName: '', contactName: '', phone: '', email: '',
  gstNumber: '', panNumber: '', businessType: '', categories: '',
  yearsInBusiness: '', website: '',
  address: '', city: '', state: '', pincode: '', message: '',
};

export default function BecomeSupplierPage() {
  const [form, setForm] = useState({ ...BLANK });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.firmName.trim() || !form.contactName.trim()) { setError('Firm name and contact name are required.'); return; }
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, '').slice(-10))) { setError('Please enter a valid 10-digit mobile number.'); return; }
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) { setError('Pincode must be 6 digits.'); return; }
    setLoading(true); setError('');
    try {
      await suppliersApi.apply(form);
      trackEvent('generate_lead', { source: 'become_supplier' });   // GA4
      setDone(true);
    } catch (e) { setError((e as Error).message || 'Submission failed. Please try again.'); }
    finally { setLoading(false); }
  };

  if (done) {
    return (
      <>
        <section className="page-hero">
          <p className="eyebrow">Partner With Us</p>
          <h1>Application Received</h1>
        </section>
        <main className="account-shell" style={{ display: 'block' }}>
          <div className="form-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
            <div style={{ fontSize: '2.5rem' }}>✅</div>
            <h2 style={{ marginTop: '.5rem' }}>Thank you, {form.contactName.split(' ')[0] || 'Partner'}!</h2>
            <p style={{ color: '#666', maxWidth: 520, margin: '.5rem auto 1.25rem' }}>
              Your supplier application has been received. Our team will review your details and contact you soon on <strong>{form.phone}</strong>.
            </p>
            <Link href="/" className="button primary">Back to Home</Link>
          </div>
        </main>
      </>
    );
  }

  const lbl: React.CSSProperties = { fontSize: '.82rem', fontWeight: 600, color: '#444', display: 'block', marginBottom: '.3rem' };
  const inp: React.CSSProperties = { width: '100%', border: '1.5px solid #ddd', borderRadius: 9, padding: '.6rem .8rem', fontSize: '.95rem', boxSizing: 'border-box', background: '#fff' };

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Partner With Us</p>
        <h1>Become a Supplier</h1>
        <p>Sell your products through Mahalaxmi Fashion Hub. Share your firm details below and our team will get in touch.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          <div className="form-card">
            <h2>Firm / Business Details</h2>
            <div className="form-grid">
              <label>Firm / Company Name *<input value={form.firmName} onChange={set('firmName')} placeholder="e.g. Shree Textiles" /></label>
              <label>Contact Person Name *<input value={form.contactName} onChange={set('contactName')} placeholder="Your full name" /></label>
              <label>Mobile Number *<input type="tel" value={form.phone} onChange={set('phone')} maxLength={15} inputMode="numeric" placeholder="10-digit mobile" /></label>
              <label>Email<input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" /></label>
              <label>GST Number<input value={form.gstNumber} onChange={set('gstNumber')} placeholder="e.g. 08ABCDE1234F1Z5" maxLength={15} /></label>
              <label>PAN Number<input value={form.panNumber} onChange={set('panNumber')} placeholder="e.g. ABCDE1234F" maxLength={10} /></label>
              <label>Business Type
                <select value={form.businessType} onChange={set('businessType')}>
                  <option value="">Select</option>
                  <option>Manufacturer</option>
                  <option>Wholesaler</option>
                  <option>Distributor</option>
                  <option>Trader</option>
                  <option>Other</option>
                </select>
              </label>
              <label>Years in Business<input value={form.yearsInBusiness} onChange={set('yearsInBusiness')} placeholder="e.g. 5" /></label>
              <label className="full-field">Product Categories you supply<input value={form.categories} onChange={set('categories')} placeholder="e.g. Sarees, Nighty, Petticoat, Fabric" /></label>
              <label className="full-field">Website / Instagram / Catalogue link<input value={form.website} onChange={set('website')} placeholder="https://…" /></label>
            </div>

            <h2 style={{ marginTop: '1.5rem' }}>Address</h2>
            <div className="form-grid">
              <label className="full-field">Address<input value={form.address} onChange={set('address')} placeholder="Shop / warehouse address" /></label>
              <label>City<input value={form.city} onChange={set('city')} placeholder="City" /></label>
              <label>State
                <select value={form.state} onChange={set('state')}>
                  <option value="">Select state</option>
                  {INDIA_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>Pincode<input value={form.pincode} onChange={set('pincode')} maxLength={6} placeholder="6-digit pincode" /></label>
            </div>

            <h2 style={{ marginTop: '1.5rem' }}>Anything else?</h2>
            <label style={{ display: 'block' }}>
              <span style={lbl}>Message / Additional details</span>
              <textarea value={form.message} onChange={set('message')} rows={4} placeholder="Product range, MOQ, pricing, existing clients, etc."
                style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </label>

            {error && <p className="wiz-message" style={{ color: '#c0392b', marginTop: '1rem' }}>{error}</p>}

            <div className="form-actions" style={{ marginTop: '1.25rem' }}>
              <button onClick={submit} className="button primary" disabled={loading}>
                {loading ? 'Submitting…' : 'Submit Application'}
              </button>
              <Link href="/" className="button secondary">Cancel</Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
