'use client';
import { useEffect, useState } from 'react';
import { ordersApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { exportOrders } from '@/lib/exportExcel';
import type { Order } from '@/types';

const ORDER_STATUS_TABS = [
  { key: 'all',                label: 'All Orders' },
  { key: 'On Hold',            label: 'On Hold' },
  { key: 'Pending',            label: 'Pending' },
  { key: 'Ready for Shipping', label: 'Ready to Ship' },
  { key: 'Shipped',            label: 'Shipped' },
  { key: 'Transit',            label: 'Transit' },
  { key: 'Delivered',          label: 'Delivered' },
  { key: 'Cancel Requested',   label: 'Cancel Req.' },
  { key: 'Cancelled',          label: 'Cancelled' },
];

const RETURN_STATUS_TABS = [
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

function statusColor(status: string) {
  if (status === 'Delivered') return { bg: '#e8f5e9', color: '#2e7d32' };
  if (status === 'Cancelled' || status === 'Cancel Requested') return { bg: '#fdecea', color: '#c62828' };
  if (status === 'Return Requested' || status === 'Return Transit' || status === 'Return') return { bg: '#fff3e0', color: '#e65100' };
  if (status === 'Shipped' || status === 'Transit') return { bg: '#e3f2fd', color: '#1565c0' };
  return { bg: '#fff9c4', color: '#856404' };
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
    const items = order.cart.map(item => `${item.name}${item.size ? ` (${item.size})` : ''} x ${item.quantity}`).join('<br>');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Shipping Label ${order.id}</title><style>
      body{font-family:Arial,sans-serif;margin:24px;color:#111}.label{width:420px;border:2px solid #111;padding:18px}
      h1{font-size:20px;margin:0 0 10px}.row{border-top:1px solid #ddd;padding:8px 0}.small{font-size:12px;color:#555}
      .awb{font-size:18px;font-weight:800;letter-spacing:.08em}.to{font-size:16px;font-weight:800}
      @media print{body{margin:0}.label{border:2px solid #111}}
    </style></head><body><div class="label">
      <h1>Mahalaxmi Fashion Hub</h1>
      <div class="row"><span class="small">ORDER</span><br><strong>${order.id}</strong></div>
      <div class="row"><span class="small">AWB</span><br><span class="awb">${order.awb || 'Pending'}</span></div>
      <div class="row"><span class="small">SHIP TO</span><br><span class="to">${order.shippingName || order.customerName || ''}</span><br>
        ${[order.shippingAddress, order.shippingCity, order.shippingState, order.shippingPincode].filter(Boolean).join(', ')}<br>
        Phone: ${order.customerPhone || ''}</div>
      <div class="row"><span class="small">ITEMS</span><br>${items || '-'}</div>
      <div class="row"><strong>Total: ₹${order.total.toLocaleString('en-IN')}</strong> | ${order.method.toUpperCase()}</div>
    </div></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shipping-label-${order.id}.html`;
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
        {currentStatusTabs.map(tab => {
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
          <button onClick={() => bulkUpdateStatus('Order Packed')} style={{ background: '#1565c0', color: '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .75rem', fontSize: '.8rem', cursor: 'pointer' }}>Accept (Pack)</button>
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
                {['Order ID','Date','Customer','Phone','Items','Amount','Method','AWB','Status','Action'].map(h => (
                  <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '.72rem', color: '#888', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>Loading orders…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>No orders found.</td></tr>
              ) : filtered.map((o, i) => {
                const sc = statusColor(o.status);
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
                    <td style={{ padding: '.65rem 1rem', fontSize: '.78rem' }}>{o.customerPhone || '—'}</td>
                    <td style={{ padding: '.65rem 1rem', fontSize: '.78rem', color: '#888' }}>
                      {o.cart.reduce((s, c) => s + c.quantity, 0)} item{o.cart.reduce((s, c) => s + c.quantity, 0) !== 1 ? 's' : ''}
                    </td>
                    <td style={{ padding: '.65rem 1rem', fontWeight: 600, whiteSpace: 'nowrap' }}>₹{o.total.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '.65rem 1rem', textTransform: 'capitalize', fontSize: '.78rem' }}>{o.method}</td>
                    <td style={{ padding: '.65rem 1rem', fontSize: '.75rem', fontFamily: 'monospace', color: o.awb ? '#333' : '#ccc' }}>
                      {o.awb || '—'}
                    </td>
                    <td style={{ padding: '.65rem 1rem' }}>
                      <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '.25rem .6rem', borderRadius: '12px', background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                        {o.status}
                      </span>
                    </td>
                    <td style={{ padding: '.65rem 1rem' }}>
                      <button onClick={() => { setSelected(o); setNewStatus(o.status); setAwb(o.awb ?? ''); }}
                        style={{ color: '#a7354d', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600 }}>
                        Update
                      </button>
                      <button onClick={() => downloadShippingLabel(o)}
                        style={{ color: '#1565c0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600, marginLeft: '.5rem' }}>
                        Label
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
