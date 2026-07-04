'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCustomer, getToken } from '@/lib/auth';
import { ordersApi } from '@/lib/api';
import { productImageSrc } from '@/lib/productImages';
import type { Order, Customer } from '@/types';

const HOURS_12 = 12 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;
const MAX_PHOTOS = 8;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // 80 MB

// Downscale + re-encode a photo in the browser so uploads stay small (typically <300 KB).
async function compressImage(file: File, maxDim = 1600, quality = 0.72): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const s = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * s);
      height = Math.round(height * s);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // fall back to original on any failure
  }
}

function canCancel(order: Order): boolean {
  if (!['Order Received', 'Pending', 'Pending confirmation'].includes(order.status)) return false;
  const placed = new Date(order.placedAt ?? order.createdAt).getTime();
  return Date.now() - placed < HOURS_12;
}

function canReturn(order: Order): boolean {
  if (order.status !== 'Delivered') return false;
  const delivered = order.deliveredAt ? new Date(order.deliveredAt).getTime() : null;
  if (!delivered) return false;
  return Date.now() - delivered < DAYS_7;
}

export default function OrdersPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState('');
  const [returnOrderId, setReturnOrderId] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnIssue, setReturnIssue] = useState('Damaged product');
  const [returnCallback, setReturnCallback] = useState('');
  const [returnSubmitted, setReturnSubmitted] = useState('');
  // Return media
  const [openVideo, setOpenVideo] = useState<File | null>(null);
  const [closeVideo, setCloseVideo] = useState<File | null>(null);
  const [openPhotos, setOpenPhotos] = useState<File[]>([]);
  const [closePhotos, setClosePhotos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [msg, setMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'orders' | 'returns'>('orders');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'delivered' | 'cancelled'>('all');
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  useEffect(() => {
    const c = getCustomer();
    if (!c) { router.push('/account'); return; }
    setCustomer(c);
    const token = getToken() ?? '';
    ordersApi.getAll({ phone: c.phone, email: c.email }, token)
      .then(r => setOrders(r.orders))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [router]);

  const handleCancel = async (orderId: string) => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    setCancellingId(orderId);
    try {
      const res = await ordersApi.cancel(orderId, getToken() ?? '');
      setOrders(prev => prev.map(o => o.id === orderId ? res.order : o));
      setDetailOrder(prev => prev && prev.id === orderId ? res.order : prev);
      setMsg(`Cancel request submitted for order #${orderId}.`);
    } catch (e) {
      setMsg('Failed to cancel order: ' + (e as Error).message);
    } finally { setCancellingId(''); }
  };

  const pickVideo = (which: 'open' | 'close', f: File | null) => {
    const setter = which === 'open' ? setOpenVideo : setCloseVideo;
    if (!f) { setter(null); return; }
    if (!f.type.startsWith('video/')) { alert('Please select a video file.'); return; }
    if (f.size > MAX_VIDEO_BYTES) { alert('Video is too large (max 80 MB). Please trim or compress it and try again.'); return; }
    setter(f);
  };

  const addPhotos = (which: 'open' | 'close', list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list).filter(f => f.type.startsWith('image/'));
    if (which === 'open') setOpenPhotos(prev => [...prev, ...incoming].slice(0, MAX_PHOTOS));
    else setClosePhotos(prev => [...prev, ...incoming].slice(0, MAX_PHOTOS));
  };

  const removePhoto = (which: 'open' | 'close', idx: number) => {
    if (which === 'open') setOpenPhotos(prev => prev.filter((_, i) => i !== idx));
    else setClosePhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const resetReturnForm = () => {
    setReturnOrderId(''); setReturnReason(''); setReturnCallback('');
    setOpenVideo(null); setCloseVideo(null); setOpenPhotos([]); setClosePhotos([]);
    setUploadMsg('');
  };

  const handleReturn = async (order: Order) => {
    if (!returnReason.trim()) { alert('Please describe the issue.'); return; }
    setUploading(true);
    try {
      const token = getToken() ?? '';
      let done = 0;
      const total = (openVideo ? 1 : 0) + (closeVideo ? 1 : 0) + openPhotos.length + closePhotos.length;
      const up = async (file: File, kind: string) => {
        const f = file.type.startsWith('image/') ? await compressImage(file) : file;
        if (total) setUploadMsg(`Uploading media… ${++done}/${total}`);
        const r = await ordersApi.uploadReturnMedia(order.id, f, kind, token);
        return r.url;
      };

      const openingVideo = openVideo ? await up(openVideo, 'openingVideo') : '';
      const closingVideo = closeVideo ? await up(closeVideo, 'closingVideo') : '';
      const openingPhotos: string[] = [];
      for (const p of openPhotos) openingPhotos.push(await up(p, 'openingPhoto'));
      const closingPhotos: string[] = [];
      for (const p of closePhotos) closingPhotos.push(await up(p, 'closingPhoto'));

      setUploadMsg('Submitting return request…');
      const details = {
        issue: returnIssue,
        invoiceNumber: order.invoiceNumber ?? '',
        awb: order.awb ?? '',
        paymentMethod: order.method,
        description: returnReason.trim(),
        callback: returnCallback.trim(),
        openingVideo, closingVideo, openingPhotos, closingPhotos,
      };
      const res = await ordersApi.requestReturn(order.id, details, token);
      setOrders(prev => prev.map(o => o.id === order.id ? res.order : o));
      setReturnSubmitted(order.id);
      resetReturnForm();
      setMsg(`Return requested for order #${order.id}.`);
    } catch (e) {
      setMsg('Failed to request return: ' + (e as Error).message);
    } finally {
      setUploading(false);
      setUploadMsg('');
    }
  };

  // Filter logic
  const returnOrders = orders.filter(o => (o as any).returnStatus || (o as any).returnReason || returnSubmitted === o.id);
  const filteredOrders = orders.filter(o => {
    if (statusFilter === 'active') return !['Delivered', 'Cancelled'].includes(o.status);
    if (statusFilter === 'delivered') return o.status === 'Delivered';
    if (statusFilter === 'cancelled') return o.status === 'Cancelled';
    return true;
  });

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">My Account</p>
        <h1>My Orders</h1>
        <p>Track and manage your orders.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          {/* Orders / Returns Tabs — Point 16 */}
          <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '2px solid #eee' }}>
            {(['orders', 'returns'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{
                  padding: '.65rem 1.5rem', border: 'none', background: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: '.95rem',
                  color: activeTab === tab ? '#a7354d' : '#888',
                  borderBottom: activeTab === tab ? '2.5px solid #a7354d' : '2.5px solid transparent',
                  marginBottom: '-2px',
                }}>
                {tab === 'orders' ? `📦 My Orders (${orders.length})` : `🔄 My Returns (${returnOrders.length})`}
              </button>
            ))}
          </div>

          {msg && (
            <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '.75rem 1rem', marginBottom: '1rem', fontSize: '.9rem', color: '#2e7d32', display: 'flex', justifyContent: 'space-between' }}>
              {msg}
              <button onClick={() => setMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2e7d32', fontWeight: 700 }}>×</button>
            </div>
          )}

          {/* Status Filter — Point 21 */}
          {activeTab === 'orders' && orders.length > 0 && (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {(['all', 'active', 'delivered', 'cancelled'] as const).map(f => (
                <button key={f} onClick={() => setStatusFilter(f)}
                  style={{
                    padding: '.35rem .9rem', borderRadius: '20px', border: '1.5px solid',
                    borderColor: statusFilter === f ? '#a7354d' : '#ddd',
                    background: statusFilter === f ? '#a7354d' : '#fff',
                    color: statusFilter === f ? '#fff' : '#555',
                    fontSize: '.82rem', fontWeight: 600, cursor: 'pointer',
                  }}>
                  {f === 'all' ? 'All Orders' : f === 'active' ? '🕐 Active' : f === 'delivered' ? '✅ Delivered' : '❌ Cancelled'}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="form-card" style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>Loading orders…</div>
          ) : activeTab === 'returns' ? (
            returnOrders.length === 0 ? (
              <div className="form-card" style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔄</div>
                <h3 style={{ color: '#555' }}>No return requests yet</h3>
                <p style={{ color: '#888' }}>Items eligible for return will appear here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {returnOrders.map(order => (
                  <div key={order.id} className="form-card" style={{ padding: '1.25rem', borderLeft: '4px solid #e67e22' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
                      <div>
                        <strong>Order #{order.id}</strong>
                        <span style={{ display: 'block', fontSize: '.8rem', color: '#888' }}>
                          {new Date(order.placedAt ?? order.createdAt).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                      <span className="badge badge-yellow">{(order as any).returnStatus ?? 'Return Requested'}</span>
                    </div>
                    {order.returnIssue && (
                      <p style={{ fontSize: '.85rem', color: '#666', marginTop: '.5rem' }}><strong>Issue:</strong> {order.returnIssue}</p>
                    )}
                    {(order.returnReason || (order as any).returnReason) && (
                      <p style={{ fontSize: '.85rem', color: '#666', marginTop: '.25rem' }}>Reason: {order.returnReason || (order as any).returnReason}</p>
                    )}
                    {(() => {
                      const media = [
                        ...(order.returnOpeningVideo ? [{ url: order.returnOpeningVideo, video: true }] : []),
                        ...(order.returnClosingVideo ? [{ url: order.returnClosingVideo, video: true }] : []),
                        ...(order.returnOpeningPhotos ?? []).map(u => ({ url: u, video: false })),
                        ...(order.returnClosingPhotos ?? []).map(u => ({ url: u, video: false })),
                      ];
                      if (!media.length) return null;
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginTop: '.6rem' }}>
                          {media.map((m, i) => (
                            <a key={i} href={m.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                              {m.video
                                ? <div style={{ width: 54, height: 54, borderRadius: 6, border: '1px solid #eee', background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>▶</div>
                                : <img src={m.url} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />}
                            </a>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )
          ) : filteredOrders.length === 0 ? (
            <div className="form-card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
              <h3 style={{ color: '#555' }}>{orders.length === 0 ? 'No orders yet' : 'No orders in this category'}</h3>
              <p style={{ color: '#888', marginBottom: '1.5rem' }}>{orders.length === 0 ? 'Your order history will appear here.' : 'Try a different filter.'}</p>
              {orders.length === 0 && <Link href="/products" className="button primary">Start Shopping</Link>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {filteredOrders.map(order => (
                <div key={order.id} className="form-card" style={{ padding: '1.25rem' }}>
                  <div onClick={() => setDetailOrder(order)} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.75rem' }}>
                      <div>
                        <strong style={{ fontSize: '1rem' }}>Order #{order.id}</strong>
                        <span style={{ display: 'block', fontSize: '.8rem', color: '#888', marginTop: '.1rem' }}>
                          Placed: {new Date(order.placedAt ?? order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                        <span className={`badge ${order.status === 'Delivered' ? 'badge-green' : order.status === 'Cancelled' ? 'badge-red' : 'badge-yellow'}`}>
                          {order.status}
                        </span>
                        <strong style={{ color: '#a7354d' }}>₹{order.total.toLocaleString('en-IN')}</strong>
                      </div>
                    </div>

                    {/* Items preview (with thumbnails) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginBottom: '.5rem' }}>
                      {order.cart.slice(0, 3).map((item, i) => {
                        const thumb = productImageSrc(item.colorPhoto || item.image);
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem', color: '#555' }}>
                            {thumb
                              ? <img src={thumb} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} />
                              : <div style={{ width: 34, height: 34, borderRadius: 6, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>👗</div>}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.name}{item.size ? ` (${item.size})` : ''} × {item.quantity}
                            </span>
                          </div>
                        );
                      })}
                      {order.cart.length > 3 && <span style={{ color: '#aaa', fontSize: '.82rem' }}>+{order.cart.length - 3} more item{order.cart.length - 3 !== 1 ? 's' : ''}</span>}
                    </div>
                    <p style={{ fontSize: '.82rem', color: '#a7354d', fontWeight: 600, marginBottom: '.75rem' }}>View full details →</p>
                  </div>

                  {order.awb && (
                    <p style={{ fontSize: '.82rem', color: '#666', marginBottom: '.75rem' }}>
                      AWB / Tracking: <strong>{order.awb}</strong>
                    </p>
                  )}

                  {/* Return form */}
                  {returnOrderId === order.id && (
                    <div style={{ background: '#f9f9f9', border: '1px solid #eee', borderRadius: '8px', padding: '1rem', marginBottom: '.75rem' }}>
                      <p style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: '.75rem' }}>Return Request</p>

                      {/* Auto-filled order details */}
                      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.78rem', color: '#555', marginBottom: '.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.25rem .75rem' }}>
                        <span><strong>Order No:</strong> {order.id}</span>
                        <span><strong>Invoice No:</strong> {order.invoiceNumber || '—'}</span>
                        <span><strong>AWB No:</strong> {order.awb || '—'}</span>
                        <span><strong>Payment:</strong> {(order.method || '').toUpperCase()}</span>
                      </div>

                      <label style={{ fontSize: '.82rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '.25rem' }}>Issue *</label>
                      <select value={returnIssue} onChange={e => setReturnIssue(e.target.value)}
                        style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.55rem .75rem', fontSize: '.85rem', marginBottom: '.6rem', background: '#fff' }}>
                        {['Damaged product', 'Wrong item received', 'Size / fit issue', 'Not as described', 'Missing item / accessory', 'Quality issue', 'Other'].map(s => <option key={s}>{s}</option>)}
                      </select>

                      <label style={{ fontSize: '.82rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '.25rem' }}>Description *</label>
                      <textarea
                        value={returnReason}
                        onChange={e => setReturnReason(e.target.value)}
                        placeholder="Please describe the issue in detail"
                        rows={3}
                        style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.85rem', resize: 'vertical', boxSizing: 'border-box', marginBottom: '.6rem' }}
                      />

                      <label style={{ fontSize: '.82rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '.25rem' }}>Callback Number</label>
                      <input value={returnCallback} onChange={e => setReturnCallback(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="Mobile number for callback (optional)"
                        style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.55rem .75rem', fontSize: '.85rem', boxSizing: 'border-box', marginBottom: '.35rem' }} />

                      {/* ── Media uploads (all optional) ────────────────────────── */}
                      <div style={{ borderTop: '1px dashed #e0e0e0', margin: '.85rem 0 .35rem', paddingTop: '.6rem' }}>
                        <p style={{ fontSize: '.8rem', fontWeight: 700, color: '#555', margin: '0 0 .1rem' }}>📷 Photos &amp; Videos <span style={{ fontWeight: 400, color: '#999' }}>(optional, but recommended)</span></p>
                        <p style={{ fontSize: '.72rem', color: '#999', margin: '0 0 .6rem' }}>Add an opening video/photos (parcel being opened) and return-pack video/photos (item being re-packed). This speeds up return approval.</p>
                      </div>

                      {/* Opening video */}
                      <div style={{ marginBottom: '.7rem' }}>
                        <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '.25rem' }}>🎬 Opening Video</label>
                        {openVideo ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.8rem', color: '#333', background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '.4rem .6rem' }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🎬 {openVideo.name} · {(openVideo.size / 1048576).toFixed(1)} MB</span>
                            <button type="button" onClick={() => setOpenVideo(null)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontWeight: 700 }}>Remove</button>
                          </div>
                        ) : (
                          <input type="file" accept="video/*" onChange={e => { pickVideo('open', e.target.files?.[0] ?? null); e.target.value = ''; }} style={{ fontSize: '.8rem' }} />
                        )}
                      </div>

                      {/* Opening photos */}
                      <div style={{ marginBottom: '.7rem' }}>
                        <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '.25rem' }}>🖼️ Opening Photos <span style={{ color: '#999', fontWeight: 400 }}>({openPhotos.length}/{MAX_PHOTOS})</span></label>
                        {openPhotos.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.4rem' }}>
                            {openPhotos.map((p, i) => (
                              <div key={i} style={{ position: 'relative' }}>
                                <img src={URL.createObjectURL(p)} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
                                <button type="button" onClick={() => removePhoto('open', i)} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#e74c3c', color: '#fff', border: 'none', fontSize: '.7rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
                              </div>
                            ))}
                          </div>
                        )}
                        {openPhotos.length < MAX_PHOTOS && (
                          <input type="file" accept="image/*" multiple onChange={e => { addPhotos('open', e.target.files); e.target.value = ''; }} style={{ fontSize: '.8rem' }} />
                        )}
                      </div>

                      {/* Return-pack video */}
                      <div style={{ marginBottom: '.7rem' }}>
                        <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '.25rem' }}>🎬 Return-Pack Video <span style={{ color: '#999', fontWeight: 400 }}>(closing)</span></label>
                        {closeVideo ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.8rem', color: '#333', background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '.4rem .6rem' }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🎬 {closeVideo.name} · {(closeVideo.size / 1048576).toFixed(1)} MB</span>
                            <button type="button" onClick={() => setCloseVideo(null)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontWeight: 700 }}>Remove</button>
                          </div>
                        ) : (
                          <input type="file" accept="video/*" onChange={e => { pickVideo('close', e.target.files?.[0] ?? null); e.target.value = ''; }} style={{ fontSize: '.8rem' }} />
                        )}
                      </div>

                      {/* Return-pack photos */}
                      <div style={{ marginBottom: '.7rem' }}>
                        <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '.25rem' }}>🖼️ Return-Pack Photos <span style={{ color: '#999', fontWeight: 400 }}>(closing · {closePhotos.length}/{MAX_PHOTOS})</span></label>
                        {closePhotos.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.4rem' }}>
                            {closePhotos.map((p, i) => (
                              <div key={i} style={{ position: 'relative' }}>
                                <img src={URL.createObjectURL(p)} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
                                <button type="button" onClick={() => removePhoto('close', i)} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#e74c3c', color: '#fff', border: 'none', fontSize: '.7rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
                              </div>
                            ))}
                          </div>
                        )}
                        {closePhotos.length < MAX_PHOTOS && (
                          <input type="file" accept="image/*" multiple onChange={e => { addPhotos('close', e.target.files); e.target.value = ''; }} style={{ fontSize: '.8rem' }} />
                        )}
                      </div>

                      {uploadMsg && <p style={{ fontSize: '.78rem', color: '#a7354d', fontWeight: 600, margin: '.25rem 0 .5rem' }}>⏳ {uploadMsg}</p>}

                      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.25rem' }}>
                        <button className="button primary" onClick={() => handleReturn(order)} disabled={uploading} style={{ fontSize: '.85rem', padding: '.5rem 1rem', opacity: uploading ? 0.6 : 1 }}>
                          {uploading ? 'Submitting…' : 'Submit Return Request'}
                        </button>
                        <button className="button secondary" onClick={resetReturnForm} disabled={uploading} style={{ fontSize: '.85rem', padding: '.5rem 1rem' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {returnSubmitted === order.id && (
                    <p style={{ color: '#27ae60', fontSize: '.85rem', marginBottom: '.5rem' }}>✓ Return request submitted successfully.</p>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                    {canCancel(order) && (
                      <button
                        className="button secondary"
                        disabled={cancellingId === order.id}
                        onClick={() => handleCancel(order.id)}
                        style={{ fontSize: '.82rem', padding: '.4rem .85rem', borderColor: '#e74c3c', color: '#e74c3c' }}>
                        {cancellingId === order.id ? 'Cancelling…' : '✕ Cancel Order'}
                      </button>
                    )}
                    {canReturn(order) && returnOrderId !== order.id && returnSubmitted !== order.id && (
                      <button
                        className="button secondary"
                        onClick={() => setReturnOrderId(order.id)}
                        style={{ fontSize: '.82rem', padding: '.4rem .85rem' }}>
                        🔄 Request Return
                      </button>
                    )}
                    {order.status === 'Delivered' && order.cart[0] && (
                      <Link href={`/products/${order.cart[0].id}`} className="button secondary" style={{ fontSize: '.82rem', padding: '.4rem .85rem', borderColor: '#f59e0b', color: '#c77800' }}>
                        ★ Write a Review
                      </Link>
                    )}
                    <Link href={`/tracking?awb=${order.awb ?? ''}`} className="button secondary" style={{ fontSize: '.82rem', padding: '.4rem .85rem' }}>
                      📦 Track
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Full order detail modal */}
      {detailOrder && (
        <div onClick={() => setDetailOrder(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 400, padding: '1rem', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px', margin: '2rem auto', padding: '1.5rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>Order #{detailOrder.id}</h3>
                <span style={{ fontSize: '.8rem', color: '#888' }}>
                  Placed: {new Date(detailOrder.placedAt ?? detailOrder.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <button onClick={() => setDetailOrder(null)} aria-label="Close"
                style={{ background: 'none', border: 'none', fontSize: '1.6rem', cursor: 'pointer', color: '#888', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <span className={`badge ${detailOrder.status === 'Delivered' ? 'badge-green' : detailOrder.status === 'Cancelled' ? 'badge-red' : 'badge-yellow'}`}>{detailOrder.status}</span>
              <span style={{ fontSize: '.85rem', color: '#555', textTransform: 'capitalize' }}>{detailOrder.method}</span>
              {detailOrder.awb && <span style={{ fontSize: '.8rem', color: '#666' }}>AWB: <strong>{detailOrder.awb}</strong></span>}
            </div>

            {/* Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', marginBottom: '1rem' }}>
              {detailOrder.cart.map((item, i) => {
                const thumb = productImageSrc(item.colorPhoto || item.image);
                const sizeOnly = item.color ? (item.size || '').split(' / ').filter(p => p && p !== item.color).join(' / ') : (item.size || '');
                return (
                  <div key={i} style={{ display: 'flex', gap: '.75rem', alignItems: 'center', borderBottom: '1px solid #f5f5f5', paddingBottom: '.75rem' }}>
                    {thumb
                      ? <img src={thumb} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} />
                      : <div style={{ width: 56, height: 56, borderRadius: 8, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>👗</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '.9rem', color: '#333' }}>{item.name}</div>
                      <div style={{ fontSize: '.75rem', color: '#888', fontFamily: 'monospace' }}>SKU: {item.sku || '—'}{item.colorColumn ? ` · Col ${item.colorColumn}` : ''}</div>
                      <div style={{ fontSize: '.78rem', color: '#666', display: 'flex', alignItems: 'center', gap: '.3rem', flexWrap: 'wrap' }}>
                        {item.color && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem' }}>
                            {item.colorCode && <span style={{ width: 11, height: 11, borderRadius: '50%', background: item.colorCode, border: '1px solid #ccc' }} />}
                            {item.color}{item.colorCode ? ` (${item.colorCode})` : ''}
                          </span>
                        )}
                        {sizeOnly && <span>{item.color ? '· ' : ''}Size: {sizeOnly}</span>}
                        <span>· Qty: {item.quantity}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}>₹{Number(item.lineTotal).toLocaleString('en-IN')}</div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div style={{ fontSize: '.85rem', color: '#555', display: 'flex', flexDirection: 'column', gap: '.3rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>₹{Number(detailOrder.subtotal).toLocaleString('en-IN')}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Shipping</span><span>{detailOrder.shippingCost ? `₹${Number(detailOrder.shippingCost).toLocaleString('en-IN')}` : 'Free'}</span></div>
              {detailOrder.codFee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>COD Fee</span><span>₹{Number(detailOrder.codFee).toLocaleString('en-IN')}</span></div>}
              {(detailOrder as { discountAmount?: number }).discountAmount ? <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2e7d32' }}><span>Discount{(detailOrder as { couponCode?: string }).couponCode ? ` (${(detailOrder as { couponCode?: string }).couponCode})` : ''}</span><span>−₹{Number((detailOrder as { discountAmount?: number }).discountAmount).toLocaleString('en-IN')}</span></div> : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#a7354d', borderTop: '1px solid #eee', paddingTop: '.4rem' }}><span>Total</span><span>₹{Number(detailOrder.total).toLocaleString('en-IN')}</span></div>
            </div>

            {/* Delivery address */}
            <div style={{ background: '#f9f9f9', borderRadius: '8px', padding: '.75rem', fontSize: '.82rem', color: '#555', marginBottom: '1rem' }}>
              <strong style={{ display: 'block', marginBottom: '.25rem', color: '#333' }}>Delivery Address</strong>
              {detailOrder.shippingName && <div>{detailOrder.shippingName}</div>}
              <div>{[detailOrder.shippingAddress, detailOrder.shippingCity, detailOrder.shippingState, detailOrder.shippingPincode].filter(Boolean).join(', ') || '—'}</div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              {canCancel(detailOrder) && (
                <button className="button secondary" disabled={cancellingId === detailOrder.id}
                  onClick={() => handleCancel(detailOrder.id)}
                  style={{ fontSize: '.82rem', padding: '.4rem .85rem', borderColor: '#e74c3c', color: '#e74c3c' }}>
                  {cancellingId === detailOrder.id ? 'Cancelling…' : '✕ Cancel Order'}
                </button>
              )}
              <Link href={`/tracking?awb=${detailOrder.awb ?? ''}`} className="button secondary" style={{ fontSize: '.82rem', padding: '.4rem .85rem' }}>📦 Track</Link>
              <button className="button primary" onClick={() => setDetailOrder(null)} style={{ fontSize: '.82rem', padding: '.4rem .85rem', marginLeft: 'auto' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
