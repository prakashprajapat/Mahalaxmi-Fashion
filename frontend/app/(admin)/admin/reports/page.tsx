'use client';
import { useEffect, useState } from 'react';
import { ordersApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { exportGSTR1Excel, exportSalesExcel, productGstTotals } from '@/lib/exportExcel';
import type { Order } from '@/types';

// Apparel GST slab (GST-inclusive prices): per-piece ≤ ₹2500 → 5%, above → 18%.
const gstSlab = (unitPrice: number) => (unitPrice > 2500 ? 18 : 5);

function exportGSTR1(orders: Order[], from: string, to: string) {
  const header = ['GSTIN','Invoice No','Invoice Date','Customer Name','State','HSN Code','Description','Qty','Taxable Value','GST Rate','CGST','SGST','IGST','Invoice Value'];
  const rows: string[][] = [];

  orders.filter(o => !['Cancelled','Return'].includes(o.status)).forEach(o => {
    const date = new Date(o.placedAt ?? o.createdAt).toLocaleDateString('en-IN');
    o.cart.forEach(item => {
      const qty = Number(item.quantity ?? 1) || 1;
      const rate = gstSlab(item.lineTotal / qty);
      const taxable = item.lineTotal / (1 + rate / 100);
      const gst = item.lineTotal - taxable;
      const state = (o as any).shippingState ?? '';
      const isIntraState = state.toLowerCase() === 'rajasthan';
      rows.push([
        '',
        o.id,
        date,
        o.customerName ?? '',
        state,
        item.hsn || '6211',
        item.name,
        String(item.quantity),
        taxable.toFixed(2),
        `${rate}%`,
        isIntraState ? (gst / 2).toFixed(2) : '0.00',
        isIntraState ? (gst / 2).toFixed(2) : '0.00',
        !isIntraState ? gst.toFixed(2) : '0.00',
        item.lineTotal.toFixed(2),
      ]);
    });
  });

  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `GSTR1-${from}-to-${to}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function exportSalesCSV(orders: Order[]) {
  const header = ['Order ID','Date','Customer','Phone','City','State','Subtotal','Shipping','COD Fee','Total','Method','Status'];
  const rows = orders.map(o => [
    o.id,
    new Date(o.placedAt ?? o.createdAt).toLocaleDateString('en-IN'),
    o.customerName ?? '',
    o.customerPhone ?? '',
    (o as any).shippingCity ?? '',
    (o as any).shippingState ?? '',
    o.subtotal,
    o.shippingCost,
    o.codFee,
    o.total,
    o.method,
    o.status,
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `sales-report.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export default function AdminReportsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary'|'gstr1'|'category'>('summary');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const token = getAdminToken() ?? '';
    ordersApi.getAll(undefined, token)
      .then(r => setOrders(r.orders))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = orders.filter(o => {
    const d = new Date(o.placedAt ?? o.createdAt);
    return d >= new Date(dateFrom) && d <= new Date(dateTo + 'T23:59:59');
  });

  const revenue = filtered.filter(o => !['Cancelled','Return'].includes(o.status)).reduce((s, o) => s + o.total, 0);
  // GST-inclusive prices, apparel slab (5% / 18% by piece price). Net of returns.
  const { taxable: taxableBase, gst: totalGst } = productGstTotals(filtered);
  const cgst = totalGst / 2;
  const sgst = totalGst / 2;
  const delivered = filtered.filter(o => o.status === 'Delivered').length;
  const cancelled = filtered.filter(o => o.status === 'Cancelled').length;
  const codOrders = filtered.filter(o => o.method === 'cod').length;
  const onlineOrders = filtered.filter(o => o.method !== 'cod').length;
  const codRevenue = filtered.filter(o => o.method === 'cod' && !['Cancelled','Return'].includes(o.status)).reduce((s, o) => s + o.total, 0);
  const onlineRevenue = filtered.filter(o => o.method !== 'cod' && !['Cancelled','Return'].includes(o.status)).reduce((s, o) => s + o.total, 0);

  // Category breakdown
  const categoryMap: Record<string, { qty: number; revenue: number }> = {};
  filtered.filter(o => !['Cancelled','Return'].includes(o.status)).forEach(o => {
    o.cart.forEach(item => {
      const c = item.category || 'Unknown';
      if (!categoryMap[c]) categoryMap[c] = { qty: 0, revenue: 0 };
      categoryMap[c].qty += item.quantity;
      categoryMap[c].revenue += item.lineTotal;
    });
  });
  const categoryRows = Object.entries(categoryMap).sort((a, b) => b[1].revenue - a[1].revenue);

  // HSN breakdown for GSTR-1
  const hsnMap: Record<string, { qty: number; taxable: number; gst: number }> = {};
  filtered.filter(o => !['Cancelled','Return'].includes(o.status)).forEach(o => {
    o.cart.forEach(item => {
      const hsn = item.hsn || '6211';
      if (!hsnMap[hsn]) hsnMap[hsn] = { qty: 0, taxable: 0, gst: 0 };
      const qty = Number(item.quantity ?? 1) || 1;
      const rate = gstSlab(item.lineTotal / qty);
      const taxable = item.lineTotal / (1 + rate / 100);
      hsnMap[hsn].qty += item.quantity;
      hsnMap[hsn].taxable += taxable;
      hsnMap[hsn].gst += item.lineTotal - taxable;
    });
  });

  const statCard = (label: string, value: string | number, sub?: string, color = '#1a1a1a') => (
    <div key={label} style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
      <p style={{ fontSize: '.8rem', color: '#888', marginBottom: '.35rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</p>
      <p style={{ fontSize: '1.5rem', fontWeight: 800, color, margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: '.78rem', color: '#aaa', marginTop: '.25rem' }}>{sub}</p>}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a1a' }}>Reports & GSTR-1</h1>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => exportSalesCSV(filtered)}
            style={{ background: '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            ⬇️ Sales CSV
          </button>
          <button onClick={() => exportSalesExcel(filtered, dateFrom, dateTo)}
            style={{ background: '#1b5e20', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            📊 Sales Excel
          </button>
          <button onClick={() => exportGSTR1(filtered, dateFrom, dateTo)}
            style={{ background: '#1565c0', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            📄 GSTR-1 CSV
          </button>
          <button onClick={() => exportGSTR1Excel(filtered, dateFrom, dateTo)}
            style={{ background: '#0d47a1', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            📊 GSTR-1 Excel
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', background: '#fff', padding: '1rem 1.25rem', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#555' }}>From:</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.45rem .75rem', fontSize: '.88rem' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#555' }}>To:</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.45rem .75rem', fontSize: '.88rem' }} />
        </div>
        <span style={{ fontSize: '.85rem', color: '#888' }}>{filtered.length} orders in range</span>
      </div>

      {loading ? (
        <p style={{ color: '#aaa' }}>Loading report data…</p>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.25rem' }}>
            {(['summary','gstr1','category'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ padding: '.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '.88rem', fontWeight: 600,
                  background: activeTab === tab ? '#a7354d' : '#f5f5f5',
                  color: activeTab === tab ? '#fff' : '#555' }}>
                {tab === 'summary' ? '📊 Summary' : tab === 'gstr1' ? '📄 GSTR-1 / HSN' : '🗂️ By Category'}
              </button>
            ))}
          </div>

          {activeTab === 'summary' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {statCard('Total Revenue', `₹${revenue.toLocaleString('en-IN')}`, `${filtered.length} orders`, '#27ae60')}
                {statCard('Taxable Base', `₹${taxableBase.toFixed(0)}`, 'excl. GST', '#1565c0')}
                {statCard('Total GST (5%)', `₹${totalGst.toFixed(0)}`, `CGST ₹${cgst.toFixed(0)} + SGST ₹${sgst.toFixed(0)}`, '#7b1fa2')}
                {statCard('Delivered', delivered, 'orders', '#27ae60')}
                {statCard('Cancelled', cancelled, 'orders', '#c62828')}
                {statCard('COD Orders', codOrders, `₹${codRevenue.toLocaleString('en-IN')}`, '#e67e22')}
                {statCard('Online Orders', onlineOrders, `₹${onlineRevenue.toLocaleString('en-IN')}`, '#1565c0')}
              </div>

              {/* GST Summary Table */}
              <div style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,.07)', marginBottom: '1.25rem' }}>
                <h3 style={{ fontWeight: 700, marginBottom: '1rem', color: '#333' }}>GST Summary (5% Rate)</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
                  <thead style={{ background: '#f9f9f9' }}>
                    <tr>
                      {['Component','Amount'].map(h => (
                        <th key={h} style={{ padding: '.6rem 1rem', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: '.78rem', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Taxable Base (excl. GST)', value: `₹${taxableBase.toFixed(2)}` },
                      { label: 'CGST @ 2.5%', value: `₹${cgst.toFixed(2)}` },
                      { label: 'SGST @ 2.5%', value: `₹${sgst.toFixed(2)}` },
                      { label: 'Total GST', value: `₹${totalGst.toFixed(2)}` },
                      { label: 'Total Invoice Value (incl. GST)', value: `₹${revenue.toLocaleString('en-IN')}` },
                    ].map((row, i) => (
                      <tr key={row.label} style={{ borderTop: i > 0 ? '1px solid #f5f5f5' : undefined }}>
                        <td style={{ padding: '.6rem 1rem' }}>{row.label}</td>
                        <td style={{ padding: '.6rem 1rem', fontWeight: 700 }}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'gstr1' && (
            <div style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
              <h3 style={{ fontWeight: 700, marginBottom: '1rem', color: '#333' }}>HSN-wise Summary (for GSTR-1 Table 12)</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                  <thead style={{ background: '#f9f9f9' }}>
                    <tr>
                      {['HSN Code','Description','Total Qty','Taxable Value','GST Rate','CGST','SGST','Total GST'].map(h => (
                        <th key={h} style={{ padding: '.65rem 1rem', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: '.75rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(hsnMap).length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#aaa' }}>No taxable orders in selected period.</td></tr>
                    ) : Object.entries(hsnMap).map(([hsn, data], i) => (
                      <tr key={hsn} style={{ borderTop: i > 0 ? '1px solid #f5f5f5' : undefined }}>
                        <td style={{ padding: '.65rem 1rem', fontFamily: 'monospace', fontWeight: 700 }}>{hsn}</td>
                        <td style={{ padding: '.65rem 1rem' }}>Garments / Clothing</td>
                        <td style={{ padding: '.65rem 1rem' }}>{data.qty}</td>
                        <td style={{ padding: '.65rem 1rem' }}>₹{data.taxable.toFixed(2)}</td>
                        <td style={{ padding: '.65rem 1rem' }}>5%</td>
                        <td style={{ padding: '.65rem 1rem' }}>₹{(data.gst / 2).toFixed(2)}</td>
                        <td style={{ padding: '.65rem 1rem' }}>₹{(data.gst / 2).toFixed(2)}</td>
                        <td style={{ padding: '.65rem 1rem', fontWeight: 700 }}>₹{data.gst.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'category' && (
            <div style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
              <h3 style={{ fontWeight: 700, marginBottom: '1rem', color: '#333' }}>Sales by Category</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                  <thead style={{ background: '#f9f9f9' }}>
                    <tr>
                      {['Category','Units Sold','Revenue','% of Total'].map(h => (
                        <th key={h} style={{ padding: '.65rem 1rem', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: '.75rem', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRows.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#aaa' }}>No data in selected period.</td></tr>
                    ) : categoryRows.map(([cat, data], i) => (
                      <tr key={cat} style={{ borderTop: i > 0 ? '1px solid #f5f5f5' : undefined }}>
                        <td style={{ padding: '.65rem 1rem', fontWeight: 500 }}>{cat}</td>
                        <td style={{ padding: '.65rem 1rem' }}>{data.qty}</td>
                        <td style={{ padding: '.65rem 1rem', fontWeight: 600 }}>₹{data.revenue.toLocaleString('en-IN')}</td>
                        <td style={{ padding: '.65rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                            <div style={{ flex: 1, height: '6px', background: '#f5f5f5', borderRadius: '3px', overflow: 'hidden', maxWidth: '100px' }}>
                              <div style={{ height: '100%', background: '#a7354d', borderRadius: '3px', width: `${Math.round((data.revenue / revenue) * 100)}%` }} />
                            </div>
                            <span>{revenue > 0 ? Math.round((data.revenue / revenue) * 100) : 0}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
