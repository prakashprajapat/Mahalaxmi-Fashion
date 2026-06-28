'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Step = 'verify' | 'otp' | 'password';

export default function AdminRecoverPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('verify');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');   // shown on screen until email service added
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleVerify = async () => {
    setError('');
    if (!email || !/\S+@\S+\.\S+/.test(email)) return setError('Please enter a valid email address.');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/admin-recover/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* empty body */ }
      if (!res.ok) throw new Error((data.message as string) ?? 'Email not recognised.');
      if (data.devOtp) setDevOtp(data.devOtp as string);  // show OTP on screen (dev mode)
      setStep('otp');
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  };

  const handleOtp = () => {
    setError('');
    if (!otp || otp.length < 6) return setError('Enter the 6-digit OTP.');
    setStep('password');
  };

  const handleReset = async () => {
    setError('');
    if (newPw.length < 8) return setError('Password must be at least 8 characters.');
    if (newPw !== confirmPw) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/admin-recover/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword: newPw }),
      });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* empty body */ }
      if (!res.ok) throw new Error((data.message as string) ?? 'Reset failed.');
      setSuccess('Password updated! Redirecting to login…');
      setTimeout(() => router.push('/admin/login'), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  };

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Admin Access</p>
        <h1>Password Recovery</h1>
        <p>Verify your identity in 3 steps to reset your admin password.</p>
      </section>

      <main className="admin-shell">
        <div className="admin-grid" style={{ maxWidth: '480px', margin: '0 auto' }}>
          <article className="admin-panel">

            {/* Step indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1.5rem' }}>
              {(['verify', 'otp', 'password'] as Step[]).map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.8rem', fontWeight: 700,
                    background: step === s ? '#a7354d' : (['verify', 'otp', 'password'].indexOf(step) > i ? '#27ae60' : '#eee'),
                    color: step === s || ['verify', 'otp', 'password'].indexOf(step) > i ? '#fff' : '#aaa',
                  }}>
                    {['verify', 'otp', 'password'].indexOf(step) > i ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: '.75rem', fontWeight: 600, color: step === s ? '#a7354d' : '#aaa', textTransform: 'capitalize' }}>{s}</span>
                  {i < 2 && <div style={{ width: '24px', height: '2px', background: '#eee', marginLeft: '.25rem' }} />}
                </div>
              ))}
            </div>

            {/* Step 1: Verify Email */}
            {step === 'verify' && (
              <div className="form-grid">
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '.5rem', gridColumn: '1 / -1' }}>Step 1 — Verify Email</h2>
                <p style={{ fontSize: '.85rem', color: '#666', marginBottom: '.5rem', gridColumn: '1 / -1' }}>
                  Enter your admin email address. An OTP will be sent if the email matches.
                </p>
                <label className="full-field">
                  Admin Email
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="admin@mahalaxmifashionhub.com"
                    onKeyDown={e => e.key === 'Enter' && handleVerify()} autoFocus />
                </label>
                {error && <p className="wiz-message full-field">{error}</p>}
                <div className="form-actions">
                  <button className="button primary" onClick={handleVerify} disabled={loading}>
                    {loading ? 'Sending OTP…' : 'Send OTP →'}
                  </button>
                  <Link href="/admin/login" className="button secondary">← Back to Admin Login</Link>
                </div>
              </div>
            )}

            {/* Step 2: Enter OTP */}
            {step === 'otp' && (
              <div className="form-grid">
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '.5rem', gridColumn: '1 / -1' }}>Step 2 — Enter OTP</h2>
                {devOtp ? (
                  <div style={{ gridColumn: '1 / -1', background: '#e8f5e9', border: '1.5px solid #c8e6c9', borderRadius: '10px', padding: '.85rem 1rem', marginBottom: '.5rem' }}>
                    <p style={{ fontSize: '.8rem', color: '#2e7d32', fontWeight: 700, margin: '0 0 .3rem' }}>📋 Your OTP (email not configured yet):</p>
                    <p style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '.2em', color: '#1b5e20', margin: 0 }}>{devOtp}</p>
                    <p style={{ fontSize: '.75rem', color: '#555', margin: '.3rem 0 0' }}>Copy this code and enter below. Valid for 15 minutes.</p>
                  </div>
                ) : (
                  <p style={{ fontSize: '.85rem', color: '#666', marginBottom: '.25rem', gridColumn: '1 / -1' }}>
                    OTP sent to <strong>{email}</strong>. Check your spam folder if not received.
                  </p>
                )}
                <label className="full-field">
                  6-digit OTP
                  <input type="text" inputMode="numeric" maxLength={6}
                    value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter OTP"
                    style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '.15em', textAlign: 'center' }}
                    onKeyDown={e => e.key === 'Enter' && handleOtp()} autoFocus />
                </label>
                {error && <p className="wiz-message full-field">{error}</p>}
                <div className="form-actions">
                  <button className="button primary" onClick={handleOtp}>
                    Verify OTP →
                  </button>
                  <button className="button secondary" onClick={() => { setStep('verify'); setOtp(''); setDevOtp(''); setError(''); }}>
                    ← Back
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: New Password */}
            {step === 'password' && (
              <div className="form-grid">
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '.5rem', gridColumn: '1 / -1' }}>Step 3 — New Password</h2>
                {success ? (
                  <div style={{ padding: '1rem', background: '#e8f5e9', borderRadius: '8px', color: '#2e7d32', fontWeight: 600, gridColumn: '1 / -1', textAlign: 'center' }}>
                    ✅ {success}
                  </div>
                ) : (
                  <>
                    <label className="full-field">
                      New Password
                      <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                        placeholder="Min 8 characters" autoComplete="new-password" autoFocus />
                    </label>
                    <label className="full-field">
                      Confirm Password
                      <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                        placeholder="Re-enter password" autoComplete="new-password"
                        onKeyDown={e => e.key === 'Enter' && handleReset()} />
                    </label>
                    {error && <p className="wiz-message full-field">{error}</p>}
                    <div className="form-actions">
                      <button className="button primary" onClick={handleReset} disabled={loading}>
                        {loading ? 'Updating…' : '🔐 Update Password'}
                      </button>
                      <Link href="/admin/login" className="button secondary">← Back to Login</Link>
                    </div>
                  </>
                )}
              </div>
            )}

          </article>
        </div>
      </main>
    </>
  );
}
