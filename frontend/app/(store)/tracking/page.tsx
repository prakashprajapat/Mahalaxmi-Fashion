'use client';
import { useEffect, useState, useCallback } from 'react';
import { ordersApi } from '@/lib/api';
import type { Order } from '@/types';

type LiveTrack = {
  success: boolean; live: boolean; orderId: string; siteStatus: string;
  courierStatus?: string; expectedDate?: string;
  scans?: Array<{ time: string; location: string; remark: string }>;
};

// Delhivery-style milestone steps shown on our own tracking page.
const STEPS = ['Order Placed', 'Picked Up', 'On the Way', 'Out for Delivery', 'Delivered'];

function stageFrom(courierStatus?: string, siteStatus?: string): number {
  const s = (courierStatus ?? '').toLowerCase();
  if (s.includes('delivered') && !s.includes('undelivered')) return 4;
  if (s.includes('out for delivery') || s.includes('dispatched')) return 3;
  if (s.includes('transit') || s.includes('reached')) return 2;
  if (s.includes('picked') || s.includes('manifest')) return 1;
  // Fallback from the site status when live data isn't available.
  if (siteStatus === 'Delivered') return 4;
  if (siteStatus === 'Transit') return 2;
  if (siteStatus === 'Shipped') return 1;
  return 0;
}

function fmtScanTime(raw: string): string {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? raw : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function TrackingPage() {
  const [awb, setAwb] = useState('');
  const [pincode, setPincode] = useState('');
  const [pinResult, setPinResult] = useState<{ kind: 'ok' | 'no' | 'err'; text: string } | null>(null);
  const [pinChecking, setPinChecking] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [live, setLive] = useState<LiveTrack | null>(null);
  const [trackMsg, setTrackMsg] = useState('');
  const [tracking, setTracking] = useState(false);

  const runTrack = useCallback(async (id: string) => {
    if (!id) return;
    setTracking(true); setTrackMsg(''); setOrder(null); setLive(null);
    try {
      const res = await ordersApi.getById(id);
      setOrder(res.order);
      // Live courier timeline (only when the order has an AWB).
      if (res.order?.awb) {
        try { setLive(await ordersApi.liveTrack(res.order.awb)); } catch { /* live optional */ }
      }
    } catch {
      setTrackMsg('Order not found on this site. Please check the Order ID/AWB or contact support.');
    } finally { setTracking(false); }
  }, []);

  // Auto-track when arriving via /tracking?awb=XXXX (the "Track" button in My Orders).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('awb');
    if (q) { setAwb(q); runTrack(q); }
  }, [runTrack]);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    await runTrack(awb.trim());
  };

  const stage = order ? stageFrom(live?.courierStatus, live?.siteStatus ?? order.status) : 0;
  const scans = (live?.scans ?? []).slice().reverse(); // latest first

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
            <div style={{ border: '1px solid #eee', borderRadius: 10, padding: '1rem 1.2rem', marginTop: '1rem', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
                <strong>Order #{order.id}</strong>
                {live?.expectedDate && (
                  <span style={{ color: '#2e7d32', fontWeight: 700, fontSize: '.9rem' }}>
                    Expected: {new Date(live.expectedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
              {order.awb && <p style={{ margin: '.35rem 0', color: '#555', fontSize: '.9rem' }}>AWB: <strong>{order.awb}</strong> · Placed: {new Date(order.placedAt ?? order.createdAt).toLocaleDateString('en-IN')}</p>}
              {!order.awb && <p style={{ margin: '.35rem 0', color: '#555' }}>Status: <strong>{order.status}</strong> · Placed: {new Date(order.placedAt ?? order.createdAt).toLocaleDateString('en-IN')}</p>}

              {/* ── Live milestone timeline ── */}
              {order.awb && (
                <div style={{ margin: '1.1rem 0 .4rem' }}>
                  {STEPS.map((label, i) => {
                    const done = i <= stage;
                    const isLast = i === STEPS.length - 1;
                    return (
                      <div key={label} style={{ display: 'flex', gap: '.8rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{
                            width: 14, height: 14, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                            background: done ? '#2e7d32' : '#fff',
                            border: done ? '2px solid #2e7d32' : '2px solid #ccc',
                          }} />
                          {!isLast && <span style={{ width: 2, flex: 1, minHeight: 22, background: i < stage ? '#2e7d32' : '#ddd' }} />}
                        </div>
                        <div style={{ paddingBottom: isLast ? 0 : '.4rem' }}>
                          <p style={{ margin: 0, fontWeight: done ? 700 : 500, color: done ? '#1a1a1a' : '#999', fontSize: '.95rem' }}>{label}</p>
                          {i === stage && live?.courierStatus && (
                            <p style={{ margin: '.15rem 0 0', color: '#2e7d32', fontSize: '.82rem', fontWeight: 600 }}>{live.courierStatus}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Latest courier updates (scan history) ── */}
              {scans.length > 0 && (
                <details style={{ marginTop: '.6rem', borderTop: '1px solid #f0f0f0', paddingTop: '.6rem' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#a7354d', fontSize: '.9rem' }}>
                    All updates ({scans.length})
                  </summary>
                  <div style={{ marginTop: '.6rem', display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
                    {scans.map((sc, i) => (
                      <div key={i} style={{ fontSize: '.84rem', borderLeft: '3px solid #eee', paddingLeft: '.7rem' }}>
                        <p style={{ margin: 0, color: '#333' }}>{sc.remark}</p>
                        <p style={{ margin: 0, color: '#999' }}>{fmtScanTime(sc.time)}{sc.location ? ` · ${sc.location}` : ''}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          <div className="safety-inline-box">
            <strong>Safe delivery reminder</strong>
            <p>Verify the order ID when receiving the delivery. If there is a parcel issue, send the parcel-opening video and parcel photos to the support team on the same day.</p>
          </div>
        </section>

        <section className="tracking-card">
          <h2>Check Serviceability</h2>
          <p>Not sure if we deliver to your area? Enter your pincode to check delivery serviceability and estimated delivery date.</p>
          <form className="tracking-form" onSubmit={async e => {
            e.preventDefault();
            const p = pincode.replace(/\D/g, '');
            if (p.length !== 6) { setPinResult({ kind: 'err', text: 'Please enter a valid 6-digit pincode.' }); return; }
            setPinChecking(true); setPinResult(null);
            try {
              const r = await ordersApi.checkPincode(p);
              if (r.known && !r.serviceable) {
                setPinResult({ kind: 'no', text: 'Delivery is not available at this pincode. Message us on WhatsApp — we may still arrange it.' });
              } else {
                const d1 = new Date(); d1.setDate(d1.getDate() + r.etaMinDays);
                const d2 = new Date(); d2.setDate(d2.getDate() + r.etaMaxDays);
                const f = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                setPinResult({ kind: 'ok', text: `✓ Yes, we deliver here! Estimated delivery by ${f(d1)} – ${f(d2)}${r.cod ? ' · COD available' : ' · Prepaid only'}` });
              }
            } catch {
              setPinResult({ kind: 'err', text: 'Could not check right now. Please try again or WhatsApp us.' });
            } finally { setPinChecking(false); }
          }}>
            <input
              type="text"
              placeholder="Enter 6-digit pincode"
              inputMode="numeric"
              maxLength={6}
              value={pincode}
              onChange={e => { setPincode(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinResult(null); }}
            />
            <button type="submit">{pinChecking ? 'Checking…' : 'Check'}</button>
          </form>
          {pinResult && (
            <p style={{ marginTop: '.6rem', fontWeight: 600, fontSize: '.9rem',
              color: pinResult.kind === 'ok' ? '#2e7d32' : '#c0392b' }}>
              {pinResult.text}
            </p>
          )}
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
