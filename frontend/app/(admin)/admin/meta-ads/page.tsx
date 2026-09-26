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
  dailyBudget: number;
  budgetOnAdSets: boolean;
  budgetNote: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
}

interface Status {
  connected: boolean;
  adAccountId: string;
  apiVersion: string;
}

const RANGES = [7, 30, 90];

const money = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });


export default function MetaAdsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [maxBudget, setMaxBudget] = useState(5000);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [confirming, setConfirming] = useState<{ c: Campaign; next: number } | null>(null);
  const [busy, setBusy] = useState('');

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/metaads/status', { headers: { Authorization: `Bearer ${getAdminToken()}` } });
    const data = await res.json();
    setStatus(data);
    return data as Status;
  }, []);

  const loadStats = useCallback(async (d: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/metaads/stats?days=${d}`, { headers: { Authorization: `Bearer ${getAdminToken()}` } });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setRows([]); setTotals(null);
        setError(data.message || 'Could not load the Meta figures.');
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

  const loadCampaigns = useCallback(async (d: number) => {
    try {
      const res = await fetch(`/api/metaads/campaigns?days=${d}`, { headers: { Authorization: `Bearer ${getAdminToken()}` } });
      const data = await res.json();
      if (res.ok && data.success) {
        setCampaigns(data.campaigns ?? []);
        if (data.maxDailyBudget) setMaxBudget(Number(data.maxDailyBudget));
      }
    } catch { /* the totals above are the important part; a campaign list failure is not fatal */ }
  }, []);

  useEffect(() => {
    (async () => {
      const st = await loadStatus().catch(() => null);
      if (st?.connected) { await loadStats(days); await loadCampaigns(days); }
      else setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeRange = (d: number) => {
    setDays(d);
    if (status?.connected) { loadStats(d); loadCampaigns(d); }
  };

  const toggleStatus = async (c: Campaign) => {
    const next = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setBusy(c.id);
    setError('');
    try {
      const res = await fetch(`/api/metaads/campaigns/${c.id}/status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.message || 'Could not change the campaign.'); return; }
      setCampaigns(list => list.map(x => x.id === c.id ? { ...x, status: next } : x));
      setNotice(`${c.name} is now ${next === 'ACTIVE' ? 'running' : 'paused'}.`);
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
      const res = await fetch('/api/metaads/budget', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: c.id, amount: next }),
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

  const disconnect = async () => {
    if (!confirm('Disconnect Meta Ads? The figures will stop loading until you paste a token again.')) return;
    await fetch('/api/metaads/disconnect', { method: 'POST', headers: { Authorization: `Bearer ${getAdminToken()}` } });
    setRows([]); setTotals(null); setCampaigns([]); setNotice('Meta Ads disconnected.');
    loadStatus();
  };

  return (
    <div className="admin-page" style={{ maxWidth: 1100 }}>
      <PageHeader
        title="Meta Ads"
        sub="Facebook and Instagram advertising — what it cost, and what came back."
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
          <h2 style={{ margin: '0 0 .5rem', fontSize: '1.05rem', fontWeight: 700 }}>Connect your Meta ad account</h2>
          <p style={{ margin: '0 0 1rem', color: '#555', fontSize: '.9rem', lineHeight: 1.6 }}>
            Meta does not need a sign-in round trip here. You make one <b>System User token</b> in
            Business Settings and paste it into Settings — that token never expires, so this stays
            connected on its own.
          </p>

          <ol style={{ margin: '0 0 1.1rem', paddingLeft: '1.2rem', color: '#555', fontSize: '.88rem', lineHeight: 1.9 }}>
            <li>Open <b>business.facebook.com</b> → Settings → Users → <b>System users</b> → Add.</li>
            <li>Give it a name and the <b>Admin</b> role, then press <b>Generate new token</b>.</li>
            <li>Pick your app, and tick <b>ads_read</b> and <b>ads_management</b>. Copy the token.</li>
            <li>Still in Business Settings → <b>Ad accounts</b> → your account → <b>Add people</b> →
              pick the system user and give it full control.</li>
            <li>Paste the token into <b>Settings → Meta Ads</b>, along with your Ad Account ID.</li>
          </ol>

          <ul style={{ margin: '0 0 1.1rem', paddingLeft: '1.1rem', color: '#555', fontSize: '.88rem', lineHeight: 1.8 }}>
            <li>Access token: <b style={{ color: '#b71c1c' }}>not saved yet</b></li>
            <li>Ad Account ID: {status.adAccountId
              ? <b style={{ color: '#1b5e20' }}>act_{status.adAccountId}</b>
              : <b style={{ color: '#b71c1c' }}>missing — the number after act_ in Ads Manager</b>}</li>
          </ul>

          <Link href="/admin/settings"
            style={{ display: 'inline-block', background: '#a7354d', color: '#fff', borderRadius: 8, padding: '.7rem 1.4rem', fontWeight: 700, fontSize: '.92rem', textDecoration: 'none' }}>
            Open Settings → Meta Ads
          </Link>

          <p style={{ margin: '1rem 0 0', fontSize: '.78rem', color: '#999', lineHeight: 1.6 }}>
            The token is stored on your own server and is sent to Meta in the request header, never
            in a web address. Anyone who can open Settings can see it, so treat it like a password.
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
                  action={`${num(totals.conversions)} purchases`} />
                <Stat label="Return on spend"
                  value={totals.roas === null ? '—' : `₹${num(totals.roas)}`}
                  action={totals.roas === null ? 'nothing spent yet' : 'back for every ₹1 spent'} />
                <Stat label="Clicks" value={num(totals.clicks)}
                  action={totals.costPerClick === null ? undefined : `${money(totals.costPerClick)} per click`} />
                <Stat label="Impressions" value={num(totals.impressions)} />
                <Stat label="Cost per sale"
                  value={totals.costPerConversion === null ? '—' : money(totals.costPerConversion)}
                  action={totals.costPerConversion === null ? 'no purchases yet' : undefined} />
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
                        <th style={{ padding: '.6rem .8rem' }}>Purchases</th>
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
                          <td data-label="Purchases" style={{ padding: '.55rem .8rem' }}>{num(r.conversions)}</td>
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
                    Pause or restart a campaign, and change what it may spend in a day. Changes reach Meta straight away.
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
                          const on = c.status === 'ACTIVE';
                          const isEditing = editing?.id === c.id;
                          return (
                            <tr key={c.id} style={{ borderTop: '1px solid #f2f2f2' }}>
                              <td data-label="Campaign" style={{ padding: '.6rem .8rem' }}>
                                <b>{c.name}</b>
                                <span style={{ display: 'block', fontSize: '.74rem', color: '#999' }}>
                                  {c.channel.replace(/^OUTCOME_/, '').replace(/_/g, ' ').toLowerCase()}
                                </span>
                              </td>

                              <td data-label="Daily budget" style={{ padding: '.6rem .8rem', whiteSpace: 'nowrap' }}>
                                {c.budgetOnAdSets ? (
                                  <span style={{ color: '#999', fontSize: '.8rem' }}>
                                    {c.budgetNote || 'set on the ad sets'}
                                  </span>
                                ) : isEditing ? (
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
                                <span style={{ display: 'block', fontSize: '.74rem', color: '#999' }}>{num(c.conversions)} purch.</span>
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

                  {campaigns.some(c => c.budgetOnAdSets) && (
                    <p style={{ margin: '.7rem 0 0', fontSize: '.8rem', color: '#999', lineHeight: 1.7 }}>
                      Some campaigns have no campaign daily budget — the money is set on each ad set, or
                      it is a lifetime budget for the whole run. Meta will not accept a daily figure for
                      those, so they cannot be changed here. Give that campaign a campaign daily budget in
                      Ads Manager and it becomes editable on this screen.
                    </p>
                  )}

                  {confirming && (
                    <div style={{ marginTop: '.9rem', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 10, padding: '.9rem 1.1rem' }}>
                      <p style={{ margin: '0 0 .2rem', fontWeight: 700, fontSize: '.92rem' }}>Change this daily budget?</p>
                      <p style={{ margin: '0 0 .8rem', fontSize: '.88rem', color: '#5d4037' }}>
                        <b>{confirming.c.name}</b> — {money(Math.round(confirming.c.dailyBudget))} → <b>{money(confirming.next)}</b> a day.
                        Meta may spend up to 25% more on a busy day and balance it out over the week.
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
                These are Meta&apos;s own figures for account act_{status.adAccountId}. &ldquo;Sales from ads&rdquo;
                counts only the purchases Meta could attribute to an ad, so it will not match{' '}
                <Link href="/admin/reports" style={{ color: '#a7354d' }}>Reports</Link> exactly — that page counts every order.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
