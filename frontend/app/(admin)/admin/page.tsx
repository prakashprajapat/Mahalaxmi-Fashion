'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ordersApi, productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import type { Order, Product } from '@/types';

// The admin home.
//
// Four figures, then the orders split by where they have reached, then the
// four things the owner opens most, then the latest orders. Every number is a
// link: a count you cannot act on is decoration.
//
// The status cards carry the exact status names the Orders screen uses as its
// tabs, and open it already filtered to that one. Counting by one name and
// linking to another would put a number on screen that the next page disagrees
// with, which is worse than no number.
//
// Known cost, said out loud: this still pulls every order into the browser and
// counts them here. At today's volume that is fine; at a few thousand orders
// these counts belong in one server call, which needs a backend endpoint and is
// deliberately not bundled with this.

const MONEY = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const LOW_STOCK = ['Out of Stock', 'Limited Stock'];

const orderDate = (o: Order) => new Date(o.placedAt ?? o.createdAt ?? '');

// key = the Orders screen's own tab, so the count and the page always agree.
const STATUS_CARDS: { key: string; label: string; colour: string }[] = [
  { key: 'Pending',            label: 'Pending',      colour: '#c26a12' },
  { key: 'Ready for Shipping', label: 'Ready to Ship', colour: '#7a5cc4' },
  { key: 'Shipped',            label: 'Shipped',      colour: '#1d74a8' },
  { key: 'Transit',            label: 'In Transit',   colour: '#1d74a8' },
  { key: 'Delivered',          label: 'Delivered',    colour: '#2e7d32' },
  { key: 'Cancelled',          label: 'Cancelled',    colour: '#c0392b' },
];

const ACTIONS = [
  { href: '/admin/products/add', title: 'Add Product',     sub: 'Put a new product in the store',     primary: true },
  { href: '/admin/products',     title: 'Manage Products',  sub: 'Edit, price and stock' },
  { href: '/admin/orders',       title: 'Manage Orders',    sub: 'Packing, shipping and returns' },
  { href: '/admin/settings',     title: 'Hero Banners',     sub: 'The photos at the top of the homepage' },
];

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = getAdminToken() ?? '';
    // allSettled: a staff account may lack permission for one of these, and one
    // 403 must not blank the whole screen.
    Promise.allSettled([
      ordersApi.getAll(undefined, token),
      productsApi.getAll({ pageSize: 1000 }),
    ]).then(([o, p]) => {
      if (o.status !== 'fulfilled' || p.status !== 'fulfilled') setFailed(true);
      setOrders(o.status === 'fulfilled' ? o.value.orders : []);
      setProducts(p.status === 'fulfilled' ? (p.value.products as Product[]) : []);
    });
  }, []);

  const loading = orders === null || products === null;
  const os = orders ?? [];
  const ps = products ?? [];

  const delivered = os.filter(o => o.status === 'Delivered');
  const deliveredSales = delivered.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const stockAlerts = ps.filter(p => LOW_STOCK.includes(p.stock ?? '')).length;
  const drafts = ps.filter(p => p.stock === 'Draft').length;

  const kpis = [
    { label: 'Total Products', value: ps.length,       href: '/admin/products', link: 'Manage products' },
    { label: 'Total Orders',   value: os.length,       href: '/admin/orders',   link: 'View all orders' },
    { label: 'Delivered Sales', value: MONEY(deliveredSales), href: '/admin/orders?status=Delivered', link: 'View delivered', money: true },
    { label: 'Stock Alerts',   value: stockAlerts,     href: '/admin/stock',    link: 'Out of stock or limited' },
  ];

  const recent = [...os].sort((a, b) => +orderDate(b) - +orderDate(a)).slice(0, 5);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>Dashboard</h1>
        <p className="admin-page-sub">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {failed && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6c2', color: '#c0392b', borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem', fontSize: '.86rem', fontWeight: 600 }}>
          Some of this could not be loaded. The numbers below may be incomplete.
        </div>
      )}

      {/* The four figures */}
      <div className="adm-grid-4" style={{ display: 'grid', gap: '.75rem', marginBottom: '.85rem' }}>
        {kpis.map(k => (
          <Link key={k.label} href={k.href} style={cardBox}>
            <div style={{ fontSize: '.74rem', color: '#7d736d', fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: k.money ? '#2e7d32' : '#1e1b19', margin: '.3rem 0 .35rem', letterSpacing: '-.02em' }}>
              {loading ? '—' : k.value}
            </div>
            <div style={{ fontSize: '.72rem', color: '#722f37', fontWeight: 700 }}>{k.link} →</div>
          </Link>
        ))}
      </div>

      {/* Where the orders have reached */}
      <div className="adm-grid-6" style={{ display: 'grid', gap: '.6rem', marginBottom: '1.4rem' }}>
        {STATUS_CARDS.map(s => {
          const n = os.filter(o => o.status === s.key).length;
          return (
            <Link key={s.key} href={`/admin/orders?status=${encodeURIComponent(s.key)}`} style={{ ...cardBox, padding: '.7rem .75rem' }}>
              <div style={{ fontSize: '.64rem', fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: s.colour }}>
                {s.label}
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1e1b19', margin: '.25rem 0 .3rem' }}>
                {loading ? '—' : n}
              </div>
              <div style={{ fontSize: '.68rem', color: '#9a908a', fontWeight: 600 }}>Open →</div>
            </Link>
          );
        })}
      </div>

      {/* What gets opened most */}
      <h2 style={sectionH}>Store Management</h2>
      <p style={sectionP}>Products, orders and the homepage banners.</p>
      <div className="adm-grid-4" style={{ display: 'grid', gap: '.75rem', marginBottom: '1.4rem' }}>
        {ACTIONS.map(a => (
          <Link key={a.href} href={a.href}
            style={{
              ...cardBox,
              background: a.primary ? '#722f37' : '#fff',
              borderColor: a.primary ? '#722f37' : '#eae3e4',
            }}>
            <div style={{ fontSize: '.95rem', fontWeight: 800, color: a.primary ? '#fff' : '#1e1b19' }}>
              {a.primary ? '+ ' : ''}{a.title}
            </div>
            <div style={{ fontSize: '.75rem', marginTop: '.3rem', lineHeight: 1.45, color: a.primary ? 'rgba(255,255,255,.82)' : '#7d736d' }}>
              {a.sub}
            </div>
          </Link>
        ))}
      </div>

      {/* Anything held back */}
      {!loading && drafts > 0 && (
        <Link href="/admin/products/drafts"
          style={{ ...cardBox, display: 'block', marginBottom: '1.4rem', borderColor: '#f2dfa8', background: '#fff8e6' }}>
          <div style={{ fontSize: '.88rem', fontWeight: 800, color: '#8a6300' }}>
            {drafts} {drafts === 1 ? 'product is' : 'products are'} held as drafts
          </div>
          <div style={{ fontSize: '.76rem', color: '#8a6300', marginTop: '.25rem' }}>
            They are not on the website. Fix what the quality check reports and they go live. →
          </div>
        </Link>
      )}

      {/* Latest orders */}
      <div style={{ ...cardBox, padding: '.9rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '.2rem' }}>
          <h2 style={{ ...sectionH, margin: 0 }}>Recent Orders</h2>
          <Link href="/admin/orders" style={{ fontSize: '.76rem', fontWeight: 700, color: '#722f37' }}>View all →</Link>
        </div>
        <p style={{ ...sectionP, marginBottom: '.6rem' }}>The latest 5 orders.</p>

        {loading && <p style={{ color: '#9a908a', fontSize: '.88rem', margin: 0 }}>Loading…</p>}
        {!loading && recent.length === 0 && (
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

      <style>{`
        .adm-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .adm-grid-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
        @media (max-width: 1100px) {
          .adm-grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .adm-grid-6 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 520px) {
          .adm-grid-6 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>
    </div>
  );
}

const cardBox: React.CSSProperties = {
  background: '#fff', border: '1px solid #eae3e4', borderRadius: 13,
  padding: '.85rem .9rem', color: 'inherit',
};
const sectionH: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 800, color: '#1e1b19', margin: '0 0 .15rem',
};
const sectionP: React.CSSProperties = {
  fontSize: '.78rem', color: '#8a7f76', margin: '0 0 .7rem',
};
