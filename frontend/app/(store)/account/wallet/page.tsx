'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken, getCustomer } from '@/lib/auth';
import { walletApi, paymentsApi, type WalletTxn } from '@/lib/api';

// Load the Razorpay checkout script once.
function loadRazorpay(): Promise<boolean> {
  return new Promise(resolve => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as any).Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function fmtDate(raw: string) {
  const d = new Date(raw);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Friendly label + icon for each ledger entry type.
const TYPE_META: Record<string, { label: string; icon: string }> = {
  earn:         { label: 'Reward earned',   icon: '🎉' },
  redeem:       { label: 'Used at checkout', icon: '🛍️' },
  refund:       { label: 'Refund',          icon: '↩️' },
  referral:     { label: 'Referral bonus',  icon: '🤝' },
  signup:       { label: 'Signup bonus',    icon: '🎁' },
  topup:        { label: 'Money added',     icon: '➕' },
  admin_adjust: { label: 'Adjustment',      icon: '⚙️' },
};

export default function WalletPage() {
  const router = useRouter();
  const [balance, setBalance] = useState(0);
  const [txns, setTxns] = useState<WalletTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addAmt, setAddAmt] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState('');

  const refresh = () => {
    const token = getToken();
    if (!token) return;
    walletApi.mine(token).then(r => { setBalance(r.balance || 0); setTxns(r.transactions || []); }).catch(() => {});
  };

  // Add money to the wallet via Razorpay, then credit it server-side after payment verifies.
  const handleAddMoney = async () => {
    const amt = Math.round(parseFloat(addAmt));
    if (!amt || amt < 100) { setAddMsg('Minimum ₹100.'); return; }
    if (amt > 50000) { setAddMsg('Maximum ₹50,000 at a time.'); return; }
    const token = getToken();
    const cust = getCustomer();
    if (!token || !cust) { setAddMsg('Please log in again.'); return; }
    setAddBusy(true); setAddMsg('');
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load payment.');
      const res = await paymentsApi.createOrder({
        amount: amt,
        currency: 'INR',
        cart: [],
        customer: { id: String(cust.id), purpose: 'wallet_topup' },
        shipping: {},
      });
      const rzp = new (window as any).Razorpay({
        key: res.keyId,
        amount: res.amountPaise,
        currency: 'INR',
        order_id: res.orderId,
        name: 'Mahalaxmi Fashion Hub',
        description: 'Add money to wallet',
        prefill: { name: `${cust.firstName} ${cust.lastName}`.trim(), contact: cust.phone, email: cust.email || '' },
        theme: { color: '#a7354d' },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await paymentsApi.verify({ razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature });
            const t = await walletApi.topup(res.localOrderId, token);
            setBalance(t.balance || 0);
            refresh();
            setShowAdd(false); setAddAmt(''); setAddBusy(false);
          } catch (e) { setAddMsg('Added, but balance refresh failed. Pull to refresh. ' + (e as Error).message); setAddBusy(false); }
        },
        modal: { ondismiss: () => setAddBusy(false) },
      });
      rzp.open();
    } catch (e) {
      const msg = (e as Error).message || '';
      setAddMsg(msg.toLowerCase().includes('not configured') ? 'Add Money is temporarily unavailable.' : ('Payment failed: ' + msg));
      setAddBusy(false);
    }
  };

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace('/account?return=/account/wallet'); return; }
    walletApi.mine(token)
      .then(r => { setBalance(r.balance || 0); setTxns(r.transactions || []); })
      .catch(() => { setBalance(0); setTxns([]); })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/account" style={{ color: '#a7354d', textDecoration: 'none', fontSize: '.9rem', fontWeight: 600 }}>← Back to Account</Link>
      </div>

      <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 1rem' }}>My Wallet</h1>

      {/* Balance card */}
      <div style={{
        background: 'linear-gradient(135deg, #7a0a22 0%, #a7354d 100%)', color: '#fff',
        borderRadius: 16, padding: '1.5rem 1.5rem', boxShadow: '0 8px 24px rgba(122,10,34,.28)', marginBottom: '1.5rem',
      }}>
        <div style={{ fontSize: '.85rem', opacity: .9, letterSpacing: '.03em' }}>Available Balance</div>
        <div style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '.2rem', lineHeight: 1.1 }}>
          ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: balance % 1 ? 2 : 0 })}
        </div>
        <div style={{ fontSize: '.82rem', opacity: .9, marginTop: '.5rem' }}>
          Earn rewards on every delivered order and use them on your next purchase.
        </div>
        <button onClick={() => { setShowAdd(true); setAddMsg(''); setAddAmt(''); }}
          style={{ marginTop: '1rem', background: '#fff', color: '#7a0a22', border: 'none', borderRadius: 10, padding: '.6rem 1.4rem', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer' }}>
          ➕ Add Money
        </button>
      </div>

      {/* Add Money modal */}
      {showAdd && (
        <div onClick={() => !addBusy && setShowAdd(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, padding: '1.5rem', width: '100%', maxWidth: 380 }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 .25rem', color: '#1a1a1a' }}>Add Money to Wallet</h2>
            <p style={{ fontSize: '.82rem', color: '#888', margin: '0 0 1rem' }}>Pay securely — the amount is added to your wallet instantly.</p>
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
              {[100, 200, 500, 1000].map(v => (
                <button key={v} onClick={() => setAddAmt(String(v))}
                  style={{ flex: 1, padding: '.5rem 0', borderRadius: 8, border: `1.5px solid ${addAmt === String(v) ? '#a7354d' : '#ddd'}`, background: addAmt === String(v) ? '#fdf0f3' : '#fff', color: '#a7354d', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>₹{v}</button>
              ))}
            </div>
            <input type="number" min={100} value={addAmt} onChange={e => setAddAmt(e.target.value)} placeholder="Enter amount (₹)"
              style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #ddd', borderRadius: 8, padding: '.7rem .9rem', fontSize: '1rem', outline: 'none', marginBottom: '.5rem' }} />
            {addMsg && <p style={{ color: '#c0392b', fontSize: '.82rem', margin: '0 0 .5rem' }}>{addMsg}</p>}
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
              <button onClick={() => setShowAdd(false)} disabled={addBusy}
                style={{ flex: 1, padding: '.7rem', borderRadius: 8, border: '1.5px solid #ddd', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddMoney} disabled={addBusy}
                style={{ flex: 2, padding: '.7rem', borderRadius: 8, border: 'none', background: 'linear-gradient(180deg,#a7354d,#8e2a3f)', color: '#fff', fontWeight: 800, cursor: 'pointer', opacity: addBusy ? .7 : 1 }}>
                {addBusy ? 'Processing…' : `Pay ₹${addAmt || 0}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#333', margin: '0 0 .75rem' }}>History</h2>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>Loading…</div>
      ) : txns.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '2.5rem 1rem', textAlign: 'center', color: '#999' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: '.4rem' }}>👛</div>
          <p style={{ margin: 0 }}>No wallet activity yet.</p>
          <p style={{ margin: '.3rem 0 0', fontSize: '.85rem', color: '#bbb' }}>Your reward will appear here once an order is delivered.</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
          {txns.map((t, i) => {
            const meta = TYPE_META[t.type] || { label: t.type, icon: '•' };
            const credit = t.amount >= 0;
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: '.85rem',
                padding: '.85rem 1rem', borderTop: i === 0 ? 'none' : '1px solid #f3f3f3',
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flex: '0 0 auto',
                  background: credit ? '#e8f5e9' : '#fdecea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
                }}>{meta.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#1a1a1a', fontSize: '.9rem' }}>{meta.label}</div>
                  <div style={{ fontSize: '.75rem', color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.note || (t.orderId ? `Order ${t.orderId}` : '')} · {fmtDate(t.createdAt)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                  <div style={{ fontWeight: 800, fontSize: '.95rem', color: credit ? '#2e7d32' : '#c62828' }}>
                    {credit ? '+' : '−'}₹{Math.abs(t.amount).toLocaleString('en-IN', { minimumFractionDigits: Math.abs(t.amount) % 1 ? 2 : 0 })}
                  </div>
                  <div style={{ fontSize: '.7rem', color: '#bbb' }}>Bal ₹{t.balanceAfter.toLocaleString('en-IN')}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
