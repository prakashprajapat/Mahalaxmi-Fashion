'use client';
import { useCallback, useEffect, useState } from 'react';
import { cashfreeApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Stat, StatGrid, Empty, Pill, Chips } from '@/components/admin/Ui';

// Everyone who reached a payment page, whether or not they paid.
//
// The orders list cannot answer this. One row is written here the moment a
// Cashfree checkout opens, before any order exists - so the people worth
// looking at, the ones who got as far as the payment screen and walked away,
// are precisely the ones an orders list has never heard of. Three dropped
// payments on one of his days came to over a thousand rupees.

type Row = {
  orderId: string;
  transactionId: string;
  amount: number;
  walletUsed: number;
  fullTotal: number;
  status: string;
  asked: boolean;
  method: string;
  name: string;
  phone: string;
  email: string;
  createdAt: string;
  paidAt: string | null;
};

// Cashfree's own words, in the shop's.
const STATUS_LABEL: Record<string, string> = {
  SUCCESS: 'Paid',
  USER_DROPPED: 'Walked away',
  FAILED: 'Failed',
  PENDING: 'Still pending',
  CANCELLED: 'Cancelled',
  NOT_ATTEMPTED: 'Never started',
  UNKNOWN: 'Not checked yet',
};
const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'grey'> = {
  SUCCESS: 'green',
  USER_DROPPED: 'amber',
  FAILED: 'red',
  PENDING: 'amber',
  CANCELLED: 'grey',
  NOT_ATTEMPTED: 'grey',
  UNKNOWN: 'grey',
};
const STATUS_KEYS = ['SUCCESS', 'USER_DROPPED', 'FAILED', 'PENDING', 'NOT_ATTEMPTED', 'CANCELLED', 'UNKNOWN'];

const METHODS = [
  { key: 'all', label: 'Any way' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
  { key: 'net_banking', label: 'Net banking' },
  { key: 'wallet', label: 'Wallet' },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const money = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const when = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
};

export default function AdminPaymentsPage() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400000);

  const [from, setFrom] = useState(iso(monthAgo));
  const [to, setTo] = useState(iso(today));
  const [status, setStatus] = useState('ALL');
  const [method, setMethod] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Awaited<ReturnType<typeof cashfreeApi.payments>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async (toPage = page) => {
    setLoading(true);
    try {
      const d = await cashfreeApi.payments(
        { from, to, status, method, q, page: toPage, pageSize: 25 },
        getAdminToken() ?? '',
      );
      setData(d);
      setMsg(null);
    } catch (e) {
      setData(null);
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [from, to, status, method, q, page]);

  // Only on the first paint. Everything else is a deliberate press: a list
  // that reloads on every keystroke of a phone number is a list that spends
  // the whole search flickering.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(1); }, []);

  const search = (toPage: number) => { setPage(toPage); load(toPage); };

  const refresh = async () => {
    setSyncing(true);
    setMsg(null);
    try {
      const r = await cashfreeApi.syncPayments({ from, to }, getAdminToken() ?? '');
      setMsg({
        kind: 'ok',
        text: r.asked === 0
          ? 'Everything in this range has already been checked with Cashfree.'
          : `Asked Cashfree about ${r.asked} checkout${r.asked === 1 ? '' : 's'}${r.changed > 0 ? `, ${r.changed} changed` : ', nothing changed'}.${r.capped ? ' Stopped at 300 — narrow the dates and press again for the rest.' : ''}`,
      });
      await load(page);
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  };

  const s = data?.summary;
  const rows = data?.rows ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="admin-page">
      <PageHeader
        title="Payments"
        sub="Everyone who reached a payment page, paid or not. The ones who walked away are money still on the table."
        right={
          <button className="adm-btn" onClick={refresh} disabled={syncing}>
            {syncing ? 'Asking Cashfree…' : 'Refresh from Cashfree'}
          </button>
        }
      />

      {msg && (
        <div className="adm-card" style={{ borderColor: msg.kind === 'ok' ? '#cfe6d4' : '#f0cfcf', marginBottom: '.8rem' }}>
          <p style={{ margin: 0, fontSize: '.88rem', color: msg.kind === 'ok' ? '#2e7d32' : '#c62828' }}>{msg.text}</p>
        </div>
      )}

      <Card title="Search and filter">
        <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">From</span>
            <input className="adm-input" type="date" style={{ display: 'block', marginTop: '.2rem' }}
                   value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">To</span>
            <input className="adm-input" type="date" style={{ display: 'block', marginTop: '.2rem' }}
                   value={to} onChange={e => setTo(e.target.value)} />
          </label>
          <label style={{ display: 'block', flex: 1, minWidth: 220 }}>
            <span className="adm-stat-l">Search</span>
            <input className="adm-input" style={{ display: 'block', marginTop: '.2rem', width: '100%' }}
                   placeholder="Phone, order ID, transaction ID, name or email"
                   value={q}
                   onChange={e => setQ(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') search(1); }} />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Paid how</span>
            <select className="adm-input" style={{ display: 'block', marginTop: '.2rem' }}
                    value={method} onChange={e => setMethod(e.target.value)}>
              {METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <button className="adm-btn adm-btn-primary" onClick={() => search(1)} disabled={loading}>
            {loading ? 'Looking…' : 'Search'}
          </button>
        </div>

        <div style={{ marginTop: '.7rem' }}>
          <Chips
            value={status}
            onChange={k => { setStatus(k); setPage(1); }}
            items={[{ key: 'ALL', label: 'Everything' },
                    ...STATUS_KEYS.map(k => ({ key: k, label: STATUS_LABEL[k] }))]}
          />
          <p style={{ margin: '.35rem 0 0', fontSize: '.76rem', color: '#999' }}>
            Pick a date range or a status, then press Search.
          </p>
        </div>
      </Card>

      {s && (
        <StatGrid>
          <Stat label="Paid" value={`${s.paidCount} · ${money(s.paidTotal)}`} tone="green" />
          <Stat label="Left on the table" value={`${s.droppedCount} · ${money(s.droppedTotal)}`}
                tone={s.droppedTotal > 0 ? 'red' : undefined} />
          <Stat label="Shown" value={String(data?.total ?? 0)} />
          {/* A row nobody has asked Cashfree about is not an empty row, and
              saying so is the difference between a gap and a silence. */}
          <Stat label="Not checked yet" value={String(s.notAsked)}
                tone={s.notAsked > 0 ? 'red' : undefined}
                action={s.notAsked > 0 ? 'Ask Cashfree now' : undefined}
                onClick={s.notAsked > 0 ? refresh : undefined} />
        </StatGrid>
      )}

      <Card title={data ? `${rows.length} of ${data.total} on this page` : 'Payments'}>
        {loading && rows.length === 0 ? (
          <Empty>Looking…</Empty>
        ) : rows.length === 0 ? (
          <Empty>Nothing matches that. Try a wider date range, or clear the search box.</Empty>
        ) : (
          <>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead><tr>
                  <th>When</th><th>Transaction</th><th className="num">Amount</th>
                  <th>How</th><th>What happened</th><th>Customer</th><th>Order</th>
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.orderId}-${i}`}>
                      <td data-label="When">{when(r.createdAt)}</td>
                      <td data-label="Transaction" className="mono">{r.transactionId || '—'}</td>
                      <td data-label="Amount" className="num">
                        {money(r.amount)}
                        {r.walletUsed > 0 && (
                          <span style={{ display: 'block', fontSize: '.72rem', color: '#999' }}>
                            + {money(r.walletUsed)} wallet
                          </span>
                        )}
                      </td>
                      <td data-label="How">{r.method ? r.method.replace(/_/g, ' ').toUpperCase() : '—'}</td>
                      <td data-label="What happened">
                        <Pill tone={STATUS_TONE[r.status] ?? 'grey'}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Pill>
                      </td>
                      <td data-label="Customer">
                        {r.name || '—'}
                        {r.phone && (
                          <span style={{ display: 'block', fontSize: '.76rem', color: '#888' }}>{r.phone}</span>
                        )}
                      </td>
                      <td data-label="Order" className="mono">{r.orderId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.8rem' }}>
                <button className="adm-btn" disabled={page <= 1 || loading} onClick={() => search(page - 1)}>
                  Back
                </button>
                <span style={{ fontSize: '.84rem', color: '#777' }}>Page {page} of {pages}</span>
                <button className="adm-btn" disabled={page >= pages || loading} onClick={() => search(page + 1)}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
