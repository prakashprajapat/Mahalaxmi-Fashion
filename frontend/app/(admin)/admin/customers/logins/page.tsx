'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getAdminToken, isOwnerAdmin } from '@/lib/auth';
import { downloadCsv } from '@/lib/adminPaged';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';
import DeleteOldHistory from '@/components/admin/DeleteOldHistory';

interface LoginRow {
  id: number;
  subjectType: string;
  subjectId: string | null;
  loginId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  method: string;
  platform: string;
  device: string | null;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  reason: string | null;
  createdAt: string;
}

interface Summary { today: number; web: number; app: number; failed: number; people: number }

const PAGE = 100;

const METHOD_LABEL: Record<string, string> = {
  otp: 'OTP', password: 'Password', google: 'Google', facebook: 'Facebook',
  register: 'New sign-up', admin: 'Panel login', login: 'Login',
};

function when(raw: string) {
  return new Date(raw).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function LoginsInner() {
  const params = useSearchParams();
  const customerId = params.get('customerId') ?? '';
  const customerName = params.get('name') ?? '';

  const owner = typeof window !== 'undefined' && isOwnerAdmin();
  const [side, setSide] = useState<'customer' | 'staff'>('customer');
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<LoginRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const urlFor = (p: number, limit: number) => {
    const u = new URLSearchParams({ type: side, page: String(p), limit: String(limit) });
    if (customerId && side === 'customer') u.set('customerId', customerId);
    if (platform) u.set('platform', platform);
    if (status) u.set('status', status);
    if (qApplied) u.set('q', qApplied);
    // Ulta range diya ho to seedha kar lo.
    let f = from, t = to;
    if (f && t && f > t) [f, t] = [t, f];
    if (f) u.set('from', f);
    if (t) u.set('to', t);
    return `/api/login-events?${u.toString()}`;
  };

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(urlFor(page, PAGE), { headers: { Authorization: `Bearer ${getAdminToken() ?? ''}` } });
      if (!res.ok) throw new Error(res.status === 403 ? 'You do not have access to this list.' : `Could not load (${res.status})`);
      const b = await res.json();
      setRows(b.events ?? []); setTotal(b.total ?? 0); setSummary(b.summary ?? null);
    } catch (e) {
      setRows([]); setTotal(0); setSummary(null);
      setError(e instanceof Error ? e.message : 'Could not load');
    } finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [side, platform, status, qApplied, from, to, page, customerId]);

  const exportCsv = async () => {
    const all: LoginRow[] = [];
    for (let p = 1; p <= 40; p++) {
      const res = await fetch(urlFor(p, 500), { headers: { Authorization: `Bearer ${getAdminToken() ?? ''}` } });
      if (!res.ok) break;
      const b = await res.json();
      const batch: LoginRow[] = b.events ?? [];
      all.push(...batch);
      if (batch.length < 500) break;
    }
    downloadCsv([
      ['Date & time', 'Name', 'Phone', 'Email', 'Login with', 'Method', 'Web / App', 'Device', 'IP', 'Result', 'Reason'],
      ...all.map(r => [
        when(r.createdAt), r.name ?? '', r.phone ?? '', r.email ?? '', r.loginId ?? '',
        METHOD_LABEL[r.method] ?? r.method, r.platform === 'app' ? 'App' : 'Web',
        r.device ?? '', r.ip ?? '', r.success ? 'Success' : 'Failed', r.reason ?? '',
      ]),
    ], `login-history-${side}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const title = customerId ? `Login History - ${customerName || `Customer #${customerId}`}` : 'Login History';

  return (
    <div className="admin-page">
      <PageHeader
        title={title}
        sub="Every sign-in on the website and the app: when, how (OTP / password / Google), which device, and from where."
        right={
          <>
            {customerId && <a className="adm-btn" href="/admin/customers/logins">All customers</a>}
            <a className="adm-btn" href="/admin/customers">Back to Customers</a>
            <button className="adm-btn adm-btn-primary" onClick={exportCsv} disabled={loading || total === 0}>Excel ({total})</button>
          </>
        }
      />

      <DeleteOldHistory endpoint="/api/login-events/delete-old" what="login records"
        keepNote="Customer and staff logins before the date are deleted. The last 12 months always stay (DPDP Rules: logs kept at least one year)." onDone={load} />

      <StatGrid cols={4}>
        <Stat label="Logins today" value={summary?.today ?? '-'} />
        <Stat label="Website logins" value={summary?.web ?? '-'} onClick={() => { setPlatform('web'); setPage(1); }} />
        <Stat label="App logins" value={summary?.app ?? '-'} tone="green" onClick={() => { setPlatform('app'); setPage(1); }} />
        <Stat label="Failed attempts" value={summary?.failed ?? '-'} tone={summary && summary.failed > 0 ? 'red' : undefined}
              onClick={() => { setStatus('failed'); setPage(1); }} />
      </StatGrid>

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          {owner && !customerId && (
            <Chips value={side} onChange={k => { setSide(k as 'customer' | 'staff'); setPage(1); }}
                   items={[{ key: 'customer', label: 'Customers' }, { key: 'staff', label: 'Staff & Admin' }]} />
          )}
          <Chips value={platform} onChange={k => { setPlatform(k); setPage(1); }}
                 items={[{ key: '', label: 'Web + App' }, { key: 'web', label: 'Website' }, { key: 'app', label: 'App' }]} />
          <Chips value={status} onChange={k => { setStatus(k); setPage(1); }}
                 items={[{ key: '', label: 'All' }, { key: 'ok', label: 'Success' }, { key: 'failed', label: 'Failed' }]} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginTop: 12 }}>
          {!customerId && (
            <form onSubmit={e => { e.preventDefault(); setQApplied(q.trim()); setPage(1); }}
                  style={{ display: 'flex', gap: 6, flex: '1 1 260px' }}>
              <input className="adm-input" value={q} onChange={e => setQ(e.target.value)}
                     placeholder="Name, phone, email or IP" style={{ flex: 1, minWidth: 0 }} />
              <button className="adm-btn" type="submit">Search</button>
            </form>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: '#6b6b6b' }}>
            From
            <input type="date" className="adm-input" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: '#6b6b6b' }}>
            To
            <input type="date" className="adm-input" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} />
          </label>
          {(from || to || platform || status || qApplied) && (
            <button className="adm-btn" onClick={() => { setFrom(''); setTo(''); setPlatform(''); setStatus(''); setQ(''); setQApplied(''); setPage(1); }}>
              Clear filters
            </button>
          )}
        </div>
      </Card>

      <Card title={`${total.toLocaleString('en-IN')} entries`}>
        {error ? <Empty>{error}</Empty>
          : loading ? <Empty>Loading…</Empty>
          : rows.length === 0 ? <Empty>No logins recorded yet for this filter. New logins appear here from now on.</Empty>
          : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                  <th style={{ padding: '8px 6px' }}>Date & time</th>
                  <th style={{ padding: '8px 6px' }}>{side === 'staff' ? 'Staff' : 'Customer'}</th>
                  <th style={{ padding: '8px 6px' }}>Method</th>
                  <th style={{ padding: '8px 6px' }}>Web / App</th>
                  <th style={{ padding: '8px 6px' }}>Device</th>
                  <th style={{ padding: '8px 6px' }}>IP</th>
                  <th style={{ padding: '8px 6px' }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f3f3f3', verticalAlign: 'top' }}>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{when(r.createdAt)}</td>
                    <td style={{ padding: '8px 6px' }}>
                      {r.subjectId && side === 'customer' && !customerId ? (
                        <a href={`/admin/customers/logins?customerId=${r.subjectId}&name=${encodeURIComponent(r.name ?? '')}`}
                           style={{ color: '#2563eb', fontWeight: 600 }}>
                          {r.name || r.loginId || `#${r.subjectId}`}
                        </a>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{r.name || r.loginId || (r.subjectType === 'admin' ? 'Owner' : '-')}</span>
                      )}
                      <div style={{ color: '#777', fontSize: 12 }}>
                        {[r.phone, r.email].filter(Boolean).join(' · ') || r.loginId || ''}
                      </div>
                    </td>
                    <td style={{ padding: '8px 6px' }}>{METHOD_LABEL[r.method] ?? r.method}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <Pill tone={r.platform === 'app' ? 'green' : 'grey'}>{r.platform === 'app' ? 'App' : 'Website'}</Pill>
                    </td>
                    <td style={{ padding: '8px 6px' }} title={r.userAgent ?? ''}>{r.device ?? '-'}</td>
                    <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontSize: 12 }}>{r.ip ?? '-'}</td>
                    <td style={{ padding: '8px 6px' }}>
                      {r.success
                        ? <Pill tone="green">Success</Pill>
                        : <><Pill tone="red">Failed</Pill>{r.reason && <div style={{ color: '#c0392b', fontSize: 12, marginTop: 2 }}>{r.reason}</div>}</>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 12 }}>
            <button className="adm-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span style={{ fontSize: 13 }}>Page {page} of {pages}</span>
            <button className="adm-btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function LoginHistoryPage() {
  return (
    <Suspense fallback={<div className="admin-page">Loading…</div>}>
      <LoginsInner />
    </Suspense>
  );
}
