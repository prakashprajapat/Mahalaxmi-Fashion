'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { customersApi } from '@/lib/api';
import { setCustomer, setToken } from '@/lib/auth';
import { INDIA_STATES, getDistrictsForState } from '@/lib/indianLocations';
import type { Customer } from '@/types';

type Step = 'details' | 'birthday';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedCustomer, setSavedCustomer] = useState<Customer | null>(null);
  const [savedToken, setSavedToken] = useState('');
  const [birthdayForm, setBirthdayForm] = useState({ dob: '', anniv: '' });

  const [honeypot, setHoneypot] = useState('');

  const [form, setForm] = useState({
    firstName: '', lastName: '', gender: '',
    phone: '', email: '', password: '', confirmPw: '',
    addrLine1: '', addrLine2: '', pincode: '', postOffice: '',
    state: '', district: '',
    consent: false,
  });
  const districts = getDistrictsForState(form.state);

  const setField = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: (e.target as HTMLInputElement).type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm(f => ({ ...f, state: e.target.value, district: '' }));
  };

  const pwStrength = (() => {
    const pw = form.password;
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    const colors = ['#e74c3c','#e67e22','#f1c40f','#27ae60'];
    const labels = ['Weak','Fair','Good','Strong'];
    return { pct: s * 25, color: colors[s-1] || '#ddd', label: s > 0 ? labels[s-1] : '' };
  })();

  const validate = (): string | null => {
    if (!form.firstName.trim()) return 'First Name is required.';
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) return 'Please enter a valid email address.';
    if (form.password.length < 8) return 'Password must be at least 8 characters.';
    if (form.password !== form.confirmPw) return 'Passwords do not match.';
    if (!form.addrLine1.trim()) return 'Address Line 1 is required.';
    if (!form.pincode || !/^\d{6}$/.test(form.pincode)) return 'Please enter a valid 6-digit Pincode.';
    if (!form.postOffice.trim()) return 'Post Office is required.';
    if (!form.state) return 'Please select a State.';
    if (!form.district) return 'Please select a District.';
    return null;
  };

  const handleCreateAccount = async () => {
    setError('');
    const err = validate();
    if (err) return setError(err);
    if (honeypot) return; // bot detected — silently ignore
    setLoading(true);
    try {
      const res = await customersApi.register({
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        email: form.email,
        phone: form.phone,
        password: form.password,
        addrLine1: form.addrLine1,
        addrLine2: form.addrLine2,
        pincode: form.pincode,
        postOffice: form.postOffice,
        state: form.state,
        district: form.district,
        marketingConsent: form.consent,
        otp: '',
      });
      if (res.token) { setToken(res.token); setCustomer(res.customer); }
      setSavedCustomer(res.customer);
      setSavedToken(res.token);
      setStep('birthday');
    } catch (e) {
      setError((e as Error).message || 'Account creation failed. Please try again.');
    } finally { setLoading(false); }
  };

  const handleSaveBirthday = async () => {
    if (!savedCustomer || !savedToken) { router.push('/account'); return; }
    setLoading(true);
    try {
      await customersApi.updateProfile(savedCustomer.id, {
        firstName: savedCustomer.firstName,
        lastName: savedCustomer.lastName,
        dateOfBirth: birthdayForm.dob || undefined,
        marriageDate: birthdayForm.anniv || undefined,
      }, savedToken);
    } catch { /* not critical */ }
    finally { setLoading(false); router.push('/account'); }
  };

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Customer Account</p>
        <h1>Create Account</h1>
        <p>Join Mahalaxmi Fashion Hub for faster checkout, order tracking and exclusive offers.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section className="auth-stack">


          {/* ── Step 1: Details ─────────────────────────────── */}
          {step === 'details' && (
            <div className="form-card">
              {/* Honeypot — hidden from humans, bots fill it */}
              <input type="text" name="website" value={honeypot} onChange={e => setHoneypot(e.target.value)}
                style={{ display: 'none' }} tabIndex={-1} autoComplete="off" aria-hidden="true" />
              <h2>Your Personal Details</h2>
              <div className="info-banner success">
                We will verify your account before completing registration.
              </div>
              <div className="form-grid">
                <label className="form-field">
                  First Name <span className="required-mark">*</span>
                  <input type="text" value={form.firstName} onChange={setField('firstName')}
                    placeholder="First name" autoComplete="off" data-form-type="other" />
                </label>
                <label className="form-field">
                  Last Name
                  <input type="text" value={form.lastName} onChange={setField('lastName')}
                    placeholder="Last name (optional)" autoComplete="off" data-form-type="other" />
                </label>

                <div className="form-pair full-field">
                  <div>
                    <span style={{ fontSize: '.9rem', fontWeight: 600, display: 'block', marginBottom: '.5rem' }}>Gender</span>
                    <div className="gender-row">
                      {['Male','Female','Other'].map(g => (
                        <label key={g} className="gender-option">
                          <input type="radio" name="gender" value={g}
                            checked={form.gender === g}
                            onChange={() => setForm(f => ({ ...f, gender: g }))} /> {g}
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="form-field">
                    Mobile Number
                    <input type="tel" value={form.phone} onChange={setField('phone')}
                      placeholder="e.g. 9876543210" maxLength={15} inputMode="numeric" autoComplete="off" data-form-type="other" />
                  </label>
                </div>
                <label className="form-field full-field">
                  Email ID <span className="required-mark">*</span>
                  <input type="email" value={form.email} onChange={setField('email')}
                    placeholder="you@example.com" autoComplete="off" data-form-type="other" />
                </label>
                <label style={{ alignContent: 'start' }}>
                  Password <span className="required-mark">*</span>
                  <input type="password" value={form.password} onChange={setField('password')}
                    placeholder="Min 8 characters" autoComplete="new-password" />
                  <div className="pw-bar" style={{ width: `${pwStrength.pct}%`, background: pwStrength.color }} />
                  <small className="pw-hint">{pwStrength.label}</small>
                </label>
                <label>
                  Confirm Password <span className="required-mark">*</span>
                  <input type="password" value={form.confirmPw} onChange={setField('confirmPw')}
                    placeholder="Re-enter password" autoComplete="new-password" />
                </label>

                <label className="full-field">
                  Address Line 1 <span className="required-mark">*</span>
                  <input type="text" value={form.addrLine1} onChange={setField('addrLine1')}
                    placeholder="House No., Building, Street" autoComplete="off" />
                </label>
                <label className="full-field">
                  Address Line 2 <small style={{ color: '#888', fontWeight: 400 }}>(optional)</small>
                  <input type="text" value={form.addrLine2} onChange={setField('addrLine2')}
                    placeholder="Landmark, Colony, Area" autoComplete="off" />
                </label>

                <div className="form-pair">
                  <label>
                    Pincode <span className="required-mark">*</span>
                    <input type="text" value={form.pincode} onChange={setField('pincode')}
                      inputMode="numeric" maxLength={6} pattern="[0-9]{6}" placeholder="6-digit PIN" autoComplete="off" />
                  </label>
                  <label>
                    Post Office <span className="required-mark">*</span>
                    <input type="text" value={form.postOffice} onChange={setField('postOffice')}
                      placeholder="Post office name" autoComplete="off" />
                  </label>
                </div>

                <div className="form-pair">
                  <label>
                    State <span className="required-mark">*</span>
                    <select value={form.state} onChange={handleStateChange}>
                      <option value="">— Select State —</option>
                      {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label>
                    District <span className="required-mark">*</span>
                    <select value={form.district} onChange={setField('district')} disabled={!form.state}>
                      <option value="">{form.state ? '— Select District —' : 'Select State First'}</option>
                      {districts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </label>
                </div>

                <label className="full-field consent-check">
                  <input type="checkbox" checked={form.consent}
                    onChange={e => setForm(f => ({ ...f, consent: e.target.checked }))} />
                  <span>I agree to receive offer updates and order notifications on WhatsApp or email.</span>
                </label>

                {error && <p className="wiz-message full-field">{error}</p>}

                <div className="full-field" style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" onClick={handleCreateAccount} disabled={loading}
                    className="button primary" style={{ fontSize: '.95rem' }}>
                    {loading ? 'Creating Account…' : 'Create Account →'}
                  </button>
                  <Link href="/account" className="button secondary">Back to Login</Link>
                </div>
              </div>
            </div>
          )}


          {/* ── Step 3: Birthday Popup (post-registration) ──── */}
          {step === 'birthday' && (
            <div style={{ maxWidth: '520px', margin: '0 auto' }}>
              {/* Success banner */}
              <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                <span style={{ fontSize: '1.6rem' }}>✅</span>
                <div>
                  <p style={{ fontWeight: 700, color: '#2e7d32', margin: 0 }}>Account Created Successfully!</p>
                  <p style={{ color: '#555', fontSize: '.85rem', margin: '2px 0 0' }}>Welcome to Mahalaxmi Fashion Hub, {savedCustomer?.firstName}!</p>
                </div>
              </div>

              {/* Birthday/Anniversary Card */}
              <div className="form-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '.5rem' }}>🎁</div>
                <h2 style={{ color: '#a7354d', marginBottom: '.4rem' }}>Get Special Offers!</h2>
                <p style={{ color: '#666', fontSize: '.88rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                  Share your special dates to receive exclusive Birthday &amp; Anniversary discounts and surprises. This is completely optional!
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', textAlign: 'left', marginBottom: '1.5rem' }}>
                  <label style={{ fontWeight: 600, fontSize: '.88rem', display: 'block' }}>
                    🎂 Date of Birth
                    <input type="date" value={birthdayForm.dob}
                      onChange={e => setBirthdayForm(f => ({ ...f, dob: e.target.value }))}
                      style={{ marginTop: '.35rem', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.55rem .75rem', fontSize: '.9rem', width: '100%', boxSizing: 'border-box' }} />
                  </label>
                  <label style={{ fontWeight: 600, fontSize: '.88rem', display: 'block' }}>
                    💍 Anniversary Date
                    <input type="date" value={birthdayForm.anniv}
                      onChange={e => setBirthdayForm(f => ({ ...f, anniv: e.target.value }))}
                      style={{ marginTop: '.35rem', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.55rem .75rem', fontSize: '.9rem', width: '100%', boxSizing: 'border-box' }} />
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={handleSaveBirthday} disabled={loading} className="button primary">
                    {loading ? 'Saving…' : '🎉 Save & Go to Account'}
                  </button>
                  <button onClick={() => router.push('/account')} className="button secondary">
                    Skip for Now
                  </button>
                </div>

                <p style={{ fontSize: '.78rem', color: '#aaa', marginTop: '1rem' }}>
                  You can always add these details later from My Account → Edit Profile.
                </p>
              </div>
            </div>
          )}

        </section>
      </main>
    </>
  );
}
