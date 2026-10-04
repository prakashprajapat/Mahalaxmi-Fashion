'use client';
import { useCallback, useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { PageHeader } from '@/components/admin/Ui';

interface Row {
  date: string;
  viewed: number;
  addedToCart: number;
  startedCheckout: number;
  purchased: number;
}
interface Totals { viewed: number; addedToCart: number; startedCheckout: number; purchased: number }

const RANGES = [7, 30, 90];
const num = (n: number) => n.toLocaleString('en-IN');
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

// "2026-10-04" is read as 10 April by half the people who see it. The month
// gets a name. Built from the parts rather than new Date(), which would shift
// the day again in a browser west of UTC.
function prettyDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`;
}

export default function FunnelPage() {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (d: number) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/site-events/funnel?days=${d}`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.message || 'Could not load the funnel.'); return; }
      setRows(data.rows ?? []);
      setTotals(data.totals ?? null);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  // Each step as a share of the one before it, which is the number that says
  // where people are lost. A share of the first step would hide a checkout
  // that drops nine out of ten behind a product page that nobody opened.
  const steps = totals ? [
    { label: 'Opened a product', value: totals.viewed, of: null as number | null },
    { label: 'Added to cart', value: totals.addedToCart, of: totals.viewed },
    { label: 'Started checkout', value: totals.startedCheckout, of: totals.addedToCart },
    { label: 'Ordered', value: totals.purchased, of: totals.startedCheckout },
  ] : [];

  return (
    <div className="adm-page">
      <PageHeader title="Where visitors stop"
        sub="How far people got through the shop, counted in Indian days — midnight to midnight here, not in UTC. The Ordered column is read straight from the Orders list: every order of that day, whatever its status, a test order of your own included. If a number here surprises you, open Orders for that date and the row will be there." />

      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
        {RANGES.map(d => (
          <button key={d} type="button" onClick={() => setDays(d)}
            style={{
              border: '1.5px solid ' + (days === d ? '#a7354d' : '#ddd'),
              background: days === d ? '#a7354d' : '#fff',
              color: days === d ? '#fff' : '#555',
              borderRadius: 999, padding: '.35rem .9rem', fontSize: '.84rem', fontWeight: 700, cursor: 'pointer',
            }}>
            Last {d} days
          </button>
        ))}
      </div>

      {error && <p style={{ color: '#b71c1c' }}>{error}</p>}
      {loading && <p style={{ color: '#999' }}>Loading…</p>}

      {!loading && totals && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.6rem' }}>
            {steps.map(s => (
              <div key={s.label} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1rem' }}>
                <div style={{ fontSize: '.8rem', color: '#777', marginBottom: '.3rem' }}>{s.label}</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#1a1a1a' }}>{num(s.value)}</div>
                {s.of !== null && (
                  <div style={{ fontSize: '.78rem', color: '#a7354d', fontWeight: 700, marginTop: '.25rem' }}>
                    {pct(s.value, s.of)} of the step before
                  </div>
                )}
              </div>
            ))}
          </div>

          {totals.viewed === 0 && (
            <p style={{ background: '#fff6e5', color: '#8a4b00', border: '1px solid #ffe2b0',
              borderRadius: 10, padding: '.8rem 1rem', fontSize: '.86rem', lineHeight: 1.6 }}>
              Nothing recorded yet. These steps are only counted from the moment this page was
              added, so the first day will look empty even if the shop was busy.
            </p>
          )}

          <table className="adm-table">
            <thead>
              <tr>
                <th>DATE</th><th>OPENED A PRODUCT</th><th>ADDED TO CART</th>
                <th>STARTED CHECKOUT</th><th>ORDERED</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.date}>
                  <td style={{ whiteSpace: 'nowrap' }}>{prettyDay(r.date)}</td>
                  <td>{num(r.viewed)}</td>
                  <td>{num(r.addedToCart)}</td>
                  <td>{num(r.startedCheckout)}</td>
                  <td style={{ fontWeight: r.purchased > 0 ? 700 : 400 }}>{num(r.purchased)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ marginTop: '1rem', fontSize: '.8rem', color: '#888', lineHeight: 1.7 }}>
            Only the step and the time are kept — no name, email, phone, address or cookie. One
            person opening four products counts as four, so read these as steps taken, not people.
          </p>
        </>
      )}
    </div>
  );
}
