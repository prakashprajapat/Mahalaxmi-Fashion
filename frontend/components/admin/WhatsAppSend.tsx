'use client';
import { useEffect, useState } from 'react';
import { storage } from '@/lib/safeStorage';
import { whatsAppNumber, whatsAppWebLink, whatsAppDesktopLink } from '@/lib/shopInvite';

// Which WhatsApp to open — asked once, then remembered.
//
// This took three wrong answers to get right, so the reasoning is written down
// rather than left for somebody to rediscover.
//
// The obvious link is wa.me/<number>?text=<message>. But wa.me is not WhatsApp:
// it is a redirect that takes the link apart and builds it again before handing
// it on, and that rebuild is where the emoji have been turning into black
// diamonds. The address bar gave it away — spaces arriving as + and asterisks as
// %2A, neither of which this code writes.
//
// web.whatsapp.com/send is reached directly, with no redirect in between, so the
// message should arrive exactly as written. It needs its own sign-in.
//
// And if even that fails, the third choice drops the emoji rather than sending
// diamonds, because a message full of black diamonds reads as a broken shop
// while the same words without emoji read as a plain one.
//
// Guessing which of these the shop should live with produced two bad answers in
// a row, so it is asked, once, and the answer is kept.

const KEY = 'mfh_whatsapp_mode';
type Mode = 'web' | 'app' | 'plain';

function savedMode(): Mode | null {
  const v = storage.get(KEY);
  return v === 'web' || v === 'app' || v === 'plain' ? v : null;
}

function open(mode: Mode, phone?: string, firstName?: string) {
  const url = mode === 'web'
    ? whatsAppWebLink(phone, firstName, true)
    : whatsAppDesktopLink(phone, firstName, mode === 'app');
  if (url) window.open(url, '_blank', 'noopener');
}

const MODE_LABEL: Record<Mode, string> = {
  web: 'WhatsApp Web',
  app: 'the app on this computer',
  plain: 'the app on this computer, without emoji',
};

export function WhatsAppSendButton({ phone, firstName }: { phone?: string; firstName?: string }) {
  const [asking, setAsking] = useState(false);

  if (!whatsAppNumber(phone)) {
    return <span title="No usable mobile number here" style={{ color: '#c4bab5' }}>WhatsApp</span>;
  }

  const go = () => {
    const mode = savedMode();
    if (mode) { open(mode, phone, firstName); return; }
    setAsking(true);
  };

  const choose = (mode: Mode) => {
    storage.set(KEY, mode);
    setAsking(false);
    open(mode, phone, firstName);
    window.dispatchEvent(new Event('mfh-whatsapp-mode'));
  };

  const card: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
    border: '1.5px solid #e3dad6', background: '#fff', borderRadius: 10,
    padding: '.8rem 1rem', marginBottom: '.55rem',
  };
  const head: React.CSSProperties = { display: 'block', fontWeight: 700, fontSize: '.9rem', color: '#2d2724' };
  const sub: React.CSSProperties = { display: 'block', fontSize: '.8rem', color: '#6b615c', lineHeight: 1.55, marginTop: '.2rem' };

  return (
    <>
      <button onClick={go} style={{ color: '#128C7E', fontWeight: 650 }}>WhatsApp</button>

      {asking && (
        <div onClick={() => setAsking(false)}
             style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: '#fff', borderRadius: 14, padding: '1.4rem', width: '100%', maxWidth: 460,
                        maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#2d2724' }}>
              Which WhatsApp should open?
            </h2>
            <p style={{ margin: '.4rem 0 1.1rem', fontSize: '.85rem', color: '#6b615c', lineHeight: 1.6 }}>
              Asked once. Try the first; if the emoji still come through wrong, change it to the last
              one, which cannot go wrong.
            </p>

            <button onClick={() => choose('web')}
                    style={{ ...card, border: '1.5px solid #cfe9df', background: '#f6fbf9' }}>
              <span style={{ ...head, color: '#0f6b57' }}>WhatsApp Web</span>
              <span style={sub}>
                Opens in a browser tab, with the message written and the emoji intact. Sign in once at
                web.whatsapp.com by scanning the code with your phone, and it stays signed in.
              </span>
            </button>

            <button onClick={() => choose('app')} style={card}>
              <span style={head}>The WhatsApp app on this computer</span>
              <span style={sub}>
                No signing in — it is already open. The emoji may arrive as black diamonds; the words
                and the links come through fine.
              </span>
            </button>

            <button onClick={() => choose('plain')} style={card}>
              <span style={head}>The app, without emoji</span>
              <span style={sub}>
                The same message in plain text. Nothing to go wrong, and nothing arrives looking
                broken. Use this if the other two disappoint.
              </span>
            </button>

            <button onClick={() => setAsking(false)}
                    style={{ display: 'block', width: '100%', marginTop: '.5rem', background: 'none',
                             border: 'none', color: '#9a908a', fontSize: '.85rem', fontWeight: 600,
                             cursor: 'pointer', padding: '.4rem' }}>
              Not now
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** The line above the table: what WhatsApp will do, and how to change it. */
export function WhatsAppModeNote() {
  const [mode, setMode] = useState<Mode | null>(null);

  // Read after mount, never during render: the server has no localStorage, and
  // a value that differs between the two is a hydration mismatch.
  useEffect(() => {
    const read = () => setMode(savedMode());
    read();
    window.addEventListener('mfh-whatsapp-mode', read);
    return () => window.removeEventListener('mfh-whatsapp-mode', read);
  }, []);

  const forget = () => {
    storage.remove(KEY);
    setMode(null);
    window.dispatchEvent(new Event('mfh-whatsapp-mode'));
  };

  return (
    <p style={{ fontSize: '.75rem', color: '#8a7f76', margin: '0 0 .7rem' }}>
      WhatsApp opens with the message already written — just press Send.{' '}
      {mode === null
        ? <>You will be asked once which WhatsApp to use. </>
        : <>Using <strong>{MODE_LABEL[mode]}</strong>. </>}
      {mode && (
        <button onClick={forget}
                style={{ background: 'none', border: 'none', padding: 0, color: '#722f37',
                         fontWeight: 700, fontSize: '.75rem', cursor: 'pointer', textDecoration: 'underline' }}>
          change
        </button>
      )}
    </p>
  );
}
