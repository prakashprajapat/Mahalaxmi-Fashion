'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';

interface MetaLead {
  id: number;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  campaignName: string | null;
  formName: string | null;
  isRead: boolean;
  isRegistered: boolean;
  createdAt: string;
}

// Official WhatsApp glyph (white by default).
function WaIcon({ size = 15, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884M20.463 3.488A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
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

export default function MetaLeadsPage() {
  const [leads, setLeads] = useState<MetaLead[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const limit = 50;

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`/api/meta/leads?page=${p}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLeads(data.leads || []);
      setTotal(data.total || 0);
      setUnread(data.unread || 0);
      setPage(p);
    } catch { setLeads([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(1); }, []);

  const markRead = async (id: number) => {
    const token = getAdminToken();
    await fetch(`/api/meta/leads/${id}/read`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    setLeads(l => l.map(x => x.id === id ? { ...x, isRead: true } : x));
    setUnread(u => Math.max(0, u - 1));
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this lead?')) return;
    const token = getAdminToken();
    await fetch(`/api/meta/leads/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setLeads(l => l.filter(x => x.id !== id));
    setTotal(t => t - 1);
  };

  const exportCsv = () => {
    const rows = [['ID', 'Name', 'Phone', 'Email', 'City', 'Campaign', 'Status', 'Date']];
    leads.forEach(l => rows.push([
      String(l.id), l.fullName || '', l.phone || '', l.email || '', l.city || '',
      l.campaignName || '', l.isRegistered ? 'Registered' : 'Unregistered', formatDate(l.createdAt),
    ]));
    downloadCsv(rows, `meta-leads-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // Meta Custom Audience upload format: phone in +91XXXXXXXXXX, email lowercased.
  // Upload this file in Meta Ads Manager → Audiences → Create Custom Audience → Customer list.
  const exportMetaAudience = () => {
    const rows = [['phone', 'email']];
    leads.forEach(l => {
      const digits = (l.phone || '').replace(/\D/g, '').slice(-10);
      const phone = digits ? '+91' + digits : '';
      const email = (l.email || '').trim().toLowerCase();
      if (phone || email) rows.push([phone, email]);
    });
    downloadCsv(rows, `meta-custom-audience-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const downloadCsv = (rows: string[][], name: string) => {
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };

  // WhatsApp link with a ready-to-send message + store link (edit the message as you like).
  const waLink = (l: MetaLead) => {
    const num = '91' + (l.phone || '').replace(/\D/g, '').slice(-10);
    const name = l.fullName?.trim() || 'there';
    const msg =
      `Hi ${name}! 👋 Thank you for your interest in Mahalaxmi Fashion Hub.\n\n` +
      `Explore our latest collection here: https://mahalaxmifashionhub.com 🛍️\n\n` +
      `Reply here for offers, sizes or any help!`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  };

  const filtered = leads.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (l.email || '').toLowerCase().includes(q)
      || (l.phone || '').includes(search)
      || (l.fullName || '').toLowerCase().includes(q)
      || (l.city || '').toLowerCase().includes(q)
      || (l.campaignName || '').toLowerCase().includes(q);
  });

  const todayCount = leads.filter(l => isToday(l.createdAt)).length;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Meta Ad Leads</h1>
          <p className="admin-page-sub">Leads submitted through your Facebook &amp; Instagram Lead Ads — arrive here automatically</p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button onClick={exportCsv} className="button secondary" style={{ fontSize: '.85rem' }}>
            ⬇️ Export CSV
          </button>
          <button onClick={exportMetaAudience} className="button secondary" style={{ fontSize: '.85rem' }}
            title="Download in Meta Custom Audience format (+91 phone, email) — upload in Meta Ads Manager to retarget with reels">
            📣 Meta Custom Audience CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Leads', value: total, icon: '📥' },
          { label: 'Unread', value: unread, icon: '🔴' },
          { label: 'Today', value: todayCount, icon: '📅' },
          { label: 'With Phone', value: leads.filter(l => l.phone).length, icon: '📞' },
          { label: 'With Email', value: leads.filter(l => l.email).length, icon: '📧' },
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
          placeholder="Search by name, phone, email, city or campaign…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ height: 38, border: '1.5px solid #ddd', borderRadius: 8, padding: '0 1rem', fontSize: '.88rem', width: 300, boxSizing: 'border-box' }} />
        <button onClick={() => load(page)} className="button secondary" style={{ fontSize: '.85rem' }}>🔄 Refresh</button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>📭</div>
            <p>No Meta leads yet.</p>
            <p style={{ fontSize: '.8rem', color: '#bbb' }}>Once your Lead Ad is live and connected, new leads will appear here within seconds.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
              <thead>
                <tr style={{ background: '#fdf0f3', borderBottom: '2px solid #eee' }}>
                  {['#', 'Name', 'Phone', 'Email', 'City', 'Campaign', 'Status', 'Date', 'Action'].map(h => (
                    <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => (
                  <tr key={l.id} style={{
                    borderBottom: '1px solid #f5f5f5',
                    background: !l.isRead ? '#fff8f9' : isToday(l.createdAt) ? '#fffbf0' : i % 2 === 0 ? '#fff' : '#fafafa',
                  }}>
                    <td style={{ padding: '.65rem 1rem', color: '#aaa', fontSize: '.8rem' }}>{l.id}</td>
                    <td style={{ padding: '.65rem 1rem', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {!l.isRead && <span style={{ background: '#e53935', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: '.66rem', marginRight: '.4rem', fontWeight: 700 }}>NEW</span>}
                      {l.fullName || <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ padding: '.65rem 1rem' }}>
                      {l.phone ? (
                        <a href={waLink(l)} target="_blank" rel="noopener noreferrer"
                          style={{ color: '#25d366', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}><WaIcon size={14} color="#25d366" /> {l.phone}</a>
                      ) : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ padding: '.65rem 1rem' }}>
                      {l.email ? (
                        <a href={`mailto:${l.email}`} style={{ color: '#a7354d', textDecoration: 'none', fontWeight: 500 }}>{l.email}</a>
                      ) : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ padding: '.65rem 1rem', color: '#555' }}>{l.city || <span style={{ color: '#ccc' }}>—</span>}</td>
                    <td style={{ padding: '.65rem 1rem', color: '#888', fontSize: '.8rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.campaignName || ''}>
                      {l.campaignName || <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ padding: '.65rem 1rem' }}>
                      {l.isRegistered ? (
                        <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 20, padding: '3px 10px', fontSize: '.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>✅ Regd</span>
                      ) : (
                        <span style={{ background: '#fff3e0', color: '#e65100', borderRadius: 20, padding: '3px 10px', fontSize: '.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>⏳ New</span>
                      )}
                    </td>
                    <td style={{ padding: '.65rem 1rem', color: '#888', fontSize: '.8rem', whiteSpace: 'nowrap' }}>
                      {isToday(l.createdAt) && <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 4, padding: '1px 6px', fontSize: '.72rem', marginRight: '.4rem', fontWeight: 700 }}>TODAY</span>}
                      {formatDate(l.createdAt)}
                    </td>
                    <td style={{ padding: '.65rem 1rem', whiteSpace: 'nowrap' }}>
                      {l.phone && (
                        <a href={waLink(l)} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', background: '#25d366', color: '#fff', border: 'none', borderRadius: 6, padding: '.3rem .6rem', fontSize: '.78rem', cursor: 'pointer', marginRight: '.35rem', textDecoration: 'none', fontWeight: 600 }}><WaIcon size={14} /> WhatsApp</a>
                      )}
                      {!l.isRead && (
                        <button onClick={() => markRead(l.id)}
                          style={{ background: 'none', border: '1px solid #c8e6c9', color: '#2e7d32', borderRadius: 6, padding: '.3rem .55rem', fontSize: '.78rem', cursor: 'pointer', marginRight: '.35rem' }}>✓ Read</button>
                      )}
                      <button onClick={() => handleDelete(l.id)}
                        style={{ background: 'none', border: '1px solid #ffcdd2', color: '#c0392b', borderRadius: 6, padding: '.3rem .65rem', fontSize: '.78rem', cursor: 'pointer' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', justifyContent: 'center' }}>
          <button disabled={page <= 1} onClick={() => load(page - 1)} className="button secondary" style={{ fontSize: '.85rem' }}>← Prev</button>
          <span style={{ padding: '.5rem 1rem', color: '#555', fontSize: '.85rem' }}>Page {page} / {Math.ceil(total / limit)}</span>
          <button disabled={page >= Math.ceil(total / limit)} onClick={() => load(page + 1)} className="button secondary" style={{ fontSize: '.85rem' }}>Next →</button>
        </div>
      )}
    </div>
  );
}
