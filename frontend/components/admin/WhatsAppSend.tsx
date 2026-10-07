'use client';
import { useEffect, useState } from 'react';
import { storage } from '@/lib/safeStorage';
import { whatsAppNumber, whatsAppWebLink, whatsAppDesktopLink } from '@/lib/shopInvite';

// Which WhatsApp to open — asked once, then remembered.
//
// There are two on this machine and they are not interchangeable. The installed
// app is where the shop already works all day, so opening a chat there is the
// natural thing. But a message handed to it through a link travels browser ->
// Windows -> app, and that handover drops anything outside the old Windows-1252
// character set: the first real send arrived with every emoji turned into a
// black diamond. WhatsApp Web keeps every character, because nothing ever
// leaves the browser, but it needs its own sign-in.
//
// Neither is right for everybody, and guessing produced two wrong answers in a
// row. So the first click asks, in one sentence each, and the answer is kept.
// It can be changed later from the line above the table.

const KEY = 'mfh_whatsapp_mode';
type Mode = 'web' | 'app';

function savedMode(): Mode | null {
  const v = storage.get(KEY);
  return v === 'web' || v === 'app' ? v : null;
}

function open(mode: Mode, phone?: string, firstName?: string) {
  const url = mode === 'web' ? whatsAppWebLink(phone, firstName) : whatsAppDesktopLink(phone, firstName);
  if (url) window.open(url, '_blank', 'noopener');
}

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

  return (
    <>
      <button onClick={go} style={{ color: '#128C7E', fontWeight: 650 }}>WhatsApp</button>

      {asking && (
        <div onClick={() => setAsking(false)}
             style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: '#fff', borderRadius: 14, padding: '1.4rem', width: '100%', maxWidth: 440 }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#2d2724' }}>
              Which WhatsApp should open?
            </h2>
            <p style={{ margin: '.4rem 0 1.1rem', fontSize: '.85rem', color: '#6b615c', lineHeight: 1.6 }}>
              Asked once. You can change it later from the line above the list.
            </p>

            <button onClick={() => choose('web')}
                    style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                             border: '1.5px solid #cfe9df', background: '#f6fbf9', borderRadius: 10,
                             padding: '.85rem 1rem', marginBottom: '.6rem' }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '.92rem', color: '#0f6b57' }}>
                WhatsApp Web (recommended)
              </span>
              <span style={{ display: 'block', fontSize: '.82rem', color: '#5a6b66', lineHeight: 1.55, marginTop: '.2rem' }}>
                Opens in a browser tab with the message written, emoji and all. Needs signing in
                once at web.whatsapp.com by scanning the code with your phone.
              </span>
            </button>

            <button onClick={() => choose('app')}
                    style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                             border: '1.5px solid #e3dad6', background: '#fff', borderRadius: 10,
                             padding: '.85rem 1rem' }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '.92rem', color: '#2d2724' }}>
                The WhatsApp app on this computer
              </span>
              <span style={{ display: 'block', fontSize: '.82rem', color: '#6b615c', lineHeight: 1.55, marginTop: '.2rem' }}>
                No signing in — it is already open. On Windows the emoji in the message may arrive
                as black diamonds; the words and the links come through fine.
              </span>
            </button>

            <button onClick={() => setAsking(false)}
                    style={{ display: 'block', width: '100%', marginTop: '.9rem', background: 'none',
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
      {mode === 'web' && <>Using <strong>WhatsApp Web</strong>. </>}
      {mode === 'app' && <>Using <strong>the app on this computer</strong>. </>}
      {mode === null && <>You will be asked once which WhatsApp to use. </>}
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
