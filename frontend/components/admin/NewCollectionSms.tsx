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
 * The other one texts a few hundred people and costs the shop a few hundred
 * messages, so it will not send on a single press: the first press asks the
 * server who would get it and shows the count, and only the second press
 * sends. A number is never in that list twice.
 *
 * Who waits, and how long:
 *
 *   ordered, not cancelled      30 days from the order
 *   the order was cancelled     48 hours - a sale that nearly happened is the
 *                               warmest lead there is
 *   already texted              48 hours, unless Resend is pressed
 *
 * Resend sets aside the text rule and only that one. Somebody who spent money
 * yesterday is not sent an advert however many times the button is pressed.
 */

interface Preview {
  success: boolean;
  configured: boolean;
  willSend: number;
  thisPress: number;
  leftAfter: number;
  resend: boolean;
  skipped: {
    noNumber: number;
    orderedInTheLast30Days: number;
    cancelledInTheLast48Hours: number;
    textedInTheLast48Hours: number;
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
    // No waiting period on this one: the shop is looking at the name.
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
  const [resend, setResend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');

  const look = async (opted = optedInOnly, again = resend) => {
    setBusy(true); setResult('');
    setOptedInOnly(opted); setResend(again);
    try {
      const res = await fetch(
        `/api/outreach/sms/preview?audience=${audience}&optedInOnly=${opted}&resend=${again}`,
        { headers: { Authorization: `Bearer ${getAdminToken()}` } });
      setPreview(await res.json());
    } catch {
      setResult('Could not ask the server who would get this.');
    } finally { setBusy(false); }
  };

  const send = async () => {
    setBusy(true); setResult('');
    const b = await post('/api/outreach/sms/everyone', { audience, optedInOnly, resend });
    setBusy(false);
    setResult(b?.message || 'Done.');
    setPreview(null);
    onDone();
  };

  const s = preview?.skipped;

  return (
    <div>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <button className="adm-btn" onClick={() => look(optedInOnly, false)} disabled={busy}>
          {busy && !preview ? 'Checking…' : 'Text everyone who is due'}
        </button>
        {/* The same send with the 48-hour text rule set aside, and nothing
            else. A separate button rather than a tick box, because it costs
            money and should take a decision rather than a glance. */}
        <button className="adm-btn" onClick={() => look(optedInOnly, true)} disabled={busy}
                title="Send again to people already texted in the last 48 hours">
          Resend
        </button>
      </div>

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
              Nobody is due right now. {s?.orderedInTheLast30Days ?? 0} ordered in the last 30 days,{' '}
              {s?.cancelledInTheLast48Hours ?? 0} cancelled in the last 48 hours and{' '}
              {s?.textedInTheLast48Hours ?? 0} were texted in the last 48 hours.
            </p>
          ) : (
            <>
              <p style={{ margin: '0 0 .4rem', fontWeight: 700, color: '#6b4e13' }}>
                {preview.resend ? 'Resend: this sends ' : 'This sends '}
                {preview.thisPress} text{preview.thisPress === 1 ? '' : 's'}
                {preview.leftAfter > 0 ? `, with ${preview.leftAfter} left for the next press` : ''}.
              </p>
              <p style={{ margin: '0 0 .5rem', fontSize: '.84rem', color: '#6b4e13', lineHeight: 1.6 }}>
                Left out: {s?.orderedInTheLast30Days ?? 0} who ordered in the last 30 days,{' '}
                {s?.cancelledInTheLast48Hours ?? 0} whose order was cancelled in the last 48 hours,{' '}
                {preview.resend
                  ? 'nobody for having been texted - this is a resend'
                  : `${s?.textedInTheLast48Hours ?? 0} texted in the last 48 hours`},{' '}
                {s?.noNumber ?? 0} with no mobile number
                {(s?.sameNumberTwice ?? 0) > 0 ? `, ${s?.sameNumberTwice} whose number is already in this list` : ''}
                {(s?.notOptedIn ?? 0) > 0 ? `, ${s?.notOptedIn} who have not agreed to offers` : ''}.
              </p>
              {audience === 'customer' && (
                <label style={{ display: 'block', fontSize: '.84rem', color: '#6b4e13', marginBottom: '.6rem' }}>
                  <input type="checkbox" checked={optedInOnly}
                    onChange={e => look(e.target.checked, resend)} />
                  {' '}Only the ones who ticked &ldquo;send me offers&rdquo;
                </label>
              )}
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button className="adm-btn adm-btn-primary" onClick={send} disabled={busy}>
                  {busy ? 'Sending…' : `Yes, ${preview.resend ? 'resend' : 'send'} ${preview.thisPress}`}
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
