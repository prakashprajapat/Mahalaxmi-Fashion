'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Stat, StatGrid, Pill, Empty } from '@/components/admin/Ui';

interface Health {
  ordersLast30Days: number;
  meta: {
    ok: boolean; pixelConfigured: boolean; tokenConfigured: boolean;
    lastResult: string; lastSentAt: string; lastOkAt: string; verdict: string;
  };
  ga4: { ok: boolean; measurementId: string; verdict: string };
  googleAds: { ok: boolean | null; verdict: string };
}

function when(raw: string) {
  if (!raw) return '';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? raw
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TrackingHealthPage() {
  const [h, setH] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/tracking-health', { headers: { Authorization: `Bearer ${getAdminToken()}` } });
      setH(await r.json());
    } catch { setH(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const sendTest = async () => {
    setTesting(true); setTestMsg(null);
    try {
      const r = await fetch('/api/tracking-health/test-meta', {
        method: 'POST', headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      const b = await r.json();
      setTestMsg({ ok: !!b.success, text: b.message ?? 'No answer from the server.' });
      await load();
    } catch (e) {
      setTestMsg({ ok: false, text: (e as Error).message });
    } finally { setTesting(false); }
  };

  const Verdict = ({ ok, text }: { ok: boolean | null; text: string }) => (
    <p style={{
      margin: 0, fontSize: '.88rem', lineHeight: 1.65,
      color: ok === true ? '#2e6b33' : ok === false ? '#8a3127' : '#6b615c',
    }}>{text}</p>
  );

  return (
    <div className="admin-page">
      <PageHeader
        title="Tracking"
        sub="Whether Meta and Google are actually being told when somebody buys something. An ad platform can only bid on sales it has heard about."
        right={<button className="adm-btn" onClick={load}>Refresh</button>}
      />

      {loading ? (
        <Card><Empty>Checking…</Empty></Card>
      ) : !h ? (
        <Card><Empty>Could not read the tracking status.</Empty></Card>
      ) : (
        <>
          <StatGrid>
            <Stat label="Orders in the last 30 days" value={h.ordersLast30Days} />
            <Stat label="Meta (Facebook / Instagram)" value={h.meta.ok ? 'Connected' : 'Not connected'}
                  tone={h.meta.ok ? 'green' : 'red'} />
            <Stat label="Google Analytics" value={h.ga4.ok ? 'Connected' : 'Browser only'}
                  tone={h.ga4.ok ? 'green' : 'red'} />
            <Stat label="Google Ads" value="Browser only" />
          </StatGrid>

          <Card title="Meta — Facebook and Instagram ads"
                style={{ borderColor: h.meta.ok ? '#cfe8d3' : '#f0d4d0',
                         background: h.meta.ok ? '#f3faf4' : '#fdf4f3' }}>
            <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', marginBottom: '.6rem' }}>
              <Pill tone={h.meta.pixelConfigured ? 'green' : 'red'}>
                Pixel ID {h.meta.pixelConfigured ? 'set' : 'missing'}
              </Pill>
              <Pill tone={h.meta.tokenConfigured ? 'green' : 'red'}>
                Conversions API token {h.meta.tokenConfigured ? 'set' : 'missing'}
              </Pill>
              {h.meta.lastOkAt && <Pill tone="green">Last accepted {when(h.meta.lastOkAt)}</Pill>}
            </div>

            <Verdict ok={h.meta.ok} text={h.meta.verdict} />

            {h.meta.lastResult && (
              <p style={{ margin: '.75rem 0 0', fontSize: '.8rem', color: '#6b615c',
                          background: '#fff', border: '1px solid #efe7e4', borderRadius: 8,
                          padding: '.6rem .7rem', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                {h.meta.lastResult}
                {h.meta.lastSentAt && <><br /><span style={{ color: '#9a908a' }}>at {when(h.meta.lastSentAt)}</span></>}
              </p>
            )}

            <div style={{ display: 'flex', gap: '.55rem', marginTop: '.9rem', flexWrap: 'wrap' }}>
              <button className="adm-btn adm-btn-primary" onClick={sendTest} disabled={testing}>
                {testing ? 'Sending…' : 'Send a test event'}
              </button>
              <a className="adm-btn" href="/admin/settings">Open Settings</a>
            </div>

            {testMsg && (
              <p style={{ marginTop: '.7rem', fontSize: '.85rem', fontWeight: 650,
                          color: testMsg.ok ? '#2e7d32' : '#c0392b', lineHeight: 1.6 }}>
                {testMsg.text}
              </p>
            )}

            <p style={{ margin: '.8rem 0 0', fontSize: '.78rem', color: '#8a7f76', lineHeight: 1.6 }}>
              The test sends a PageView, never a Purchase. A made-up sale would teach Meta&apos;s bidding
              something untrue and would show up in your own numbers as money you never took.
            </p>
          </Card>

          {!h.meta.tokenConfigured && (
            <Card title="How to get the token">
              <ol style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '.88rem', color: '#463d38', lineHeight: 1.9 }}>
                <li>Open <strong>business.facebook.com</strong> → <strong>Events Manager</strong>.</li>
                <li>Pick the dataset whose Pixel ID matches the one in your Settings.</li>
                <li><strong>Settings</strong> tab → scroll to <strong>Conversions API</strong>.</li>
                <li>Press <strong>Generate access token</strong> and copy it.</li>
                <li>Paste it into Settings → <strong>Meta Conversions API access token</strong> here, and Save.</li>
                <li>Come back and press <strong>Send a test event</strong>.</li>
              </ol>
              <p style={{ margin: '.8rem 0 0', fontSize: '.82rem', color: '#8a3127', lineHeight: 1.6 }}>
                Paste the token straight into Settings. Never send it in a chat, an email or a screenshot —
                anyone holding it can send events as your shop.
              </p>
            </Card>
          )}

          <Card title="Google Analytics">
            <Verdict ok={h.ga4.ok} text={h.ga4.verdict} />
          </Card>

          <Card title="Google Ads">
            <Verdict ok={h.googleAds.ok} text={h.googleAds.verdict} />
          </Card>
        </>
      )}
    </div>
  );
}
