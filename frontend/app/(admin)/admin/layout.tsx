'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getAdminToken, adminLogout } from '@/lib/auth';
import { settingsApi } from '@/lib/api';

// All nav items (admin sees everything). Items with `heading` render as a
// non-clickable group label.
const ALL_NAV: { href?: string; label?: string; exact?: boolean; heading?: string }[] = [
  { href: '/admin',             label: '📊 Dashboard',       exact: true },
  { href: '/admin/orders',      label: '📦 Orders' },
  { heading: 'Inventory' },
  { href: '/admin/products',    label: '👗 Products' },
  { href: '/admin/products/add',label: '➕ Add / Edit Product' },
  { href: '/admin/stock',       label: '🔄 Stock Manager' },
  { href: '/admin/customers',   label: '👥 Customers' },
  { href: '/admin/reports',     label: '📈 Reports & GSTR-1' },
  { href: '/admin/reconcile',   label: '💰 Payment Reconcile' },
  { href: '/admin/reviews',     label: '⭐ Reviews' },
  { href: '/admin/staff',       label: '👤 Staff Management' },
  { href: '/admin/birthday',    label: '🎂 Birthday & Anniversary Offers' },
  { href: '/admin/coupons',     label: '🎟️ Coupons & Discounts' },
  { href: '/admin/influencers', label: '🌟 Influencer Marketing' },
  { href: '/admin/popup-leads', label: '📋 Popup Leads' },
  { href: '/admin/suppliers',   label: '🏪 Seller Applications' },
  { href: '/admin/seo',         label: '🔍 SEO Analysis' },
  { href: '/admin/settings',    label: '⚙️ Settings' },
];

// Staff sees only these
const STAFF_NAV_HREFS = ['/admin/products', '/admin/products/add', '/admin/orders', '/admin/stock'];

// Decode JWT payload to get role (no library needed)
function getTokenRole(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // ASP.NET Core stores role under this claim key
    return (
      payload['role'] ||
      payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
      'admin'
    );
  } catch { return 'staff'; }  // SEC-7: default to least privilege
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isPublicAdminRoute = pathname === '/admin/login' || pathname.startsWith('/admin/login/');
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<'admin' | 'staff'>('admin');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [storeName, setStoreName] = useState('Mahalaxmi Fashion Hub');
  const [adminName, setAdminName] = useState('');

  useEffect(() => {
    if (isPublicAdminRoute) { setAuthed(true); return; }
    const token = getAdminToken();
    if (!token) { router.replace('/admin/login'); return; }
    setRole(getTokenRole(token) === 'staff' ? 'staff' : 'admin');
    setAuthed(true);
  }, [isPublicAdminRoute, router]);

  useEffect(() => {
    if (isPublicAdminRoute) return;
    settingsApi.getAll().then(r => {
      const s = r.settings ?? {};
      if (s.storeName?.trim()) setStoreName(s.storeName.trim());
      if (s.adminDisplayName?.trim()) setAdminName(s.adminDisplayName.trim());
    }).catch(() => {});
  }, [isPublicAdminRoute]);

  if (isPublicAdminRoute) return <>{children}</>;

  if (!authed) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <p style={{ color: '#999' }}>Checking authentication…</p>
    </div>
  );

  // Filter nav based on role
  const navItems = role === 'staff'
    ? ALL_NAV.filter(n => n.href && STAFF_NAV_HREFS.includes(n.href))
    : ALL_NAV;

  const isActive = (item: { href?: string; exact?: boolean }) =>
    !!item.href && (item.exact ? pathname === item.href : pathname.startsWith(item.href));

  const currentLabel = ALL_NAV.find(n => isActive(n))?.label?.replace(/^[^\s]+\s/, '') || 'Admin Panel';

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <strong>{storeName}</strong>
          <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            {role === 'staff' ? 'Staff Workspace' : 'Admin Panel'}
            <span style={{ fontSize: '.65rem', background: role === 'staff' ? '#e67e22' : '#a7354d', color: '#fff', padding: '.1rem .35rem', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>
              {role}
            </span>
          </span>
        </div>
        <nav className="admin-nav">
          {navItems.map((item, i) => (
            item.heading ? (
              <div key={'h' + i} style={{ padding: '.9rem 1.25rem .3rem', fontSize: '.68rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                {item.heading}
              </div>
            ) : (
              <Link key={item.href} href={item.href!}
                className={isActive(item) ? 'active' : ''}>
                {item.label}
              </Link>
            )
          ))}
        </nav>
        <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,.1)', marginTop: 'auto' }}>
          <Link href="/" style={{ color: '#aaa', fontSize: '.85rem', display: 'block', marginBottom: '.5rem' }}>
            🌐 View Website
          </Link>
          <button
            onClick={() => { adminLogout(); router.push('/admin/login'); }}
            style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '.85rem', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Top bar */}
      <div className="admin-topbar">
        <button
          onClick={() => setMobileNavOpen(v => !v)}
          style={{ display: 'none', background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#333', marginRight: '.5rem' }}
          className="admin-mobile-menu-btn"
          aria-label="Toggle menu">
          ☰
        </button>
        <h1>{currentLabel}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '.85rem', color: '#666' }}>
          {adminName && <span style={{ fontWeight: 600, color: '#333' }}>👋 {adminName}</span>}
          <Link href="/" style={{ color: '#a7354d', fontWeight: 600, fontSize: '.82rem' }}>🌐 Store</Link>
          <button onClick={() => { adminLogout(); router.push('/admin/login'); }}
            style={{ background: 'none', border: 'none', color: '#a7354d', cursor: 'pointer', fontWeight: 600, fontSize: '.85rem' }}>
            Logout
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      {mobileNavOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.5)' }}
          onClick={() => setMobileNavOpen(false)}>
          <div style={{ width: '240px', height: '100%', background: '#1a1a2e', padding: '1.5rem 0' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '0 1rem 1rem', borderBottom: '1px solid rgba(255,255,255,.1)', marginBottom: '1rem' }}>
              <strong style={{ color: '#fff', fontSize: '.95rem' }}>{storeName}</strong>
              <span style={{ display: 'block', color: '#aaa', fontSize: '.75rem' }}>Admin Panel</span>
            </div>
            {navItems.map((item, i) => (
              item.heading ? (
                <div key={'mh' + i} style={{ padding: '.8rem 1.25rem .3rem', fontSize: '.68rem', fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  {item.heading}
                </div>
              ) : (
                <Link key={item.href} href={item.href!}
                  onClick={() => setMobileNavOpen(false)}
                  style={{
                    display: 'block', padding: '.7rem 1.25rem', fontSize: '.9rem',
                    color: isActive(item) ? '#fff' : '#aaa',
                    background: isActive(item) ? 'rgba(167,53,77,.4)' : 'transparent',
                    textDecoration: 'none',
                  }}>
                  {item.label}
                </Link>
              )
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="admin-content">
        {children}
      </div>
    </div>
  );
}
