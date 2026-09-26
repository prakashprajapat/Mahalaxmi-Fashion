'use client';
import { useState } from 'react';
import { paymentsApi, type ReconcileRow } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import * as XLSX from 'xlsx';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';

// What each of the four verdicts means, in the words you would use to explain
// it to someone. MATCHED is the boring one; the two red ones are why the page
// exists at all.
const CATEGORY_LABEL: Record<ReconcileRow['category'], string> = {
  MATCHED:          'Matched',
  AMOUNT_MISMATCH:  'Wrong amount',
  PAYMENT_NO_ORDER: 'Paid, no order',
  ORDER_NO_PAYMENT: 'Order, no payment',
};

const CATEGORY_TONE: Record<ReconcileRow['category'], 'green' | 'amber' | 'red'> = {
  MATCHED: 'green',
  AMOUNT_MISMATCH: 'amber',
  PAYMENT_NO_ORDER: 'red',
  ORDER_NO_PAYMENT: 'red',
};

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export default function ReconcilePage() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<Awaited<ReturnType<typeof paymentsApi.reconcile>> | null>(null);
  const [filter, setFilter] = useState<'ALL' | ReconcileRow['category']>('ALL');

  const run = async () => {
    const token = getAdminToken();
    if (!token) { setError('Sign in again — your session has expired.'); return; }
    setLoading(true); setError('');
    try {
      setData(await paymentsApi.reconcile(from, to, token));
    } catch (e) {
      setError((e as Error).message || 'Could not fetch the payments.');
    } finally { setLoading(false); }
  };

  const rows = (data?.rows ?? []).filter(r => filter === 'ALL' || r.category === filter);

  const exportXlsx = () => {
    if (!data) return;
    const sheetRows = data.rows.map(r => ({
      Category: r.category,
      'Payment ID': r.paymentId ?? '',
      'Payment ₹': r.paymentAmount ?? '',
      'Refunded ₹': r.refundedAmount || '',
      'Payment Status': r.paymentStatus ?? '',
      'Payment Date': r.paymentDate ? new Date(r.paymentDate).toLocaleString('en-IN') : '',
      'Order ID': r.orderId ?? '',
      'Order ₹': r.orderTotal ?? '',
      'Order Status': r.orderStatus ?? '',
      Email: r.email, Phone: r.contact,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), 'Reconciliation');
    const s = data.summary;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Metric: 'Total Payments', Value: s.totalPayments },
      { Metric: 'Matched', Value: s.matched },
      { Metric: 'Amount Mismatch', Value: s.amountMismatch },
      { Metric: 'Payment without Order', Value: s.paymentWithoutOrder },
      { Metric: 'Order without Payment', Value: s.orderWithoutPayment },
      { Metric: 'Refunded', Value: s.refunded },
      { Metric: 'Failed Payments', Value: s.failed },
      { Metric: 'Captured Total ₹', Value: s.capturedTotal },
      { Metric: 'Refunded Total ₹', Value: s.refundedTotal },
    ]), 'Summary');
    XLSX.writeFile(wb, `payment-reconcile-${from}-to-${to}.xlsx`);
  };

  const s = data?.summary;
  const needsLooking = s ? s.amountMismatch + s.paymentWithoutOrder + s.orderWithoutPayment : 0;

  return (
    <div className="admin-page">
      <PageHeader
        title="Payment reconcile"
        sub="Every Razorpay payment matched against your orders. Money in with no order, or an order with no money, shows up here."
        right={data ? <button className="adm-btn adm-btn-primary" onClick={exportXlsx}>Export Excel</button> : undefined}
      />

      <Card title="Which dates">
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
          <button className="adm-btn adm-btn-primary" onClick={run} disabled={loading}>
            {loading ? 'Checking…' : 'Reconcile'}
          </button>
        </div>
        {error && <p style={{ color: '#c0392b', fontWeight: 700, fontSize: '.85rem', margin: '.6rem 0 0' }}>{error}</p>}
      </Card>

      {!data && !loading && (
        <Card>
          <Empty>
            Pick a date range and press Reconcile. Anything that does not add up — money received with no order,
            an order with no money, or the two disagreeing on the amount — is worth looking at the same day.
          </Empty>
        </Card>
      )}

      {s && (
        <>
          <StatGrid>
            <Stat label="Money taken" value={`₹${s.capturedTotal.toLocaleString('en-IN')}`} />
            <Stat label="Matched cleanly" value={s.matched} tone="green" />
            <Stat label="Needs looking at" value={needsLooking} tone={needsLooking > 0 ? 'red' : undefined}
                  action={needsLooking > 0 && filter === 'ALL' ? 'Show the mismatches' : undefined}
                  onClick={needsLooking > 0 ? () => setFilter('AMOUNT_MISMATCH') : undefined} />
            <Stat label="Refunded" value={`${s.refunded} · ₹${s.refundedTotal.toLocaleString('en-IN')}`} />
          </StatGrid>

          <Card
            title={`${rows.length} of ${data.rows.length} payments`}
            right={s.failed > 0 ? <Pill tone="grey">{s.failed} failed payments, not counted</Pill> : undefined}
          >
            <Chips value={filter} onChange={k => setFilter(k as typeof filter)}
                   items={[
                     { key: 'ALL', label: 'All', count: data.rows.length },
                     ...(Object.keys(CATEGORY_LABEL) as ReconcileRow['category'][]).map(c => ({
                       key: c, label: CATEGORY_LABEL[c], count: data.rows.filter(r => r.category === c).length,
                     })),
                   ]} />

            {rows.length === 0 ? (
              <Empty>Nothing in this group — which, for the red ones, is the answer you want.</Empty>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead><tr>
                    <th>Verdict</th><th>Payment</th><th className="num">Paid</th>
                    <th>Order</th><th className="num">Order total</th><th>Order status</th>
                    <th className="num">Refund</th><th>Date</th><th>Contact</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.paymentId ?? r.orderId ?? i}>
                        <td data-label="Verdict"><Pill tone={CATEGORY_TONE[r.category]}>{CATEGORY_LABEL[r.category]}</Pill></td>
                        <td data-label="Payment" className="mono">{r.paymentId ?? '—'}</td>
                        <td data-label="Paid" className="num">{r.paymentAmount != null ? `₹${r.paymentAmount.toLocaleString('en-IN')}` : '—'}</td>
                        <td data-label="Order" className="mono">{r.orderId ?? '—'}</td>
                        <td data-label="Order total" className="num">{r.orderTotal != null ? `₹${r.orderTotal.toLocaleString('en-IN')}` : '—'}</td>
                        <td data-label="Order status">{r.orderStatus ?? '—'}</td>
                        <td data-label="Refund" className="num">{r.refundedAmount ? `₹${r.refundedAmount.toLocaleString('en-IN')}` : '—'}</td>
                        <td data-label="Date">{r.paymentDate ? new Date(r.paymentDate).toLocaleDateString('en-IN') : '—'}</td>
                        <td data-label="Contact">{r.contact || r.email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
