'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminToken } from '@/lib/auth';

interface Row {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionValue: number;
}

interface Totals {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
  roas: number | null;
  costPerClick: number | null;
  costPerConversion: number | null;
}

interface Status {
  connected: boolean;
  customerId: string;
  hasOauthClient: boolean;
  redirectUri: string;
  apiVersion: string;
}

const RANGES = [7, 30, 90];

// Google hands back a code on the callback; turn it into something readable.
const CALLBACK_ERRORS: Record<string, string> = {
  access_denied: 'You cancelled the Google permission screen, so nothing was connected.',
  state_mismatch: 'That sign-in link had expired. Press Connect Google Ads again.',
  oauth_not_configured: 'Google OAuth Client ID / Secret are empty in Settings → Social Login Options.',
  token_exchange_failed: 'Google refused to complete the connection. Check that the redirect URI below is registered in Google Cloud.',
  no_refresh_token: 'Google did not return a lasting permission. Press Connect Google Ads again and choose Allow.',
  callback_exception: 'Something broke while completing the connection. The reason is in the server log.',
};

const money = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1rem 1.15rem' }}>
      <p style={{ margin: 0, fontSize: '.76rem', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#888' }}>{label}</p>
      <p style={{ margin: '.3rem 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#1a1a1a' }}>{value}</p>
      {hint && <p style={{ margin: '.15rem 0 0', fontSize: '.76rem', color: '#999' }}>{hint}</p>}
    </div>
  );
}

export default function GoogleAdsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Read the result of the Google round trip, then clean the URL so a refresh
  // does not show the same banner again.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const err = q.get('error');
    if (err) setError(CALLBACK_ERRORS[err] ?? `Google returned: ${err}`);
    if (q.get('connected')) setNotice('Google Ads is connected.');
    if (err || q.get('connected')) {
      try { window.history.replaceState({}, '', '/admin/google-ads'); } catch {}
    }
  }, []);

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/googleads/status', { headers: { Authorization: `Bearer ${getAdminToken()}` } });
    const data = await res.json();
    setStatus(data);
    return data as Status;
  }, []);

  const loadStats = useCallback(async (d: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/googleads/stats?days=${d}`, { headers: { Authorization: `Bearer ${getAdminToken()}` } });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setRows([]); setTotals(null);
        setError(data.message || 'Could not load Google Ads figures.');
        return;
      }
      setRows(data.rows ?? []);
      setTotals(data.totals ?? null);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const st = await loadStatus().catch(() => null);
      if (st?.connected) await loadStats(days);
      else setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeRange = (d: number) => { setDays(d); if (status?.connected) loadStats(d); };

  const connect = async () => {
    setConnecting(true);
    setError('');
    try {
      const res = await fetch('/api/googleads/oauth/start', { headers: { Authorization: `Bearer ${getAdminToken()}` } });
      const data = await res.json();
      if (!res.ok || !data.url) { setError(data.message || 'Could not start the Google sign-in.'); setConnecting(false); return; }
      window.location.href = data.url;
    } catch {
      setError('Could not reach the server.');
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Google Ads? The figures will stop loading until you connect again.')) return;
    await fetch('/api/googleads/disconnect', { method: 'POST', headers: { Authorization: `Bearer ${getAdminToken()}` } });
    setRows([]); setTotals(null); setNotice('Google Ads disconnected.');
    loadStatus();
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 .3rem' }}>Google Ads</h1>
      <p style={{ margin: '0 0 1.25rem', color: '#666', fontSize: '.9rem' }}>
        What the advertising cost, and what came back.
      </p>

      {notice && (
        <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', color: '#1b5e20', borderRadius: 10, padding: '.7rem 1rem', marginBottom: '1rem', fontSize: '.88rem' }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6c2', color: '#8a1c13', borderRadius: 10, padding: '.7rem 1rem', marginBottom: '1rem', fontSize: '.88rem' }}>
          {error}
        </div>
      )}

      {status && !status.connected && (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1.4rem' }}>
          <h2 style={{ margin: '0 0 .5rem', fontSize: '1.05rem', fontWeight: 700 }}>Connect your Google Ads account</h2>
          <p style={{ margin: '0 0 1rem', color: '#555', fontSize: '.9rem', lineHeight: 1.6 }}>
            You will be sent to Google once to allow read access. Nothing is changed in your
            campaigns — this only reads the numbers.
          </p>

          <ul style={{ margin: '0 0 1.1rem', paddingLeft: '1.1rem', color: '#555', fontSize: '.88rem', lineHeight: 1.8 }}>
            <li>Google OAuth credentials: {status.hasOauthClient
              ? <b style={{ color: '#1b5e20' }}>ready</b>
              : <b style={{ color: '#b71c1c' }}>missing — fill them in Settings → Social Login Options</b>}</li>
            <li>Customer ID: {status.customerId
              ? <b style={{ color: '#1b5e20' }}>{status.customerId}</b>
              : <b style={{ color: '#b71c1c' }}>missing — add it in Settings → Google Ads</b>}</li>
          </ul>

          <button
            onClick={connect}
            disabled={connecting || !status.hasOauthClient}
            style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: 8, padding: '.7rem 1.4rem', fontWeight: 700, fontSize: '.92rem', cursor: connecting ? 'default' : 'pointer', opacity: (connecting || !status.hasOauthClient) ? .6 : 1 }}>
            {connecting ? 'Opening Google…' : 'Connect Google Ads'}
          </button>

          <p style={{ margin: '1rem 0 0', fontSize: '.78rem', color: '#999', lineHeight: 1.6 }}>
            This redirect URI must be registered on the OAuth client in Google Cloud:<br />
            <code style={{ background: '#f5f5f5', padding: '.15rem .4rem', borderRadius: 4 }}>{status.redirectUri}</code>
          </p>
        </div>
      )}

      {status?.connected && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {RANGES.map(d => (
              <button key={d} onClick={() => changeRange(d)}
                style={{
                  border: '1.5px solid ' + (days === d ? '#a7354d' : '#ddd'),
                  background: days === d ? '#a7354d' : '#fff',
                  color: days === d ? '#fff' : '#555',
                  borderRadius: 999, padding: '.35rem .9rem', fontSize: '.84rem', fontWeight: 700, cursor: 'pointer',
                }}>
                Last {d} days
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button onClick={() => loadStats(days)}
              style={{ border: '1.5px solid #ddd', background: '#fff', borderRadius: 8, padding: '.35rem .8rem', fontSize: '.84rem', fontWeight: 600, cursor: 'pointer' }}>
              Refresh
            </button>
            <button onClick={disconnect}
              style={{ border: 'none', background: 'none', color: '#999', fontSize: '.82rem', cursor: 'pointer', textDecoration: 'underline' }}>
              Disconnect
            </button>
          </div>

          {loading && <p style={{ color: '#999' }}>Loading…</p>}

          {!loading && totals && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.8rem', marginBottom: '1.25rem' }}>
                <Stat label="Spend" value={money(totals.spend)} />
                <Stat label="Sales from ads" value={money(totals.conversionValue)}
                  hint={`${num(totals.conversions)} conversions`} />
                <Stat label="Return on spend"
                  value={totals.roas === null ? '—' : `₹${num(totals.roas)}`}
                  hint={totals.roas === null ? 'nothing spent yet' : 'back for every ₹1 spent'} />
                <Stat label="Clicks" value={num(totals.clicks)}
                  hint={totals.costPerClick === null ? undefined : `${money(totals.costPerClick)} per click`} />
                <Stat label="Impressions" value={num(totals.impressions)} />
                <Stat label="Cost per sale"
                  value={totals.costPerConversion === null ? '—' : money(totals.costPerConversion)}
                  hint={totals.costPerConversion === null ? 'no conversions yet' : undefined} />
              </div>

              {rows.length === 0 ? (
                <p style={{ color: '#888', fontSize: '.9rem' }}>
                  No activity in this period. If your campaigns are paused, that is expected.
                </p>
              ) : (
                <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, overflowX: 'auto' }}>
                  <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
                    <thead>
                      <tr style={{ background: '#fafafa', textAlign: 'left' }}>
                        <th style={{ padding: '.6rem .8rem' }}>Date</th>
                        <th style={{ padding: '.6rem .8rem' }}>Impressions</th>
                        <th style={{ padding: '.6rem .8rem' }}>Clicks</th>
                        <th style={{ padding: '.6rem .8rem' }}>Spend</th>
                        <th style={{ padding: '.6rem .8rem' }}>Conversions</th>
                        <th style={{ padding: '.6rem .8rem' }}>Sales value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice().reverse().map(r => (
                        <tr key={r.date} style={{ borderTop: '1px solid #f2f2f2' }}>
                          <td data-label="Date" style={{ padding: '.55rem .8rem', whiteSpace: 'nowrap' }}>
                            {new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </td>
                          <td data-label="Impressions" style={{ padding: '.55rem .8rem' }}>{num(r.impressions)}</td>
                          <td data-label="Clicks" style={{ padding: '.55rem .8rem' }}>{num(r.clicks)}</td>
                          <td data-label="Spend" style={{ padding: '.55rem .8rem' }}>{money(r.cost)}</td>
                          <td data-label="Conversions" style={{ padding: '.55rem .8rem' }}>{num(r.conversions)}</td>
                          <td data-label="Sales value" style={{ padding: '.55rem .8rem' }}>{money(r.conversionValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p style={{ margin: '1rem 0 0', fontSize: '.78rem', color: '#999', lineHeight: 1.7 }}>
                These are Google&apos;s own figures for account {status.customerId}. &ldquo;Sales from ads&rdquo; counts
                only the orders Google could attribute to an ad, so it will not match{' '}
                <Link href="/admin/reports" style={{ color: '#a7354d' }}>Reports</Link> exactly — that page counts every order.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
