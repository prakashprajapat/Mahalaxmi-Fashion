'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Stat } from '@/components/admin/Ui';

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

interface Campaign {
  id: string;
  name: string;
  status: string;
  channel: string;
  budgetResource: string;
  dailyBudget: number;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
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


export default function GoogleAdsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [maxBudget, setMaxBudget] = useState(5000);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [confirming, setConfirming] = useState<{ c: Campaign; next: number } | null>(null);
  const [busy, setBusy] = useState('');

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
      if (st?.connected) { await loadStats(days); await loadCampaigns(days); }
      else setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCampaigns = useCallback(async (d: number) => {
    try {
      const res = await fetch(`/api/googleads/campaigns?days=${d}`, { headers: { Authorization: `Bearer ${getAdminToken()}` } });
      const data = await res.json();
      if (res.ok && data.success) {
        setCampaigns(data.campaigns ?? []);
        if (data.maxDailyBudget) setMaxBudget(Number(data.maxDailyBudget));
      }
    } catch { /* the totals above are the important part; a campaign list failure is not fatal */ }
  }, []);

  const changeRange = (d: number) => {
    setDays(d);
    if (status?.connected) { loadStats(d); loadCampaigns(d); }
  };

  const toggleStatus = async (c: Campaign) => {
    const next = c.status === 'ENABLED' ? 'PAUSED' : 'ENABLED';
    setBusy(c.id);
    setError('');
    try {
      const res = await fetch(`/api/googleads/campaigns/${c.id}/status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.message || 'Could not change the campaign.'); return; }
      setCampaigns(list => list.map(x => x.id === c.id ? { ...x, status: next } : x));
      setNotice(`${c.name} is now ${next === 'ENABLED' ? 'running' : 'paused'}.`);
    } catch {
      setError('Could not reach the server.');
    } finally { setBusy(''); }
  };

  const applyBudget = async () => {
    if (!confirming) return;
    const { c, next } = confirming;
    setBusy(c.id);
    setError('');
    try {
      const res = await fetch('/api/googleads/budget', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgetResource: c.budgetResource, amount: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.message || 'Could not change the budget.'); return; }
      setCampaigns(list => list.map(x => x.id === c.id ? { ...x, dailyBudget: Number(data.dailyBudget) } : x));
      setNotice(`${c.name} budget is now ${money(Number(data.dailyBudget))} a day.`);
      setEditing(null);
    } catch {
      setError('Could not reach the server.');
    } finally { setBusy(''); setConfirming(null); }
  };

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
    <div className="admin-page" style={{ maxWidth: 1100 }}>
      <PageHeader
        title="Google Ads"
        sub="What the advertising cost, and what came back. Reading only - nothing here changes a campaign except the budget box, which says so."
      />

      {notice && (
        <div className="adm-card" style={{ background: '#f2faf3', borderColor: '#cbe6cf', color: '#2e7d32', marginBottom: '.85rem', fontSize: '.86rem', fontWeight: 600 }}>
          {notice}
        </div>
      )}
      {error && (
        <div className="adm-card" style={{ background: '#fdf3f2', borderColor: '#f0cdc9', color: '#c0392b', marginBottom: '.85rem', fontSize: '.86rem', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {status && !status.connected && (
        <div className="adm-card" style={{ padding: '1.1rem 1.15rem' }}>
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
            className="adm-btn adm-btn-primary">
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
            <button onClick={() => { loadStats(days); loadCampaigns(days); }}
              className="adm-btn" style={{ padding: '.35rem .8rem', fontSize: '.8rem' }}>
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
                  action={`${num(totals.conversions)} conversions`} />
                <Stat label="Return on spend"
                  value={totals.roas === null ? '—' : `₹${num(totals.roas)}`}
                  action={totals.roas === null ? 'nothing spent yet' : 'back for every ₹1 spent'} />
                <Stat label="Clicks" value={num(totals.clicks)}
                  action={totals.costPerClick === null ? undefined : `${money(totals.costPerClick)} per click`} />
                <Stat label="Impressions" value={num(totals.impressions)} />
                <Stat label="Cost per sale"
                  value={totals.costPerConversion === null ? '—' : money(totals.costPerConversion)}
                  action={totals.costPerConversion === null ? 'no conversions yet' : undefined} />
              </div>

              {rows.length === 0 ? (
                <p style={{ color: '#888', fontSize: '.9rem' }}>
                  No activity in this period. If your campaigns are paused, that is expected.
                </p>
              ) : (
                <div className="adm-card adm-table-wrap" style={{ padding: 0 }}>
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

              {campaigns.length > 0 && (
                <div style={{ marginTop: '1.75rem' }}>
                  <h2 style={{ fontSize: '1.02rem', fontWeight: 700, margin: '0 0 .2rem' }}>Campaigns</h2>
                  <p style={{ margin: '0 0 .8rem', color: '#777', fontSize: '.84rem' }}>
                    Pause or restart a campaign, and change what it may spend in a day. Changes reach Google straight away.
                  </p>

                  <div className="adm-card adm-table-wrap" style={{ padding: 0 }}>
                    <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
                      <thead>
                        <tr style={{ background: '#fafafa', textAlign: 'left' }}>
                          <th style={{ padding: '.6rem .8rem' }}>Campaign</th>
                          <th style={{ padding: '.6rem .8rem' }}>Daily budget</th>
                          <th style={{ padding: '.6rem .8rem' }}>Spend</th>
                          <th style={{ padding: '.6rem .8rem' }}>Clicks</th>
                          <th style={{ padding: '.6rem .8rem' }}>Sales</th>
                          <th style={{ padding: '.6rem .8rem' }}>State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map(c => {
                          const on = c.status === 'ENABLED';
                          const isEditing = editing?.id === c.id;
                          return (
                            <tr key={c.id} style={{ borderTop: '1px solid #f2f2f2' }}>
                              <td data-label="Campaign" style={{ padding: '.6rem .8rem' }}>
                                <b>{c.name}</b>
                                <span style={{ display: 'block', fontSize: '.74rem', color: '#999' }}>
                                  {c.channel.replace(/_/g, ' ').toLowerCase()}
                                </span>
                              </td>

                              <td data-label="Daily budget" style={{ padding: '.6rem .8rem', whiteSpace: 'nowrap' }}>
                                {isEditing ? (
                                  <span style={{ display: 'inline-flex', gap: '.35rem', alignItems: 'center' }}>
                                    <span>₹</span>
                                    <input
                                      type="number" min={1} max={maxBudget} step={1}
                                      value={editing.value}
                                      onChange={e => setEditing({ id: c.id, value: e.target.value })}
                                      className="adm-input" style={{ width: 92, padding: '.3rem .45rem' }} />
                                    <button
                                      onClick={() => {
                                        const next = Math.round(Number(editing.value));
                                        if (!Number.isFinite(next) || next <= 0) { setError('Enter a daily budget above ₹0.'); return; }
                                        if (next > maxBudget) { setError(`₹${next} is above the ₹${maxBudget} limit set in Settings.`); return; }
                                        if (next === Math.round(c.dailyBudget)) { setEditing(null); return; }
                                        setConfirming({ c, next });
                                      }}
                                      className="adm-btn adm-btn-primary" style={{ padding: '.3rem .6rem', fontSize: '.76rem' }}>
                                      Save
                                    </button>
                                    <button onClick={() => setEditing(null)}
                                      style={{ border: 'none', background: 'none', color: '#999', fontSize: '.78rem', cursor: 'pointer' }}>
                                      Cancel
                                    </button>
                                  </span>
                                ) : (
                                  <span style={{ display: 'inline-flex', gap: '.5rem', alignItems: 'center' }}>
                                    {money(c.dailyBudget)}
                                    <button
                                      onClick={() => { setEditing({ id: c.id, value: String(Math.round(c.dailyBudget)) }); setError(''); }}
                                      style={{ border: 'none', background: 'none', color: '#a7354d', fontSize: '.78rem', cursor: 'pointer', textDecoration: 'underline' }}>
                                      change
                                    </button>
                                  </span>
                                )}
                              </td>

                              <td data-label="Spend" style={{ padding: '.6rem .8rem' }}>{money(c.spend)}</td>
                              <td data-label="Clicks" style={{ padding: '.6rem .8rem' }}>{num(c.clicks)}</td>
                              <td data-label="Sales" style={{ padding: '.6rem .8rem' }}>
                                {money(c.conversionValue)}
                                <span style={{ display: 'block', fontSize: '.74rem', color: '#999' }}>{num(c.conversions)} conv.</span>
                              </td>

                              <td data-label="State" style={{ padding: '.6rem .8rem', whiteSpace: 'nowrap' }}>
                                <span style={{
                                  display: 'inline-block', marginRight: '.5rem', fontSize: '.74rem', fontWeight: 700,
                                  color: on ? '#1b5e20' : '#888',
                                }}>
                                  {on ? '● Running' : '❚❚ Paused'}
                                </span>
                                <button
                                  onClick={() => toggleStatus(c)}
                                  disabled={busy === c.id}
                                  style={{
                                    border: '1.5px solid ' + (on ? '#ddd' : '#a7354d'),
                                    background: on ? '#fff' : '#a7354d',
                                    color: on ? '#555' : '#fff',
                                    borderRadius: 6, padding: '.3rem .7rem', fontSize: '.78rem', fontWeight: 700,
                                    cursor: busy === c.id ? 'default' : 'pointer', opacity: busy === c.id ? .6 : 1,
                                  }}>
                                  {busy === c.id ? '…' : on ? 'Pause' : 'Start'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {confirming && (
                    <div style={{ marginTop: '.9rem', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 10, padding: '.9rem 1.1rem' }}>
                      <p style={{ margin: '0 0 .2rem', fontWeight: 700, fontSize: '.92rem' }}>Change this daily budget?</p>
                      <p style={{ margin: '0 0 .8rem', fontSize: '.88rem', color: '#5d4037' }}>
                        <b>{confirming.c.name}</b> — {money(Math.round(confirming.c.dailyBudget))} → <b>{money(confirming.next)}</b> a day.
                        Google may spend up to twice this on a busy day and balance it out over the month.
                      </p>
                      <button onClick={applyBudget} disabled={busy === confirming.c.id}
                        className="adm-btn adm-btn-primary" style={{ marginRight: '.5rem' }}>
                        {busy === confirming.c.id ? 'Saving…' : 'Yes, change it'}
                      </button>
                      <button onClick={() => setConfirming(null)}
                        className="adm-btn">
                        Cancel
                      </button>
                    </div>
                  )}
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
