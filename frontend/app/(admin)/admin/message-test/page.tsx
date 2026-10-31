'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Pill, Empty } from '@/components/admin/Ui';

// Does each order template actually fill its variables in?
//
// It cannot be answered by reading code. A MSG91 flow's variables are whatever
// names were typed into the panel, and a key that does not match is not an
// error: the message is accepted, sent, and arrives with that variable blank.
// So the only honest test is to send the real template with values that say
// which slot they are, and read the SMS.

interface Variable {
  position: number;
  name: string;
  alsoSentAs: string[];
  testValue: string;
}

interface Template {
  template: string;
  dltName: string;
  settingKey: string;
  trigger: string;
  configured: boolean;
  variables: Variable[];
}

interface Info {
  smsConfigured: boolean;
  senderId: string;
  templates: Template[];
}

interface Result {
  ok: boolean;
  detail: string;
  dltName?: string;
  sent?: { position: number; name: string; value: string }[];
  howToRead?: string;
}

export default function MessageTestPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState('');
  const [results, setResults] = useState<Record<string, Result>>({});

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/message-test', {
          headers: { Authorization: `Bearer ${getAdminToken()}` },
        });
        setInfo(await r.json());
      } catch { setInfo(null); }
      finally { setLoading(false); }
    })();
  }, []);

  const send = async (template: string) => {
    setBusy(template);
    try {
      const r = await fetch('/api/message-test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, phone }),
      });
      const b = (await r.json()) as Result;
      setResults(prev => ({ ...prev, [template]: b }));
    } catch (e) {
      setResults(prev => ({ ...prev, [template]: { ok: false, detail: (e as Error).message } }));
    } finally {
      setBusy('');
    }
  };

  const ready = phone.replace(/\D/g, '').length >= 10;

  return (
    <div>
      <PageHeader
        title="Check the order messages"
        sub="Send each template to your own phone with values that name their own slot, and read what arrives."
      />

      <Card>
        <p style={{ margin: '0 0 .8rem', color: '#444', lineHeight: 1.6 }}>
          A variable whose name does not match the MSG91 flow is <strong>not</strong> reported as an
          error. MSG91 accepts the message, sends it, and leaves that space blank — which is why the
          Delivered text went out with nothing in the Order ID. The only way to see the truth is to
          send one and read it.
        </p>
        <p style={{ margin: '0 0 .8rem', color: '#444', lineHeight: 1.6 }}>
          Each test sends values like <code>1-NAME</code> and <code>2-ORDERID</code>. In the SMS that
          arrives, every blank should hold one of them. A space left empty means that variable has a
          different name in the flow; two values sitting in each other&apos;s places means the order
          has to be swapped. Tell me what arrives and I will correct it.
        </p>
        <p style={{ margin: 0, color: '#777', fontSize: '.9rem' }}>
          Nothing here is written to the message record, so a test never uses up a real
          customer&apos;s message. Each press sends one real SMS and costs what one SMS costs.
        </p>
      </Card>

      <Card>
        <label style={{ display: 'block', fontWeight: 700, marginBottom: '.4rem' }}>
          Send the tests to this mobile number
        </label>
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Your own number, 10 digits"
          inputMode="numeric"
          style={{
            width: '100%', maxWidth: 320, padding: '.6rem .7rem', borderRadius: 8,
            border: '1px solid #ccc', fontSize: '1rem',
          }}
        />
        {!ready && phone.length > 0 && (
          <p style={{ color: '#c0392b', margin: '.5rem 0 0', fontSize: '.9rem' }}>
            That is not a full mobile number yet.
          </p>
        )}
        {info && !info.smsConfigured && (
          <p style={{ color: '#c0392b', margin: '.6rem 0 0' }}>
            The MSG91 auth key is not set in Settings, so nothing can be sent.
          </p>
        )}
        {info && info.smsConfigured && (
          <p style={{ color: '#777', margin: '.6rem 0 0', fontSize: '.9rem' }}>
            Sender ID: <strong>{info.senderId}</strong>
          </p>
        )}
      </Card>

      {loading && <Card><p style={{ margin: 0 }}>Loading…</p></Card>}

      {!loading && !info && (
        <Card><Empty>Could not read the message settings. Open Settings and check the MSG91 section.</Empty></Card>
      )}

      {info?.templates.map(t => {
        const res = results[t.template];
        return (
          <Card key={t.template}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'center' }}>
              <strong style={{ fontSize: '1.05rem' }}>{t.dltName}</strong>
              {t.configured
                ? <Pill tone="green">Flow id saved</Pill>
                : <Pill tone="red">No flow id yet</Pill>}
              <span style={{ flex: 1 }} />
              <button
                onClick={() => send(t.template)}
                disabled={!ready || !t.configured || busy === t.template || !info.smsConfigured}
                style={{
                  background: ready && t.configured && info.smsConfigured ? '#722f37' : '#bbb',
                  color: '#fff', border: 0, borderRadius: 8, padding: '.55rem 1.1rem',
                  fontWeight: 700, cursor: ready && t.configured ? 'pointer' : 'not-allowed',
                }}
              >
                {busy === t.template ? 'Sending…' : 'Send test'}
              </button>
            </div>

            <p style={{ color: '#666', margin: '.5rem 0 .8rem' }}>{t.trigger}</p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.92rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#777' }}>
                  <th style={{ padding: '.3rem .4rem' }}>#</th>
                  <th style={{ padding: '.3rem .4rem' }}>We send it as</th>
                  <th style={{ padding: '.3rem .4rem' }}>Also as</th>
                  <th style={{ padding: '.3rem .4rem' }}>Test value</th>
                </tr>
              </thead>
              <tbody>
                {t.variables.map(v => (
                  <tr key={v.position} style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ padding: '.35rem .4rem' }}>{v.position}</td>
                    <td style={{ padding: '.35rem .4rem' }}><code>{v.name}</code></td>
                    <td style={{ padding: '.35rem .4rem', color: '#777' }}>
                      {v.alsoSentAs.join(', ')}
                    </td>
                    <td style={{ padding: '.35rem .4rem' }}><strong>{v.testValue}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {res && (
              <div style={{
                marginTop: '.9rem', padding: '.7rem .8rem', borderRadius: 8,
                background: res.ok ? '#eef8f1' : '#fdeeec',
                border: `1px solid ${res.ok ? '#bfe3cb' : '#f3c7c1'}`,
              }}>
                <p style={{ margin: 0, fontWeight: 700, color: res.ok ? '#1d7a46' : '#c0392b' }}>
                  {res.ok ? 'MSG91 accepted it — now read the SMS.' : 'Not sent.'}
                </p>
                <p style={{ margin: '.3rem 0 0', color: '#444' }}>{res.detail}</p>
                {res.howToRead && (
                  <p style={{ margin: '.4rem 0 0', color: '#666', fontSize: '.9rem' }}>
                    {res.howToRead}
                  </p>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
