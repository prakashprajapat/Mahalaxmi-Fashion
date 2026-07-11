'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { ordersApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { exportOrders } from '@/lib/exportExcel';
import { productImageSrc } from '@/lib/productImages';
import type { Order } from '@/types';

const ORDER_STATUS_TABS: { key: string; label: string; hidden?: boolean }[] = [
  { key: 'all',                  label: 'All Orders' },
  { key: 'Pending',              label: 'Pending' },
  { key: 'On Hold',              label: 'On Hold' },
  { key: 'Ready for Shipping',   label: 'Ready to Ship' },
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
    const matchDate = !dateFilter || (o.placedAt ?? o.createdAt).startsWith(dateFilter);
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

  // Shared 4x6 label styles (one label per printed page)
  const LABEL_CSS = `
      *{box-sizing:border-box}
      @page{size:4in 6in;margin:0}
      html,body{margin:0;padding:0}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
      .label{width:4in;min-height:6in;margin:0 auto;border:1px solid #111;padding:7px 8px;page-break-after:always}
      .label:last-child{page-break-after:auto}
      .top{position:relative;text-align:center;padding-top:2px}
      .brand-logo{width:135px;height:auto;object-fit:contain;display:inline-block}
      .web{font-size:9px;color:#a7354d;font-weight:700;margin-top:0}
      .courier-mini{position:absolute;top:0;right:0;background:#111;color:#fff;font-weight:800;font-size:7px;padding:2px 5px;border-radius:3px;letter-spacing:.03em;white-space:nowrap}
      .doctitle{font-size:10px;font-weight:800;margin:3px 0 4px;text-align:center}
      .box{border:1px solid #111;padding:4px 6px;margin-top:5px}
      .lbl{font-size:7px;font-weight:700;letter-spacing:.06em;color:#333}
      .cols{display:flex;gap:5px}.cols>.box{flex:1;margin-top:0}
      .awbnum{font-size:12px;font-weight:800;letter-spacing:.08em;text-align:center;margin-top:1px}
      .bc{display:block;width:100%;height:34px}
      .to{font-size:11px;font-weight:800;margin:1px 0}
      .txt{font-size:8px}
      .big{font-weight:800;font-size:11px}
      table{width:100%;border-collapse:collapse;font-size:8px}
      th{text-align:left;font-size:7px;letter-spacing:.03em;color:#333;border-bottom:1px solid #999;padding-bottom:2px}
      .tax{display:flex;gap:8px}.tax .left{flex:1.3}.tax .right{flex:1}
      .taxrow{display:flex;justify-content:space-between;font-size:8px;padding:0}
      .taxrow.total{font-weight:800;border-top:1px solid #999;margin-top:2px;padding-top:2px}
      .foot{font-size:7px;font-weight:700;margin-top:5px}
      .foot .muted{font-weight:400;color:#555}
      @media print{body{margin:0}.label{margin:0;width:4in;border:1px solid #111}}`;

  const buildLabelBody = (order: Order): string => {
    const esc = (s: string | number | null | undefined) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const money = (n: number) => 'Rs.' + Number(n || 0).toFixed(2);
    const awb = order.awb || '';
    const courier = (order.courier || '').trim();
    const showCourier = !!awb && !!courier;
    const gstRate = Number(order.cart[0]?.gstRate) || 5;
    const hsn = order.cart[0]?.hsn || '6211';
    const invoiceTotal = Number(order.total) || 0;
    const taxable = invoiceTotal / (1 + gstRate / 100);
    const totalTax = invoiceTotal - taxable;
    const cgst = totalTax / 2;
    const totalQty = order.cart.reduce((s, i) => s + i.quantity, 0);
    const payment = (order.method || '').toLowerCase() === 'cod' ? 'COD' : (order.method || 'PREPAID').toUpperCase();
    const placed = new Date(order.placedAt ?? order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const shipTo = [order.shippingAddress, order.shippingCity, order.shippingState, order.shippingPincode].filter(Boolean).map(esc).join(', ');
    const productRows = order.cart.map((it, i) => `
      <tr>
        <td style="padding:4px 0">${i + 1}. ${esc(it.name)}</td>
        <td>${esc(it.sku || '-')}</td>
        <td style="text-align:center">${it.quantity}</td>
        <td>${esc(it.size || '-')}</td>
        <td style="text-align:right">${money(it.lineTotal)}</td>
      </tr>`).join('');
    return `
    <div class="label">
      <div class="top">
        ${showCourier ? `<div class="courier-mini">${esc(courier.toUpperCase())}</div>` : ''}
        <img class="brand-logo" src="https://mahalaxmifashionhub.com/email-logo.png" alt="logo" />
        <div class="web">www.mahalaxmifashionhub.com</div>
      </div>
      <div class="doctitle">TAX INVOICE / ${showCourier ? esc(courier.toUpperCase()) + ' ' : ''}SHIPPING LABEL</div>
      <div class="box">
        <div class="lbl">AWB / TRACKING ID</div>
        <svg class="bc" data-code="${esc(awb || order.id)}"></svg>
        <div class="awbnum">${esc(awb || 'PENDING')}</div>
      </div>
      <div class="cols" style="margin-top:5px">
        <div class="box"><div class="lbl">ORDER ID</div><div class="big">${esc(order.id)}</div></div>
        <div class="box"><div class="lbl">PAYMENT</div><div class="big">${esc(payment)}</div></div>
      </div>
      <div class="box">
        <div class="lbl">SHIP TO</div>
        <div class="to">${esc(order.shippingName || order.customerName || '')}</div>
        <div class="txt">${shipTo}</div>
      </div>
      <div class="box">
        <div class="lbl" style="margin-bottom:3px">PRODUCT DETAILS (TOTAL QTY: ${totalQty})</div>
        <table>
          <tr><th>Product</th><th>SKU</th><th style="text-align:center">Qty</th><th>Size</th><th style="text-align:right">Amount</th></tr>
          ${productRows}
        </table>
      </div>
      <div class="box tax">
        <div class="left">
          <div class="lbl">TAX INVOICE</div>
          <div style="font-weight:800;font-size:9px;margin:1px 0">Invoice Type: Tax Invoice</div>
          <div class="txt">Invoice No: ${esc(order.invoiceNumber || 'Pending (mark Ready to Ship)')}</div>
          <div class="txt">Invoice Date: ${placed}</div>
          <div class="txt">HSN: ${esc(hsn)} | GST: ${gstRate}% | CGST + SGST</div>
        </div>
        <div class="right">
          <div class="taxrow"><span>Taxable Value</span><span>${money(taxable)}</span></div>
          <div class="taxrow"><span>CGST</span><span>${money(cgst)}</span></div>
          <div class="taxrow"><span>SGST</span><span>${money(cgst)}</span></div>
          <div class="taxrow total"><span>Total Tax</span><span>${money(totalTax)}</span></div>
          <div class="taxrow total"><span>Invoice Total</span><span>${money(invoiceTotal)}</span></div>
        </div>
      </div>
      <div class="cols" style="margin-top:5px">
        <div class="box"><div class="lbl">SELLER / PICKUP</div><div class="txt">Mahalaxmi Fashion Hub, Balotra, Rajasthan - 344022</div></div>
        <div class="box"><div class="lbl">DELIVERY PARTNER</div><div class="txt">${showCourier ? esc(courier) + ' | ' : ''}AWB: ${esc(awb || 'PENDING')}</div></div>
      </div>
      <div class="foot">Print this label and paste it on the parcel before handover.
        <span class="muted">Tax included in invoice total.</span></div>
    </div>`;
  };

  // Opens one or many labels in a print view; the print dialog lets you "Save as PDF"
  // (or send straight to a 4x6 label printer). Each label is its own page.
  const openLabelsPdf = (list: Order[]) => {
    if (!list.length) return;
    const bodies = list.map(buildLabelBody).join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labels (${list.length})</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    <style>${LABEL_CSS}</style></head>
    <body onload="try{document.querySelectorAll('.bc').forEach(function(el){JsBarcode(el, el.getAttribute('data-code'), {format:'CODE128',displayValue:false,height:30,margin:0,width:1.4});});}catch(e){};setTimeout(function(){window.focus();window.print();},450);">
    ${bodies}
    </body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) { alert('Please allow pop-ups for this site to download/print labels.'); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const downloadShippingLabel = (order: Order) => openLabelsPdf([order]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a1a' }}>Order Management</h1>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button onClick={fetchOrders}
            style={{ background: '#1565c0', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontSize: '.85rem', fontWeight: 600, cursor: 'pointer' }}>
            🔄 Refresh
          </button>
          <button onClick={() => exportCSV(filtered)}
            style={{ background: '#555', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontSize: '.85rem', fontWeight: 600, cursor: 'pointer' }}>
            ⬇️ CSV ({filtered.length})
          </button>
          <button onClick={() => exportOrders(filtered, new Date().toISOString().slice(0,10))}
            style={{ background: '#1b5e20', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1.25rem', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer' }}>
            📊 Export Excel ({filtered.length})
          </button>
        </div>
      </div>

      {/* Main Tabs: Orders / Returns */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '1rem', borderBottom: '2px solid #a7354d' }}>
        {(['orders', 'returns'] as const).map(mt => {
          const isActive = mainTab === mt;
          const cnt = mt === 'returns'
            ? orders.filter(o => RETURN_STATUSES.includes(o.status)).length
            : orders.filter(o => !RETURN_STATUSES.includes(o.status)).length;
          return (
            <button key={mt} onClick={() => { setMainTab(mt); setActiveTab('all'); }}
              style={{
                padding: '.6rem 1.5rem', border: 'none', borderRadius: '8px 8px 0 0',
                background: isActive ? '#a7354d' : '#f5f5f5',
                color: isActive ? '#fff' : '#555',
                fontSize: '.9rem', fontWeight: 700, cursor: 'pointer',
                textTransform: 'capitalize', marginRight: '4px',
              }}>
              {mt === 'orders' ? '📦 Orders' : '↩️ Returns'} ({cnt})
            </button>
          );
        })}
      </div>

      {/* Sub-status Tabs */}
      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '.5rem' }}>
        {currentStatusTabs.filter(tab => !tab.hidden).map(tab => {
          const cnt = countFor(tab.key);
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '.4rem .85rem', borderRadius: '20px', border: 'none',
                background: activeTab === tab.key ? '#a7354d' : '#f5f5f5',
                color: activeTab === tab.key ? '#fff' : '#555',
                fontSize: '.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              {tab.label} <span style={{ opacity: .8 }}>({cnt})</span>
            </button>
          );
        })}
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', marginBottom: '1rem', alignItems: 'center' }}>
        <input placeholder="Search ID, name, phone, AWB, SKU..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.88rem', width: '240px' }} />
        <input placeholder="Size (e.g. XL)"
          value={filterSize} onChange={e => setFilterSize(e.target.value)}
          style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.88rem', width: '130px' }} />
        <input placeholder="Colour / Design"
          value={filterColour} onChange={e => setFilterColour(e.target.value)}
          style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.88rem', width: '150px' }} />
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.88rem' }} />
        {(dateFilter || filterSize || filterColour || search) && <button onClick={() => { setDateFilter(''); setFilterSize(''); setFilterColour(''); setSearch(''); }}
          style={{ background: '#f5f5f5', border: 'none', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.82rem', cursor: 'pointer' }}>
          Clear
        </button>}
        <span style={{ fontSize: '.85rem', color: '#888', fontWeight: 600 }}>{filtered.length} orders</span>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div style={{ background: '#fff3cd', borderRadius: '8px', padding: '.6rem 1rem', marginBottom: '1rem', display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '.85rem' }}>{selectedIds.size} selected</strong>
          {mainTab === 'returns' ? (
            <>
              <button onClick={() => bulkUpdateStatus('Return Transit')} style={{ background: '#e67e22', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>🚚 Mark Return Transit</button>
              <button onClick={() => bulkUpdateStatus('Return')} style={{ background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>✅ Mark Returned</button>
              <button onClick={() => bulkUpdateStatus('Cancelled')} style={{ background: '#c62828', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>Cancel Return</button>
            </>
          ) : (
            <>
              <button onClick={() => bulkUpdateStatus('Ready for Shipping')} style={{ background: '#27ae60', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>Ready to Ship</button>
              <button onClick={openManualAwb} style={{ background: '#00695c', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>🚚 AWB / Courier</button>
              <button onClick={() => bulkUpdateStatus('Shipped')} style={{ background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>Mark Shipped</button>
              <button onClick={() => bulkUpdateStatus('Delivered')} style={{ background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>✅ Mark Delivered</button>
              <button onClick={() => bulkUpdateStatus('Cancelled')} style={{ background: '#c62828', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>Cancel</button>
            </>
          )}
          <button onClick={() => openLabelsPdf(filtered.filter(o => selectedIds.has(o.id)))} style={{ background: '#1565c0', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer', fontWeight: 700 }}>⬇ Labels PDF ({selectedIds.size})</button>
          <button onClick={() => setSelectedIds(new Set())} style={{ background: '#f5f5f5', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
            <thead style={{ background: '#f9f9f9' }}>
              <tr>
                <th style={{ padding: '.75rem 1rem', width: '36px' }}>
                  <input type="checkbox"
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(o => o.id)) : new Set())} />
                </th>
                {['S.No','Order ID','Date','Customer','Pincode','Item(s)','Size','Colour/Design','Amount','Method','AWB','Action'].map(h => (
                  <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '.72rem', color: '#888', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>Loading orders…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={13} style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>No orders found.</td></tr>
              ) : filtered.map((o, i) => {
                return (
                  <tr key={o.id} style={{ borderTop: i > 0 ? '1px solid #f5f5f5' : undefined, background: selectedIds.has(o.id) ? '#fdf0f3' : undefined }}>
                    <td style={{ padding: '.65rem 1rem' }}>
                      <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} />
                    </td>
                    <td style={{ padding: '.65rem 1rem', fontWeight: 700, fontSize: '.82rem', color: '#a7354d', whiteSpace: 'nowrap' }}>{i + 1}</td>
                    <td style={{ padding: '.65rem 1rem', fontFamily: 'monospace', fontSize: '.75rem', color: '#555', whiteSpace: 'nowrap' }}>{o.id}</td>
                    <td style={{ padding: '.65rem 1rem', fontSize: '.75rem', color: '#888', whiteSpace: 'nowrap' }}>
                      {new Date(o.placedAt ?? o.createdAt).toLocaleDateString('en-IN')}
                    </td>
                    <td style={{ padding: '.65rem 1rem', fontWeight: 500 }}>{o.customerName || '—'}</td>
                    <td style={{ padding: '.65rem 1rem', fontFamily: 'monospace', fontWeight: 700, fontSize: '.82rem', color: o.shippingPincode ? '#1a1a1a' : '#ccc', whiteSpace: 'nowrap' }}>{o.shippingPincode || '—'}</td>
                    <td style={{ padding: '.5rem 1rem', minWidth: '270px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
                        {o.cart.map((c, ci) => {
                          const thumb = productImageSrc(c.colorPhoto || c.image);
                          // `size` historically holds "size / colour" — strip the colour part when we show it separately
                          const sizeOnly = c.color ? (c.size || '').split(' / ').filter(p => p && p !== c.color).join(' / ') : (c.size || '');
                          return (
                            <div key={ci} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                              {thumb
                                ? <img src={thumb} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid #eee' }} />
                                : <div style={{ width: 40, height: 40, borderRadius: 6, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>👗</div>}
                              <div style={{ fontSize: '.72rem', lineHeight: 1.4 }}>
                                <div style={{ fontWeight: 600, color: '#333', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                                <div style={{ color: '#888', fontFamily: 'monospace' }}>
                                  SKU: {c.sku || '—'}{c.colorColumn ? ` · Col ${c.colorColumn}` : ''}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', color: '#666', flexWrap: 'wrap' }}>
                                  {c.color && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem' }}>
                                      {c.colorCode && <span style={{ width: 11, height: 11, borderRadius: '50%', background: c.colorCode, border: '1px solid #ccc', display: 'inline-block', flexShrink: 0 }} />}
                                      {c.color}{c.colorCode ? ` (${c.colorCode})` : ''}
                                    </span>
                                  )}
                                  {sizeOnly && <span>{c.color ? '· ' : ''}Size: {sizeOnly}</span>}
                                  <span>· ×{c.quantity}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ padding: '.5rem 1rem', fontSize: '.75rem', color: '#444' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
                        {o.cart.map((c, ci) => {
                          const sizeOnly = c.color ? (c.size || '').split(' / ').filter(p => p && p !== c.color).join(' / ') : (c.size || '');
                          return <div key={ci} style={{ minHeight: 40, display: 'flex', alignItems: 'center', fontWeight: 600 }}>{sizeOnly || '—'}</div>;
                        })}
                      </div>
                    </td>
                    <td style={{ padding: '.5rem 1rem', fontSize: '.75rem', color: '#444' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
                        {o.cart.map((c, ci) => (
                          <div key={ci} style={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: '.3rem', flexWrap: 'wrap' }}>
                            {c.colorCode && <span style={{ width: 11, height: 11, borderRadius: '50%', background: c.colorCode, border: '1px solid #ccc', display: 'inline-block', flexShrink: 0 }} />}
                            <span>{c.color || c.colorColumn ? `${c.color || ''}${c.colorColumn ? ` (Col ${c.colorColumn})` : ''}` : '—'}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '.65rem 1rem', fontWeight: 600, whiteSpace: 'nowrap' }}>₹{o.total.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '.65rem 1rem', textTransform: 'capitalize', fontSize: '.78rem' }}>{o.method}</td>
                    <td style={{ padding: '.65rem 1rem', fontSize: '.75rem', fontFamily: 'monospace', color: o.awb ? '#333' : '#ccc' }}>
                      {o.awb || '—'}
                    </td>
                    <td style={{ padding: '.65rem 1rem', whiteSpace: 'nowrap' }}>
                      <button onClick={() => downloadShippingLabel(o)}
                        style={{ color: '#1565c0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600 }}>
                        ⬇ Label
                      </button>
                      {RETURN_STATUSES.includes(o.status) && (
                        <button onClick={() => { setShowReject(false); setRejectReason(''); setReturnModalId(o.id); }}
                          style={{ display: 'block', marginTop: '.35rem', color: o.returnDecision === 'rejected' ? '#c62828' : o.returnDecision === 'approved' ? '#2e7d32' : '#a7354d', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: 700 }}>
                          ↩ Return{o.returnDecision === 'approved' ? ' ✓' : o.returnDecision === 'rejected' ? ' ✕' : ''}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
                    {o.awb ? (
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
