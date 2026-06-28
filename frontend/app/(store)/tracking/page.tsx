'use client';
import { useState } from 'react';
import { ordersApi } from '@/lib/api';
import type { Order } from '@/types';

export default function TrackingPage() {
  const [awb, setAwb] = useState('');
  const [pincode, setPincode] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [trackMsg, setTrackMsg] = useState('');
  const [tracking, setTracking] = useState(false);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = awb.trim();
    if (!id) return;
    setTracking(true); setTrackMsg(''); setOrder(null);
    try {
      const res = await ordersApi.getById(id);
      setOrder(res.order);
    } catch {
      setTrackMsg('Order not found on this site. Please check the Order ID/AWB or contact support.');
    } finally { setTracking(false); }
  };

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Delivery</p>
        <h1>Track Order</h1>
        <p>Enter your Order ID or AWB number to check shipment status on our site.</p>
      </section>

      <main className="tracking-page">
        <section className="tracking-card">
          <h2>Shipment Lookup</h2>
          <form className="tracking-form" onSubmit={handleTrack}>
            <input
              type="text"
              placeholder="Order ID or AWB number"
              aria-label="Order ID or AWB number"
              value={awb}
              onChange={e => setAwb(e.target.value)}
            />
            <button type="submit">{tracking ? 'Checking...' : 'Track'}</button>
          </form>
          {trackMsg && <p style={{ color: '#c0392b', fontWeight: 600 }}>{trackMsg}</p>}
          {order && (
            <div style={{ border: '1px solid #eee', borderRadius: 10, padding: '1rem', marginTop: '1rem', background: '#fff' }}>
              <strong>Order #{order.id}</strong>
              <p style={{ margin: '.35rem 0', color: '#555' }}>Status: <strong>{order.status}</strong></p>
              {order.awb && <p style={{ margin: '.35rem 0', color: '#555' }}>AWB: <strong>{order.awb}</strong></p>}
              <p style={{ margin: '.35rem 0', color: '#555' }}>Placed: {new Date(order.placedAt ?? order.createdAt).toLocaleDateString('en-IN')}</p>
            </div>
          )}
          <div className="safety-inline-box">
            <strong>Safe delivery reminder</strong>
            <p>Verify the order ID when receiving the delivery. If there is a parcel issue, send the parcel-opening video and parcel photos to the support team on the same day.</p>
          </div>
        </section>

        <section className="tracking-card">
          <h2>Check Serviceability</h2>
          <p>Not sure if we deliver to your area? Enter your pincode to check delivery serviceability.</p>
          <form className="tracking-form" onSubmit={e => { e.preventDefault(); window.open(`https://www.delhivery.com/`, '_blank'); }}>
            <input
              type="text"
              placeholder="Enter 6-digit pincode"
              inputMode="numeric"
              maxLength={6}
              value={pincode}
              onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <button type="submit">Check</button>
          </form>
        </section>

        <section className="tracking-card">
          <h2>Delivery Support</h2>
          <p>Facing a delivery issue? We are here to help.</p>
          <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', lineHeight: 1.8 }}>
            <li>For missing or damaged items, WhatsApp us within <strong>48 hours of delivery</strong>.</li>
            <li>For delayed orders, share your AWB number on WhatsApp for faster resolution.</li>
            <li>For address change requests, contact us before dispatch only.</li>
          </ul>
          <p style={{ marginTop: '1rem' }}>
            <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer" style={{ color: '#a7354d', fontWeight: 600 }}>
              WhatsApp: +91 9429429880 →
            </a>
          </p>
        </section>
      </main>
    </>
  );
}
