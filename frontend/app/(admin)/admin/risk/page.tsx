'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { ordersApi } from '@/lib/api';
import { PageHeader, Card, Stat, StatGrid, Pill, Empty } from '@/components/admin/Ui';
import PincodeImport from '@/components/admin/PincodeImport';
import { normalizeState } from '@/lib/indianStates';

type Pin = {
  pincode: string; city?: string | null; state?: string | null;
  total: number; cod: number; cancelled: number; returned: number; delivered: number;
  cancelRate: number; returnRate: number; risky: boolean; codBlocked: boolean;
};
type RiskyCustomer = {
  customerId: string; name?: string | null; phone?: string | null;
  total: number; cancelled: number; returned: number;
};

function waHref(phone?: string | null) {
  const d = (phone || '').replace(/\D/g, '');
  const num = d.length > 10 ? d.slice(-10) : d;
  return num ? `https://wa.me/91${num}` : undefined;
}

export default function RiskPage() {
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(2);
  const [pins, setPins] = useState<Pin[]>([]);
  const [customers, setCustomers] = useState<RiskyCustomer[]>([]);
  const [busyPin, setBusyPin] = useState<string | null>(null);
  const [onlyRisky, setOnlyRisky] = useState(false);
  const [search, setSearch] = useState('');
  // Every pincode with COD off, including ones never shipped to (an imported
  // list) - those are not in the table below, so they are listed on their own.
  const [allBlocked, setAllBlocked] = useState<string[]>([]);
  const [showOther, setShowOther] = useState(false);
  const [otherQ, setOtherQ] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const token = getAdminToken() || '';
      const r = await ordersApi.riskSummary(token);
      setThreshold(r.highRiskThreshold);
      setPins(r.pincodes || []);
      setCustomers(r.riskyCustomers || []);
      setAllBlocked(r.codBlocked || []);
    } catch {
      setPins([]); setCustomers([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleCod = async (pin: Pin) => {
    const next = !pin.codBlocked;
    if (next && !confirm(`Block Cash on Delivery for pincode ${pin.pincode}? Customers there can still order by paying online.`)) return;
    setBusyPin(pin.pincode);
    try {
      await ordersApi.setCodBlock(pin.pincode, next, getAdminToken() || '');
      setPins(list => list.map(p => p.pincode === pin.pincode ? { ...p, codBlocked: next } : p));
      setAllBlocked(list => next ? Array.from(new Set([...list, pin.pincode])).sort() : list.filter(x => x !== pin.pincode));
    } catch (e) {
      alert('Could not update: ' + (e as Error).message);
    } finally { setBusyPin(null); }
  };

  const filtered = pins.filter(p => {
    if (onlyRisky && !p.risky && !p.codBlocked) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return p.pincode.includes(search)
      || (p.city || '').toLowerCase().includes(q)
      || (p.state || '').toLowerCase().includes(q);
  });

  const blockedCount = allBlocked.length;
  const shippedPins = new Set(pins.map(p => p.pincode));
  const otherBlocked = allBlocked.filter(p => !shippedPins.has(p));
  const otherShown = otherBlocked.filter(p => !otherQ || p.includes(otherQ.trim()));

  const unblockOther = async (pin: string) => {
    setBusyPin(pin);
    try {
      await ordersApi.setCodBlock(pin, false, getAdminToken() || '');
      setAllBlocked(list => list.filter(x => x !== pin));
    } catch (e) {
      alert('Could not update: ' + (e as Error).message);
    } finally { setBusyPin(null); }
  };
  const riskyCount = pins.filter(p => p.risky).length;

  return (
    <div className="admin-page">
      <PageHeader
        title="Fraud &amp; risk"
        sub="Where fake and return-heavy orders come from, and where to switch Cash on Delivery off. Paying online is never blocked."
        right={<>
          <button className="adm-btn" onClick={load}>Refresh</button>
          <PincodeImport onDone={load} />
        </>}
      />

      <StatGrid>
        <Stat label="High-risk customers" value={customers.length} tone={customers.length > 0 ? 'red' : undefined} />
        <Stat label="Risky pincodes" value={riskyCount} tone={riskyCount > 0 ? 'red' : undefined}
              action={riskyCount > 0 ? 'Show only these' : undefined}
              onClick={riskyCount > 0 ? () => setOnlyRisky(true) : undefined} />
        <Stat label="COD switched off" value={blockedCount} />
        <Stat label="Pincodes ordered from" value={pins.length} />
      </StatGrid>

      <Card title={`High-risk customers — more than ${threshold} cancelled orders`}>
        <p style={{ fontSize: '.82rem', color: '#7d736d', margin: '0 0 .6rem', lineHeight: 1.55 }}>
          Cash on Delivery is already off for everyone here; it happens on its own, you do not have to do
          anything. They can still order by paying online.
        </p>
        {loading ? (
          <Empty>Loading…</Empty>
        ) : customers.length === 0 ? (
          <Empty>Nobody has crossed the line. Good news.</Empty>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr>
                <th>Customer</th><th>Phone</th><th className="num">Orders</th>
                <th className="num">Cancelled</th><th className="num">Returned</th><th>Status</th>
              </tr></thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.customerId}>
                    <td data-label="Customer" style={{ fontWeight: 650 }}>{c.name || '—'}</td>
                    <td data-label="Phone">
                      {c.phone
                        ? <a href={waHref(c.phone)} target="_blank" rel="noopener noreferrer"
                             style={{ color: '#128C7E', fontWeight: 700, textDecoration: 'none' }}>{c.phone}</a>
                        : '—'}
                    </td>
                    <td data-label="Orders" className="num">{c.total}</td>
                    <td data-label="Cancelled" className="num" style={{ color: '#c0392b', fontWeight: 800 }}>{c.cancelled}</td>
                    <td data-label="Returned" className="num" style={{ color: '#b26b00' }}>{c.returned}</td>
                    <td data-label="Status"><Pill tone="red">COD off</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Every pincode you have shipped to"
        right={
          <span style={{ display: 'flex', gap: '.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="adm-input" style={{ width: '200px' }} placeholder="Pincode, city or state"
                   value={search} onChange={e => setSearch(e.target.value)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.78rem', color: '#7d736d', fontWeight: 700, cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyRisky} onChange={e => setOnlyRisky(e.target.checked)} />
              Only risky or blocked
            </label>
          </span>
        }
      >
        {loading ? (
          <Empty>Loading…</Empty>
        ) : filtered.length === 0 ? (
          <Empty>{pins.length === 0 ? 'No orders yet, so there is nothing to judge.' : 'Nothing matches those filters.'}</Empty>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr>
                <th>Pincode</th><th>Area</th><th>State</th><th className="num">Orders</th><th className="num">COD</th>
                <th className="num">Cancelled</th><th className="num">Returned</th><th className="num">Delivered</th>
                <th>Risk</th><th>Cash on Delivery</th>
              </tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.pincode}>
                    <td data-label="Pincode" className="mono" style={{ fontWeight: 800 }}>{p.pincode}</td>
                    <td data-label="Area">{p.city || '—'}</td>
                    <td data-label="State">{normalizeState(p.state) || '—'}</td>
                    <td data-label="Orders" className="num">{p.total}</td>
                    <td data-label="COD" className="num">{p.cod}</td>
                    <td data-label="Cancelled" className="num" style={{ color: p.cancelled ? '#c0392b' : '#9a908a', fontWeight: p.cancelled ? 800 : 400 }}>
                      {p.cancelled}{p.cancelled > 0 ? ` (${p.cancelRate}%)` : ''}
                    </td>
                    <td data-label="Returned" className="num" style={{ color: p.returned ? '#b26b00' : '#9a908a', fontWeight: p.returned ? 800 : 400 }}>
                      {p.returned}{p.returned > 0 ? ` (${p.returnRate}%)` : ''}
                    </td>
                    <td data-label="Delivered" className="num" style={{ color: '#2e7d32' }}>{p.delivered}</td>
                    <td data-label="Risk">
                      {p.risky ? <Pill tone="red">Risky</Pill> : <Pill tone="green">OK</Pill>}
                    </td>
                    <td data-label="Cash on Delivery">
                      <button className="adm-btn" style={{ padding: '.32rem .7rem', fontSize: '.76rem',
                                                           color: p.codBlocked ? '#2e7d32' : '#c0392b' }}
                              onClick={() => toggleCod(p)} disabled={busyPin === p.pincode}>
                        {busyPin === p.pincode ? '…' : p.codBlocked ? 'Turn COD back on' : 'Switch COD off'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {otherBlocked.length > 0 && (
          <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '.8rem' }}>
            <button className="adm-btn" onClick={() => setShowOther(v => !v)}>
              {showOther ? 'Hide' : 'Show'} {otherBlocked.length.toLocaleString('en-IN')} other pincodes with COD off (never shipped to, e.g. imported)
            </button>
            {showOther && (
              <div style={{ marginTop: '.7rem' }}>
                <input className="adm-input" style={{ width: 200, marginBottom: '.6rem' }} placeholder="Find a pincode"
                       value={otherQ} onChange={e => setOtherQ(e.target.value.replace(/\D/g, ''))} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                  {otherShown.slice(0, 300).map(p => (
                    <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', border: '1px solid #eee', borderRadius: 999, padding: '.2rem .3rem .2rem .65rem', fontFamily: 'monospace', fontSize: '.8rem' }}>
                      {p}
                      <button className="adm-btn" style={{ padding: '.1rem .5rem', fontSize: '.7rem', color: '#2e7d32' }}
                              disabled={busyPin === p} onClick={() => unblockOther(p)} title="Turn COD back on">
                        {busyPin === p ? '…' : 'COD on'}
                      </button>
                    </span>
                  ))}
                </div>
                {otherShown.length > 300 && (
                  <p style={{ fontSize: '.78rem', color: '#888', marginTop: '.5rem' }}>
                    Showing 300 of {otherShown.length.toLocaleString('en-IN')}. Type a pincode to find one.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <p style={{ fontSize: '.78rem', color: '#9a908a', margin: '.75rem 0 0', lineHeight: 1.6 }}>
          Switching COD off for a pincode hides the Cash-on-Delivery option there. Nobody is stopped from
          ordering — they pay online instead.
        </p>
      </Card>
    </div>
  );
}
