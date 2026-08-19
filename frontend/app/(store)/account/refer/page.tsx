'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '@/lib/auth';
import { referralApi } from '@/lib/api';

export default function ReferPage() {
  const router = useRouter();
  const [data, setData] = useState<{ enabled: boolean; code: string; discount: number; minOrder: number; reward: number; friendsJoined: number; totalEarned: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace('/account?return=/account/refer'); return; }
    referralApi.mine(token).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [router]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.mahalaxmifashionhub.com';
  const link = data ? `${origin}/?ref=${data.code}` : '';
  const shareMsg = data
    ? `Hey! Shop premium sarees, nighty & more at Mahalaxmi Fashion Hub and get ₹${data.discount} OFF your first order (min ₹${data.minOrder}) with my code ${data.code} 🛍️\n${link}`
    : '';

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1800); } catch {}
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/account" style={{ color: '#a7354d', textDecoration: 'none', fontSize: '.9rem', fontWeight: 600 }}>← Back to Account</Link>
      </div>

      <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 1rem' }}>Refer &amp; Earn 🤝</h1>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>Loading…</div>
      ) : !data || !data.enabled ? (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#999' }}>
          Referral program is currently unavailable. Please check back soon.
        </div>
      ) : (
        <>
          {/* Hero */}
          <div style={{ background: 'linear-gradient(135deg,#7a0a22 0%,#a7354d 100%)', color: '#fff', borderRadius: 16, padding: '1.5rem', marginBottom: '1.25rem', boxShadow: '0 8px 24px rgba(122,10,34,.28)' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '.35rem' }}>Give ₹{data.discount}, Get ₹{data.reward}</div>
            <div style={{ fontSize: '.88rem', opacity: .92, lineHeight: 1.5 }}>
              Invite friends — they get ₹{data.discount} off their first order (min ₹{data.minOrder}), and you get ₹{data.reward} in your wallet when their order is delivered.
            </div>
          </div>

          {/* Code */}
          <div style={{ background: '#fff', border: '1.5px dashed #a7354d', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
            <div>
              <div style={{ fontSize: '.72rem', color: '#999', textTransform: 'uppercase', letterSpacing: '.05em' }}>Your code</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a7354d', letterSpacing: '.05em' }}>{data.code}</div>
            </div>
            <button onClick={() => copy(data.code, 'code')}
              style={{ background: '#fdf0f3', color: '#a7354d', border: '1px solid #f0c8d2', borderRadius: 8, padding: '.5rem .9rem', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>
              {copied === 'code' ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          {/* Share buttons */}
          <div style={{ display: 'flex', gap: '.6rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareMsg)}`} target="_blank" rel="noopener noreferrer"
              style={{ flex: 1, minWidth: 160, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', background: '#25D366', color: '#fff', borderRadius: 10, padding: '.75rem', fontWeight: 800, fontSize: '.9rem', textDecoration: 'none' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Share on WhatsApp
            </a>
            <button onClick={() => copy(link, 'link')}
              style={{ flex: 1, minWidth: 160, background: '#fff', color: '#a7354d', border: '1.5px solid #a7354d', borderRadius: 10, padding: '.75rem', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer' }}>
              {copied === 'link' ? '✓ Link copied' : '🔗 Copy link'}
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1.1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#a7354d' }}>{data.friendsJoined}</div>
              <div style={{ fontSize: '.78rem', color: '#888', marginTop: '.2rem' }}>Friends ordered</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1.1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2e7d32' }}>₹{data.totalEarned.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '.78rem', color: '#888', marginTop: '.2rem' }}>Total earned</div>
            </div>
          </div>

          {/* How it works */}
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#333', margin: '0 0 .75rem' }}>How it works</h2>
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1rem 1.25rem' }}>
            {[
              ['1', 'Share your code or link with friends on WhatsApp, Instagram, anywhere.'],
              ['2', `Your friend gets ₹${data.discount} off their first order (min ₹${data.minOrder}).`],
              ['3', `Once their order is delivered, ₹${data.reward} is added to your wallet — use it on your next order.`],
            ].map(([n, t]) => (
              <div key={n} style={{ display: 'flex', gap: '.85rem', alignItems: 'flex-start', padding: '.5rem 0' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#a7354d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.85rem', flex: '0 0 auto' }}>{n}</div>
                <div style={{ fontSize: '.9rem', color: '#444', lineHeight: 1.5 }}>{t}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '.75rem', color: '#aaa', marginTop: '.75rem' }}>You can&apos;t use your own code. Reward is credited only after your friend&apos;s order is delivered.</p>
        </>
      )}
    </div>
  );
}
