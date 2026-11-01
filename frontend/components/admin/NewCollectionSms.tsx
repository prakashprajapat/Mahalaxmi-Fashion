'use client';
import { useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { shortDate, type Audience, type SendRecord } from '@/lib/outreach';

/**
 * The one promotional text, sent from the Popup Leads and Customers screens.
 *
 * Two buttons, and they are deliberately not the same kind of thing.
 *
 * The row button texts one person because somebody looked at that row and
 * decided. It asks no questions.
 *
 * The other one texts everybody who has never bought, which on this shop is
 * two hundred-odd people and two hundred-odd messages the shop pays for. So it
 * will not send on a single press: the first press asks the server who would
 * get it and shows the count, and only the second press sends. A number is
 * never in that list twice, anyone who has ever ordered is left out, and
 * anyone texted in the last thirty days is left out.
 */

interface Preview {
  success: boolean;
  configured: boolean;
  willSend: number;
  thisPress: number;
  leftAfter: number;
  skipped: {
    noNumber: number;
    alreadyBought: number;
    textedInTheLast30Days: number;
    notOptedIn: number;
    sameNumberTwice: number;
  };
}

const post = async (url: string, body: unknown) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ success: false, message: 'No answer from the server.' }));
};

/** One row's button. */
export function SmsSendButton({ audience, personId, phone, sent, onSent }: {
  audience: Audience; personId: number; phone?: string | null;
  sent?: SendRecord; onSent: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!phone) return <span title="No mobile number on this row" style={{ color: '#c4bab5' }}>SMS</span>;

  const go = async () => {
    if (sent && !confirm(`This number was already texted on ${shortDate(sent.sentAt)}. Send it again?`)) return;
    setBusy(true);
    const b = await post('/api/outreach/sms/one', { audience, personId });
    setBusy(false);
    if (b?.success) onSent(); else alert(b?.message || 'That text did not go.');
  };

  return (
    <button onClick={go} disabled={busy} style={{ color: '#a7354d' }}
      title={sent ? `Texted on ${shortDate(sent.sentAt)} - click to send again` : 'Text the new-collection message'}>
      {busy ? 'Sending…' : sent ? 'SMS ✓' : 'SMS'}
    </button>
  );
}

/** The one at the top of the page. */
export function TextEveryoneButton({ audience, onDone }: { audience: Audience; onDone: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [optedInOnly, setOptedInOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');

  const look = async (opted = optedInOnly) => {
    setBusy(true); setResult('');
    try {
      const res = await fetch(`/api/outreach/sms/preview?audience=${audience}&optedInOnly=${opted}`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      setPreview(await res.json());
    } catch {
      setResult('Could not ask the server who would get this.');
    } finally { setBusy(false); }
  };

  const send = async () => {
    setBusy(true); setResult('');
    const b = await post('/api/outreach/sms/everyone', { audience, optedInOnly });
    setBusy(false);
    setResult(b?.message || 'Done.');
    setPreview(null);
    onDone();
  };

  const s = preview?.skipped;

  return (
    <div>
      <button className="adm-btn" onClick={() => look()} disabled={busy}>
        {busy && !preview ? 'Checking…' : 'Text everyone who never bought'}
      </button>

      {preview && (
        <div style={{
          marginTop: '.7rem', padding: '.8rem .9rem', borderRadius: 10,
          background: '#fdf6ee', border: '1px solid #ecd9bd', maxWidth: 520,
        }}>
          {!preview.configured ? (
            <p style={{ margin: 0, color: '#8c5a1a' }}>
              No MSG91 flow id for this message in Settings yet, so nothing can be sent.
              Settings has a box for it.
            </p>
          ) : preview.willSend === 0 ? (
            <p style={{ margin: 0, color: '#8c5a1a' }}>
              Nobody to text right now. {s?.alreadyBought ?? 0} have bought before and{' '}
              {s?.textedInTheLast30Days ?? 0} were texted in the last 30 days.
            </p>
          ) : (
            <>
              <p style={{ margin: '0 0 .4rem', fontWeight: 700, color: '#6b4e13' }}>
                This sends {preview.thisPress} text{preview.thisPress === 1 ? '' : 's'}
                {preview.leftAfter > 0 ? `, with ${preview.leftAfter} left for the next press` : ''}.
              </p>
              <p style={{ margin: '0 0 .5rem', fontSize: '.84rem', color: '#6b4e13', lineHeight: 1.6 }}>
                Left out: {s?.alreadyBought ?? 0} who have ordered before,{' '}
                {s?.textedInTheLast30Days ?? 0} texted in the last 30 days,{' '}
                {s?.noNumber ?? 0} with no mobile number
                {(s?.sameNumberTwice ?? 0) > 0 ? `, ${s?.sameNumberTwice} whose number is already in this list` : ''}
                {(s?.notOptedIn ?? 0) > 0 ? `, ${s?.notOptedIn} who have not agreed to offers` : ''}.
              </p>
              {audience === 'customer' && (
                <label style={{ display: 'block', fontSize: '.84rem', color: '#6b4e13', marginBottom: '.6rem' }}>
                  <input type="checkbox" checked={optedInOnly}
                    onChange={e => { setOptedInOnly(e.target.checked); look(e.target.checked); }} />
                  {' '}Only the ones who ticked &ldquo;send me offers&rdquo;
                </label>
              )}
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button className="adm-btn adm-btn-primary" onClick={send} disabled={busy}>
                  {busy ? 'Sending…' : `Yes, send ${preview.thisPress}`}
                </button>
                <button className="adm-btn" onClick={() => setPreview(null)} disabled={busy}>Not now</button>
              </div>
            </>
          )}
        </div>
      )}

      {result && (
        <p style={{ marginTop: '.6rem', fontSize: '.86rem', color: '#2e7d32', fontWeight: 600 }}>{result}</p>
      )}
    </div>
  );
}
