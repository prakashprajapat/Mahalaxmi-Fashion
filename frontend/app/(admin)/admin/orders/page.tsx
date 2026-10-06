'use client';
import { Fragment, useEffect, useState, type CSSProperties } from 'react';
import { ordersApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { exportOrders } from '@/lib/exportExcel';
import { productImageSrc } from '@/lib/productImages';
import type { Order } from '@/types';
import { openOrderLabels, openPicklist } from '@/lib/orderLabel';
import { PageHeader, Card, Stat, StatGrid, Chips, Empty } from '@/components/admin/Ui';

const ORDER_STATUS_TABS: { key: string; label: string; hidden?: boolean }[] = [
  { key: 'all',                  label: 'All Orders' },
  { key: 'Pending',              label: 'Pending' },
  { key: 'On Hold',              label: 'On Hold' },
  { key: 'Ready for Shipping',   label: 'Ready to Ship' },
  // "Shipped" has no chip of its own any more - it told the shop nothing the
  // courier's own status did not tell it better, and sat next to Transit saying
  // a weaker version of the same thing.
  //
  // But its orders cannot vanish with it. Delhivery moves an order to Transit as
  // soon as the AWB syncs; a MANUAL courier (India Post, DTDC) stops at Shipped
  // and never moves again. Without a chip that accepts them those orders would
  // belong to no chip at all, which is how a parcel gets forgotten. So Transit
  // now covers both - see TAB_MATCHES.
  { key: 'Transit',              label: 'Transit' },
  { key: 'Delivered',            label: 'Delivered' },
  { key: 'Cancel Requested',     label: 'Cancel Req.' },
  { key: 'Cancelled',            label: 'Cancelled' },
];

// A chip may stand for more than one status. Only "Transit" does today, and it
// does it because a manual courier's order stops at "Shipped" for good.
const TAB_MATCHES: Record<string, string[]> = {
  Transit: ['Transit', 'Shipped'],
};
const tabAccepts = (tabKey: string, status: string) =>
  tabKey === 'all' || (TAB_MATCHES[tabKey] ?? [tabKey]).includes(status);

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


// Which step of the journey a courier scan is describing.
//
// Delhivery writes these in its own words - "Manifest uploaded", "Added to Bag",
// "Shipment Recieved at Origin Center", misspelling and all - so the mapping is
// by meaning, not by an exact phrase. Anything unrecognised falls to the first
// step rather than being dropped: an update nobody has seen before is still an
// update, and losing it silently is worse than putting it one row too early.
function stepOfScan(remark: string): number {
  const r = (remark || '').toLowerCase();
  if (r.includes('delivered') && !r.includes('undelivered')) return 4;
  if (r.includes('out for delivery') || r.includes('dispatched')) return 3;
  if (r.includes('transit') || r.includes('reached') || r.includes('received at')
   || r.includes('recieved at') || r.includes('added to bag') || r.includes('bag')
   || r.includes('center') || r.includes('centre')) return 2;
  if (r.includes('picked') || r.includes('manifest')) return 1;
  return 0;
}

// A courier scan's timestamp, as a person would say it. Delhivery sometimes
// sends something Date cannot read; then the raw string is better than "Invalid
// Date", which tells the shop nothing at all.
function scanWhen(raw: string): string {
  const dt = new Date(raw);
  return isNaN(dt.getTime())
    ? raw
    : dt.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
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
  const [filterPay, setFilterPay] = useState('');
  // Kis khaane me dhoondhna hai. "Sab" purani aadat hai aur wahi default hai;
  // ek khaana chun lene par 1786 jaisa number sirf Order ID me khojega,
  // pincode ya AWB me nahin — Meesho panel me bhi yahi tareeka hai.
  const [searchIn, setSearchIn] = useState('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | ''>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [awbModal, setAwbModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');           // holds the chosen courier
  const [awbMap, setAwbMap] = useState<Record<string, string>>({}); // per-order AWB
  const [genAwbId, setGenAwbId] = useState<string | null>(null);    // order currently auto-generating an AWB
  const [updating, setUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Kaun sa order khula hua hai.
  //
  // Pehle har order apna poora byora khole rakhta tha — saman ki tasveer, SKU,
  // rang, naap, aur niche teen batan. Do order me hi poori screen bhar jati
  // thi, aur dus order dekhne ke liye scroll karte rehna padta tha. Kaam ke
  // waqt sawal aksar ek hi hota hai: "kaun sa aaya, kiska, kitne ka, kahan tak
  // pahuncha" — uske liye ek pankti kafi hai. Byora tab chahiye jab usi order
  // par kuch karna ho, aur tab ek click door hai.
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) => setOpenIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Packing view: the order's photos, big enough to match against a shelf.
  // The 34px thumbnail in the row proves a photo exists and nothing more - you
  // cannot tell one navy nighty from another at that size, which is exactly the
  // moment the wrong parcel gets taped shut.
  const [packId, setPackId] = useState<string | null>(null);

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

  const tabFiltered = mainFiltered.filter(o => tabAccepts(activeTab, o.status));

  const filtered = tabFiltered.filter(o => {
    const q = search.toLowerCase();
    const hit: Record<string, boolean> = {
      id:       o.id.toLowerCase().includes(q),
      customer: (o.customerName ?? '').toLowerCase().includes(q),
      phone:    (o.customerPhone ?? '').includes(search),
      pincode:  (o.shippingPincode ?? '').includes(search),
      awb:      (o.awb ?? '').toLowerCase().includes(q),
      sku:      (o.cart ?? []).some(c => (c.sku ?? '').toLowerCase().includes(q)),
      product:  (o.cart ?? []).some(c => (c.name ?? '').toLowerCase().includes(q)),
      // Dukaan ka naam bhi khoja ja sake. Naam order par dikhne laga tha par
      // khoj me shaamil nahi tha, isliye "All fields" me bhi nahi milta tha.
      shop:     (o.cart ?? []).some(c => (c.shopName ?? '').toLowerCase().includes(q)),
    };
    const matchSearch = !search ||
      (searchIn === 'all' ? Object.values(hit).some(Boolean) : !!hit[searchIn]);
    const matchPay = !filterPay || (o.method ?? '') === filterPay;
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
    return matchSearch && matchPay && matchDate && matchSize && matchColour;
  });

  const countFor = (key: string) =>
    key === 'all' ? mainFiltered.length : mainFiltered.filter(o => tabAccepts(key, o.status)).length;

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

  const anyFilter = Boolean(dateFilter || filterSize || filterColour || search || filterPay);
  const clearFilters = () => { setDateFilter(''); setFilterSize(''); setFilterColour(''); setSearch(''); setFilterPay(''); };
  const allShownSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  // Khaane ke naam par click karke tartib badalna. Sirf do khaane me iska matlab
  // hai — tareekh aur rakam; baki naam ke hain, unme tartib se kuch nahi milta.
  const toggleSort = (k: 'date' | 'amount') => {
    if (sortBy === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(k); setSortDir('desc'); }
  };
  const arrow = (k: string) => (sortBy === k ? (sortDir === 'asc' ? ' \u25b2' : ' \u25bc') : '');
  const shown = !sortBy ? filtered : [...filtered].sort((a, b) => {
    const va = sortBy === 'amount' ? a.total : new Date(a.placedAt ?? a.createdAt).getTime();
    const vb = sortBy === 'amount' ? b.total : new Date(b.placedAt ?? b.createdAt).getTime();
    return sortDir === 'asc' ? va - vb : vb - va;
  });

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
        {/* countFor('Transit') already counts Shipped - adding them again
            counted every manual-courier parcel twice. */}
        <Stat label="On the way" value={countFor('Transit')}
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
          <span style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase',
                         letterSpacing: '.04em', color: '#8a7f76' }}>Filter by</span>
          <select className="adm-input" style={{ width: '122px' }} value={searchIn}
                  onChange={e => setSearchIn(e.target.value)}>
            <option value="all">All fields</option>
            <option value="id">Order ID</option>
            <option value="customer">Customer</option>
            <option value="phone">Phone</option>
            <option value="pincode">Pincode</option>
            <option value="awb">AWB</option>
            <option value="sku">SKU</option>
            <option value="product">Product</option>
            <option value="shop">Shop</option>
          </select>
          <input className="adm-input" style={{ flex: '1 1 170px' }}
                 placeholder={searchIn === 'all' ? 'Search ID, name, phone, AWB, SKU or shop' : 'Search'}
                 value={search} onChange={e => setSearch(e.target.value)} />
          <select className="adm-input" style={{ width: '118px' }} value={filterPay}
                  onChange={e => setFilterPay(e.target.value)}>
            <option value="">Payment: all</option>
            <option value="cod">COD</option>
            <option value="razorpay">Prepaid</option>
          </select>
          <input className="adm-input" style={{ width: '96px' }} placeholder="Size"
                 value={filterSize} onChange={e => setFilterSize(e.target.value)} />
          <input className="adm-input" style={{ width: '116px' }} placeholder="Colour"
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
        ) : (
          /* Orders ki list asal me ek table hai — har order ki ek pankti, aur
             har khaana apni jagah par. Pehle har order ek chaukor dabba tha
             jisme sab kuch neeche-upar likha rehta tha, isliye do order me hi
             screen bhar jati thi aur aankh ko har baar naya rasta dhoondhna
             padta tha. Khaane me likha ho to aankh seedhi neeche utarti hai.
             Byora chhupa nahi hai: Order ID par click kijiye, usi pankti ke
             neeche saman ki poori tafseel khul jati hai. */
          <div className="adm-table-wrap">
            <table className="adm-table adm-table-sticky">
              <thead>
                <tr>
                  <th style={{ width: 26 }}>
                    <input type="checkbox" checked={allShownSelected} title="Select all shown"
                           onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(o => o.id)) : new Set())} />
                  </th>
                  <th>Order</th>
                  <th className="num">Qty</th>
                  <th>Size / Colour</th>
                  <th className="num">
                    <button type="button" className="adm-sort" onClick={() => toggleSort('amount')}>Amount{arrow('amount')}</button>
                  </th>
                  <th>Customer</th>
                  <th>Payment</th>
                  <th>Tracking</th>
                  <th>
                    <button type="button" className="adm-sort" onClick={() => toggleSort('date')}>Date{arrow('date')}</button>
                  </th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(o => {
                  const picked = selectedIds.has(o.id);
                  const isOpen = openIds.has(o.id);
                  const lines = o.cart ?? [];
                  const pieces = lines.reduce((n, c) => n + (c.quantity ?? 1), 0);
                  const placed = new Date(o.placedAt ?? o.createdAt);
                  // Size ke andar rang bhi likha aata hai ("M / Red") — packer ko
                  // naap chahiye, isliye rang alag kar dete hain.
                  const sizeOf = (c: typeof lines[number]) =>
                    c.color ? (c.size || '').split(' / ').filter(p => p && p !== c.color).join(' / ') : (c.size || '');
                  const sizes = Array.from(new Set(lines.map(sizeOf).filter(Boolean)));
                  const colours = Array.from(new Set(lines.map(c => c.color).filter(Boolean)));
                  // Kis dukaan se maal mangwana hai. Ek order me do dukaanon
                  // ka maal ho sakta hai, isliye sabhi dikhate hain.
                  const shops = Array.from(new Set(lines.map(c => c.shopName).filter(Boolean)));
                  const first = lines[0];
                  const thumb = first ? productImageSrc(first.colorPhoto || first.image) : '';
                  return (
                    <Fragment key={o.id}>
                      <tr style={{ background: picked ? '#fdf7f8' : undefined }}>
                        <td data-label="">
                          <input type="checkbox" checked={picked} onChange={() => toggleSelect(o.id)} />
                        </td>
                        <td data-label="Order">
                          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                            <button type="button" onClick={() => setPackId(o.id)}
                                    title="See the photos, big - for packing"
                                    style={{ background: 'none', border: 0, padding: 0, flexShrink: 0,
                                             cursor: 'zoom-in', lineHeight: 0, borderRadius: 6 }}>
                              {thumb
                                ? <img src={thumb} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', border: '1px solid #f0eae7' }} />
                                : <div className="adm-item-thumb" style={{ width: 34, height: 34, fontSize: '.85rem' }}>&mdash;</div>}
                            </button>
                            <div style={{ minWidth: 0 }}>
                              <button type="button" onClick={() => setPackId(o.id)}
                                      title="See the photos, big - for packing"
                                      style={{ background: 'none', border: 0, padding: 0, textAlign: 'left',
                                               cursor: 'zoom-in', fontWeight: 650, color: '#2d2724', maxWidth: 210,
                                               overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                               display: 'block', fontSize: 'inherit', fontFamily: 'inherit' }}>
                                {first ? first.name : 'no items'}{lines.length > 1 ? ` +${lines.length - 1}` : ''}
                              </button>
                              {/* The SKU, on the row itself. It was already searchable and
                                  already in the expanded panel, but packing a parcel means
                                  reading a code off a shelf - and opening every row to find
                                  it is the slowest part of the morning. */}
                              {first && (
                                <div title={lines.map(c => c.sku || 'no SKU').join(', ')}
                                     style={{ fontFamily: 'monospace', fontSize: '.72rem', color: '#8a7f76',
                                              maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap' }}>
                                  {first.sku || 'no SKU'}{lines.length > 1 ? ` +${lines.length - 1}` : ''}
                                </div>
                              )}
                              <button type="button" className="adm-oid" onClick={() => toggleOpen(o.id)}
                                      title="Open the full details of this order">
                                {o.id} {isOpen ? '\u25b4' : '\u25be'}
                              </button>
                              {shops.length > 0 && (
                                <div title={`Stocked at ${shops.join(', ')}`}
                                     style={{ marginTop: '.15rem', fontSize: '.72rem', fontWeight: 700, color: '#722f37',
                                              maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {shops.join(' \u00b7 ')}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td data-label="Qty" className="num">{pieces}</td>
                        <td data-label="Size / Colour">
                          <div style={{ fontWeight: 600 }}>{sizes.join(', ') || '\u2014'}</div>
                          {colours.length > 0 && <div style={{ color: '#9a908a', fontSize: '.72rem' }}>{colours.join(', ')}</div>}
                        </td>
                        <td data-label="Amount" className="num adm-money">&#8377;{o.total.toLocaleString('en-IN')}</td>
                        <td data-label="Customer">
                          <div style={{ fontWeight: 600, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {o.customerName || 'no name'}
                          </div>
                          <div style={{ color: '#9a908a', fontSize: '.72rem' }}>
                            {o.customerPhone || ''}{o.shippingPincode ? ` \u00b7 ${o.shippingPincode}` : ''}
                          </div>
                        </td>
                        <td data-label="Payment">{o.method === 'cod' ? 'COD' : 'Prepaid'}</td>
                        <td data-label="Tracking">
                          {o.awb
                            ? <button onClick={() => openLiveTrack(o.awb!)} title="Live Delhivery tracking"
                                      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'monospace',
                                               fontSize: '.74rem', color: '#1565c0', textDecoration: 'underline' }}>{o.awb}</button>
                            : <span style={{ color: '#c4bab5' }}>&mdash;</span>}
                        </td>
                        <td data-label="Date" style={{ whiteSpace: 'nowrap' }}>
                          {placed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </td>
                        <td data-label="Action">
                          <div className="adm-actions" style={{ flexWrap: 'wrap', alignItems: 'center', margin: 0 }}>
                            <button onClick={() => downloadShippingLabel(o)}>Label</button>
                            <button onClick={() => ordersApi.downloadInvoice(o.id, getAdminToken() ?? '').catch(() => {})}>Invoice</button>
                            {o.customerPhone && (
                              <details>
                                <summary style={{ cursor: 'pointer', color: '#128C7E', fontWeight: 700, fontSize: '.76rem', listStyle: 'none', userSelect: 'none' }}>
                                  WhatsApp &#9662;
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
                                Return{o.returnDecision === 'approved' ? ' \u2713' : o.returnDecision === 'rejected' ? ' \u2715' : ''}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Khula hua byora — usi order ke neeche, poori chaudai me. */}
                      {isOpen && (
                        <tr className="adm-row-detail">
                          <td data-label="" colSpan={11}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.9rem 1.6rem' }}>
                              {lines.map((c, ci) => {
                                const t = productImageSrc(c.colorPhoto || c.image);
                                const sz = sizeOf(c);
                                return (
                                  <div key={ci} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                                    {t
                                      ? <img src={t} alt="" style={{ width: 38, height: 38, borderRadius: 7, objectFit: 'cover', flexShrink: 0, border: '1px solid #f0eae7' }} />
                                      : <div className="adm-item-thumb" style={{ width: 38, height: 38, fontSize: '.9rem' }}>&mdash;</div>}
                                    <div style={{ fontSize: '.74rem', lineHeight: 1.45, minWidth: 0 }}>
                                      <div style={{ fontWeight: 650, color: '#2d2724', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{c.name}</div>
                                      <div style={{ color: '#9a908a', display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span style={{ fontFamily: 'monospace' }}>{c.sku || 'no SKU'}</span>
                                        {c.colorColumn ? <span>&middot; Col {c.colorColumn}</span> : null}
                                        {c.color && (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem' }}>
                                            &middot; {c.colorCode && <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.colorCode, border: '1px solid #ddd', display: 'inline-block' }} />}
                                            {c.color}
                                          </span>
                                        )}
                                        {sz && <span>&middot; Size {sz}</span>}
                                        <span>&middot; &times;{c.quantity}</span>
                                      </div>
                                      {c.shopName && (
                                        <div style={{ color: '#722f37', fontWeight: 700 }}>{c.shopName}</div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ marginTop: '.6rem', fontSize: '.74rem', color: '#7d736d' }}>
                              {[o.shippingName || o.customerName, o.shippingAddress, o.shippingCity, o.shippingState, o.shippingPincode]
                                .filter(Boolean).join(', ') || 'No address on this order'}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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

              // Every update belongs under the step it describes. Listed
              // separately at the bottom, the four scans said the same four
              // things the timeline above had already said, in a different
              // order, so the box answered "where is my parcel" twice and
              // agreed with itself by accident.
              const scansFor = (i: number) => scans.filter(sc => stepOfScan(sc.remark) === i);
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.9rem' }}>
                    {/* "Site status: Shipped" sat here arguing with the timeline
                        below it, which said In Transit. One of them is the courier
                        and one of them is a word we wrote down when the label was
                        printed; only one of them knows where the parcel is. */}
                    <span style={{ fontSize: '.85rem', color: '#555' }}>Order: <strong>{d.orderId}</strong></span>
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
                          {scansFor(i).map((sc, k) => (
                            <p key={k} style={{ margin: '.12rem 0 0', fontSize: '.78rem', lineHeight: 1.5,
                                                color: i === stage && k === 0 ? '#2e7d32' : '#777',
                                                fontWeight: i === stage && k === 0 ? 600 : 400 }}>
                              {sc.remark}
                              <span style={{ color: '#9a9a9a', fontWeight: 400 }}>
                                {' \u00b7 '}{scanWhen(sc.time)}
                                {sc.location ? ` \u00b7 ${sc.location}` : ''}
                              </span>
                            </p>
                          ))}
                          {/* The courier's own words, only when no scan has landed on
                              the step it is talking about - otherwise it is the same
                              sentence twice. */}
                          {i === stage && d.courierStatus && scansFor(i).length === 0 && (
                            <p style={{ margin: '.12rem 0 0', color: '#2e7d32', fontSize: '.78rem', fontWeight: 600 }}>
                              {d.courierStatus}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Packing view ──────────────────────────────────────────────
          Every line of one order, with the photo big enough to recognise.
          Everything a person needs while standing at the shelf with a parcel
          open - picture, code, size, colour, how many - and nothing else. */}
      {packId && (() => {
        const o = filtered.find(x => x.id === packId) ?? orders.find(x => x.id === packId);
        if (!o) return null;
        const lines = o.cart ?? [];
        const pieces = lines.reduce((n, c) => n + (c.quantity ?? 1), 0);
        return (
          <div onClick={() => setPackId(null)}
               style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', zIndex: 340, padding: '1rem' }}>
            <div onClick={e => e.stopPropagation()}
                 style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560,
                          maxHeight: '88vh', overflowY: 'auto', padding: '1.2rem 1.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.75rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>📦 Packing — {o.id}</h3>
                  <p style={{ margin: '.2rem 0 0', fontSize: '.84rem', color: '#8a7f76' }}>
                    {o.customerName || 'no name'} · {pieces} {pieces === 1 ? 'piece' : 'pieces'}
                    {o.shippingPincode ? ` · ${o.shippingPincode}` : ''}
                  </p>
                </div>
                <button onClick={() => setPackId(null)}
                        style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#888', lineHeight: 1 }}>
                  ✕
                </button>
              </div>

              {lines.length === 0 ? (
                <p style={{ color: '#8a7f76', fontSize: '.88rem', marginTop: '1rem' }}>This order has no items on it.</p>
              ) : lines.map((c, i) => {
                const big = productImageSrc(c.colorPhoto || c.image);
                return (
                  <div key={i} style={{ marginTop: '1rem', paddingTop: i === 0 ? 0 : '1rem',
                                        borderTop: i === 0 ? 'none' : '1px solid #f0eae7' }}>
                    {big ? (
                      <img src={big} alt={c.name}
                           style={{ width: '100%', maxHeight: 360, objectFit: 'contain',
                                    borderRadius: 10, background: '#faf6f2', border: '1px solid #f0eae7' }} />
                    ) : (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#b3a9a3',
                                    background: '#faf6f2', borderRadius: 10, fontSize: '.85rem' }}>
                        No photo on this product
                      </div>
                    )}
                    <p style={{ margin: '.6rem 0 .2rem', fontWeight: 700, color: '#2d2724', fontSize: '.95rem' }}>
                      {c.name}
                    </p>
                    <p style={{ margin: 0, fontSize: '.86rem', color: '#6b615c', lineHeight: 1.7 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#722f37' }}>
                        {c.sku || 'no SKU'}
                      </span>
                      {c.size ? ` \u00b7 Size ${c.size}` : ''}
                      {c.color ? ` \u00b7 ${c.color}` : ''}
                      {` \u00b7 \u00d7${c.quantity ?? 1}`}
                      {c.shopName ? ` \u00b7 ${c.shopName}` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
