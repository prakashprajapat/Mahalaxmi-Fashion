'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ordersApi, productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import type { Order, Product } from '@/types';

// The admin home, rebuilt for a phone.
//
// It used to be five cards with emoji — Total Orders, Total Revenue, Customers,
// Products, Pending Orders — and a table underneath that a phone cannot show.
// Those numbers read well and told the owner nothing to do: "Total Orders 412"
// is the same number every morning, and the work of the day is invisible.
//
// What replaces it is today's two figures, then the list of things actually
// waiting — parcels to pack, labels to print, returns that arrived, stock that
// ran out, products the quality gate is holding back. Every line is a link to
// the screen where that work is done.
//
// Known cost, worth saying out loud: this still loads every order into the
// browser and counts them here. At eighty products and today's order volume
// that is fine; at a few thousand orders it will not be, and these counts
// belong in one server call. That change needs a backend endpoint and is
// deliberately not bundled with this one.

const MONEY = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const NEW_STATUSES = ['Order Received', 'Pending'];
const RETURN_STATUSES = ['Return Requested', 'Return Transit'];

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const orderDate = (o: Order) => new Date(o.placedAt ?? o.createdAt ?? '');
const isRevenue = (o: Order) =>
  !['Cancelled', 'Return', 'Return Requested', 'Return Transit', 'Cancel Requested'].includes(o.status);

interface Task { label: string; hint: string; count: number; href: string; tone: 'red' | 'amber' | 'grey' }

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    const token = getAdminToken() ?? '';
    // allSettled: a staff account may lack permission for one of these, and one
    // 403 must not blank the whole screen.
    Promise.allSettled([
      ordersApi.getAll(undefined, token),
      productsApi.getAll({ pageSize: 1000 }),
    ]).then(([o, p]) => {
      setOrders(o.status === 'fulfilled' ? o.value.orders : []);
      setProducts(p.status === 'fulfilled' ? (p.value.products as Product[]) : []);
    });
  }, []);

  const loading = orders === null || products === null;
  const os = orders ?? [];
  const ps = products ?? [];

  const today = dayKey(new Date());
  const todays = os.filter(o => dayKey(orderDate(o)) === today);
  const todaysSales = todays.filter(isRevenue).reduce((s, o) => s + (Number(o.total) || 0), 0);

  const yesterday = dayKey(new Date(Date.now() - 86400000));
  const yesterdaysCount = os.filter(o => dayKey(orderDate(o)) === yesterday).length;
  const diff = todays.length - yesterdaysCount;

  // Last seven days, oldest first, for the bar strip.
  const week = [...Array(7)].map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    const of_ = os.filter(o => dayKey(orderDate(o)) === dayKey(d) && isRevenue(o));
    return {
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2),
      value: of_.reduce((s, o) => s + (Number(o.total) || 0), 0),
      isToday: i === 6,
    };
  });
  const weekTotal = week.reduce((s, d) => s + d.value, 0);
  const peak = Math.max(1, ...week.map(d => d.value));

  const tasks: Task[] = [
    { label: 'To pack', hint: 'New orders waiting', tone: 'red',
      count: os.filter(o => NEW_STATUSES.includes(o.status)).length, href: '/admin/orders' },
    { label: 'Ready to ship', hint: 'Labels to print', tone: 'amber',
      count: os.filter(o => o.status === 'Ready for Shipping').length, href: '/admin/orders' },
    { label: 'Returns', hint: 'Coming back to you', tone: 'amber',
      count: os.filter(o => RETURN_STATUSES.includes(o.status)).length, href: '/admin/orders' },
    { label: 'Out of stock', hint: 'Listed but cannot sell', tone: 'red',
      count: ps.filter(p => p.stock === 'Out of Stock').length, href: '/admin/stock' },
    { label: 'Held as drafts', hint: 'Google would reject these', tone: 'grey',
      count: ps.filter(p => p.stock === 'Draft').length, href: '/admin/products/drafts' },
  ];
  const openTasks = tasks.filter(t => t.count > 0);

  const recent = [...os]
    .sort((a, b) => +orderDate(b) - +orderDate(a))
    .slice(0, 6);

  const toneBg: Record<Task['tone'], string> = { red: '#fdecea', amber: '#fff4e2', grey: '#f1edea' };
  const toneFg: Record<Task['tone'], string> = { red: '#c0392b', amber: '#b26b00', grey: '#7d736d' };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>Dashboard</h1>
        <p className="admin-page-sub">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Today */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '1rem' }}>
        <Link href="/admin/orders" style={kpiBox}>
          <div style={kpiNum}>{loading ? '—' : todays.length}</div>
          <div style={kpiLbl}>Orders today</div>
          {!loading && yesterdaysCount > 0 && (
            <div style={{ ...kpiDelta, color: diff >= 0 ? '#2e7d32' : '#c0392b' }}>
              {diff >= 0 ? '+' : ''}{diff} vs yesterday
            </div>
          )}
        </Link>
        <Link href="/admin/reports" style={kpiBox}>
          <div style={kpiNum}>{loading ? '—' : MONEY(todaysSales)}</div>
          <div style={kpiLbl}>Sales today</div>
        </Link>
      </div>

      {/* What is waiting */}
      <div style={card}>
        <h2 style={cardH}>Today&apos;s tasks</h2>
        {loading ? (
          <p style={{ color: '#9a908a', fontSize: '.88rem', margin: 0 }}>Loading…</p>
        ) : openTasks.length === 0 ? (
          <p style={{ color: '#2e7d32', fontSize: '.9rem', margin: 0, fontWeight: 600 }}>
            Nothing waiting. Everything is packed, shipped and in stock.
          </p>
        ) : openTasks.map((t, i) => (
          <Link key={t.label} href={t.href} style={{ ...taskRow, borderBottom: i === openTasks.length - 1 ? 'none' : '1px solid #f4efec' }}>
            <span>
              <span style={{ display: 'block', fontSize: '.88rem', fontWeight: 600, color: '#2d2724' }}>{t.label}</span>
              <span style={{ display: 'block', fontSize: '.74rem', color: '#9a908a', marginTop: 2 }}>{t.hint}</span>
            </span>
            <span style={{ background: toneBg[t.tone], color: toneFg[t.tone], borderRadius: 20, padding: '3px 10px', fontSize: '.78rem', fontWeight: 800, minWidth: 30, textAlign: 'center' }}>
              {t.count}
            </span>
          </Link>
        ))}
      </div>

      {/* Last seven days */}
      <div style={card}>
        <h2 style={cardH}>Last 7 days</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 64 }}>
          {week.map((d, i) => (
            <div key={i} title={MONEY(d.value)}
              style={{
                flex: 1, borderRadius: '3px 3px 0 0', minHeight: 3,
                height: `${Math.max(4, (d.value / peak) * 100)}%`,
                background: d.isToday ? '#722f37' : '#e3d3d6',
              }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 7, marginTop: 6 }}>
          {week.map((d, i) => (
            <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: '.66rem', color: '#9a908a' }}>{d.label}</span>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '.9rem', paddingTop: '.75rem', borderTop: '1px solid #f4efec' }}>
          <span style={{ fontSize: '.82rem', color: '#7d736d' }}>Sales this week</span>
          <span style={{ fontSize: '.98rem', fontWeight: 800, color: '#1e1b19' }}>{loading ? '—' : MONEY(weekTotal)}</span>
        </div>
      </div>

      {/* Recent orders */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '.7rem' }}>
          <h2 style={{ ...cardH, marginBottom: 0 }}>Recent orders</h2>
          <Link href="/admin/orders" style={{ fontSize: '.76rem', fontWeight: 700, color: '#722f37' }}>See all</Link>
        </div>
        {recent.length === 0 && !loading && (
          <p style={{ color: '#9a908a', fontSize: '.88rem', margin: 0 }}>No orders yet.</p>
        )}
        {recent.map((o, i) => (
          <Link key={o.id} href="/admin/orders"
            style={{ display: 'flex', alignItems: 'center', gap: '.7rem', padding: '.7rem 0', borderBottom: i === recent.length - 1 ? 'none' : '1px solid #f4efec', color: 'inherit' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '.8rem', fontWeight: 800, color: '#1e1b19' }}>{o.id}</span>
              <span style={{ display: 'block', fontSize: '.74rem', color: '#9a908a', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.customerName || 'Guest'}{o.shippingCity ? ` · ${o.shippingCity}` : ''}
              </span>
            </span>
            <span style={{ textAlign: 'right', flexShrink: 0 }}>
              <span style={{ display: 'block', fontSize: '.85rem', fontWeight: 800, color: '#1e1b19' }}>
                {MONEY(Number(o.total) || 0)}
              </span>
              <span style={{
                display: 'inline-block', marginTop: 3, fontSize: '.66rem', fontWeight: 800, borderRadius: 12, padding: '2px 8px',
                background: o.status === 'Delivered' ? '#eaf6ec' : o.status === 'Cancelled' ? '#fdecea' : '#fff4e2',
                color: o.status === 'Delivered' ? '#2e7d32' : o.status === 'Cancelled' ? '#c0392b' : '#b26b00',
              }}>{o.status}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #eae3e4', borderRadius: 13,
  padding: '.85rem .9rem', marginBottom: '.85rem',
};
const cardH: React.CSSProperties = {
  fontSize: '.74rem', fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase',
  color: '#8a7f76', margin: '0 0 .65rem',
};
const kpiBox: React.CSSProperties = {
  background: '#fff', border: '1px solid #eae3e4', borderRadius: 13, padding: '.8rem .85rem', color: 'inherit',
};
const kpiNum: React.CSSProperties = { fontSize: '1.5rem', fontWeight: 800, color: '#1e1b19', letterSpacing: '-.02em' };
const kpiLbl: React.CSSProperties = { fontSize: '.74rem', color: '#7d736d', marginTop: 3 };
const kpiDelta: React.CSSProperties = { fontSize: '.7rem', fontWeight: 700, marginTop: 5 };
const taskRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '.65rem 0', color: 'inherit',
};
