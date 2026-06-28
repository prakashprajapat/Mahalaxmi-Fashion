'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';

interface Lead {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  createdAt: string;
  isRegistered: boolean;
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

type StatusFilter = 'all' | 'registered' | 'unregistered';

export default function PopupLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const limit = 50;

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`/api/popup-leads?page=${p}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLeads(data.leads || []);
      setTotal(data.total || 0);
      setPage(p);
    } catch { setLeads([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(1); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this lead?')) return;
    const token = getAdminToken();
    await fetch(`/api/popup-leads/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setLeads(l => l.filter(x => x.id !== id));
    setTotal(t => t - 1);
  };

  const exportCsv = () => {
    const rows = [['ID', 'Name', 'Email', 'Phone', 'Source', 'Status', 'Date']];
    leads.forEach(l => rows.push([
      String(l.id), l.name || '', l.email || '', l.phone || '', l.source,
      l.isRegistered ? 'Registered' : 'Unregistered',
      formatDate(l.createdAt),
    ]));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `popup-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const filtered = leads.filter(l => {
    const matchSearch = !search ||
      (l.email || '').includes(search.toLowerCase()) ||
      (l.phone || '').includes(search) ||
      (l.name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'registered' && l.isRegistered) ||
      (statusFilter === 'unregistered' && !l.isRegistered);
    return matchSearch && matchStatus;
  });

  const todayCount = leads.filter(l => isToday(l.createdAt)).length;
  const registeredCount = leads.filter(l => l.isRegistered).length;
  const unregisteredCount = leads.filter(l => !l.isRegistered).length;

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '.35rem .9rem',
    borderRadius: 20,
    border: active ? '2px solid #a7354d' : '1.5px solid #ddd',
    background: active ? '#a7354d' : '#fff',
    color: active ? '#fff' : '#555',
    fontWeight: active ? 700 : 400,
    fontSize: '.82rem',
    cursor: 'pointer',
  });

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Popup Leads</h1>
          <p className="admin-page-sub">Visitors who submitted the welcome popup form</p>
        </div>
        <button onClick={exportCsv} className="button secondary" style={{ fontSize: '.85rem' }}>
          ⬇️ Export CSV
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Leads', value: total, icon: '📋' },
          { label: 'Today', value: todayCount, icon: '📅' },
          { label: 'Registered', value: registeredCount, icon: '✅' },
          { label: 'Unregistered', value: unregisteredCount, icon: '⏳' },
          { label: 'With Email', value: leads.filter(l => l.email).length, icon: '📧' },
          { label: 'With WhatsApp', value: leads.filter(l => l.phone).length, icon: '💬' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#fff', border: '1px solid #eee', borderRadius: 12,
            padding: '1rem 1.25rem', textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.4rem' }}>{s.icon}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a7354d' }}>{s.value}</div>
            <div style={{ fontSize: '.74rem', color: '#888', marginTop: '.2rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search by name, email or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            height: 38, border: '1.5px solid #ddd', borderRadius: 8,
            padding: '0 1rem', fontSize: '.88rem', width: 260, boxSizing: 'border-box',
          }} />
        <button style={filterBtnStyle(statusFilter === 'all')} onClick={() => setStatusFilter('all')}>All</button>
        <button style={filterBtnStyle(statusFilter === 'registered')} onClick={() => setStatusFilter('registered')}>✅ Registered</button>
        <button style={filterBtnStyle(statusFilter === 'unregistered')} onClick={() => setStatusFilter('unregistered')}>⏳ Unregistered</button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>📭</div>
            <p>No leads found.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
              <thead>
                <tr style={{ background: '#fdf0f3', borderBottom: '2px solid #eee' }}>
                  {['#', 'Name', 'Email', 'WhatsApp', 'Status', 'Source', 'Date', 'Action'].map(h => (
                    <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => (
                  <tr key={l.id} style={{
                    borderBottom: '1px solid #f5f5f5',
                    background: isToday(l.createdAt) ? '#fffbf0' : i % 2 === 0 ? '#fff' : '#fafafa',
                  }}>
                    <td style={{ padding: '.65rem 1rem', color: '#aaa', fontSize: '.8rem' }}>{l.id}</td>
                    <td style={{ padding: '.65rem 1rem', fontWeight: 500 }}>
                      {l.name || <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ padding: '.65rem 1rem' }}>
                      {l.email ? (
                        <a href={`mailto:${l.email}`} style={{ color: '#a7354d', textDecoration: 'none', fontWeight: 500 }}>
                          {l.email}
                        </a>
                      ) : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ padding: '.65rem 1rem' }}>
                      {l.phone ? (
                        <a href={`https://wa.me/91${l.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                          style={{ color: '#25d366', fontWeight: 600, textDecoration: 'none' }}>
                          💬 {l.phone}
                        </a>
                      ) : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ padding: '.65rem 1rem' }}>
                      {l.isRegistered ? (
                        <span style={{
                          background: '#e8f5e9', color: '#2e7d32', borderRadius: 20,
                          padding: '3px 10px', fontSize: '.75rem', fontWeight: 700, whiteSpace: 'nowrap',
                        }}>✅ Regd</span>
                      ) : (
                        <span style={{
                          background: '#fff3e0', color: '#e65100', borderRadius: 20,
                          padding: '3px 10px', fontSize: '.75rem', fontWeight: 700, whiteSpace: 'nowrap',
                        }}>⏳ Unreg</span>
                      )}
                    </td>
                    <td style={{ padding: '.65rem 1rem', color: '#888', fontSize: '.8rem' }}>{l.source}</td>
                    <td style={{ padding: '.65rem 1rem', color: '#888', fontSize: '.8rem', whiteSpace: 'nowrap' }}>
                      {isToday(l.createdAt) && <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 4, padding: '1px 6px', fontSize: '.72rem', marginRight: '.4rem', fontWeight: 700 }}>TODAY</span>}
                      {formatDate(l.createdAt)}
                    </td>
                    <td style={{ padding: '.65rem 1rem' }}>
                      <button
                        onClick={() => handleDelete(l.id)}
                        style={{ background: 'none', border: '1px solid #ffcdd2', color: '#c0392b', borderRadius: 6, padding: '.3rem .65rem', fontSize: '.78rem', cursor: 'pointer' }}>
                        Delete
                      </button>
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
          <button disabled={page <= 1} onClick={() => load(page - 1)}
            className="button secondary" style={{ fontSize: '.85rem' }}>← Prev</button>
          <span style={{ padding: '.5rem 1rem', color: '#555', fontSize: '.85rem' }}>
            Page {page} / {Math.ceil(total / limit)}
          </span>
          <button disabled={page >= Math.ceil(total / limit)} onClick={() => load(page + 1)}
            className="button secondary" style={{ fontSize: '.85rem' }}>Next →</button>
        </div>
      )}
    </div>
  );
}
