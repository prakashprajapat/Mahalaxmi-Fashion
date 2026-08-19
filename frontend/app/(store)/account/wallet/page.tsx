'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '@/lib/auth';
import { walletApi, type WalletTxn } from '@/lib/api';

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
  admin_adjust: { label: 'Adjustment',      icon: '⚙️' },
};

export default function WalletPage() {
  const router = useRouter();
  const [balance, setBalance] = useState(0);
  const [txns, setTxns] = useState<WalletTxn[]>([]);
  const [loading, setLoading] = useState(true);

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
      </div>

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
