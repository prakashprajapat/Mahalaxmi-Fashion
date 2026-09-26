'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { fetchAllPages, downloadCsv } from '@/lib/adminPaged';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';

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

export default function PopupLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchAllPages<Lead>(
        (p, l) => `/api/popup-leads?page=${p}&limit=${l}`,
        b => (b.leads as Lead[]) ?? [],
        getAdminToken() ?? '',
      );
      setLeads(r.rows); setTotal(r.total); setTruncated(r.truncated);
    } catch { setLeads([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this lead? It cannot be brought back.')) return;
    await fetch(`/api/popup-leads/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getAdminToken()}` },
    });
    setLeads(l => l.filter(x => x.id !== id));
    setTotal(t => t - 1);
  };

  const exportCsv = () => {
    downloadCsv(
      [['ID', 'Name', 'Email', 'Phone', 'Source', 'Status', 'Date'],
       ...filtered.map(l => [
         String(l.id), l.name || '', l.email || '', l.phone || '', l.source,
         l.isRegistered ? 'Registered' : 'Not registered', formatDate(l.createdAt),
       ])],
      `popup-leads-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  const filtered = leads.filter(l => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || (l.email || '').toLowerCase().includes(q)
      || (l.phone || '').includes(search.trim())
      || (l.name || '').toLowerCase().includes(q);
    const matchTab = tab === 'all'
      || (tab === 'registered' && l.isRegistered)
      || (tab === 'not' && !l.isRegistered);
    return matchSearch && matchTab;
  });

  const registered = leads.filter(l => l.isRegistered).length;
  const notYet = leads.length - registered;
  const todayCount = leads.filter(l => isToday(l.createdAt)).length;
  const reachable = leads.filter(l => l.phone).length;

  return (
    <div className="admin-page">
      <PageHeader
        title="Popup leads"
        sub="People who left their details in the welcome popup. Some of them never went on to make an account."
        right={
          <>
            <button className="adm-btn" onClick={load}>Refresh</button>
            <button className="adm-btn adm-btn-primary" onClick={exportCsv} disabled={!filtered.length}>
              Export CSV ({filtered.length})
            </button>
          </>
        }
      />

      <StatGrid>
        <Stat label="Leads" value={total} />
        <Stat label="Came in today" value={todayCount} tone={todayCount > 0 ? 'green' : undefined} />
        <Stat label="Never made an account" value={notYet} tone={notYet > 0 ? 'red' : undefined}
              action={tab === 'not' ? undefined : 'These are the ones to chase'}
              onClick={() => setTab('not')} />
        <Stat label="Reachable on WhatsApp" value={reachable} />
      </StatGrid>

      {truncated && (
        <Card style={{ background: '#fff9ec', borderColor: '#f0e0bd' }}>
          <p style={{ margin: 0, fontSize: '.83rem', color: '#7a5a18', lineHeight: 1.6 }}>
            Showing the {leads.length} newest of {total}. The search, the counts and the export all cover
            those {leads.length} — the older ones are still safe in the database, they are just not on this
            screen.
          </p>
        </Card>
      )}

      <Card>
        <input className="adm-input" style={{ width: '100%', maxWidth: '320px', marginBottom: '.65rem' }}
               placeholder="Search name, email or phone"
               value={search} onChange={e => setSearch(e.target.value)} />
        <Chips value={tab} onChange={setTab}
               items={[
                 { key: 'all', label: 'All', count: leads.length },
                 { key: 'not', label: 'No account yet', count: notYet },
                 { key: 'registered', label: 'Became a customer', count: registered },
               ]} />
      </Card>

      <Card title={`${filtered.length} ${filtered.length === 1 ? 'lead' : 'leads'}`}>
        {loading ? (
          <Empty>Loading leads…</Empty>
        ) : filtered.length === 0 ? (
          <Empty>
            {leads.length === 0
              ? 'Nobody has filled in the popup yet. Leads land here the moment they do.'
              : 'Nothing matches that search.'}
          </Empty>
        ) : filtered.map(l => {
          const ph = (l.phone || '').replace(/\D/g, '');
          return (
            <div key={l.id} className="adm-item" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
              <div style={{ minWidth: 0 }}>
                <div className="adm-item-t" style={{ display: 'flex', gap: '.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {l.name || 'No name given'}
                  {l.isRegistered ? <Pill tone="green">Customer</Pill> : <Pill tone="amber">No account</Pill>}
                  {isToday(l.createdAt) && <Pill tone="grey">Today</Pill>}
                </div>
                <div className="adm-item-s">
                  {l.email || 'no email'}{l.phone ? ` · ${l.phone}` : ''} · from {l.source}
                </div>
                <div className="adm-item-s">{formatDate(l.createdAt)}</div>
                <div className="adm-actions" style={{ marginTop: '.35rem', flexWrap: 'wrap' }}>
                  {ph && <a href={`https://wa.me/91${ph.slice(-10)}`} target="_blank" rel="noopener noreferrer" style={{ color: '#128C7E' }}>WhatsApp</a>}
                  {l.email && <a href={`mailto:${l.email}`}>Email</a>}
                  <button onClick={() => handleDelete(l.id)} style={{ color: '#c0392b' }}>Delete</button>
                </div>
              </div>
              <div />
            </div>
          );
        })}
      </Card>
    </div>
  );
}
