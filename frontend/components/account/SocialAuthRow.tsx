'use client';
import { useEffect, useState } from 'react';

// Google / Mobile / Facebook, in one place.
//
// This row existed three times — in the navbar popup, on the account login page
// and nowhere at all on the register page, which is the one page a new customer
// actually lands on. The three copies had already drifted: two of them asked
// Facebook for v18 of the dialog and one for v25. One component now, so a change
// to the callback, the scopes or the dialog version happens once.
//
// A provider with no key configured is shown greyed out rather than hidden. A
// gap where a button used to be reads as a broken page; a greyed button reads as
// "not that one, then", which is the truth.

export interface SocialAuthRowProps {
  /** Called when Mobile is pressed — the page decides what mobile means to it. */
  onMobile: () => void;
  /** Draws Mobile as the chosen one. */
  mobileActive?: boolean;
  /** Mobile's label: "Mobile" on login, "Mobile OTP" where the form below is the mobile route. */
  mobileLabel?: string;
}

const FB_DIALOG_VERSION = 'v25.0';

export default function SocialAuthRow({ onMobile, mobileActive = false, mobileLabel = 'Mobile' }: SocialAuthRowProps) {
  const [googleClientId, setGoogleClientId] = useState('');
  const [facebookAppId, setFacebookAppId] = useState('');
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        const s = d?.settings ?? {};
        setGoogleClientId(s.googleClientId ?? '');
        setFacebookAppId(s.facebookAppId ?? '');
      })
      .catch(() => { /* both stay greyed out, which is what no key means */ });
  }, []);

  const callbackUrl = `${origin}/account/social-callback`;
  const ready = Boolean(origin);

  const googleHref = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}`
    + `&redirect_uri=${encodeURIComponent(callbackUrl)}`
    + `&response_type=code&scope=email%20profile&prompt=select_account&state=google`;

  const facebookHref = `https://www.facebook.com/${FB_DIALOG_VERSION}/dialog/oauth?client_id=${facebookAppId}`
    + `&redirect_uri=${encodeURIComponent(callbackUrl)}`
    + `&scope=email,public_profile&response_type=code&state=facebook`;

  const live: React.CSSProperties = {
    flex: 1, height: 46, borderRadius: 9, background: '#fff', color: '#333',
    fontWeight: 700, fontSize: '.82rem', textDecoration: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem',
    border: '1.5px solid #ddd', cursor: 'pointer',
  };
  const dead: React.CSSProperties = {
    flex: 1, height: 46, borderRadius: 9, background: '#f5f5f5', color: '#bbb',
    fontWeight: 700, fontSize: '.85rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem',
    border: '1.5px solid #eee', cursor: 'not-allowed',
  };

  const GoogleMark = ({ on }: { on: boolean }) => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill={on ? '#EA4335' : '#ccc'} d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill={on ? '#4285F4' : '#ccc'} d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill={on ? '#FBBC05' : '#ccc'} d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill={on ? '#34A853' : '#ccc'} d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );

  const FacebookMark = ({ on }: { on: boolean }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? '#1877f2' : '#ccc'} aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );

  return (
    <div style={{ display: 'flex', gap: '.6rem' }}>
      {googleClientId && ready ? (
        <a href={googleHref} style={live} aria-label="Continue with Google">
          <GoogleMark on /> Google
        </a>
      ) : (
        <button type="button" disabled style={dead}><GoogleMark on={false} /> Google</button>
      )}

      <button type="button" onClick={onMobile} title="Continue with your mobile number"
        style={{
          flex: 1, height: 46, borderRadius: 9,
          background: mobileActive ? '#f7eff0' : '#fff',
          color: '#a01836', fontWeight: 700, fontSize: '.82rem',
          whiteSpace: 'nowrap', letterSpacing: '-.01em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem',
          border: '1.5px solid #ddd', cursor: 'pointer',
        }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
          <rect x="6" y="2" width="12" height="20" rx="2.6" stroke="#a01836" strokeWidth="1.7" />
          <line x1="10.4" y1="5" x2="13.6" y2="5" stroke="#a01836" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="12" cy="18.6" r="1" fill="#a01836" />
        </svg>
        {mobileLabel}
      </button>

      {facebookAppId && ready ? (
        <a href={facebookHref} style={live} aria-label="Continue with Facebook">
          <FacebookMark on /> Facebook
        </a>
      ) : (
        <button type="button" disabled style={dead}><FacebookMark on={false} /> Facebook</button>
      )}
    </div>
  );
}

/** The "or continue with" rule, so every page draws it the same. */
export function SocialDivider({ label = 'or continue with' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', margin: '.1rem 0' }}>
      <div style={{ flex: 1, height: '1px', background: '#e0e0e0' }} />
      <span style={{ fontSize: '.78rem', color: '#aaa', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: '1px', background: '#e0e0e0' }} />
    </div>
  );
}
