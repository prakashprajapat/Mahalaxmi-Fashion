'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';

// Admin -> WhatsApp Activity. Everything Interakt reports through the webhook:
// carts from the WhatsApp catalogue, how far each WhatsApp template message
// got, payment confirmations, account alerts, and every raw event.

type Tab = 'carts' | 'messages' | 'payments' | 'alerts' | 'events';
interface CartItem { retailerId: string; productId?: number | null; name: string; sku: string; variant: string; qty: number; price: number; link: string }
interface Cart {
  id: number; phone?: string | null; name?: string | null; items: CartItem[]; total: number; currency?: string | null;
  customerNote?: string | null; status: string; orderId?: string | null; orderedLater?: string | null; note?: string | null; createdAt: string;
}
interface Msg {
  id: number; messageId: string; source: string; phone?: string | null; template?: string | null; campaignId?: string | null;
  status: string; failureReason?: string | null; sentAt?: string | null; deliveredAt?: string | null; readAt?: string | null; clickedAt?: string | null; failedAt?: string | null;
}
interface Ev { id: number; type: string; category: string; phone?: string | null; ref?: string | null; status?: string | null; summary?: string | null; raw?: string | null; createdAt: string }
interface Sum { cartsNew: number; carts: number; sent: number; delivered: number; read: number; clicked: number; failed: number; payments: number; alerts: number; lastEventAt?: string | null }

const auth = () => ({ Authorization: `Bearer ${getAdminToken() ?? ''}` });
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const money = (n: number) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const STATUS_TONE: Record<string, 'red' | 'amber' | 'green' | 'grey'> = { new: 'red', contacted: 'amber', ordered: 'green', cancelled: 'grey' };
const MSG_TONE: Record<string, 'red' | 'amber' | 'green' | 'grey'> = { Failed: 'red', Sent: 'grey', Delivered: 'amber', Read: 'green', Clicked: 'green' };

const DEFAULT_REPLY = 'Dear {name},\n\nThank you for your order on WhatsApp!\n\n{items}\n\nTotal: {total}\n\nPlease reply with your full delivery address and pincode, and tell us Cash on Delivery or online payment. You can also order on our website from the links above.\n\nThank you for choosing Mahalaxmi Fashion Hub.';

export default function WhatsAppActivityPage() {
  const [tab, setTab] = useState<Tab>('carts');
  const [days, setDays] = useState(30);
  const [sum, setSum] = useState<Sum | null>(null);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [reply, setReply] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [msgStatus, setMsgStatus] = useState('');
  const [events, setEvents] = useState<Ev[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const get = async (path: string) => {
    const r = await fetch(path, { headers: auth() });
    if (!r.ok) throw new Error(r.status === 403 ? 'You do not have access to this page.' : `Could not load (${r.status})`);
    return r.json();
  };

  const load = async () => {
    setLoading(true); setError('');
    try {
      setSum(await get(`/api/whatsapp/activity/summary?days=${days}`));
      if (tab === 'carts') { const b = await get(`/api/whatsapp/activity/carts?days=${days}`); setCarts(b.carts ?? []); setReply(b.cartReply ?? ''); }
      else if (tab === 'messages') { const b = await get(`/api/whatsapp/activity/messages?days=${days}${msgStatus ? `&status=${msgStatus}` : ''}`); setMsgs(b.messages ?? []); }
      else { const cat = tab === 'payments' ? 'payment' : tab === 'alerts' ? 'alert' : 'all'; const b = await get(`/api/whatsapp/activity/events?category=${cat}&days=${days}`); setEvents(b.events ?? []); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load'); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [tab, days, msgStatus]);

  const patchCart = async (c: Cart, body: Partial<{ status: string; note: string; orderId: string }>) => {
    await fetch(`/api/whatsapp/activity/carts/${c.id}`, { method: 'PATCH', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    load();
  };

  const replyText = (c: Cart) => {
    const items = c.items.map(i => `- ${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.qty}${i.price ? ` - ${money(i.price * i.qty)}` : ''}${i.link ? `\n  ${i.link}` : ''}`).join('\n');
    return (reply.trim() || DEFAULT_REPLY)
      .replace(/\{name\}/g, c.name?.split(' ')[0] || 'Customer')
      .replace(/\{items\}/g, items)
      .replace(/\{total\}/g, money(c.total));
  };

  const cell = { padding: '8px 6px', verticalAlign: 'top' as const };
  const small = { fontSize: 11, color: '#777' };

  return (
    <div className="admin-page">
      <PageHeader title="WhatsApp Activity"
        sub="What Interakt reports: carts sent from your WhatsApp catalogue, how far each WhatsApp message got, payments and account alerts."
        right={<>
          <select className="adm-input" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 150 }}>
            {[7, 30, 90, 365].map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button className="adm-btn" onClick={load}>Refresh</button>
        </>} />

      <StatGrid cols={4}>
        <Stat label="New WhatsApp carts" value={sum?.cartsNew ?? '-'} tone={sum?.cartsNew ? 'red' : undefined} onClick={() => setTab('carts')} />
        <Stat label="Messages delivered / read" value={sum ? `${sum.delivered} / ${sum.read}` : '-'} onClick={() => { setTab('messages'); setMsgStatus(''); }} />
        <Stat label="Messages failed" value={sum?.failed ?? '-'} tone={sum?.failed ? 'red' : undefined} onClick={() => { setTab('messages'); setMsgStatus('Failed'); }} />
        <Stat label="Alerts" value={sum?.alerts ?? '-'} tone={sum?.alerts ? 'red' : undefined} onClick={() => setTab('alerts')} />
      </StatGrid>

      <Chips value={tab} onChange={k => setTab(k as Tab)} items={[
        { key: 'carts', label: 'Carts & Orders', count: sum?.carts },
        { key: 'messages', label: 'Message status', count: sum?.sent },
        { key: 'payments', label: 'Payments', count: sum?.payments },
        { key: 'alerts', label: 'Alerts', count: sum?.alerts },
        { key: 'events', label: 'All events' },
      ]} />
      {sum && <p style={{ ...small, margin: '.3rem 0 .6rem' }}>Last event from Interakt: {sum.lastEventAt ? when(sum.lastEventAt) : 'nothing yet'}. Turn the events on in Interakt → Developer Settings → Webhook.</p>}

      <Card>
        {error && <p style={{ color: '#c0392b' }}>{error}</p>}
        {loading ? <Empty>Loading…</Empty> : tab === 'carts' ? (
          carts.length === 0 ? <Empty>No carts yet. When a customer sends a cart from your WhatsApp catalogue it appears here.</Empty> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ textAlign: 'left' }}>
                  <th style={cell}>When</th><th style={cell}>Customer</th><th style={cell}>Items</th><th style={cell}>Total</th><th style={cell}>Status</th><th style={cell}></th>
                </tr></thead>
                <tbody>
                  {carts.map(c => (
                    <tr key={c.id} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ ...cell, whiteSpace: 'nowrap' }}>{when(c.createdAt)}</td>
                      <td style={cell}>
                        <div style={{ fontWeight: 600 }}>{c.name || '-'}</div>
                        {c.phone && <a href={`tel:+91${c.phone}`} style={{ color: '#2563eb' }}>{c.phone}</a>}
                        {c.customerNote && <div style={small}>&ldquo;{c.customerNote}&rdquo;</div>}
                      </td>
                      <td style={{ ...cell, maxWidth: 360 }}>
                        {c.items.map((i, k) => (
                          <div key={k}>
                            {i.link ? <a href={i.link} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>{i.name}</a> : i.name}
                            {i.variant ? <span style={small}> ({i.variant})</span> : null} x{i.qty}
                            {i.price ? <span style={small}> · {money(i.price)}</span> : null}
                            {!i.productId && <span style={{ ...small, color: '#b45309' }}> · not matched ({i.retailerId})</span>}
                          </div>
                        ))}
                      </td>
                      <td style={{ ...cell, whiteSpace: 'nowrap', fontWeight: 700 }}>{money(c.total)}</td>
                      <td style={cell}>
                        <Pill tone={STATUS_TONE[c.status] ?? 'grey'}>{c.status}</Pill>
                        {c.orderedLater && c.status !== 'ordered' && <div style={{ ...small, color: '#1a7f4b' }}>Ordered on website: {c.orderedLater}</div>}
                        {c.orderId && c.status === 'ordered' && <div style={{ ...small, fontFamily: 'monospace' }}>{c.orderId}</div>}
                        {c.note && <div style={small}>{c.note}</div>}
                      </td>
                      <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                        {c.phone && (
                          <a className="adm-btn" style={{ padding: '.2rem .5rem', fontSize: 12, color: '#128C7E' }} target="_blank" rel="noopener noreferrer"
                             href={`https://wa.me/91${c.phone}?text=${encodeURIComponent(replyText(c))}`}
                             onClick={() => { if (c.status === 'new') patchCart(c, { status: 'contacted' }); }}>Reply on WhatsApp</a>
                        )}{' '}
                        <select className="adm-input" value={c.status} style={{ width: 120, padding: '.2rem' }}
                                onChange={e => patchCart(c, { status: e.target.value, ...(e.target.value === 'ordered' && c.orderedLater ? { orderId: c.orderedLater } : {}) })}>
                          {['new', 'contacted', 'ordered', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>{' '}
                        <button className="adm-btn" style={{ padding: '.2rem .5rem', fontSize: 12 }}
                                onClick={() => { const n = prompt('Note for this cart (what the customer said):', c.note ?? ''); if (n !== null) patchCart(c, { note: n }); }}>Note</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'messages' ? (
          <>
            <Chips value={msgStatus} onChange={setMsgStatus} items={[
              { key: '', label: 'All' }, { key: 'Sent', label: 'Sent' }, { key: 'Delivered', label: 'Delivered' },
              { key: 'Read', label: 'Read' }, { key: 'Clicked', label: 'Clicked' }, { key: 'Failed', label: 'Failed' },
            ]} />
            {msgs.length === 0 ? <Empty>No WhatsApp template messages reported yet.</Empty> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left' }}>
                    <th style={cell}>Mobile</th><th style={cell}>Template</th><th style={cell}>From</th><th style={cell}>Status</th><th style={cell}>Sent</th><th style={cell}>Delivered</th><th style={cell}>Read</th><th style={cell}>Clicked</th>
                  </tr></thead>
                  <tbody>
                    {msgs.map(m => (
                      <tr key={m.id} style={{ borderTop: '1px solid #eee' }}>
                        <td style={cell}>{m.phone || '-'}</td>
                        <td style={cell}>{m.template || '-'}</td>
                        <td style={cell}>{m.source === 'campaign' ? 'Campaign' : 'API'}</td>
                        <td style={cell}><Pill tone={MSG_TONE[m.status] ?? 'grey'}>{m.status}</Pill>
                          {m.failureReason && <div style={{ ...small, color: '#c0392b', maxWidth: 220 }}>{m.failureReason}</div>}</td>
                        <td style={cell}>{when(m.sentAt)}</td><td style={cell}>{when(m.deliveredAt)}</td>
                        <td style={cell}>{when(m.readAt)}</td><td style={cell}>{when(m.clickedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          events.length === 0 ? <Empty>Nothing reported yet.</Empty> : (
            <div>
              {events.map(e => (
                <div key={e.id} style={{ borderTop: '1px solid #eee', padding: '.55rem 0' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Pill tone={e.category === 'alert' ? 'red' : e.category === 'payment' ? 'green' : 'grey'}>{e.category}</Pill>
                    <code style={{ fontSize: 12 }}>{e.type}</code>
                    <span style={{ fontSize: 13 }}>{e.summary || ''}</span>
                    {e.phone && <span style={small}>{e.phone}</span>}
                    {e.ref && <span style={{ ...small, fontFamily: 'monospace' }}>{e.ref}</span>}
                    <span style={{ ...small, marginLeft: 'auto' }}>{when(e.createdAt)}</span>
                    <button className="adm-btn" style={{ padding: '.1rem .45rem', fontSize: 11 }} onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'Hide' : 'Details'}</button>
                  </div>
                  {open === e.id && (
                    <pre style={{ background: '#f6f6f7', borderRadius: 8, padding: 10, fontSize: 11, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 360 }}>
                      {(() => { try { return JSON.stringify(JSON.parse(e.raw ?? ''), null, 2); } catch { return e.raw; } })()}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </Card>
    </div>
  );
}
