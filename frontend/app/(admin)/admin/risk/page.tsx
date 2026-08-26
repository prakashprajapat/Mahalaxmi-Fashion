'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { ordersApi } from '@/lib/api';

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

  const load = async () => {
    setLoading(true);
    try {
      const token = getAdminToken() || '';
      const r = await ordersApi.riskSummary(token);
      setThreshold(r.highRiskThreshold);
      setPins(r.pincodes || []);
      setCustomers(r.riskyCustomers || []);
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
      const token = getAdminToken() || '';
      await ordersApi.setCodBlock(pin.pincode, next, token);
      setPins(list => list.map(p => p.pincode === pin.pincode ? { ...p, codBlocked: next } : p));
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

  const blockedCount = pins.filter(p => p.codBlocked).length;
  const riskyCount = pins.filter(p => p.risky).length;

  const th: React.CSSProperties = { padding: '.7rem 1rem', textAlign: 'left', fontWeight: 700, color: '#555', whiteSpace: 'nowrap', fontSize: '.8rem' };
  const td: React.CSSProperties = { padding: '.6rem 1rem', fontSize: '.85rem', whiteSpace: 'nowrap' };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>🛡️ Fraud &amp; Risk</h1>
          <p className="admin-page-sub">Spot risky customers and delivery areas, and switch off Cash on Delivery where fake or return-heavy orders come from.</p>
        </div>
        <button onClick={load} className="button secondary" style={{ fontSize: '.85rem' }}>🔄 Refresh</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'High-Risk Customers', value: customers.length, icon: '🚩' },
          { label: 'Risky Pincodes', value: riskyCount, icon: '📍' },
          { label: 'COD Blocked Pincodes', value: blockedCount, icon: '⛔' },
          { label: 'Pincodes Seen', value: pins.length, icon: '🗺️' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1rem 1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem' }}>{s.icon}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a7354d' }}>{s.value}</div>
            <div style={{ fontSize: '.74rem', color: '#888', marginTop: '.2rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── High-Risk Customers (Red Zone) ── */}
      <h2 style={{ fontSize: '1rem', margin: '0 0 .6rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        <span style={{ background: '#e53935', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: '.72rem', fontWeight: 800 }}>RED ZONE</span>
        High-Risk Customers
        <span style={{ fontSize: '.75rem', color: '#999', fontWeight: 400 }}>(more than {threshold} cancelled orders)</span>
      </h2>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', overflow: 'hidden', marginBottom: '2rem' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>Loading…</div>
        ) : customers.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>
            <div style={{ fontSize: '2rem' }}>✅</div>
            <p style={{ margin: '.4rem 0 0' }}>No high-risk customers. Good news!</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#fff5f5', borderBottom: '2px solid #ffe0e0' }}>
                {['Customer', 'Phone', 'Total Orders', 'Cancelled', 'Returned', 'Status'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.customerId} style={{ borderBottom: '1px solid #f5f5f5', background: '#fffafa' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{c.name || <span style={{ color: '#ccc' }}>—</span>}</td>
                    <td style={td}>
                      {c.phone ? (
                        <a href={waHref(c.phone)} target="_blank" rel="noopener noreferrer" style={{ color: '#25d366', fontWeight: 600, textDecoration: 'none' }}>{c.phone}</a>
                      ) : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={td}>{c.total}</td>
                    <td style={{ ...td, color: '#c62828', fontWeight: 700 }}>{c.cancelled}</td>
                    <td style={{ ...td, color: '#e65100' }}>{c.returned}</td>
                    <td style={td}>
                      <span style={{ background: '#ffebee', color: '#c62828', borderRadius: 20, padding: '3px 10px', fontSize: '.72rem', fontWeight: 800 }}>🚩 HIGH RISK · COD OFF</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p style={{ fontSize: '.78rem', color: '#999', margin: '-1.4rem 0 2rem' }}>
        These customers are automatically blocked from Cash on Delivery — they can still order by paying online.
      </p>

      {/* ── Pincode Risk Analysis ── */}
      <h2 style={{ fontSize: '1rem', margin: '0 0 .6rem' }}>📍 Pincode Risk Analysis</h2>
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.8rem' }}>
        <input type="text" placeholder="Search pincode, city or state…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ height: 36, border: '1.5px solid #ddd', borderRadius: 8, padding: '0 .9rem', fontSize: '.85rem', width: 260, boxSizing: 'border-box' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.82rem', color: '#555', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyRisky} onChange={e => setOnlyRisky(e.target.checked)} />
          Only risky / blocked
        </label>
      </div>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>No pincodes to show.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#fdf0f3', borderBottom: '2px solid #eee' }}>
                {['Pincode', 'Area', 'Orders', 'COD', 'Cancelled', 'Returned', 'Delivered', 'Risk', 'COD'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.pincode} style={{ borderBottom: '1px solid #f5f5f5', background: p.codBlocked ? '#fff5f5' : p.risky ? '#fffaf3' : '#fff' }}>
                    <td style={{ ...td, fontWeight: 700 }}>{p.pincode}</td>
                    <td style={{ ...td, color: '#666' }}>{[p.city, p.state].filter(Boolean).join(', ') || <span style={{ color: '#ccc' }}>—</span>}</td>
                    <td style={td}>{p.total}</td>
                    <td style={td}>{p.cod}</td>
                    <td style={{ ...td, color: p.cancelled ? '#c62828' : '#888', fontWeight: p.cancelled ? 700 : 400 }}>
                      {p.cancelled}{p.cancelled > 0 && <span style={{ color: '#aaa', fontWeight: 400 }}> ({p.cancelRate}%)</span>}
                    </td>
                    <td style={{ ...td, color: p.returned ? '#e65100' : '#888', fontWeight: p.returned ? 700 : 400 }}>
                      {p.returned}{p.returned > 0 && <span style={{ color: '#aaa', fontWeight: 400 }}> ({p.returnRate}%)</span>}
                    </td>
                    <td style={{ ...td, color: '#2e7d32' }}>{p.delivered}</td>
                    <td style={td}>
                      {p.risky
                        ? <span style={{ background: '#ffebee', color: '#c62828', borderRadius: 20, padding: '3px 9px', fontSize: '.72rem', fontWeight: 800 }}>⚠ RISKY</span>
                        : <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 20, padding: '3px 9px', fontSize: '.72rem', fontWeight: 700 }}>OK</span>}
                    </td>
                    <td style={td}>
                      <button onClick={() => toggleCod(p)} disabled={busyPin === p.pincode}
                        style={{
                          border: 'none', borderRadius: 7, padding: '.35rem .7rem', fontSize: '.76rem', fontWeight: 700,
                          cursor: busyPin === p.pincode ? 'default' : 'pointer',
                          background: p.codBlocked ? '#e8f5e9' : '#ffebee',
                          color: p.codBlocked ? '#2e7d32' : '#c62828',
                        }}>
                        {busyPin === p.pincode ? '…' : p.codBlocked ? '✓ Enable COD' : '⛔ Block COD'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p style={{ fontSize: '.78rem', color: '#999', marginTop: '.8rem' }}>
        Blocking COD for a pincode hides the Cash-on-Delivery option there — customers can still order by paying online. Online (prepaid) orders are never blocked.
      </p>
    </div>
  );
}
