'use client';
import { useEffect, useState } from 'react';
import { ordersApi, productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { exportGSTR1Excel, exportSalesExcel, exportGSTR1GovTemplate, productGstBreakdown } from '@/lib/exportExcel';
import type { Order } from '@/types';
import { PageHeader, Card, Stat, StatGrid, Chips, Empty, Pill } from '@/components/admin/Ui';

// Apparel GST slab (prices include GST): per-piece ≤ ₹2500 → 5%, above → 18%.
const gstSlab = (unitPrice: number) => (unitPrice > 2500 ? 18 : 5);
const HOME_STATE = 'rajasthan';
const OFF_BOOKS = ['Cancelled', 'Return'];

function exportGSTR1(orders: Order[], from: string, to: string) {
  const header = ['GSTIN','Invoice No','Invoice Date','Customer Name','State','HSN Code','Description','Qty','Taxable Value','GST Rate','CGST','SGST','IGST','Invoice Value'];
  const rows: string[][] = [];

  orders.filter(o => !OFF_BOOKS.includes(o.status)).forEach(o => {
    const date = new Date(o.placedAt ?? o.createdAt).toLocaleDateString('en-IN');
    o.cart.forEach(item => {
      const qty = Number(item.quantity ?? 1) || 1;
      const rate = gstSlab(item.lineTotal / qty);
      const taxable = item.lineTotal / (1 + rate / 100);
      const gst = item.lineTotal - taxable;
      const state = (o as any).shippingState ?? '';
      const intra = state.toLowerCase() === HOME_STATE;
      rows.push([
        '', o.id, date, o.customerName ?? '', state,
        item.hsn || '6211', item.name, String(item.quantity),
        taxable.toFixed(2), `${rate}%`,
        intra ? (gst / 2).toFixed(2) : '0.00',
        intra ? (gst / 2).toFixed(2) : '0.00',
        !intra ? gst.toFixed(2) : '0.00',
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
    o.customerName ?? '', o.customerPhone ?? '',
    (o as any).shippingCity ?? '', (o as any).shippingState ?? '',
    o.subtotal, o.shippingCost, o.codFee, o.total, o.method, o.status,
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = 'sales-report.csv';
  a.click(); URL.revokeObjectURL(url);
}

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const money2 = (n: number) => `₹${n.toFixed(2)}`;

export default function AdminReportsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'summary' | 'gstr1' | 'category'>('summary');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [packOf, setPackOf] = useState<Record<string, number>>({});

  useEffect(() => {
    const token = getAdminToken() ?? '';
    ordersApi.getAll(undefined, token)
      .then(r => setOrders(r.orders))
      .catch(console.error)
      .finally(() => setLoading(false));
    // SKU → pack-of, so report quantities can be counted in pieces.
    productsApi.getAll({ pageSize: 10000 })
      .then(r => {
        const m: Record<string, number> = {};
        (r.products ?? []).forEach((p: any) => { if (p.sku) m[p.sku] = Number(p.packOf ?? 1) || 1; });
        setPackOf(m);
      })
      .catch(() => {});
  }, []);

  const filtered = orders.filter(o => {
    const d = new Date(o.placedAt ?? o.createdAt);
    return d >= new Date(dateFrom) && d <= new Date(dateTo + 'T23:59:59');
  });

  const onBooks = filtered.filter(o => !OFF_BOOKS.includes(o.status));
  const revenue = onBooks.reduce((s, o) => s + o.total, 0);
  const g = productGstBreakdown(filtered);

  const delivered = filtered.filter(o => o.status === 'Delivered').length;
  const cancelled = filtered.filter(o => o.status === 'Cancelled').length;
  const codOrders = filtered.filter(o => o.method === 'cod').length;
  const onlineOrders = filtered.filter(o => o.method !== 'cod').length;
  const codRevenue = onBooks.filter(o => o.method === 'cod').reduce((s, o) => s + o.total, 0);
  const onlineRevenue = onBooks.filter(o => o.method !== 'cod').reduce((s, o) => s + o.total, 0);

  const categoryMap: Record<string, { qty: number; revenue: number }> = {};
  onBooks.forEach(o => o.cart.forEach(item => {
    const c = item.category || 'Uncategorised';
    if (!categoryMap[c]) categoryMap[c] = { qty: 0, revenue: 0 };
    categoryMap[c].qty += item.quantity;
    categoryMap[c].revenue += item.lineTotal;
  }));
  const categoryRows = Object.entries(categoryMap).sort((a, b) => b[1].revenue - a[1].revenue);

  // GSTR-1 Table 12 wants one row per HSN *and rate*. Lumping two rates under
  // one HSN and printing "5%" over the total is how a return goes in wrong.
  const hsnMap: Record<string, { hsn: string; rate: number; qty: number; taxable: number; gst: number; intraGst: number; interGst: number }> = {};
  onBooks.forEach(o => {
    const intra = String((o as any).shippingState ?? '').toLowerCase() === HOME_STATE;
    o.cart.forEach(item => {
      const hsn = item.hsn || '6211';
      const qty = Number(item.quantity ?? 1) || 1;
      const rate = gstSlab(item.lineTotal / qty);
      const key = `${hsn}|${rate}`;
      if (!hsnMap[key]) hsnMap[key] = { hsn, rate, qty: 0, taxable: 0, gst: 0, intraGst: 0, interGst: 0 };
      const taxable = item.lineTotal / (1 + rate / 100);
      const gst = item.lineTotal - taxable;
      hsnMap[key].qty += item.quantity;
      hsnMap[key].taxable += taxable;
      hsnMap[key].gst += gst;
      if (intra) hsnMap[key].intraGst += gst; else hsnMap[key].interGst += gst;
    });
  });
  const hsnRows = Object.values(hsnMap).sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);

  const rateLabel = g.rates.length === 0 ? '—'
    : g.rates.length === 1 ? `${g.rates[0]}%`
    : `${g.rates.join('% and ')}%`;

  return (
    <div className="admin-page">
      <PageHeader
        title="Reports &amp; GSTR-1"
        sub="Sales and tax for a date range. Cancelled orders and returns are left out, so these are net figures."
        right={
          <>
            <button className="adm-btn" onClick={() => exportSalesCSV(filtered)}>Sales CSV</button>
            <button className="adm-btn" onClick={() => exportSalesExcel(filtered, dateFrom, dateTo, packOf)}>Sales Excel</button>
            <button className="adm-btn" onClick={() => exportGSTR1(filtered, dateFrom, dateTo)}>GSTR-1 CSV</button>
            <button className="adm-btn" onClick={() => exportGSTR1Excel(filtered, dateFrom, dateTo, packOf)}>GSTR-1 Excel</button>
            <button className="adm-btn adm-btn-primary" onClick={() => exportGSTR1GovTemplate(filtered, dateFrom, dateTo, packOf)}>
              GSTR-1 gov template
            </button>
          </>
        }
      />

      <Card title="Which dates">
        <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">From</span>
            <input className="adm-input" type="date" style={{ display: 'block', marginTop: '.2rem' }}
                   value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">To</span>
            <input className="adm-input" type="date" style={{ display: 'block', marginTop: '.2rem' }}
                   value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </label>
          <span style={{ fontSize: '.82rem', color: '#7d736d', fontWeight: 600, paddingBottom: '.5rem' }}>
            {filtered.length} orders in this range, {onBooks.length} of them on the books
          </span>
        </div>
      </Card>

      {loading ? (
        <Card><Empty>Loading the orders…</Empty></Card>
      ) : (
        <>
          <Chips value={tab} onChange={k => setTab(k as typeof tab)}
                 items={[
                   { key: 'summary', label: 'Summary' },
                   { key: 'gstr1', label: 'GSTR-1 / HSN' },
                   { key: 'category', label: 'By category' },
                 ]} />

          {tab === 'summary' && (
            <>
              <StatGrid>
                <Stat label="Revenue" value={money(revenue)} action={`${onBooks.length} orders`} tone="green" />
                <Stat label="Taxable base" value={money(g.taxable)} action="before GST" />
                <Stat label="GST collected" value={money(g.gst)} action={`at ${rateLabel}`} />
                <Stat label="Delivered" value={delivered} tone="green" />
              </StatGrid>
              <StatGrid>
                <Stat label="Cancelled" value={cancelled} tone={cancelled > 0 ? 'red' : undefined} />
                <Stat label="Cash on delivery" value={codOrders} action={money(codRevenue)} />
                <Stat label="Paid online" value={onlineOrders} action={money(onlineRevenue)} />
                <Stat label="Orders out of state" value={g.igst > 0 ? 'Yes — IGST' : 'None'}
                      action={g.igst > 0 ? money(g.igst) + ' IGST' : 'all inside Rajasthan'} />
              </StatGrid>

              <Card title="GST, split the way the return wants it">
                <p style={{ fontSize: '.82rem', color: '#7d736d', margin: '0 0 .6rem', lineHeight: 1.6 }}>
                  A sale inside Rajasthan is CGST plus SGST; a sale to another state is IGST. Apparel is 5% up to
                  ₹2,500 a piece and 18% above it. Both splits below are counted from the orders, not assumed —
                  this range used {rateLabel}.
                </p>
                <div className="adm-table-wrap">
                  <table className="adm-table">
                    <thead><tr><th>Component</th><th className="num">Amount</th></tr></thead>
                    <tbody>
                      {[
                        ['Taxable base (before GST)', money2(g.taxable)],
                        ['CGST — sales inside Rajasthan', money2(g.cgst)],
                        ['SGST — sales inside Rajasthan', money2(g.sgst)],
                        ['IGST — sales to other states', money2(g.igst)],
                        ['Total GST', money2(g.gst)],
                        ['Invoice value (with GST)', money2(revenue)],
                      ].map(([label, value]) => (
                        <tr key={label}>
                          <td data-label="Component">{label}</td>
                          <td data-label="Amount" className="num" style={{ fontWeight: 800 }}>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {tab === 'gstr1' && (
            <Card title="HSN summary — for GSTR-1 table 12"
                  right={g.rates.length > 1 ? <Pill tone="amber">Two GST rates in this range</Pill> : undefined}>
              <p style={{ fontSize: '.82rem', color: '#7d736d', margin: '0 0 .6rem', lineHeight: 1.6 }}>
                One row per HSN code and rate, which is what the return asks for. A single HSN can appear twice
                if some pieces cost over ₹2,500.
              </p>
              {hsnRows.length === 0 ? (
                <Empty>No taxable orders in this range.</Empty>
              ) : (
                <div className="adm-table-wrap">
                  <table className="adm-table">
                    <thead><tr>
                      <th>HSN</th><th>Description</th><th className="num">Qty</th>
                      <th className="num">Taxable</th><th className="num">Rate</th>
                      <th className="num">CGST</th><th className="num">SGST</th>
                      <th className="num">IGST</th><th className="num">Total GST</th>
                    </tr></thead>
                    <tbody>
                      {hsnRows.map(r => (
                        <tr key={`${r.hsn}-${r.rate}`}>
                          <td data-label="HSN" className="mono" style={{ fontWeight: 800 }}>{r.hsn}</td>
                          <td data-label="Description">Garments / clothing</td>
                          <td data-label="Qty" className="num">{r.qty}</td>
                          <td data-label="Taxable" className="num">{money2(r.taxable)}</td>
                          <td data-label="Rate" className="num">{r.rate}%</td>
                          <td data-label="CGST" className="num">{money2(r.intraGst / 2)}</td>
                          <td data-label="SGST" className="num">{money2(r.intraGst / 2)}</td>
                          <td data-label="IGST" className="num">{money2(r.interGst)}</td>
                          <td data-label="Total GST" className="num" style={{ fontWeight: 800 }}>{money2(r.gst)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {tab === 'category' && (
            <Card title="Sales by category">
              {categoryRows.length === 0 ? (
                <Empty>Nothing sold in this range.</Empty>
              ) : (
                <div className="adm-table-wrap">
                  <table className="adm-table">
                    <thead><tr>
                      <th>Category</th><th className="num">Units</th><th className="num">Revenue</th><th>Share</th>
                    </tr></thead>
                    <tbody>
                      {categoryRows.map(([cat, d]) => {
                        const pct = revenue > 0 ? Math.round((d.revenue / revenue) * 100) : 0;
                        return (
                          <tr key={cat}>
                            <td data-label="Category" style={{ fontWeight: 650 }}>{cat}</td>
                            <td data-label="Units" className="num">{d.qty}</td>
                            <td data-label="Revenue" className="num" style={{ fontWeight: 800 }}>{money(d.revenue)}</td>
                            <td data-label="Share">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', justifyContent: 'flex-end' }}>
                                <div style={{ flex: 1, maxWidth: 110, height: 6, background: '#f4efec', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: '#722f37', borderRadius: 3 }} />
                                </div>
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
