'use client';
import { useState, useEffect } from 'react';
import { reviewsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';

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
  return <span style={{ color: '#f59e0b' }}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>;
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const fetchReviews = () => {
    const token = getAdminToken() ?? '';
    reviewsApi.getPending(token)
      .then(r => setReviews((r as any).reviews ?? []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchReviews(); }, []);

  const handleApprove = async (id: number) => {
    try {
      await reviewsApi.approve(id, getAdminToken() ?? '');
      setReviews(prev => prev.filter(r => r.id !== id));
      setMsg('Review approved.');
    } catch (e) { setMsg('Error: ' + (e as Error).message); }
  };

  const handleReject = async (id: number) => {
    try {
      await reviewsApi.reject(id, getAdminToken() ?? '');
      setReviews(prev => prev.filter(r => r.id !== id));
      setMsg('Review rejected.');
    } catch (e) { setMsg('Error: ' + (e as Error).message); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this review permanently?')) return;
    try {
      await reviewsApi.delete(id, getAdminToken() ?? '');
      setReviews(prev => prev.filter(r => r.id !== id));
      setMsg('Review deleted.');
    } catch (e) { setMsg('Error: ' + (e as Error).message); }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: '#1a1a1a' }}>
        Review Approvals
        {reviews.length > 0 && <span style={{ marginLeft: '.75rem', background: '#a7354d', color: '#fff', fontSize: '.75rem', borderRadius: '12px', padding: '.2rem .6rem' }}>{reviews.length} pending</span>}
      </h1>

      {msg && (
        <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '.75rem 1rem', marginBottom: '1rem', fontSize: '.9rem', color: '#2e7d32', display: 'flex', justifyContent: 'space-between' }}>
          {msg} <button onClick={() => setMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#2e7d32' }}>×</button>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#aaa' }}>Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '12px', padding: '3rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
          <h3 style={{ color: '#555' }}>No Pending Reviews</h3>
          <p style={{ color: '#888', marginTop: '.5rem' }}>All reviews have been moderated.</p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
            <thead style={{ background: '#f9f9f9' }}>
              <tr>
                {['Customer', 'Product', 'Rating', 'Review', 'Date', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '.78rem', color: '#888', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviews.map((r, i) => (
                <tr key={r.id} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : undefined, verticalAlign: 'top' }}>
                  <td style={{ padding: '.75rem 1rem', fontWeight: 600 }}>{r.customerName ?? '—'}</td>
                  <td style={{ padding: '.75rem 1rem', color: '#555', maxWidth: '140px' }}>
                    <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {r.productName ?? '—'}
                    </span>
                  </td>
                  <td style={{ padding: '.75rem 1rem', whiteSpace: 'nowrap' }}>
                    <Stars n={r.rating} />
                    <span style={{ display: 'block', fontSize: '.78rem', color: '#aaa' }}>{r.rating}/5</span>
                  </td>
                  <td style={{ padding: '.75rem 1rem', color: '#444', maxWidth: '280px' }}>
                    <span style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {r.text}
                    </span>
                  </td>
                  <td style={{ padding: '.75rem 1rem', color: '#888', fontSize: '.78rem', whiteSpace: 'nowrap' }}>
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td style={{ padding: '.75rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                      <button onClick={() => handleApprove(r.id)}
                        style={{ background: '#27ae60', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', cursor: 'pointer', fontSize: '.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        ✓ Approve
                      </button>
                      <button onClick={() => handleReject(r.id)}
                        style={{ background: '#f39c12', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', cursor: 'pointer', fontSize: '.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        ✗ Reject
                      </button>
                      <button onClick={() => handleDelete(r.id)}
                        style={{ background: 'none', color: '#c0392b', border: '1px solid #fcc', borderRadius: '6px', padding: '.35rem .75rem', cursor: 'pointer', fontSize: '.78rem', whiteSpace: 'nowrap' }}>
                        🗑️ Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
