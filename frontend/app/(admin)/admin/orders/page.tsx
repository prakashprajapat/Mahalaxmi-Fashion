'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { ordersApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { exportOrders } from '@/lib/exportExcel';
import { productImageSrc } from '@/lib/productImages';
import type { Order } from '@/types';
import { openOrderLabels, openPicklist } from '@/lib/orderLabel';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';

const ORDER_STATUS_TABS: { key: string; label: string; hidden?: boolean }[] = [
  { key: 'all',                  label: 'All Orders' },
  { key: 'Pending',              label: 'Pending' },
  { key: 'On Hold',              label: 'On Hold' },
  { key: 'Ready for Shipping',   label: 'Ready to Ship' },
  // Delhivery AWB bante hi sync order ko Transit me le jata hai, par MANUAL courier
  // (India Post/DTDC) wale "Shipped" par ruk jate the aur kisi tab me nahi dikhte the —
  // isliye Shipped tab wapas rakha hai taki wo orphan na hon.
  { key: 'Shipped',              label: 'Shipped' },
  { key: 'Transit',              label: 'Transit' },
  { key: 'Delivered',            label: 'Delivered' },
  { key: 'Cancel Requested',     label: 'Cancel Req.' },
  { key: 'Cancelled',            label: 'Cancelled' },
];

const RETURN_STATUS_TABS: { key: string; label: string; hidden?: boolean }[] = [
  { key: 'all',              label: 'All Returns' },
  { key: 'Return Requested', label: 'Return Requested' },
  { key: 'Return Transit',   label: 'Return Transit' },
  { key: 'Return',           label: 'Returned' },
];

const RETURN_STATUSES = ['Return Requested', 'Return Transit', 'Return'];
// Forward-shipping statuses that must NOT be applied to a return in progress —
// doing so would silently pull the order out of the Returns queue.
const FORWARD_SHIP_STATUSES = ['Ready for Shipping', 'Shipped', 'Delivered'];

// WhatsApp order-update styling for the per-order menu.
const waItemStyle: CSSProperties = { color: '#075E54', fontWeight: 600, fontSize: '.8rem', textDecoration: 'none', padding: '.18rem .1rem' };

// Build a WhatsApp deep-link (wa.me) so the admin can message the CUSTOMER a
// pre-filled order update in one click. Number = last 10 digits + India code 91.
function waCustomerLink(
  phone: string | undefined,
  name: string | undefined,
  orderId: string,
  total: number,
  awb: string | undefined,
  kind: 'confirm' | 'shipped' | 'delivered' | 'chat',
): string {
  const num = '91' + (phone || '').replace(/\D/g, '').slice(-10);
  const amt = 'Rs.' + (total ?? 0).toLocaleString('en-IN');
  const who = (name || '').trim() || 'Customer';
  const messages: Record<string, string> = {
    confirm:   `Hello ${who},

Your order has been confirmed.
Order ID: ${orderId}
Amount: ${amt}

We will dispatch it soon. Thank you for shopping with Mahalaxmi Fashion Hub.`,
    shipped:   `Hello ${who},

Good news! Your order has been shipped.
Order ID: ${orderId}${awb ? `
Tracking (AWB): ${awb}` : ''}

It will reach you soon.
- Mahalaxmi Fashion Hub`,
    delivered: `Hello ${who},

Your order has been delivered.
Order ID: ${orderId}

We hope you love it! Please share your feedback and review.
- Mahalaxmi Fashion Hub`,
    chat:      `Hello ${who},

Regarding your order (ID: ${orderId}) from Mahalaxmi Fashion Hub:`,
  };
  return `https://wa.me/${num}?text=${encodeURIComponent(messages[kind])}`;
}

function exportCSV(orders: Order[]) {
  const header = ['Order ID','Date','Customer','Phone','Email','City','State','Subtotal','Shipping','COD Fee','Total','Method','Status','AWB'];
  const rows = orders.map(o => [
    o.id,
    new Date(o.placedAt ?? o.createdAt).toLocaleDateString('en-IN'),
    o.customerName ?? '',
    o.customerPhone ?? '',
    o.customerEmail ?? '',
    o.shippingCity ?? '',
    o.shippingState ?? '',
    o.subtotal,
    o.shippingCost,
    o.codFee,
    o.total,
    o.method,
    o.status,
    o.awb ?? '',
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}


export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<'orders' | 'returns'>('orders');
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [filterSize, setFilterSize] = useState('');
  const [filterColour, setFilterColour] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [awbModal, setAwbModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');           // holds the chosen courier
  const [awbMap, setAwbMap] = useState<Record<string, string>>({}); // per-order AWB
  const [genAwbId, setGenAwbId] = useState<string | null>(null);    // order currently auto-generating an AWB
  const [updating, setUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Return-details modal (view media + approve/reject)
  const [returnModalId, setReturnModalId] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  // Return pickup (reverse AWB) inputs
  const [retAwb, setRetAwb] = useState('');
  const [retCourier, setRetCourier] = useState('Delhivery');

  const closeReturnModal = () => { setReturnModalId(null); setShowReject(false); setRejectReason(''); setRetAwb(''); };

  // Auto-generate a forward Delhivery AWB for a single order (fills the AWB box on success).
  const generateAwbFor = async (orderId: string) => {
    setGenAwbId(orderId);
    try {
      const r = await ordersApi.generateAwb(orderId, getAdminToken() ?? '');
      if (r.awb) {
        setAwbMap(m => ({ ...m, [orderId]: r.awb! }));
        setNewStatus('Delhivery');
        if (r.order) setOrders(prev => prev.map(o => (o.id === orderId ? r.order! : o)));
      } else {
        alert(r.message || 'Could not generate AWB. Enter it manually.');
      }
    } catch (e) {
      alert((e as Error).message || 'AWB generation failed. Enter it manually.');
    } finally {
      setGenAwbId(null);
    }
  };

  const assignReturnAwb = async (order: Order, mode: 'manual' | 'auto') => {
    if (mode === 'manual' && !retAwb.trim()) { alert('Enter the return AWB / tracking number.'); return; }
    if (mode === 'manual' && !confirm(`Assign return AWB ${retAwb.trim()} (${retCourier}) and move to Return Transit?`)) return;
    setDecisionBusy(true);
    try {
      const token = getAdminToken() ?? '';
      const r = await ordersApi.assignReturnAwb(order.id,
        mode === 'auto' ? { mode } : { mode, awb: retAwb.trim(), courier: retCourier }, token);
      setOrders(prev => prev.map(o => (o.id === order.id ? r.order : o)));
      setRetAwb('');
      if (mode === 'auto') alert(`Delhivery reverse pickup created. AWB: ${r.awb}`);
    } catch (e) {
      alert((e as Error).message || 'Failed to assign return AWB.');
    } finally {
      setDecisionBusy(false);
    }
  };

  const submitDecision = async (order: Order, decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !rejectReason.trim()) { alert('Please enter a reason for rejecting this return.'); return; }
    const msg = decision === 'approve'
      ? 'Approve this return? All uploaded photos & videos will be permanently deleted now.'
      : 'Reject this return? The customer will see your reason. Media is kept 30 days as evidence, then auto-deleted.';
    if (!confirm(msg)) return;
    setDecisionBusy(true);
    try {
      const token = getAdminToken() ?? '';
      const r = await ordersApi.returnDecision(order.id, decision, rejectReason.trim(), token);
      setOrders(prev => prev.map(o => (o.id === order.id ? r.order : o)));
      closeReturnModal();
    } catch (e) {
      alert((e as Error).message || 'Failed to submit decision.');
    } finally {
      setDecisionBusy(false);
    }
  };

  // Approved return whose item has now been received → close it out as "Returned".
  const markReturned = async (order: Order) => {
    if (!confirm('Mark this return as Returned (item received back)?')) return;
    setDecisionBusy(true);
    try {
      const token = getAdminToken() ?? '';
      const r = await ordersApi.updateStatus({ orderId: order.id, status: 'Return' }, token);
      setOrders(prev => prev.map(o => (o.id === order.id ? r.order : o)));
      closeReturnModal();
    } catch (e) {
      alert((e as Error).message || 'Failed to update.');
    } finally {
      setDecisionBusy(false);
    }
  };

  const fetchOrders = () => {
    setLoading(true);
    const token = getAdminToken() ?? '';
    ordersApi.getAll(undefined, token)
      .then(r => setOrders(r.orders))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  // ── Live Delhivery tracking modal (AWB number pe click karte hi) ──
  const [liveModal, setLiveModal] = useState<null | {
    awb: string; loading: boolean;
    data?: Awaited<ReturnType<typeof ordersApi.liveTrack>>;
  }>(null);
  const openLiveTrack = async (awbNo: string) => {
    setLiveModal({ awb: awbNo, loading: true });
    try {
      const data = await ordersApi.liveTrack(awbNo);
      setLiveModal({ awb: awbNo, loading: false, data });
      fetchOrders(); // live check order status bhi sync kar deta hai — list refresh
    } catch {
      setLiveModal({ awb: awbNo, loading: false });
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  const currentStatusTabs = mainTab === 'returns' ? RETURN_STATUS_TABS : ORDER_STATUS_TABS;

  const mainFiltered = orders.filter(o =>
    mainTab === 'returns' ? RETURN_STATUSES.includes(o.status) : !RETURN_STATUSES.includes(o.status)
  );

  const tabFiltered = mainFiltered.filter(o =>
    activeTab === 'all' || o.status === activeTab
  );

  const filtered = tabFiltered.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      o.id.toLowerCase().includes(q) ||
      (o.customerName ?? '').toLowerCase().includes(q) ||
      (o.customerPhone ?? '').includes(search) ||
      (o.shippingPincode ?? '').includes(search) ||
      (o.awb ?? '').toLowerCase().includes(q) ||
      (o.cart ?? []).some(c => (c.sku ?? '').toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q));
    // Compare against the order's LOCAL date (same as what the table shows), not the raw
    // UTC string — otherwise an order placed near midnight lands in the wrong day.
    const matchDate = !dateFilter || (() => {
      const d = new Date(o.placedAt ?? o.createdAt);
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return local === dateFilter;
    })();
    const matchSize = !filterSize ||
      (o.cart ?? []).some(c => (c.size ?? '').toLowerCase().includes(filterSize.toLowerCase()));
    const matchColour = !filterColour ||
      (o.cart ?? []).some(c =>
        (c.color ?? '').toLowerCase().includes(filterColour.toLowerCase()) ||
        (c.colorCode ?? '').toLowerCase().includes(filterColour.toLowerCase()) ||
        (c.colorColumn ?? '').toLowerCase().includes(filterColour.toLowerCase()));
    return matchSearch && matchDate && matchSize && matchColour;
  });

  const countFor = (key: string) =>
    key === 'all' ? mainFiltered.length : mainFiltered.filter(o => o.status === key).length;

  // Manual AWB / delivery-partner assignment for one or many orders.
  // `newStatus` holds the courier (same for all); `awbMap` holds each order's AWB.
  const handleUpdate = async () => {
    const sel = filtered.filter(o => selectedIds.has(o.id));
    let targets = sel.filter(o => (awbMap[o.id] ?? '').trim());
    if (targets.length === 0) { alert('Enter at least one AWB / tracking number.'); return; }
    // Safeguard: assigning a forward AWB marks the order "Shipped" — don't do that to a return.
    const returnTargets = targets.filter(o => RETURN_STATUSES.includes(o.status));
    if (returnTargets.length) {
      const proceed = confirm(
        `${returnTargets.length} of these are return orders (${returnTargets.map(o => o.id).join(', ')}).\n\n` +
        `Assigning a forward AWB marks them "Shipped" and removes them from the Returns queue.\n\n` +
        `OK = skip those and continue.  Cancel = stop.`
      );
      if (!proceed) return;
      targets = targets.filter(o => !RETURN_STATUSES.includes(o.status));
      if (!targets.length) { setAwbModal(false); return; }
    }
    setUpdating(true);
    try {
      for (const o of targets) {
        // eslint-disable-next-line no-await-in-loop
        await ordersApi.updateStatus({ orderId: o.id, status: 'Shipped', awb: (awbMap[o.id] || '').trim(), courier: newStatus || 'Manual' }, getAdminToken() ?? '');
      }
      setAwbModal(false); setAwbMap({});
      fetchOrders();
    } catch (e) { alert((e as Error).message); }
    finally { setUpdating(false); }
  };

  const openManualAwb = () => {
    const sel = filtered.filter(o => selectedIds.has(o.id));
    if (sel.length === 0) { alert('Select at least one order.'); return; }
    const init: Record<string, string> = {};
    sel.forEach(o => { init[o.id] = o.awb ?? ''; });
    setAwbMap(init);
    setNewStatus(sel[0].courier || 'Delhivery');
    setAwbModal(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Clear any selection when the visible tab changes — otherwise a bulk action could hit
  // orders selected on a different tab that are no longer on screen.
  useEffect(() => { setSelectedIds(new Set()); }, [mainTab, activeTab]);

  // Open straight onto a status when the dashboard links here
  // (/admin/orders?status=Pending, ?tab=returns). Read from location rather
  // than useSearchParams: that hook forces a Suspense boundary at build time,
  // and this is a client-only admin screen that gains nothing from it.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('tab');
    if (t === 'returns' || t === 'orders') setMainTab(t);
    const st = q.get('status');
    if (st) setActiveTab(st);
  }, []);

  const bulkUpdateStatus = async (status: string) => {
    if (!selectedIds.size) return;
    let ids = [...selectedIds];
    // Safeguard: forward-shipping statuses shouldn't overwrite a return in progress.
    if (FORWARD_SHIP_STATUSES.includes(status)) {
      const returnIds = ids.filter(id => {
        const o = orders.find(x => x.id === id);
        return !!o && RETURN_STATUSES.includes(o.status);
      });
      if (returnIds.length) {
        const proceed = confirm(
          `${returnIds.length} selected order(s) are in a return flow (${returnIds.join(', ')}).\n\n` +
          `Marking them "${status}" would remove them from the Returns queue.\n\n` +
          `OK = skip those and continue with the rest.  Cancel = stop.`
        );
        if (!proceed) return;
        ids = ids.filter(id => !returnIds.includes(id));
        if (!ids.length) { setSelectedIds(new Set()); return; }
      }
    }
    if (!confirm(`Update ${ids.length} order(s) to "${status}"?`)) return;
    const token = getAdminToken() ?? '';
    for (const id of ids) {
      await ordersApi.updateStatus({ orderId: id, status }, token).catch(() => {});
    }
    setSelectedIds(new Set());
    fetchOrders();
  };

  // Admin-only: permanently delete the selected orders (for clearing test orders).
  // Double-confirm because it cannot be undone.
  const bulkDelete = async () => {
    if (!selectedIds.size) return;
    const ids = [...selectedIds];
    if (!confirm(`Permanently DELETE ${ids.length} order(s)?\n\n${ids.join('\n')}\n\n⚠️ This cannot be undone. Use only to remove test orders.`)) return;
    if (!confirm(`Last check — really delete ${ids.length} order(s) forever?`)) return;
    const token = getAdminToken() ?? '';
    let ok = 0, fail = 0;
    for (const id of ids) {
      try { await ordersApi.deleteOrder(id, token); ok++; } catch { fail++; }
    }
    setSelectedIds(new Set());
    fetchOrders();
    alert(`Deleted ${ok} order(s)${fail ? `, ${fail} failed (admin login required)` : ''}.`);
  };

  const downloadShippingLabel = (order: Order) => openOrderLabels([order]);

  const anyFilter = Boolean(dateFilter || filterSize || filterColour || search);
  const clearFilters = () => { setDateFilter(''); setFilterSize(''); setFilterColour(''); setSearch(''); };
  const allShownSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <div className="admin-page">
      <PageHeader
        title={mainTab === 'returns' ? 'Returns' : 'Orders'}
        sub="Everything bought, and everything coming back. A change here is live on the website at once."
        right={
          <>
            <button className="adm-btn" onClick={fetchOrders}>Refresh</button>
            <button className="adm-btn" onClick={() => exportCSV(filtered)}>CSV ({filtered.length})</button>
            <button className="adm-btn adm-btn-primary" onClick={() => exportOrders(filtered, new Date().toISOString().slice(0,10))}>
              Excel ({filtered.length})
            </button>
          </>
        }
      />

      <StatGrid>
        <Stat label="Waiting to be packed" value={countFor('Pending')}
              tone={countFor('Pending') > 0 ? 'red' : undefined}
              action="Open these"
              onClick={() => { setMainTab('orders'); setActiveTab('Pending'); }} />
        <Stat label="Ready to ship" value={countFor('Ready for Shipping')}
              action="Print the picklist"
              onClick={() => { setMainTab('orders'); setActiveTab('Ready for Shipping'); }} />
        <Stat label="On the way" value={countFor('Transit') + countFor('Shipped')}
              action="Track these"
              onClick={() => { setMainTab('orders'); setActiveTab('Transit'); }} />
        <Stat label="Returns to decide" value={orders.filter(o => o.status === 'Return Requested').length}
              tone={orders.filter(o => o.status === 'Return Requested').length > 0 ? 'red' : undefined}
              action="Review these"
              onClick={() => { setMainTab('returns'); setActiveTab('Return Requested'); }} />
      </StatGrid>

      <Card>
        {/* Orders and Returns are two different jobs, so they stay two tabs —
            but they are the same kind of control as everything else now. */}
        <div className="adm-toolbar">
          {(['orders', 'returns'] as const).map(mt => {
            const cnt = mt === 'returns'
              ? orders.filter(o => RETURN_STATUSES.includes(o.status)).length
              : orders.filter(o => !RETURN_STATUSES.includes(o.status)).length;
            return (
              <button key={mt} type="button" className={`adm-chip${mainTab === mt ? ' on' : ''}`}
                      style={{ fontSize: '.84rem', padding: '7px 16px' }}
                      onClick={() => { setMainTab(mt); setActiveTab('all'); }}>
                {mt === 'orders' ? 'Orders' : 'Returns'} {cnt}
              </button>
            );
          })}
        </div>

        <Chips value={activeTab} onChange={setActiveTab}
               items={currentStatusTabs.filter(t => !t.hidden).map(t => ({ key: t.key, label: t.label, count: countFor(t.key) }))} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center',
                      borderTop: '1px solid #f4efec', paddingTop: '.7rem' }}>
          <input className="adm-input" style={{ flex: '1 1 200px' }}
                 placeholder="Search ID, name, phone, AWB or SKU"
                 value={search} onChange={e => setSearch(e.target.value)} />
          <input className="adm-input" style={{ width: '110px' }} placeholder="Size"
                 value={filterSize} onChange={e => setFilterSize(e.target.value)} />
          <input className="adm-input" style={{ width: '130px' }} placeholder="Colour"
                 value={filterColour} onChange={e => setFilterColour(e.target.value)} />
          <input className="adm-input" type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
          {anyFilter && <button className="adm-btn" onClick={clearFilters}>Clear</button>}
          {activeTab === 'Ready for Shipping' && filtered.length > 0 && (
            <button className="adm-btn" onClick={() => openPicklist(filtered)}>Picklist ({filtered.length})</button>
          )}
        </div>
      </Card>

      {/* What you can do to the ones you ticked. It only appears when something
          is ticked, because until then there is nothing it could do. */}
      {selectedIds.size > 0 && (
        <div className="adm-card" style={{ background: '#fff9ec', borderColor: '#f0e0bd', display: 'flex',
                                           flexWrap: 'wrap', gap: '.5rem', alignItems: 'center' }}>
          <strong style={{ fontSize: '.84rem', marginRight: '.2rem' }}>{selectedIds.size} selected</strong>
          {mainTab === 'returns' ? (
            <>
              <button className="adm-btn" onClick={() => bulkUpdateStatus('Return Transit')}>Mark Return Transit</button>
              <button className="adm-btn" onClick={() => bulkUpdateStatus('Return')}>Mark Returned</button>
              <button className="adm-btn" onClick={() => bulkUpdateStatus('Cancelled')}>Cancel Return</button>
            </>
          ) : (
            <>
              <button className="adm-btn" onClick={() => bulkUpdateStatus('Ready for Shipping')}>Ready to Ship</button>
              <button className="adm-btn" onClick={openManualAwb}>AWB / Courier</button>
              <button className="adm-btn" onClick={() => bulkUpdateStatus('Shipped')}>Mark Shipped</button>
              <button className="adm-btn" onClick={() => bulkUpdateStatus('Delivered')}>Mark Delivered</button>
              <button className="adm-btn" onClick={() => bulkUpdateStatus('Cancelled')}>Cancel</button>
            </>
          )}
          <button className="adm-btn" onClick={() => openOrderLabels(filtered.filter(o => selectedIds.has(o.id)))}>
            Labels PDF ({selectedIds.size})
          </button>
          <button className="adm-btn" onClick={bulkDelete} style={{ color: '#a3122b', borderColor: '#eccdd3' }}
                  title="Deletes these orders for good">
            Delete ({selectedIds.size})
          </button>
          <button className="adm-btn" onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}

      <Card
        title={`${filtered.length} ${filtered.length === 1 ? (mainTab === 'returns' ? 'return' : 'order') : (mainTab === 'returns' ? 'returns' : 'orders')}`}
        right={filtered.length > 0 && (
          <label style={{ fontSize: '.76rem', color: '#7d736d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={allShownSelected}
                   onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(o => o.id)) : new Set())} />
            Select all shown
          </label>
        )}
      >
        {loading ? (
          <Empty>Loading orders…</Empty>
        ) : filtered.length === 0 ? (
          <Empty>
            {mainTab === 'returns'
              ? 'No returns here. Nothing is waiting on you.'
              : anyFilter
                ? 'No order matches this search. Clear the filters to see them all.'
                : 'No orders in this queue.'}
          </Empty>
        ) : filtered.map(o => {
          const picked = selectedIds.has(o.id);
          const placed = new Date(o.placedAt ?? o.createdAt);
          const tone = o.status === 'Delivered' ? 'green'
            : o.status === 'Cancelled' ? 'grey'
            : o.status === 'Pending' || o.status === 'Return Requested' || o.status === 'Cancel Requested' ? 'red'
            : 'amber';
          return (
            <div key={o.id} style={{ borderBottom: '1px solid #f4efec', padding: '.8rem 0',
                                     background: picked ? '#fdf7f8' : undefined }}>
              <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start' }}>
                <input type="checkbox" checked={picked} onChange={() => toggleSelect(o.id)}
                       style={{ marginTop: '.2rem', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '.8rem', fontWeight: 700, color: '#2d2724' }}>{o.id}</span>
                    <Pill tone={tone}>{o.status}</Pill>
                    <span className="adm-money" style={{ marginLeft: 'auto' }}>₹{o.total.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="adm-item-s">
                    {placed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    {' · '}{o.customerName || 'no name'}
                    {o.shippingPincode ? ` · ${o.shippingPincode}` : ''}
                    {' · '}<span style={{ textTransform: 'capitalize' }}>{o.method}</span>
                    {o.awb && <> · <button onClick={() => openLiveTrack(o.awb!)} title="Live Delhivery tracking"
                      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'monospace',
                               fontSize: '.74rem', color: '#1565c0', textDecoration: 'underline' }}>{o.awb}</button></>}
                  </div>

                  {/* Size and colour used to be their own columns as well as being
                      written on every item. Once is enough, and it is the line
                      the packer actually reads. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginTop: '.5rem' }}>
                    {(o.cart ?? []).map((c, ci) => {
                      const thumb = productImageSrc(c.colorPhoto || c.image);
                      const sizeOnly = c.color ? (c.size || '').split(' / ').filter(p => p && p !== c.color).join(' / ') : (c.size || '');
                      return (
                        <div key={ci} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                          {thumb
                            ? <img src={thumb} alt="" style={{ width: 38, height: 38, borderRadius: 7, objectFit: 'cover', flexShrink: 0, border: '1px solid #f0eae7' }} />
                            : <div className="adm-item-thumb" style={{ width: 38, height: 38, fontSize: '.9rem' }}>—</div>}
                          <div style={{ fontSize: '.74rem', lineHeight: 1.45, minWidth: 0 }}>
                            <div style={{ fontWeight: 650, color: '#2d2724', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{c.name}</div>
                            <div style={{ color: '#9a908a', display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontFamily: 'monospace' }}>{c.sku || 'no SKU'}</span>
                              {c.colorColumn ? <span>· Col {c.colorColumn}</span> : null}
                              {c.color && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem' }}>
                                  · {c.colorCode && <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.colorCode, border: '1px solid #ddd', display: 'inline-block' }} />}
                                  {c.color}
                                </span>
                              )}
                              {sizeOnly && <span>· Size {sizeOnly}</span>}
                              <span>· ×{c.quantity}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="adm-actions" style={{ marginTop: '.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => downloadShippingLabel(o)}>Label</button>
                    <button onClick={() => ordersApi.downloadInvoice(o.id, getAdminToken() ?? '').catch(() => {})}>Invoice</button>
                    {o.customerPhone && (
                      <details>
                        <summary style={{ cursor: 'pointer', color: '#128C7E', fontWeight: 700, fontSize: '.76rem', listStyle: 'none', userSelect: 'none' }}>
                          WhatsApp ▾
                        </summary>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '.1rem', marginTop: '.3rem',
                                      background: '#f0fbf4', border: '1px solid #cdeede', borderRadius: 8, padding: '.4rem .55rem' }}>
                          <a href={waCustomerLink(o.customerPhone, o.customerName, o.id, o.total, o.awb, 'confirm')} target="_blank" rel="noopener noreferrer" style={waItemStyle}>Confirm</a>
                          <a href={waCustomerLink(o.customerPhone, o.customerName, o.id, o.total, o.awb, 'shipped')} target="_blank" rel="noopener noreferrer" style={waItemStyle}>Shipped</a>
                          <a href={waCustomerLink(o.customerPhone, o.customerName, o.id, o.total, o.awb, 'delivered')} target="_blank" rel="noopener noreferrer" style={waItemStyle}>Delivered</a>
                          <a href={waCustomerLink(o.customerPhone, o.customerName, o.id, o.total, o.awb, 'chat')} target="_blank" rel="noopener noreferrer" style={waItemStyle}>Open chat</a>
                        </div>
                      </details>
                    )}
                    {RETURN_STATUSES.includes(o.status) && (
                      <button onClick={() => { setShowReject(false); setRejectReason(''); setReturnModalId(o.id); }}
                              style={{ color: o.returnDecision === 'rejected' ? '#c0392b' : o.returnDecision === 'approved' ? '#2e7d32' : '#722f37' }}>
                        Return{o.returnDecision === 'approved' ? ' ✓' : o.returnDecision === 'rejected' ? ' ✕' : ''}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      {/* Live Delhivery tracking modal — AWB pe click karne par */}
      {liveModal && (
        <div onClick={() => setLiveModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, padding: '1.3rem 1.5rem', width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.8rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>📍 Live Tracking — {liveModal.awb}</h3>
              <button onClick={() => setLiveModal(null)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            {liveModal.loading && <p style={{ color: '#888' }}>Fetching live status from Delhivery…</p>}

            {!liveModal.loading && !liveModal.data?.live && (
              <p style={{ color: '#c62828' }}>Live tracking unavailable right now. Please check the Delhivery portal.</p>
            )}

            {!liveModal.loading && liveModal.data?.live && (() => {
              const d = liveModal.data!;
              const s = (d.courierStatus ?? '').toLowerCase();
              const stage = s.includes('delivered') && !s.includes('undelivered') ? 4
                : (s.includes('out for delivery') || s.includes('dispatched')) ? 3
                : (s.includes('transit') || s.includes('reached')) ? 2
                : (s.includes('picked') || s.includes('manifest')) ? 1 : 0;
              const steps = ['Order Placed', 'Picked Up', 'On the Way', 'Out for Delivery', 'Delivered'];
              const scans = (d.scans ?? []).slice().reverse();
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.9rem' }}>
                    <span style={{ fontSize: '.85rem', color: '#555' }}>Order: <strong>{d.orderId}</strong> · Site status: <strong>{d.siteStatus}</strong></span>
                    {d.expectedDate && <span style={{ color: '#2e7d32', fontWeight: 700, fontSize: '.85rem' }}>Expected: {new Date(d.expectedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                  </div>

                  {steps.map((label, i) => {
                    const done = i <= stage;
                    const isLast = i === steps.length - 1;
                    return (
                      <div key={label} style={{ display: 'flex', gap: '.7rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ width: 13, height: 13, borderRadius: '50%', marginTop: 3, flexShrink: 0,
                            background: done ? '#2e7d32' : '#fff', border: done ? '2px solid #2e7d32' : '2px solid #ccc' }} />
                          {!isLast && <span style={{ width: 2, flex: 1, minHeight: 18, background: i < stage ? '#2e7d32' : '#ddd' }} />}
                        </div>
                        <div style={{ paddingBottom: isLast ? 0 : '.35rem' }}>
                          <p style={{ margin: 0, fontWeight: done ? 700 : 500, color: done ? '#1a1a1a' : '#999', fontSize: '.9rem' }}>{label}</p>
                          {i === stage && d.courierStatus && <p style={{ margin: '.1rem 0 0', color: '#2e7d32', fontSize: '.78rem', fontWeight: 600 }}>{d.courierStatus}</p>}
                        </div>
                      </div>
                    );
                  })}

                  {scans.length > 0 && (
                    <div style={{ marginTop: '.9rem', borderTop: '1px solid #f0f0f0', paddingTop: '.7rem' }}>
                      <p style={{ margin: '0 0 .5rem', fontWeight: 700, fontSize: '.85rem' }}>All updates ({scans.length})</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                        {scans.map((sc, i) => (
                          <div key={i} style={{ fontSize: '.8rem', borderLeft: '3px solid #eee', paddingLeft: '.6rem' }}>
                            <p style={{ margin: 0, color: '#333' }}>{sc.remark}</p>
                            <p style={{ margin: 0, color: '#999' }}>{(() => { const dt = new Date(sc.time); return isNaN(dt.getTime()) ? sc.time : dt.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); })()}{sc.location ? ` · ${sc.location}` : ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Assign AWB / Delivery Partner Modal (one or many orders) */}
      {awbModal && (() => {
        const awbOrders = filtered.filter(o => selectedIds.has(o.id));
        return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '460px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontWeight: 700, marginBottom: '.25rem' }}>Assign AWB / Delivery Partner</h3>
            <p style={{ fontSize: '.82rem', color: '#888', marginBottom: '1rem' }}>{awbOrders.length} order{awbOrders.length !== 1 ? 's' : ''} — enter each AWB, courier applies to all.</p>

            <div style={{ marginBottom: '.85rem' }}>
              <label style={{ fontSize: '.85rem', color: '#555', display: 'block', marginBottom: '.3rem' }}>Delivery Partner (all)</label>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem' }}>
                {['Delhivery', 'India Post', 'DTDC', 'Other / Manual'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.6rem', flex: 1 }}>
              {awbOrders.map(o => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                  <div style={{ flex: '0 0 155px', fontSize: '.75rem' }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{o.id}</div>
                    <div style={{ color: '#888' }}>{o.shippingName || o.customerName} · {o.shippingPincode || ''}</div>
                  </div>
                  <input value={awbMap[o.id] ?? ''} onChange={e => setAwbMap(m => ({ ...m, [o.id]: e.target.value }))}
                    placeholder="AWB / tracking no."
                    style={{ flex: 1, border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .65rem', fontSize: '.85rem', boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => generateAwbFor(o.id)} disabled={genAwbId === o.id}
                    title="Auto-generate AWB via Delhivery"
                    style={{ flexShrink: 0, background: '#0b6b3a', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem .7rem', fontSize: '.78rem', fontWeight: 700, cursor: genAwbId === o.id ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                    {genAwbId === o.id ? '…' : '⚡ Generate'}
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.25rem' }}>
              <button onClick={() => setAwbModal(false)}
                style={{ flex: 1, background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', padding: '.65rem', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={handleUpdate} disabled={updating}
                style={{ flex: 1, background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.65rem', cursor: updating ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: updating ? .7 : 1 }}>
                {updating ? 'Saving...' : 'Save (Mark Shipped)'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Return details modal — view media + Approve / Reject */}
      {returnModalId && (() => {
        const o = orders.find(x => x.id === returnModalId);
        if (!o) return null;
        const purged = !!o.returnMediaDeleted;
        const photos = [...(o.returnOpeningPhotos ?? []), ...(o.returnClosingPhotos ?? [])];
        const hasMedia = !!(o.returnOpeningVideo || o.returnClosingVideo || photos.length);
        const lbl: CSSProperties ={ fontSize: '.75rem', fontWeight: 700, color: '#666', margin: '0 0 .3rem' };
        const vid: CSSProperties ={ width: 220, maxWidth: '100%', borderRadius: 8, background: '#000' };
        const btn: CSSProperties ={ flex: 1, color: '#fff', border: 'none', borderRadius: 8, padding: '.65rem', cursor: decisionBusy ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: decisionBusy ? .7 : 1 };
        const grey: CSSProperties ={ flex: 1, background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 8, padding: '.65rem', cursor: 'pointer', fontWeight: 600 };
        const mediaLinks: CSSProperties = { display: 'flex', gap: '.4rem', justifyContent: 'center', marginTop: '.3rem' };
        const viewA: CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: '#1565c0', textDecoration: 'none', background: '#eaf2fb', borderRadius: 5, padding: '.15rem .4rem' };
        const dlA: CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: '#2e7d32', textDecoration: 'none', background: '#e8f5e9', borderRadius: 5, padding: '.15rem .4rem' };
        return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '640px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontWeight: 700, marginBottom: '.15rem' }}>Return · {o.id}</h3>
                <p style={{ fontSize: '.8rem', color: '#888' }}>{o.customerName || '—'} · {o.status}</p>
              </div>
              <button onClick={closeReturnModal} style={{ background: 'none', border: 'none', fontSize: '1.4rem', lineHeight: 1, cursor: 'pointer', color: '#999' }}>×</button>
            </div>

            {o.returnDecision === 'approved' && (
              <div style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 8, padding: '.5rem .75rem', fontSize: '.8rem', margin: '.6rem 0' }}>
                ✓ Approved{o.returnDecisionAt ? ` on ${new Date(o.returnDecisionAt).toLocaleString('en-IN')}` : ''} — media deleted.
              </div>
            )}
            {o.returnDecision === 'rejected' && (
              <div style={{ background: '#fdecea', color: '#c62828', borderRadius: 8, padding: '.5rem .75rem', fontSize: '.8rem', margin: '.6rem 0' }}>
                ✕ Rejected{o.returnDecisionAt ? ` on ${new Date(o.returnDecisionAt).toLocaleString('en-IN')}` : ''}. Reason: {o.returnRejectReason || '—'}
                {o.returnMediaPurgeAt && !purged && <div style={{ marginTop: '.25rem', color: '#a1554f' }}>Media auto-deletes on {new Date(o.returnMediaPurgeAt).toLocaleDateString('en-IN')}.</div>}
                {purged && <div style={{ marginTop: '.25rem' }}>Media has been deleted.</div>}
              </div>
            )}

            <div style={{ overflowY: 'auto', flex: 1, fontSize: '.85rem', marginTop: '.4rem' }}>
              <p style={{ margin: '.35rem 0' }}><strong>Issue:</strong> {o.returnIssue || '—'}</p>
              <p style={{ margin: '.35rem 0' }}><strong>Description:</strong> {o.returnReason || '—'}</p>
              {o.returnCallback && <p style={{ margin: '.35rem 0' }}><strong>Callback:</strong> {o.returnCallback}</p>}

              {purged ? (
                <p style={{ color: '#999', fontStyle: 'italic', marginTop: '.75rem' }}>Media has been deleted.</p>
              ) : !hasMedia ? (
                <p style={{ color: '#999', fontStyle: 'italic', marginTop: '.75rem' }}>No photos or videos were uploaded.</p>
              ) : (
                <>
                  {(o.returnOpeningVideo || o.returnClosingVideo) && (
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
                      {o.returnOpeningVideo && (
                        <div>
                          <p style={lbl}>🎬 Opening video</p>
                          <video src={o.returnOpeningVideo} controls preload="metadata" style={vid} />
                          <div style={mediaLinks}>
                            <a href={o.returnOpeningVideo} target="_blank" rel="noreferrer" style={viewA}>↗ View</a>
                            <a href={o.returnOpeningVideo} download style={dlA}>⬇ Download</a>
                          </div>
                        </div>
                      )}
                      {o.returnClosingVideo && (
                        <div>
                          <p style={lbl}>🎬 Return-pack video</p>
                          <video src={o.returnClosingVideo} controls preload="metadata" style={vid} />
                          <div style={mediaLinks}>
                            <a href={o.returnClosingVideo} target="_blank" rel="noreferrer" style={viewA}>↗ View</a>
                            <a href={o.returnClosingVideo} download style={dlA}>⬇ Download</a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {photos.length > 0 && (
                    <>
                      <p style={{ ...lbl, marginTop: '.85rem' }}>🖼️ Photos ({photos.length})</p>
                      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                        {photos.map((src, i) => (
                          <div key={i} style={{ textAlign: 'center' }}>
                            <a href={src} target="_blank" rel="noreferrer">
                              <img src={src} alt="" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee', display: 'block' }} />
                            </a>
                            <div style={mediaLinks}>
                              <a href={src} target="_blank" rel="noreferrer" style={viewA}>↗</a>
                              <a href={src} download style={dlA}>⬇</a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {!o.returnDecision ? (
              showReject ? (
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#555' }}>Reason for rejection (shown to customer) *</label>
                  <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
                    placeholder="e.g. Product shows signs of use / opening video missing…"
                    style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: 8, padding: '.5rem', fontSize: '.85rem', boxSizing: 'border-box', marginTop: '.3rem' }} />
                  <div style={{ display: 'flex', gap: '.6rem', marginTop: '.6rem' }}>
                    <button onClick={() => { setShowReject(false); setRejectReason(''); }} style={grey}>Back</button>
                    <button onClick={() => submitDecision(o, 'reject')} disabled={decisionBusy} style={{ ...btn, background: '#c62828' }}>{decisionBusy ? 'Saving…' : 'Confirm Reject'}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem' }}>
                  <button onClick={closeReturnModal} style={grey}>Close</button>
                  <button onClick={() => setShowReject(true)} disabled={decisionBusy} style={{ ...btn, background: '#c62828' }}>Reject</button>
                  <button onClick={() => submitDecision(o, 'approve')} disabled={decisionBusy} style={{ ...btn, background: '#2e7d32' }}>{decisionBusy ? 'Saving…' : 'Approve (delete media)'}</button>
                </div>
              )
            ) : (
              <>
                {o.returnDecision === 'approved' && o.status !== 'Return' && (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '.85rem' }}>
                    <p style={{ ...lbl, marginBottom: '.4rem' }}>🚚 Return Pickup (reverse)</p>
                    <div style={{ background: '#faf7f8', borderRadius: 8, padding: '.6rem .75rem', fontSize: '.78rem', color: '#555', marginBottom: '.6rem', lineHeight: 1.5 }}>
                      <strong>Pickup from customer:</strong><br />
                      {o.shippingName || o.customerName || '—'}{o.customerPhone ? ` · ${o.customerPhone}` : ''}<br />
                      {[o.shippingAddress, o.shippingCity, o.shippingState, o.shippingPincode].filter(Boolean).join(', ') || '—'}
                    </div>
                    {/* The reverse AWB is only actually set once the return moves to "Return Transit"
                        (assignReturnAwb sets that status). Before that the order still carries its
                        FORWARD delivery AWB, so gate on the status — not on o.awb — otherwise the
                        input never appears for a delivered order and no return AWB can be entered. */}
                    {o.status === 'Return Transit' && o.awb ? (
                      <p style={{ fontSize: '.82rem', color: '#2e7d32', fontWeight: 700, margin: '0 0 .5rem' }}>
                        ✓ Return AWB: {o.awb}{o.courier ? ` (${o.courier})` : ''}
                      </p>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
                          <input value={retAwb} onChange={e => setRetAwb(e.target.value)} placeholder="Return AWB / tracking no."
                            style={{ flex: '1 1 160px', border: '1.5px solid #ddd', borderRadius: 8, padding: '.5rem .65rem', fontSize: '.85rem', boxSizing: 'border-box' }} />
                          <select value={retCourier} onChange={e => setRetCourier(e.target.value)}
                            style={{ border: '1.5px solid #ddd', borderRadius: 8, padding: '.5rem', fontSize: '.85rem' }}>
                            {['Delhivery', 'India Post', 'DTDC', 'Other / Manual'].map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                          <button onClick={() => assignReturnAwb(o, 'manual')} disabled={decisionBusy} style={{ ...btn, flex: '0 0 auto', padding: '.5rem .9rem', background: '#a7354d' }}>
                            {decisionBusy ? '…' : 'Save AWB'}
                          </button>
                          <button onClick={() => assignReturnAwb(o, 'auto')} disabled={decisionBusy} style={{ ...btn, flex: '0 0 auto', padding: '.5rem .9rem', background: '#1565c0' }}>
                            ⚡ Auto (Delhivery)
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem' }}>
                  <button onClick={closeReturnModal} style={grey}>Close</button>
                  {o.returnDecision === 'approved' && RETURN_STATUSES.includes(o.status) && o.status !== 'Return' && (
                    <button onClick={() => markReturned(o)} disabled={decisionBusy} style={{ ...btn, background: '#2e7d32' }}>
                      {decisionBusy ? 'Saving…' : '✓ Mark as Returned'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
