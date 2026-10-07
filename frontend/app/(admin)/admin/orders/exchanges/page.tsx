'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAdminToken } from '@/lib/auth';
import { exchangesApi, type Exchange } from '@/lib/api';
import { PageHeader, Card, Stat, StatGrid, Pill, Empty, Chips } from '@/components/admin/Ui';
import DateFilter, { ANY_DATES, inDateWindow, describeDateWindow, type DateWindow } from '@/components/admin/DateFilter';

// Exchanges, in the order the shop has to deal with them.
//
// An exchange is not a return and it is not a new order, and until now it was
// handled as both: the policy said "return it and order again", which sends the
// customer's money back to their bank and asks them to pay a second time while
// the first parcel is still in the post. The owner chose to keep the money and
// swap the goods instead, so this screen has to answer four questions at a
// glance - what is coming back, what is going out, who owes whom, and whether
// the size they want is actually on the shelf.
//
// Nothing here moves stock or books a courier. An exchange is agreed by somebody
// who can see the shelf, and the Orders screen already does the shipping.

type Row = {
  exchange: Exchange;
  customer: { name: string | null; phone: string | null; email: string | null; awb: string | null; orderStatus: string } | null;
};

// The order the shop works in: what has just come in, then what it has promised,
// then what is on the road. Finished and refused sit at the end.
const FLOW = ['Requested', 'Approved', 'Picked Up', 'Sent', 'Completed', 'Rejected'];

const TONE: Record<string, 'red' | 'amber' | 'green' | 'grey'> = {
  Requested: 'amber',
  Approved: 'green',
  'Picked Up': 'grey',
  Sent: 'grey',
  Completed: 'green',
  Rejected: 'red',
};

function when(raw: string) {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminExchangesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const [dates, setDates] = useState<DateWindow>(ANY_DATES);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await exchangesApi.all(getAdminToken() ?? '');
      setRows(r.exchanges ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const act = async (id: number, data: Parameters<typeof exchangesApi.update>[1], note: string) => {
    setBusy(id); setMsg('');
    try {
      await exchangesApi.update(id, data, getAdminToken() ?? '');
      setMsg(note);
      await load();
    } catch (e) {
      setMsg((e as Error).message || 'That could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const open = rows.filter(r => ['Requested', 'Approved', 'Picked Up', 'Sent'].includes(r.exchange.status));

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      const x = r.exchange;
      const matchTab =
        tab === 'all' ? true
        : tab === 'open' ? ['Requested', 'Approved', 'Picked Up', 'Sent'].includes(x.status)
        : tab === 'done' ? x.status === 'Completed'
        : x.status === 'Rejected';
      const hay = `${x.orderId} ${x.have.name} ${x.want.name} ${r.customer?.name ?? ''} ${r.customer?.phone ?? ''}`.toLowerCase();
      return matchTab && (!q || hay.includes(q)) && inDateWindow(x.createdAt, dates);
    });
  }, [rows, tab, search, dates]);

  return (
    <div className="admin-page">
      <PageHeader
        title="Exchanges"
        sub="One item back, a different one out, and the money stays on the order."
        right={<button className="adm-btn" onClick={load}>Refresh</button>}
      />

      <StatGrid>
        <Stat label="Waiting for you" value={rows.filter(r => r.exchange.status === 'Requested').length}
              tone={rows.some(r => r.exchange.status === 'Requested') ? 'red' : undefined} />
        <Stat label="Agreed, not yet back" value={rows.filter(r => r.exchange.status === 'Approved').length} />
        <Stat label="On the road" value={rows.filter(r => ['Picked Up', 'Sent'].includes(r.exchange.status)).length} />
        <Stat label="Finished" value={rows.filter(r => r.exchange.status === 'Completed').length} />
      </StatGrid>

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center' }}>
          <Chips
            items={[
              { key: 'open', label: 'Open', count: open.length },
              { key: 'done', label: 'Finished' },
              { key: 'rejected', label: 'Refused' },
              { key: 'all', label: 'All' },
            ]}
            value={tab}
            onChange={setTab}
          />
          <input className="adm-input" style={{ flex: '1 1 220px', maxWidth: 340 }}
                 placeholder="Order, product, name or number"
                 value={search} onChange={e => setSearch(e.target.value)} />
          <DateFilter value={dates} onChange={setDates} label="Asked" />
        </div>
      </Card>

      {msg && (
        <Card style={{ borderColor: '#d9ecd9', background: '#f6faf6' }}>
          <p style={{ margin: 0, fontSize: '.86rem', fontWeight: 650, color: '#2e7d32' }}>{msg}</p>
        </Card>
      )}

      <Card title={`${shown.length} shown${describeDateWindow(dates) ? ' · ' + describeDateWindow(dates) : ''}`}>
        {loading ? (
          <Empty>Loading exchanges…</Empty>
        ) : shown.length === 0 ? (
          <Empty>{rows.length === 0 ? 'Nobody has asked for an exchange yet.' : 'Nothing matches that.'}</Empty>
        ) : (
          <div style={{ display: 'grid', gap: '.9rem' }}>
            {shown.map(({ exchange: x, customer }) => {
              const owes = x.priceDifference;
              return (
                <div key={x.id} style={{ border: '1px solid #efe6e2', borderRadius: 12, padding: '1rem' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.7rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#2d2724' }}>
                        {customer?.name || 'Customer'}{' '}
                        <Pill tone={TONE[x.status] ?? 'grey'}>{x.status}</Pill>
                      </div>
                      <div style={{ fontSize: '.78rem', color: '#8a7f76' }}>
                        {x.orderId} · asked {when(x.createdAt)}
                        {customer?.phone && <> · {customer.phone}</>}
                      </div>
                    </div>
                    <Link href={`/admin/orders?q=${encodeURIComponent(x.orderId)}`}
                          style={{ fontSize: '.82rem', color: '#722f37', fontWeight: 650 }}>
                      Open the order →
                    </Link>
                  </div>

                  {/* what is coming back, and what is going out */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '.7rem', marginBottom: '.7rem' }}>
                    <div style={{ background: '#fdf7f7', border: '1px solid #f3e4e4', borderRadius: 9, padding: '.65rem .8rem' }}>
                      <div style={{ fontSize: '.7rem', letterSpacing: '.08em', textTransform: 'uppercase', color: '#a1554f', fontWeight: 700 }}>Coming back</div>
                      <div style={{ fontSize: '.88rem', color: '#2d2724', fontWeight: 650 }}>{x.have.name}</div>
                      <div style={{ fontSize: '.8rem', color: '#6b615c' }}>
                        {x.have.size || '—'}{x.have.colour ? ` / ${x.have.colour}` : ''} · ₹{x.have.price}
                      </div>
                    </div>
                    <div style={{ background: '#f6faf6', border: '1px solid #d9ecd9', borderRadius: 9, padding: '.65rem .8rem' }}>
                      <div style={{ fontSize: '.7rem', letterSpacing: '.08em', textTransform: 'uppercase', color: '#2e7d32', fontWeight: 700 }}>Going out</div>
                      <div style={{ fontSize: '.88rem', color: '#2d2724', fontWeight: 650 }}>{x.want.name}</div>
                      <div style={{ fontSize: '.8rem', color: '#6b615c' }}>
                        {x.want.size || '—'}{x.want.colour ? ` / ${x.want.colour}` : ''} · ₹{x.want.price}
                      </div>
                    </div>
                  </div>

                  <p style={{ margin: '0 0 .5rem', fontSize: '.85rem', color: '#2d2724' }}>
                    <strong>
                      {owes === 0 ? 'No money either way.' : owes > 0 ? `Customer owes ₹${owes}.` : `You owe ₹${-owes}.`}
                    </strong>{' '}
                    <span style={{ color: '#6b615c' }}>
                      Courier paid by <strong>{x.shippingPaidBy === 'shop' ? 'you' : 'the customer'}</strong> ·{' '}
                      <button onClick={() => act(x.id, { shippingPaidBy: x.shippingPaidBy === 'shop' ? 'customer' : 'shop' }, 'Who pays the courier has been changed.')}
                              disabled={busy === x.id}
                              style={{ background: 'none', border: 'none', padding: 0, color: '#722f37', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', textDecoration: 'underline' }}>
                        switch
                      </button>
                    </span>
                  </p>

                  <p style={{ margin: '0 0 .6rem', fontSize: '.84rem', color: '#6b615c', lineHeight: 1.6 }}>
                    <strong style={{ color: '#2d2724' }}>Reason:</strong> {x.reason}
                    {x.description && <> — {x.description}</>}
                  </p>

                  {x.photos && (
                    <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.7rem' }}>
                      {(() => { try { return JSON.parse(x.photos) as string[]; } catch { return []; } })().map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                          <img src={u} alt="" width={60} height={60}
                               style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 7, border: '1px solid #eee' }} />
                        </a>
                      ))}
                    </div>
                  )}

                  {/* what the shop does next */}
                  <div className="adm-actions" style={{ flexWrap: 'wrap', margin: 0, gap: '.4rem' }}>
                    {x.status === 'Requested' && (
                      <>
                        <button disabled={busy === x.id} onClick={() => act(x.id, { status: 'Approved' }, 'Agreed. Arrange the pickup when you are ready.')}
                                style={{ color: '#2e7d32', fontWeight: 700 }}>
                          Agree to it
                        </button>
                        <button disabled={busy === x.id} onClick={() => {
                          const note = prompt('Why are you refusing? The customer will not see this, but you will.');
                          if (note === null) return;
                          act(x.id, { status: 'Rejected', adminNote: note }, 'Refused.');
                        }} style={{ color: '#c0392b' }}>
                          Refuse
                        </button>
                      </>
                    )}
                    {x.status === 'Approved' && (
                      <button disabled={busy === x.id} onClick={() => act(x.id, { status: 'Picked Up' }, 'Marked as collected from the customer.')}>
                        Old one collected
                      </button>
                    )}
                    {x.status === 'Picked Up' && (
                      <button disabled={busy === x.id} onClick={() => {
                        const awb = prompt('Courier number for the replacement (leave blank if you do not have it yet):') ?? '';
                        act(x.id, { status: 'Sent', newAwb: awb.trim() }, 'Replacement marked as sent.');
                      }}>
                        Replacement sent
                      </button>
                    )}
                    {x.status === 'Sent' && (
                      <button disabled={busy === x.id} onClick={() => act(x.id, { status: 'Completed' }, 'Finished.')}
                              style={{ color: '#2e7d32', fontWeight: 700 }}>
                        Delivered — finish
                      </button>
                    )}
                    {x.newAwb && <span style={{ fontSize: '.8rem', color: '#8a7f76', alignSelf: 'center' }}>New AWB {x.newAwb}</span>}
                  </div>

                  {x.adminNote && (
                    <p style={{ margin: '.6rem 0 0', fontSize: '.8rem', color: '#8a7f76' }}>
                      <strong>Your note:</strong> {x.adminNote}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
