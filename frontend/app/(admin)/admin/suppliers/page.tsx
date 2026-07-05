'use client';
import { useEffect, useState, Fragment } from 'react';
import { getAdminToken } from '@/lib/auth';

interface SupplierApplication {
  id: number;
  firmName: string;
  contactName: string;
  phone: string;
  email: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  businessType: string | null;
  categories: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  website: string | null;
  yearsInBusiness: string | null;
  message: string | null;
  status: string | null;
  createdAt: string;
}

function formatDate(raw: string) {
  const d = new Date(raw);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isToday(raw: string) {
  const d = new Date(raw);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export default function SuppliersPage() {
  const [apps, setApps] = useState<SupplierApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const res = await fetch('/api/suppliers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setApps(data.applications || []);
    } catch { setApps([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const exportCsv = () => {
    const rows = [['ID', 'Firm', 'Contact', 'Phone', 'Email', 'GST', 'PAN', 'Business Type', 'Categories', 'City', 'State', 'Pincode', 'Website', 'Years', 'Message', 'Status', 'Date']];
    apps.forEach(a => rows.push([
      String(a.id), a.firmName, a.contactName, a.phone, a.email || '', a.gstNumber || '', a.panNumber || '',
      a.businessType || '', a.categories || '', a.city || '', a.state || '', a.pincode || '',
      a.website || '', a.yearsInBusiness || '', (a.message || '').replace(/\n/g, ' '), a.status || '', formatDate(a.createdAt),
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `seller-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    el.click();
  };

  const filtered = apps.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (a.firmName || '').toLowerCase().includes(q)
      || (a.contactName || '').toLowerCase().includes(q)
      || (a.phone || '').includes(search)
      || (a.email || '').toLowerCase().includes(q)
      || (a.city || '').toLowerCase().includes(q);
  });

  const todayCount = apps.filter(a => isToday(a.createdAt)).length;
  const withGst = apps.filter(a => a.gstNumber).length;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Seller Applications</h1>
          <p className="admin-page-sub">People who applied via the “Become a Seller” form</p>
        </div>
        <button onClick={exportCsv} className="button secondary" style={{ fontSize: '.85rem' }}>
          ⬇️ Export CSV
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Applications', value: apps.length, icon: '🏪' },
          { label: 'Today', value: todayCount, icon: '📅' },
          { label: 'With GST', value: withGst, icon: '🧾' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1rem 1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem' }}>{s.icon}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a7354d' }}>{s.value}</div>
            <div style={{ fontSize: '.74rem', color: '#888', marginTop: '.2rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search firm, contact, phone, email, city…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ height: 38, border: '1.5px solid #ddd', borderRadius: 8, padding: '0 1rem', fontSize: '.88rem', width: 300, boxSizing: 'border-box' }} />
        <button onClick={load} className="button secondary" style={{ fontSize: '.82rem' }}>🔄 Refresh</button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>📭</div>
            <p>No seller applications yet.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
              <thead>
                <tr style={{ background: '#fdf0f3', borderBottom: '2px solid #eee' }}>
                  {['#', 'Firm', 'Contact', 'WhatsApp', 'Email', 'GST', 'Categories', 'City / State', 'Date', ''].map(h => (
                    <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => (
                  <Fragment key={a.id}>
                    <tr style={{
                      borderBottom: expanded === a.id ? 'none' : '1px solid #f5f5f5',
                      background: isToday(a.createdAt) ? '#fffbf0' : i % 2 === 0 ? '#fff' : '#fafafa',
                    }}>
                      <td style={{ padding: '.65rem 1rem', color: '#aaa', fontSize: '.8rem' }}>{a.id}</td>
                      <td style={{ padding: '.65rem 1rem', fontWeight: 600 }}>{a.firmName}</td>
                      <td style={{ padding: '.65rem 1rem' }}>{a.contactName}</td>
                      <td style={{ padding: '.65rem 1rem', whiteSpace: 'nowrap' }}>
                        <a href={`https://wa.me/91${(a.phone || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                          style={{ color: '#25d366', fontWeight: 600, textDecoration: 'none', marginRight: '.5rem' }}>💬</a>
                        <a href={`tel:+91${(a.phone || '').replace(/\D/g, '')}`} style={{ color: '#a7354d', textDecoration: 'none', fontWeight: 500 }}>{a.phone}</a>
                      </td>
                      <td style={{ padding: '.65rem 1rem' }}>
                        {a.email ? <a href={`mailto:${a.email}`} style={{ color: '#a7354d', textDecoration: 'none' }}>{a.email}</a> : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ padding: '.65rem 1rem', fontSize: '.8rem' }}>{a.gstNumber || <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ padding: '.65rem 1rem', fontSize: '.82rem' }}>{a.categories || <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ padding: '.65rem 1rem', fontSize: '.82rem', whiteSpace: 'nowrap' }}>
                        {[a.city, a.state].filter(Boolean).join(', ') || <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ padding: '.65rem 1rem', color: '#888', fontSize: '.8rem', whiteSpace: 'nowrap' }}>
                        {isToday(a.createdAt) && <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 4, padding: '1px 6px', fontSize: '.72rem', marginRight: '.4rem', fontWeight: 700 }}>TODAY</span>}
                        {formatDate(a.createdAt)}
                      </td>
                      <td style={{ padding: '.65rem 1rem' }}>
                        <button onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                          style={{ background: 'none', border: '1px solid #ddd', color: '#a7354d', borderRadius: 6, padding: '.3rem .65rem', fontSize: '.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {expanded === a.id ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {expanded === a.id && (
                      <tr style={{ borderBottom: '1px solid #f5f5f5', background: '#fbfbfb' }}>
                        <td colSpan={10} style={{ padding: '1rem 1.5rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.75rem 1.5rem', fontSize: '.85rem' }}>
                            {[
                              ['PAN', a.panNumber],
                              ['Business Type', a.businessType],
                              ['Years in Business', a.yearsInBusiness],
                              ['Pincode', a.pincode],
                              ['Website', a.website],
                              ['Address', a.address],
                              ['Status', a.status],
                              ['Message', a.message],
                            ].map(([label, val]) => (
                              <div key={label as string}>
                                <div style={{ fontSize: '.72rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.15rem' }}>{label}</div>
                                <div style={{ color: '#333' }}>{val ? String(val) : '—'}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
