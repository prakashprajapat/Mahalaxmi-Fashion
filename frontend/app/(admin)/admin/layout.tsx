'use client';
import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getAdminToken, adminLogout } from '@/lib/auth';
import { settingsApi } from '@/lib/api';

// All nav items (admin sees everything). Items with `heading` render as a
// non-clickable group label.
const ALL_NAV: { href?: string; label?: string; exact?: boolean; heading?: string }[] = [
  { href: '/admin',             label: '📊 Dashboard',       exact: true },

  { heading: 'Sales' },
  { href: '/admin/orders',      label: '📦 Orders' },
  { href: '/admin/risk',        label: '🛡️ Fraud & Risk' },

  { heading: 'Catalogue' },
  { href: '/admin/products',    label: '👗 Products' },
  { href: '/admin/products/add',label: '➕ Add / Edit Product' },
  { href: '/admin/stock',       label: '🔄 Stock Manager' },

  { heading: 'Customers' },
  { href: '/admin/customers',   label: '👥 Customers' },
  { href: '/admin/reviews',     label: '⭐ Reviews' },
  { href: '/admin/suppliers',   label: '🏪 Seller Applications' },

  { heading: 'Marketing' },
  { href: '/admin/meta-leads',  label: '📥 Meta Ad Leads' },
  { href: '/admin/google-ads', label: '💸 Google Ads' },
  { href: '/admin/meta-ads',   label: '📱 Meta Ads' },
  { href: '/admin/audiences',  label: '🎯 Audiences (Target List)' },
  { href: '/admin/popup-leads', label: '📋 Popup Leads' },
  { href: '/admin/campaigns',   label: '📣 Bulk Campaigns (SMS / WhatsApp)' },
  { href: '/admin/notifications', label: '🔔 Push Notifications' },
  { href: '/admin/influencers', label: '🌟 Influencer Marketing' },
  { href: '/admin/coupons',     label: '🎟️ Coupons & Discounts' },
  { href: '/admin/birthday',    label: '🎂 Birthday & Anniversary Offers' },
  { href: '/admin/seo',         label: '🔍 SEO Analysis' },

  { heading: 'Accounts' },
  { href: '/admin/reports',     label: '📈 Reports & GSTR-1' },
  { href: '/admin/reconcile',   label: '💰 Payment Reconcile' },

  { heading: 'Settings' },
  { href: '/admin/staff',       label: '👤 Staff Management' },
  { href: '/admin/settings',    label: '⚙️ Settings' },
];

// The four sections the phone tab bar shows. Everything else lives behind "More",
// which opens the same drawer the hamburger used to.
const MOBILE_TABS: { href: string; label: string; icon: string; exact?: boolean }[] = [
  { href: '/admin',          label: 'Dashboard', icon: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z', exact: true },
  { href: '/admin/orders',   label: 'Orders',    icon: 'M20.5 7.5 12 3 3.5 7.5v9L12 21l8.5-4.5v-9ZM3.7 7.6 12 12l8.3-4.4M12 12v9' },
  { href: '/admin/products', label: 'Products',  icon: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z' },
  { href: '/admin/stock',    label: 'Stock',     icon: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Zm9 4.5v9m0-9L3 7.5M12 12l9-4.5' },
];

// The admin-section key for a nav href: '/admin/products/add' -> 'products', '/admin' -> '' (dashboard, always allowed)
function sectionKey(href?: string): string {
  if (!href || href === '/admin') return '';
  return href.replace('/admin/', '').split('/')[0];
}

type NavItem = { href?: string; label?: string; exact?: boolean; heading?: string };
type NavGroup = { heading: string | null; items: NavItem[] };

// Turn the flat list into groups so each heading can be folded away. Anything
// before the first heading (the Dashboard link) becomes a headless group that
// always shows.
function groupNav(items: NavItem[]): NavGroup[] {
  const out: NavGroup[] = [];
  let current: NavGroup = { heading: null, items: [] };
  for (const it of items) {
    if (it.heading) {
      if (current.items.length) out.push(current);
      current = { heading: it.heading, items: [] };
    } else current.items.push(it);
  }
  if (current.items.length) out.push(current);
  return out;   // a heading with nothing under it is dropped on its own
}

function matches(item: NavItem, pathname: string): boolean {
  if (!item.href) return false;
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

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

// Decode the per-staff permission keys from the JWT "perms" claim.
function getTokenPerms(token: string): string[] {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return String(payload['perms'] || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  } catch { return []; }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isPublicAdminRoute = pathname === '/admin/login' || pathname.startsWith('/admin/login/');
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<'admin' | 'staff'>('admin');
  const [perms, setPerms] = useState<string[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [storeName, setStoreName] = useState('Mahalaxmi Fashion Hub');
  const [adminName, setAdminName] = useState('');
  // One group open at a time, so the sidebar stays short enough to read.
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    if (isPublicAdminRoute) { setAuthed(true); return; }
    const token = getAdminToken();
    if (!token) { router.replace('/admin/login'); return; }
    const isAdmin = getTokenRole(token) === 'admin';   // anything else = staff (least privilege)
    setRole(isAdmin ? 'admin' : 'staff');
    setPerms(isAdmin ? [] : getTokenPerms(token));
    setAuthed(true);
  }, [isPublicAdminRoute, router]);

  // Guard: a staff hitting a section they weren't granted is bounced to the dashboard.
  useEffect(() => {
    if (isPublicAdminRoute || !authed || role === 'admin') return;
    const key = sectionKey(pathname);
    if (key && !perms.includes(key)) router.replace('/admin');
  }, [pathname, authed, role, perms, isPublicAdminRoute, router]);

  // Whichever group the open page belongs to unfolds itself, so you always see
  // where you are without hunting for it.
  useEffect(() => {
    const g = groupNav(ALL_NAV).find(gr => gr.heading && gr.items.some(it => matches(it, pathname)));
    if (g?.heading) setOpenGroup(g.heading);
  }, [pathname]);

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

  // Filter nav: admin sees everything; staff sees Dashboard + only their granted
  // sections. A group heading is dropped when nothing under it survived, so a
  // staff member never sees "Accounts" with nothing beneath it.
  const navItems = (() => {
    if (role !== 'staff') return ALL_NAV;
    const visible = ALL_NAV.filter(n =>
      n.heading || (n.href && (sectionKey(n.href) === '' || perms.includes(sectionKey(n.href)))));
    // A heading earns its place only when a link follows it.
    return visible.filter((n, i) => !n.heading || Boolean(visible[i + 1] && !visible[i + 1].heading));
  })();

  const navGroups = groupNav(navItems);

  const isActive = (item: { href?: string; exact?: boolean }) =>
    !!item.href && (item.exact ? pathname === item.href : pathname.startsWith(item.href));

  const toggleGroup = (heading: string) =>
    setOpenGroup(open => (open === heading ? null : heading));

  const headingStyle = (light: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', padding: '.8rem 1.25rem .45rem',
    background: 'none', border: 'none', cursor: 'pointer',
    font: 'inherit', fontSize: '.68rem', fontWeight: 700,
    color: light ? 'rgba(255,255,255,.45)' : '#aaa',
    textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'left',
  });

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
          {navGroups.map((g, gi) => (
            <Fragment key={g.heading ?? 'top' + gi}>
              {g.heading && (
                <button type="button" onClick={() => toggleGroup(g.heading!)}
                  aria-expanded={openGroup === g.heading}
                  style={headingStyle(false)}>
                  <span>{g.heading}</span>
                  <span aria-hidden="true" style={{ fontSize: '.6rem', opacity: .8 }}>
                    {openGroup === g.heading ? '\u25BE' : '\u25B8'}
                  </span>
                </button>
              )}
              {(!g.heading || openGroup === g.heading) && g.items.map(item => (
                <Link key={item.href} href={item.href!}
                  className={isActive(item) ? 'active' : ''}>
                  {item.label}
                </Link>
              ))}
            </Fragment>
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
          <div className="admin-drawer" style={{ background: '#1a1a2e' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '0 1rem 1rem', borderBottom: '1px solid rgba(255,255,255,.1)', marginBottom: '1rem' }}>
              <strong style={{ color: '#fff', fontSize: '.95rem' }}>{storeName}</strong>
              <span style={{ display: 'block', color: '#aaa', fontSize: '.75rem' }}>Admin Panel</span>
            </div>
            {navGroups.map((g, gi) => (
              <Fragment key={'m' + (g.heading ?? 'top' + gi)}>
                {g.heading && (
                  <button type="button" onClick={() => toggleGroup(g.heading!)}
                    aria-expanded={openGroup === g.heading}
                    style={headingStyle(true)}>
                    <span>{g.heading}</span>
                    <span aria-hidden="true" style={{ fontSize: '.6rem', opacity: .8 }}>
                      {openGroup === g.heading ? '\u25BE' : '\u25B8'}
                    </span>
                  </button>
                )}
                {(!g.heading || openGroup === g.heading) && g.items.map(item => (
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
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Phone tab bar — the four everyday sections, plus More for the rest. */}
      <nav className="admin-tabbar" aria-label="Admin sections">
        {MOBILE_TABS
          .filter(t => role !== 'staff' || sectionKey(t.href) === '' || perms.includes(sectionKey(t.href)))
          .map(t => (
            <Link key={t.href} href={t.href}
              className={`admin-tab${isActive(t) ? ' active' : ''}`}>
              <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
                <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{t.label}</span>
            </Link>
          ))}
        <button type="button" className={`admin-tab${mobileNavOpen ? ' active' : ''}`}
          onClick={() => setMobileNavOpen(v => !v)} aria-label="More sections">
          <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>More</span>
        </button>
      </nav>

      {/* Content */}
      <div className="admin-content">
        {children}
      </div>
    </div>
  );
}
