'use client';
import { useEffect, useState } from 'react';
import { reviewsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Stat, StatGrid, Empty, Pill } from '@/components/admin/Ui';

interface Review {
  id: number;
  customerName?: string;
  productName?: string;
  rating: number;
  text: string;
  createdAt?: string;
  status?: string;
}

function Stars({ n }: { n: number }) {
  return (
    <span style={{ color: '#d79b28', letterSpacing: '1px' }} aria-label={`${n} out of 5`}>
      {'★'.repeat(n)}{'☆'.repeat(Math.max(0, 5 - n))}
    </span>
  );
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const fetchReviews = () => {
    reviewsApi.getPending(getAdminToken() ?? '')
      .then(r => setReviews((r as any).reviews ?? []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchReviews(); }, []);

  const act = async (id: number, what: 'approve' | 'reject' | 'delete') => {
    if (what === 'delete' && !confirm('Delete this review for good? This cannot be undone.')) return;
    setBusy(id);
    try {
      const token = getAdminToken() ?? '';
      if (what === 'approve') await reviewsApi.approve(id, token);
      else if (what === 'reject') await reviewsApi.reject(id, token);
      else await reviewsApi.delete(id, token);
      setReviews(prev => prev.filter(r => r.id !== id));
      setMsg({ kind: 'ok', text: what === 'approve' ? 'Approved — it is on the website now.'
        : what === 'reject' ? 'Rejected — it stays off the website.'
        : 'Deleted.' });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const low = reviews.filter(r => r.rating <= 2).length;

  return (
    <div className="admin-page">
      <PageHeader
        title="Reviews waiting"
        sub="A review stays off the website until you approve it. Nothing here is visible to customers yet."
        right={<button className="adm-btn" onClick={() => { setLoading(true); fetchReviews(); }}>Refresh</button>}
      />

      {msg && (
        <div className="adm-card" style={{
          background: msg.kind === 'ok' ? '#f2faf3' : '#fdf3f2',
          borderColor: msg.kind === 'ok' ? '#cbe6cf' : '#f0cdc9',
          color: msg.kind === 'ok' ? '#2e7d32' : '#c0392b',
          display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '.86rem', fontWeight: 600,
        }}>
          {msg.text}
          <button onClick={() => setMsg(null)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit', fontWeight: 800 }}>×</button>
        </div>
      )}

      <StatGrid cols={3}>
        <Stat label="Waiting on you" value={reviews.length} tone={reviews.length > 0 ? 'red' : undefined} />
        <Stat label="Two stars or fewer" value={low} tone={low > 0 ? 'red' : undefined} />
        <Stat label="Published reviews" value="On the website" action="See the page"
              href="/customer-reviews" />
      </StatGrid>

      <Card title={reviews.length ? `${reviews.length} to decide` : 'Nothing waiting'}>
        {loading ? (
          <Empty>Loading reviews…</Empty>
        ) : reviews.length === 0 ? (
          <Empty>
            Every review has been dealt with. New ones will appear here as customers write them — you will
            not see them on the website until you approve them.
          </Empty>
        ) : reviews.map(r => (
          <div key={r.id} style={{ borderBottom: '1px solid #f4efec', padding: '.8rem 0' }}>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '.88rem', color: '#2d2724' }}>{r.customerName || 'Anonymous'}</strong>
              <Stars n={r.rating} />
              {r.rating <= 2 && <Pill tone="red">Low rating</Pill>}
              <span className="adm-item-s" style={{ marginLeft: 'auto', marginTop: 0 }}>
                {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'no date'}
              </span>
            </div>
            {r.productName && <div className="adm-item-s">on {r.productName}</div>}
            <p style={{ fontSize: '.88rem', color: '#463d38', lineHeight: 1.6, margin: '.45rem 0 0', whiteSpace: 'pre-wrap' }}>
              {r.text || <em style={{ color: '#a49a94' }}>No words, only a rating.</em>}
            </p>
            <div className="adm-actions" style={{ marginTop: '.55rem' }}>
              <button onClick={() => act(r.id, 'approve')} disabled={busy === r.id} style={{ color: '#2e7d32' }}>
                {busy === r.id ? '…' : 'Put on website'}
              </button>
              <button onClick={() => act(r.id, 'reject')} disabled={busy === r.id} style={{ color: '#b26b00' }}>Reject</button>
              <button onClick={() => act(r.id, 'delete')} disabled={busy === r.id} style={{ color: '#c0392b' }}>Delete</button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
