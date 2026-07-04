'use client';
import { useState } from 'react';
import Link from 'next/link';
import { customersApi } from '@/lib/api';

type Step = 'email' | 'otp' | 'reset' | 'done';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [identifier, setIdentifier] = useState('');
  const [sentMsg, setSentMsg] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEmail = (v: string) => /\S+@\S+\.\S+/.test(v);
  const isMobile = (v: string) => /^\d{10,13}$/.test(v.replace(/\D/g, ''));

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const id = identifier.trim();
    if (!isEmail(id) && !isMobile(id))
      return setError('Please enter a valid email address or mobile number.');
    setLoading(true);
    try {
      const res = await customersApi.forgotPasswordSendOtp(id);
      const dest: string[] = [];
      if (res.sentTo?.email) dest.push(res.sentTo.email);
      if (res.sentTo?.phone) dest.push(res.sentTo.phone);
      setSentMsg(dest.length ? dest.join(' and ') : 'your registered email / mobile');
      setStep('otp');
    } catch (e) {
      setError((e as Error).message || 'Could not send OTP. Please try again.');
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!otp || otp.length < 6) return setError('Please enter the 6-digit OTP.');
    setStep('reset');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirmPw) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await customersApi.resetPassword({ email: identifier.trim(), otp, password });
      setStep('done');
    } catch (e) {
      setError((e as Error).message || 'Password reset failed. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Customer Account</p>
        <h1>Forgot Password</h1>
        <p>Reset your account password using your registered email address or mobile number.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section className="auth-stack">
          {step === 'email' && (
            <div className="form-card">
              <h2>Enter Email or Mobile</h2>
              <p style={{ color: '#666', fontSize: '.9rem', marginBottom: '1rem' }}>We will send an OTP to your registered email and/or mobile. If both are on your account, you will get the same OTP on both.</p>
              {error && <p className="wiz-message">{error}</p>}
              <form onSubmit={handleSendOtp}>
                <div className="form-grid">
                  <label className="full-field">
                    Email Address or Mobile Number <span className="required-mark">*</span>
                    <span style={{ display: 'flex', alignItems: 'stretch', border: '1.5px solid #ddd', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                      {/^\d/.test(identifier.trim()) && (
                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 .5rem 0 .85rem', fontWeight: 600, color: '#333', background: '#fafafa', borderRight: '1px solid #eee' }}>+91</span>
                      )}
                      <input type="text" value={identifier}
                        onChange={e => {
                          const raw = e.target.value;
                          const first = raw.trim()[0];
                          if (first && /[0-9]/.test(first)) setIdentifier(raw.replace(/\D/g, '').slice(0, 10));
                          else setIdentifier(raw);
                        }}
                        placeholder="you@example.com  or  9876543210" required autoComplete="username"
                        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent' }} />
                    </span>
                  </label>
                  <div className="form-actions">
                    <button type="submit" className="button primary" disabled={loading}>{loading ? 'Sending OTP…' : 'Send OTP →'}</button>
                    <Link href="/account" className="button secondary">Back to Login</Link>
                  </div>
                </div>
              </form>
            </div>
          )}

          {step === 'otp' && (
            <div className="form-card">
              <h2>Enter OTP</h2>
              <p style={{ color: '#555', fontSize: '.9rem', marginBottom: '.5rem' }}>OTP sent to <strong>{sentMsg}</strong></p>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '8px', padding: '.65rem .85rem', margin: '.5rem 0 .75rem', fontSize: '.84rem', color: '#795548' }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>📬</span>
                <span>Check your <strong>Spam / Junk</strong> folder (email) or wait a few seconds (SMS) if you did not receive the OTP.</span>
              </div>
              {error && <p className="wiz-message">{error}</p>}
              <form onSubmit={handleVerifyOtp}>
                <label style={{ fontWeight: 600, fontSize: '.9rem', display: 'block', marginBottom: '.4rem' }}>6-digit OTP</label>
                <input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter OTP" style={{ border: '2px solid #ddd', borderRadius: '8px', padding: '.65rem 1rem', fontSize: '1.2rem', fontWeight: 700, letterSpacing: '.15em', maxWidth: '200px', textAlign: 'center', display: 'block', marginBottom: '1rem' }} />
                <div className="form-actions">
                  <button type="submit" className="button primary">Verify OTP →</button>
                  <button type="button" onClick={() => setStep('email')} className="button secondary">← Back</button>
                </div>
              </form>
            </div>
          )}

          {step === 'reset' && (
            <div className="form-card">
              <h2>Set New Password</h2>
              {error && <p className="wiz-message">{error}</p>}
              <form onSubmit={handleResetPassword}>
                <div className="form-grid">
                  <label className="full-field">
                    New Password <span className="required-mark">*</span>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" required autoComplete="new-password" />
                  </label>
                  <label className="full-field">
                    Confirm Password <span className="required-mark">*</span>
                    <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Re-enter password" required autoComplete="new-password" />
                  </label>
                  <div className="form-actions">
                    <button type="submit" className="button primary" disabled={loading}>{loading ? 'Resetting…' : 'Reset Password'}</button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {step === 'done' && (
            <div className="form-card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>✅</div>
              <h2 style={{ color: '#27ae60' }}>Password Reset!</h2>
              <p style={{ color: '#555', marginBottom: '1.5rem' }}>Your password has been updated. You can now login with your new password.</p>
              <div className="form-actions" style={{ justifyContent: 'center' }}>
                <Link href="/account" className="button primary">Login Now</Link>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
