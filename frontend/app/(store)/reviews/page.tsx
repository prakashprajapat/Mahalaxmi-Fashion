'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCustomer, getToken } from '@/lib/auth';
import { reviewsApi, ordersApi } from '@/lib/api';
import type { Customer, Order } from '@/types';

function Stars({ n, onClick }: { n: number; onClick?: (v: number) => void }) {
  return (
    <span style={{ fontSize: '1.4rem', cursor: onClick ? 'pointer' : 'default' }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} onClick={() => onClick?.(i)} style={{ color: i <= n ? '#f59e0b' : '#ddd' }}>★</span>
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const c = getCustomer();
    if (!c) { router.push('/account'); return; }
    setCustomer(c);
    const token = getToken() ?? '';
    ordersApi.getAll({ phone: c.phone, email: c.email }, token)
      .then(r => setOrders(r.orders.filter(o => o.status === 'Delivered')))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [router]);

  const eligibleItems = orders.flatMap(o =>
    o.cart.map(item => ({ orderId: o.id, productId: item.id, productName: item.name }))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) { setMsg('Please select a product to review.'); return; }
    if (!text.trim()) { setMsg('Please write a review.'); return; }
    setSubmitting(true); setMsg('');
    try {
      await reviewsApi.submit({
        productId: Number(selectedProductId),
        rating,
        text: text.trim(),
        orderId: selectedOrderId,
      }, getToken() ?? '');
      setMsg('✅ Review submitted! It will appear after approval.');
      setText(''); setRating(5); setSelectedProductId(''); setSelectedOrderId('');
    } catch (e) { setMsg('❌ ' + (e as Error).message); }
    finally { setSubmitting(false); }
  };

  if (!customer) return null;

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">My Account</p>
        <h1>My Reviews</h1>
        <p>Share your experience about products you have purchased.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          <div className="form-card">
            <h2>Submit a Review</h2>
            {loading ? (
              <p style={{ color: '#aaa' }}>Loading your orders…</p>
            ) : orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>📦</div>
                <p>No delivered orders found. Reviews can only be submitted for delivered orders.</p>
                <Link href="/orders" className="button primary" style={{ display: 'inline-block', marginTop: '1rem' }}>View Orders</Link>
              </div>
            ) : (
              <form className="form-grid" onSubmit={handleSubmit}>
                <div className="full-field">
                  <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, marginBottom: '.3rem' }}>Select Product to Review</label>
                  <select value={selectedProductId}
                    onChange={e => {
                      const opt = eligibleItems.find(i => i.productId === e.target.value);
                      setSelectedProductId(e.target.value);
                      setSelectedOrderId(opt?.orderId ?? '');
                      setSelectedProductName(opt?.productName ?? '');
                    }}
                    style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem' }}>
                    <option value="">— Select a product —</option>
                    {eligibleItems.map((item, i) => (
                      <option key={i} value={item.productId}>{item.productName} (Order: {item.orderId})</option>
                    ))}
                  </select>
                </div>

                <div className="full-field">
                  <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, marginBottom: '.5rem' }}>Your Rating</label>
                  <Stars n={rating} onClick={setRating} />
                </div>

                <label className="full-field">
                  Your Review
                  <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
                    placeholder="Share your experience with this product..."
                    style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem', resize: 'vertical', marginTop: '.3rem', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                </label>

                {msg && <p className="full-field" style={{ color: msg.startsWith('✅') ? '#27ae60' : '#c0392b', fontWeight: 600 }}>{msg}</p>}

                <div className="form-actions">
                  <button type="submit" className="button primary" disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit Review'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
