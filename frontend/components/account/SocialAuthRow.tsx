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
// A provider appears only when the shop has switched it on AND given it a key.
// Settings already had "Enable Google Login" and "Enable Facebook Login"
// toggles; the navbar honoured them and this row did not, so a provider the shop
// had deliberately turned off still showed a button here.
//
// A switched-off provider is HIDDEN, not greyed. Facebook refuses an app that is
// not Live with "App Not Active", and a greyed - or worse, live-looking - button
// that always ends in an error page is worse than no button: the other two grow
// to fill the row and nothing looks missing. Turning Facebook off in Settings is
// now a complete fix on its own, no deploy needed.

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
  const [google, setGoogle] = useState('');     // client id, only when switched on
  const [facebook, setFacebook] = useState('');  // app id, only when switched on
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        const s = d?.settings ?? {};
        setGoogle(s.enableGoogleLogin === 'true' ? (s.googleClientId ?? '').trim() : '');
        setFacebook(s.enableFacebookLogin === 'true' ? (s.facebookAppId ?? '').trim() : '');
      })
      .catch(() => { /* neither shows, which is the honest state when nothing loaded */ });
  }, []);

  const callbackUrl = `${origin}/account/social-callback`;
  const ready = Boolean(origin);

  const googleHref = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${google}`
    + `&redirect_uri=${encodeURIComponent(callbackUrl)}`
    + `&response_type=code&scope=email%20profile&prompt=select_account&state=google`;

  const facebookHref = `https://www.facebook.com/${FB_DIALOG_VERSION}/dialog/oauth?client_id=${facebook}`
    + `&redirect_uri=${encodeURIComponent(callbackUrl)}`
    + `&scope=email,public_profile&response_type=code&state=facebook`;

  const live: React.CSSProperties = {
    flex: 1, height: 46, borderRadius: 9, background: '#fff', color: '#333',
    fontWeight: 700, fontSize: '.82rem', textDecoration: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem',
    border: '1.5px solid #ddd', cursor: 'pointer',
  };
  const GoogleMark = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );

  const FacebookMark = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877f2" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );

  return (
    <div style={{ display: 'flex', gap: '.6rem' }}>
      {google && ready && (
        <a href={googleHref} style={live} aria-label="Continue with Google">
          <GoogleMark /> Google
        </a>
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

      {facebook && ready && (
        <a href={facebookHref} style={live} aria-label="Continue with Facebook">
          <FacebookMark /> Facebook
        </a>
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
