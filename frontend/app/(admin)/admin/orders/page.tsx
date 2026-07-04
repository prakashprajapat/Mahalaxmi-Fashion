'use client';
import { useEffect, useState } from 'react';
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
const ORDER_STATUSES  = ORDER_STATUS_TABS.filter(t => t.key !== 'all').map(t => t.key);

const ALL_STATUSES = [...ORDER_STATUSES, ...RETURN_STATUSES];

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
  const [dateFilter, setDateFilter] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [awb, setAwb] = useState('');
  const [updating, setUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    const matchSearch = !search ||
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      (o.customerName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.customerPhone ?? '').includes(search) ||
      (o.shippingPincode ?? '').includes(search) ||
      (o.awb ?? '').toLowerCase().includes(search.toLowerCase());
    const matchDate = !dateFilter || (o.placedAt ?? o.createdAt).startsWith(dateFilter);
    return matchSearch && matchDate;
  });

  const countFor = (key: string) =>
    key === 'all' ? mainFiltered.length : mainFiltered.filter(o => o.status === key).length;

  const handleUpdate = async () => {
    if (!selected || !newStatus) return;
    setUpdating(true);
    try {
      await ordersApi.updateStatus({ orderId: selected.id, status: newStatus, awb }, getAdminToken() ?? '');
      fetchOrders();
      setSelected(null);
    } catch (e) { alert((e as Error).message); }
    finally { setUpdating(false); }
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
    if (!confirm(`Update ${selectedIds.size} order(s) to "${status}"?`)) return;
    const token = getAdminToken() ?? '';
    for (const id of selectedIds) {
      await ordersApi.updateStatus({ orderId: id, status }, token).catch(() => {});
    }
    setSelectedIds(new Set());
    fetchOrders();
  };

  const downloadShippingLabel = (order: Order) => {
    const courier = 'Delhivery'; // TODO(Phase 3): use the selected courier
    const awb = order.awb || '';
    const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const money = (n: number) => 'Rs.' + Number(n || 0).toFixed(2);

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

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${courier} label ${esc(awb || order.id)}</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    <style>
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#111;background:#fff}
      .label{width:780px;margin:16px auto;border:1.5px solid #111;padding:16px 18px}
      .top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .brand{display:flex;gap:12px;align-items:center}
      .brand img{width:70px;height:70px;object-fit:contain}
      .brand h1{font-size:22px;margin:0;font-weight:800}
      .brand .tag{font-size:11px;letter-spacing:.06em;color:#333;font-weight:700}
      .courier{background:#111;color:#fff;font-weight:800;font-size:14px;padding:6px 12px;border-radius:4px;letter-spacing:.05em}
      .doctitle{font-size:15px;font-weight:800;margin:8px 0 12px}
      .box{border:1.5px solid #111;padding:8px 12px;margin-top:10px}
      .lbl{font-size:10px;font-weight:700;letter-spacing:.08em;color:#333}
      .cols{display:flex;gap:10px}.cols>.box{flex:1;margin-top:0}
      .awbnum{font-size:22px;font-weight:800;letter-spacing:.12em;text-align:center;margin-top:2px}
      #barcode{display:block;width:100%;height:70px}
      .to{font-size:17px;font-weight:800;margin:3px 0}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{text-align:left;font-size:10px;letter-spacing:.05em;color:#333;border-bottom:1px solid #999;padding-bottom:3px}
      .tax{display:flex;gap:20px}.tax .left{flex:1.3}.tax .right{flex:1}
      .taxrow{display:flex;justify-content:space-between;font-size:12px;padding:1px 0}
      .taxrow.total{font-weight:800;border-top:1px solid #999;margin-top:3px;padding-top:3px}
      .foot{font-size:11px;font-weight:700;margin-top:10px}
      .foot .muted{font-weight:400;color:#555}
      @media print{body{margin:0}.label{margin:0;border:1.5px solid #111}}
    </style></head><body onload="try{JsBarcode('#barcode','${esc(awb || order.id)}',{format:'CODE128',displayValue:false,height:64,margin:0,width:2});}catch(e){}">
    <div class="label">
      <div class="top">
        <div class="brand">
          <img src="https://mahalaxmifashionhub.com/email-logo.png" alt="logo" />
          <div><h1>Mahalaxmi Fashion Hub</h1><div class="tag">EVERY LOOK, A NEW EXPERIENCE</div></div>
        </div>
        <div class="courier">${courier.toUpperCase()}</div>
      </div>
      <div class="doctitle">TAX INVOICE / ${courier.toUpperCase()} SHIPPING LABEL</div>

      <div class="box">
        <div class="lbl">AWB / TRACKING ID</div>
        <svg id="barcode"></svg>
        <div class="awbnum">${esc(awb || 'PENDING')}</div>
      </div>

      <div class="cols" style="margin-top:10px">
        <div class="box"><div class="lbl">ORDER ID</div><div style="font-weight:800;font-size:15px">${esc(order.id)}</div></div>
        <div class="box"><div class="lbl">PAYMENT</div><div style="font-weight:800;font-size:15px">${esc(payment)}</div></div>
      </div>

      <div class="box">
        <div class="lbl">SHIP TO</div>
        <div class="to">${esc(order.shippingName || order.customerName || '')}</div>
        <div style="font-size:12px">${shipTo}</div>
        <div style="font-size:12px">Phone: ${esc(order.customerPhone || '')}</div>
      </div>

      <div class="box">
        <div class="lbl" style="margin-bottom:5px">PRODUCT DETAILS (TOTAL QTY: ${totalQty})</div>
        <table>
          <tr><th>Product</th><th>SKU</th><th style="text-align:center">Qty</th><th>Size</th><th style="text-align:right">Amount</th></tr>
          ${productRows}
        </table>
      </div>

      <div class="box tax">
        <div class="left">
          <div class="lbl">TAX INVOICE</div>
          <div style="font-weight:800;font-size:13px;margin:2px 0">Invoice Type: Tax Invoice</div>
          <div style="font-size:12px">Invoice No: INV-${esc(order.id)}</div>
          <div style="font-size:12px">Invoice Date: ${placed}</div>
          <div style="font-size:12px">HSN: ${esc(hsn)} | GST: ${gstRate}% | CGST + SGST</div>
        </div>
        <div class="right">
          <div class="taxrow"><span>Taxable Value</span><span>${money(taxable)}</span></div>
          <div class="taxrow"><span>CGST</span><span>${money(cgst)}</span></div>
          <div class="taxrow"><span>SGST</span><span>${money(cgst)}</span></div>
          <div class="taxrow total"><span>Total Tax</span><span>${money(totalTax)}</span></div>
          <div class="taxrow total"><span>Invoice Total (Tax Included)</span><span>${money(invoiceTotal)}</span></div>
        </div>
      </div>

      <div class="cols" style="margin-top:10px">
        <div class="box"><div class="lbl">SELLER / PICKUP</div><div style="font-size:12px">Mahalaxmi Fashion Hub, Balotra, Rajasthan - 344022</div></div>
        <div class="box"><div class="lbl">DELIVERY PARTNER</div><div style="font-size:12px">${courier} | AWB: ${esc(awb || 'PENDING')}</div></div>
      </div>

      <div class="foot">Print this label and paste it on the parcel before handover.<br>
        <span class="muted">Tax amount is included in the invoice total.</span></div>
    </div></body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${courier.toLowerCase()}-label-${awb || order.id}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <input placeholder="Search ID, name, phone, AWB..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.88rem', width: '240px' }} />
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.88rem' }} />
        {dateFilter && <button onClick={() => setDateFilter('')}
          style={{ background: '#f5f5f5', border: 'none', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.82rem', cursor: 'pointer' }}>
          Clear Date
        </button>}
        <span style={{ fontSize: '.85rem', color: '#888' }}>{filtered.length} orders</span>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div style={{ background: '#fff3cd', borderRadius: '8px', padding: '.6rem 1rem', marginBottom: '1rem', display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '.85rem' }}>{selectedIds.size} selected</strong>
          <button onClick={() => bulkUpdateStatus('Ready for Shipping')} style={{ background: '#27ae60', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>Ready to Ship</button>
          <button onClick={() => bulkUpdateStatus('Shipped')} style={{ background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>Mark Shipped</button>
          <button onClick={() => bulkUpdateStatus('Cancelled')} style={{ background: '#c62828', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>Cancel</button>
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
                {['Order ID','Date','Customer','Pincode','Item(s)','Amount','Method','AWB','Action'].map(h => (
                  <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '.72rem', color: '#888', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>Loading orders…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>No orders found.</td></tr>
              ) : filtered.map((o, i) => {
                return (
                  <tr key={o.id} style={{ borderTop: i > 0 ? '1px solid #f5f5f5' : undefined, background: selectedIds.has(o.id) ? '#fdf0f3' : undefined }}>
                    <td style={{ padding: '.65rem 1rem' }}>
                      <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} />
                    </td>
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
                    <td style={{ padding: '.65rem 1rem', fontWeight: 600, whiteSpace: 'nowrap' }}>₹{o.total.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '.65rem 1rem', textTransform: 'capitalize', fontSize: '.78rem' }}>{o.method}</td>
                    <td style={{ padding: '.65rem 1rem', fontSize: '.75rem', fontFamily: 'monospace', color: o.awb ? '#333' : '#ccc' }}>
                      {o.awb || '—'}
                    </td>
                    <td style={{ padding: '.65rem 1rem' }}>
                      <button onClick={() => downloadShippingLabel(o)}
                        style={{ color: '#1565c0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600 }}>
                        ⬇ Label
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Update Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '420px' }}>
            <h3 style={{ fontWeight: 700, marginBottom: '.25rem' }}>Update Order</h3>
            <p style={{ fontSize: '.82rem', color: '#888', marginBottom: '1.25rem', fontFamily: 'monospace' }}>{selected.id}</p>

            <div style={{ background: '#f9f9f9', borderRadius: '8px', padding: '.75rem', marginBottom: '1rem', fontSize: '.82rem' }}>
              <p style={{ margin: '0 0 .25rem' }}><strong>Customer:</strong> {selected.customerName}</p>
              <p style={{ margin: '0 0 .25rem' }}><strong>Phone:</strong> {selected.customerPhone}</p>
              <p style={{ margin: '0 0 .25rem' }}><strong>Amount:</strong> ₹{selected.total.toLocaleString('en-IN')} ({selected.method})</p>
              <p style={{ margin: 0 }}><strong>Address:</strong> {[selected.shippingAddress, selected.shippingCity, selected.shippingState, selected.shippingPincode].filter(Boolean).join(', ')}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              <div>
                <label style={{ fontSize: '.85rem', color: '#555', display: 'block', marginBottom: '.3rem' }}>New Status</label>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem' }}>
                  {ALL_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '.85rem', color: '#555', display: 'block', marginBottom: '.3rem' }}>AWB / Tracking Number</label>
                <input value={awb} onChange={e => setAwb(e.target.value)}
                  placeholder="Enter AWB from Delhivery / courier"
                  style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.25rem' }}>
              <button onClick={() => setSelected(null)}
                style={{ flex: 1, background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', padding: '.65rem', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={handleUpdate} disabled={updating}
                style={{ flex: 1, background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.65rem', cursor: updating ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: updating ? .7 : 1 }}>
                {updating ? 'Saving...' : 'Update Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
