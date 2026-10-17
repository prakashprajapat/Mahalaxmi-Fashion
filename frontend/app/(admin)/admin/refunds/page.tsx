'use client';
import { useCallback, useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Chips, Empty } from '@/components/admin/Ui';

interface Refund {
  id: number;
  orderId: string;
  suggestedAmount: number;
  amount: number;
  method: string;
  gateway: string | null;
  gatewayRefundId: string | null;
  status: string;
  note: string | null;
  failureReason: string | null;
  createdAt: string;
  settledAt: string | null;
  settledBy: string | null;
  orderStatus: string | null;
  orderMethod: string | null;
  orderTotal: number;
  walletUsed: number;
  advancePaid: number;
  customerName: string;
  customerPhone: string;
  hasWallet: boolean;
}

const money = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const FILTERS = [
  { key: 'pending', label: 'To pay' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

export default function RefundsPage() {
  const [rows, setRows] = useState<Refund[]>([]);
  const [filter, setFilter] = useState('pending');
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(0);

  // The open payout form, one at a time. Amount starts at what the customer
  // paid and can only be lowered — the server enforces that too, but showing
  // the ceiling here saves a round trip and a confusing refusal.
  const [paying, setPaying] = useState<{ r: Refund; amount: string; method: string; note: string } | null>(null);
  const [cancelling, setCancelling] = useState<{ r: Refund; note: string } | null>(null);

  const load = useCallback(async (f: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/refunds?status=${encodeURIComponent(f)}&limit=200`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setRows([]);
        setError(data.message || 'Could not load the refunds.');
        return;
      }
      setRows(data.refunds ?? []);
      setPendingCount(Number(data.pendingCount ?? 0));
      setPendingTotal(Number(data.pendingTotal ?? 0));
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const submitPay = async () => {
    if (!paying) return;
    const amount = Number(paying.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter the amount to refund.'); return; }
    if (amount > paying.r.suggestedAmount) {
      setError(`${money(amount)} is more than the ${money(paying.r.suggestedAmount)} this customer paid online.`);
      return;
    }
    setBusy(paying.r.id);
    setError('');
    try {
      const res = await fetch(`/api/refunds/${paying.r.id}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method: paying.method, note: paying.note }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.message || 'The refund did not go through.'); return; }
      setNotice(
        paying.method === 'wallet'
          ? `${money(amount)} added to the wallet for ${paying.r.orderId}.`
          : `${money(amount)} sent back to the customer for ${paying.r.orderId}.`
      );
      setPaying(null);
      load(filter);
    } catch {
      setError('Could not reach the server.');
    } finally { setBusy(0); }
  };

  const submitCancel = async () => {
    if (!cancelling) return;
    if (cancelling.note.trim().length < 3) { setError('Write a short reason for cancelling.'); return; }
    setBusy(cancelling.r.id);
    setError('');
    try {
      const res = await fetch(`/api/refunds/${cancelling.r.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: cancelling.note }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.message || 'Could not cancel the refund.'); return; }
      setNotice(`Refund for ${cancelling.r.orderId} cancelled.`);
      setCancelling(null);
      load(filter);
    } catch {
      setError('Could not reach the server.');
    } finally { setBusy(0); }
  };

  return (
    <div className="admin-page" style={{ maxWidth: 1000 }}>
      <PageHeader
        title="Refunds"
        sub="Money owed back on returned and cancelled orders — and whether it has gone."
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

      {pendingCount > 0 && (
        <div className="adm-card" style={{ marginBottom: '.85rem', fontSize: '.9rem' }}>
          <b>{pendingCount}</b> refund{pendingCount === 1 ? '' : 's'} waiting, <b>{money(pendingTotal)}</b> in all.
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <Chips items={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {loading && <p style={{ color: '#888', fontSize: '.9rem' }}>Loading…</p>}

      {!loading && rows.length === 0 && (
        <Empty>
          {filter === 'pending'
            ? 'Nothing to refund right now.'
            : 'No refunds here yet.'}
        </Empty>
      )}

      {!loading && rows.map(r => (
        <div key={r.id} className="adm-card" style={{ marginBottom: '.7rem', padding: '.95rem 1.05rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem', flexWrap: 'wrap' }}>
            <b style={{ fontSize: '.95rem' }}>{r.orderId}</b>
            <span style={{ fontSize: '.85rem', color: '#555' }}>
              {r.customerName || 'Customer'}{r.customerPhone ? ' · ' + r.customerPhone : ''}
            </span>
            <span style={{ flex: 1 }} />
            <span style={{
              fontSize: '.75rem', fontWeight: 700, borderRadius: 999, padding: '.15rem .6rem',
              background: r.status === 'paid' ? '#e8f5e9' : r.status === 'cancelled' ? '#eee' : '#fff4e5',
              color: r.status === 'paid' ? '#1b5e20' : r.status === 'cancelled' ? '#777' : '#8a5a00',
            }}>
              {r.status === 'paid' ? 'Paid' : r.status === 'cancelled' ? 'Cancelled' : 'To pay'}
            </span>
          </div>

          <div style={{ marginTop: '.5rem', fontSize: '.86rem', color: '#555', lineHeight: 1.8 }}>
            Order {money(r.orderTotal)} · {r.orderMethod === 'cod' ? 'COD' : 'Prepaid'}
            {r.walletUsed > 0 && <> · wallet {money(r.walletUsed)} (returned separately)</>}
            {r.orderMethod === 'cod' && r.advancePaid > 0 && <> · advance {money(r.advancePaid)}</>}
            {r.orderStatus && <> · now <b>{r.orderStatus}</b></>}
            <br />
            Paid online: <b>{money(r.suggestedAmount)}</b>
            {r.status === 'paid' && (
              <> · refunded <b style={{ color: '#1b5e20' }}>{money(r.amount)}</b>
                {r.method === 'wallet' ? ' to the wallet' : ' to the original payment'}
                {r.settledAt && <> on {day(r.settledAt)}</>}
                {r.settledBy && <> by {r.settledBy}</>}
                {r.gatewayRefundId && <> · ref {r.gatewayRefundId}</>}
              </>
            )}
          </div>

          {r.note && (
            <div style={{ marginTop: '.35rem', fontSize: '.82rem', color: '#777' }}>{r.note}</div>
          )}
          {r.failureReason && r.status === 'pending' && (
            <div style={{ marginTop: '.35rem', fontSize: '.82rem', color: '#c0392b', fontWeight: 600 }}>
              Last attempt failed: {r.failureReason}
            </div>
          )}

          {r.status === 'pending' && paying?.r.id !== r.id && cancelling?.r.id !== r.id && (
            <div style={{ marginTop: '.7rem', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <button
                className="adm-btn"
                onClick={() => { setError(''); setNotice(''); setCancelling(null); setPaying({ r, amount: String(r.suggestedAmount), method: r.hasWallet ? 'gateway' : 'gateway', note: '' }); }}
                style={{ padding: '.4rem .9rem', fontSize: '.84rem', fontWeight: 700, background: '#a7354d', color: '#fff', borderColor: '#a7354d' }}>
                Refund this
              </button>
              <button
                className="adm-btn"
                onClick={() => { setError(''); setNotice(''); setPaying(null); setCancelling({ r, note: '' }); }}
                style={{ padding: '.4rem .9rem', fontSize: '.84rem' }}>
                Nothing owed
              </button>
            </div>
          )}

          {paying?.r.id === r.id && (
            <div style={{ marginTop: '.8rem', borderTop: '1px solid #eee', paddingTop: '.8rem' }}>
              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ fontSize: '.8rem', color: '#555' }}>
                  Amount (max {money(r.suggestedAmount)})<br />
                  <input
                    value={paying.amount}
                    onChange={e => setPaying({ ...paying, amount: e.target.value })}
                    inputMode="decimal"
                    style={{ marginTop: '.2rem', padding: '.45rem .6rem', border: '1px solid #ddd', borderRadius: 7, width: 130, fontSize: '.9rem' }}
                  />
                </label>
                <label style={{ fontSize: '.8rem', color: '#555' }}>
                  Where to<br />
                  <select
                    value={paying.method}
                    onChange={e => setPaying({ ...paying, method: e.target.value })}
                    style={{ marginTop: '.2rem', padding: '.45rem .6rem', border: '1px solid #ddd', borderRadius: 7, fontSize: '.9rem' }}>
                    <option value="gateway">
                      Back to {r.gateway === 'cashfree' ? 'Cashfree' : 'Razorpay'} (original payment)
                    </option>
                    <option value="wallet" disabled={!r.hasWallet}>
                      {r.hasWallet ? 'Store wallet' : 'Store wallet (no customer account)'}
                    </option>
                  </select>
                </label>
                <label style={{ fontSize: '.8rem', color: '#555', flex: 1, minWidth: 180 }}>
                  Note (why less, if less)<br />
                  <input
                    value={paying.note}
                    onChange={e => setPaying({ ...paying, note: e.target.value })}
                    style={{ marginTop: '.2rem', padding: '.45rem .6rem', border: '1px solid #ddd', borderRadius: 7, width: '100%', fontSize: '.9rem' }}
                  />
                </label>
              </div>
              <div style={{ marginTop: '.7rem', display: 'flex', gap: '.5rem' }}>
                <button className="adm-btn" onClick={submitPay} disabled={busy === r.id}
                  style={{ padding: '.4rem 1.1rem', fontSize: '.84rem', fontWeight: 700, background: '#a7354d', color: '#fff', borderColor: '#a7354d' }}>
                  {busy === r.id ? 'Sending…' : 'Send the refund'}
                </button>
                <button className="adm-btn" onClick={() => setPaying(null)} style={{ padding: '.4rem .9rem', fontSize: '.84rem' }}>
                  Cancel
                </button>
              </div>
              <p style={{ margin: '.6rem 0 0', fontSize: '.78rem', color: '#999', lineHeight: 1.6 }}>
                This moves real money. A gateway refund reaches the customer&apos;s bank in 5–7 working days and cannot be undone from here.
              </p>
            </div>
          )}

          {cancelling?.r.id === r.id && (
            <div style={{ marginTop: '.8rem', borderTop: '1px solid #eee', paddingTop: '.8rem' }}>
              <label style={{ fontSize: '.8rem', color: '#555' }}>
                Why is nothing owed?<br />
                <input
                  value={cancelling.note}
                  onChange={e => setCancelling({ ...cancelling, note: e.target.value })}
                  placeholder="Already paid by UPI on 12 Oct / customer kept the item"
                  style={{ marginTop: '.2rem', padding: '.45rem .6rem', border: '1px solid #ddd', borderRadius: 7, width: '100%', maxWidth: 420, fontSize: '.9rem' }}
                />
              </label>
              <div style={{ marginTop: '.7rem', display: 'flex', gap: '.5rem' }}>
                <button className="adm-btn" onClick={submitCancel} disabled={busy === r.id}
                  style={{ padding: '.4rem 1.1rem', fontSize: '.84rem', fontWeight: 700 }}>
                  {busy === r.id ? 'Saving…' : 'Close this refund'}
                </button>
                <button className="adm-btn" onClick={() => setCancelling(null)} style={{ padding: '.4rem .9rem', fontSize: '.84rem' }}>
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
