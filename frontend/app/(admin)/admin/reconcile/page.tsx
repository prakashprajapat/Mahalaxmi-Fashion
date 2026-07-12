'use client';
import { useState } from 'react';
import { paymentsApi, type ReconcileRow } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import * as XLSX from 'xlsx';

const CATEGORY_LABEL: Record<ReconcileRow['category'], string> = {
  MATCHED:          '✅ Matched',
  AMOUNT_MISMATCH:  '⚠️ Amount Mismatch',
  PAYMENT_NO_ORDER: '❌ Payment mila, Order nahi',
  ORDER_NO_PAYMENT: '❌ Order hai, Payment nahi',
};

const CATEGORY_COLOR: Record<ReconcileRow['category'], string> = {
  MATCHED: '#e8f5e9',
  AMOUNT_MISMATCH: '#fff8e1',
  PAYMENT_NO_ORDER: '#ffebee',
  ORDER_NO_PAYMENT: '#ffebee',
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
    if (!token) { setError('Admin login required'); return; }
    setLoading(true); setError('');
    try {
      setData(await paymentsApi.reconcile(from, to, token));
    } catch (e: any) {
      setError(e.message ?? 'Failed');
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

  const card = (label: string, value: number | string, bg = '#fff') => (
    <div style={{ background: bg, border: '1px solid #eee', borderRadius: 8, padding: '.8rem 1.1rem', minWidth: 130 }}>
      <div style={{ fontSize: '.75rem', color: '#888' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ padding: '1.2rem' }}>
      <h1 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>💰 Payment Reconciliation (Razorpay vs Orders)</h1>

      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'end', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <label style={{ fontSize: '.8rem' }}>From<br />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '.4rem' }} /></label>
        <label style={{ fontSize: '.8rem' }}>To<br />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '.4rem' }} /></label>
        <button onClick={run} disabled={loading}
          style={{ padding: '.55rem 1.4rem', background: '#a7354d', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {loading ? 'Fetching…' : 'Reconcile'}
        </button>
        {data && (
          <button onClick={exportXlsx}
            style={{ padding: '.55rem 1.2rem', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            ⬇ Excel Export
          </button>
        )}
      </div>

      {error && <p style={{ color: '#c62828' }}>{error}</p>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
            {card('Captured Total', `₹${data.summary.capturedTotal.toLocaleString('en-IN')}`)}
            {card('Matched', data.summary.matched, '#e8f5e9')}
            {card('Amount Mismatch', data.summary.amountMismatch, data.summary.amountMismatch ? '#fff8e1' : '#fff')}
            {card('Payment ✓ Order ✗', data.summary.paymentWithoutOrder, data.summary.paymentWithoutOrder ? '#ffebee' : '#fff')}
            {card('Order ✓ Payment ✗', data.summary.orderWithoutPayment, data.summary.orderWithoutPayment ? '#ffebee' : '#fff')}
            {card('Refunded', `${data.summary.refunded} (₹${data.summary.refundedTotal.toLocaleString('en-IN')})`)}
            {card('Failed', data.summary.failed)}
          </div>

          <div style={{ marginBottom: '.7rem' }}>
            <select value={filter} onChange={e => setFilter(e.target.value as any)} style={{ padding: '.4rem' }}>
              <option value="ALL">Sab dikhao ({data.rows.length})</option>
              {(Object.keys(CATEGORY_LABEL) as ReconcileRow['category'][]).map(c => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]} ({data.rows.filter(r => r.category === c).length})</option>
              ))}
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                  {['Status', 'Payment ID', 'Payment ₹', 'Order ID', 'Order ₹', 'Order Status', 'Refund ₹', 'Date', 'Contact'].map(h =>
                    <th key={h} style={{ padding: '.5rem .6rem', borderBottom: '2px solid #ddd' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ background: CATEGORY_COLOR[r.category], borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '.45rem .6rem', whiteSpace: 'nowrap' }}>{CATEGORY_LABEL[r.category]}</td>
                    <td style={{ padding: '.45rem .6rem', fontFamily: 'monospace' }}>{r.paymentId ?? '—'}</td>
                    <td style={{ padding: '.45rem .6rem' }}>{r.paymentAmount != null ? `₹${r.paymentAmount.toLocaleString('en-IN')}` : '—'}</td>
                    <td style={{ padding: '.45rem .6rem', fontFamily: 'monospace' }}>{r.orderId ?? '—'}</td>
                    <td style={{ padding: '.45rem .6rem' }}>{r.orderTotal != null ? `₹${r.orderTotal.toLocaleString('en-IN')}` : '—'}</td>
                    <td style={{ padding: '.45rem .6rem' }}>{r.orderStatus ?? '—'}</td>
                    <td style={{ padding: '.45rem .6rem' }}>{r.refundedAmount ? `₹${r.refundedAmount.toLocaleString('en-IN')}` : ''}</td>
                    <td style={{ padding: '.45rem .6rem', whiteSpace: 'nowrap' }}>{r.paymentDate ? new Date(r.paymentDate).toLocaleDateString('en-IN') : '—'}</td>
                    <td style={{ padding: '.45rem .6rem' }}>{r.contact || r.email}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: '1rem', textAlign: 'center', color: '#888' }}>Koi row nahi</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!data && !loading && (
        <p style={{ color: '#777', fontSize: '.88rem' }}>
          Date range chuno aur <b>Reconcile</b> dabao — Razorpay ke saare payments tumhare orders se match honge.
          Red rows = paisa aaya par order nahi bana (ya order bana par payment nahi mila) — inko turant check karo.
        </p>
      )}
    </div>
  );
}
