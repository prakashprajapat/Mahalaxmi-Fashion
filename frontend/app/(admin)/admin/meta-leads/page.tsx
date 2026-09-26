'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { fetchAllPages, downloadCsv } from '@/lib/adminPaged';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';

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

function formatDate(raw: string) {
  const d = new Date(raw);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isToday(raw: string) {
  const d = new Date(raw);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

// A first message that says who you are and gives them somewhere to go. Edit it
// in WhatsApp before sending if the lead deserves something more specific.
function waLink(l: MetaLead) {
  const num = '91' + (l.phone || '').replace(/\D/g, '').slice(-10);
  const name = l.fullName?.trim() || 'there';
  const msg =
    `Hi ${name}! Thank you for your interest in Mahalaxmi Fashion Hub.\n\n` +
    `You can see our latest collection here: https://www.mahalaxmifashionhub.com\n\n` +
    `Reply here for sizes, offers or any help.`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

export default function MetaLeadsPage() {
  const [leads, setLeads] = useState<MetaLead[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('new');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchAllPages<MetaLead>(
        (p, l) => `/api/meta/leads?page=${p}&limit=${l}`,
        b => (b.leads as MetaLead[]) ?? [],
        getAdminToken() ?? '',
      );
      setLeads(r.rows); setTotal(r.total); setTruncated(r.truncated);
    } catch { setLeads([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: number) => {
    await fetch(`/api/meta/leads/${id}/read`, { method: 'POST', headers: { Authorization: `Bearer ${getAdminToken()}` } });
    setLeads(l => l.map(x => x.id === id ? { ...x, isRead: true } : x));
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this lead? It cannot be brought back.')) return;
    await fetch(`/api/meta/leads/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getAdminToken()}` } });
    setLeads(l => l.filter(x => x.id !== id));
    setTotal(t => t - 1);
  };

  const exportCsv = () => downloadCsv(
    [['ID', 'Name', 'Phone', 'Email', 'City', 'Campaign', 'Status', 'Date'],
     ...filtered.map(l => [
       String(l.id), l.fullName || '', l.phone || '', l.email || '', l.city || '',
       l.campaignName || '', l.isRegistered ? 'Customer' : 'Lead only', formatDate(l.createdAt),
     ])],
    `meta-leads-${new Date().toISOString().slice(0, 10)}.csv`,
  );

  // Meta's Custom Audience format: +91 phone, lowercase email. Upload it in Ads
  // Manager → Audiences → Create → Customer list, to show these people reels.
  const exportMetaAudience = () => downloadCsv(
    [['phone', 'email'],
     ...filtered.map(l => {
       const digits = (l.phone || '').replace(/\D/g, '').slice(-10);
       return [digits ? '+91' + digits : '', (l.email || '').trim().toLowerCase()];
     }).filter(([p, e]) => p || e)],
    `meta-custom-audience-${new Date().toISOString().slice(0, 10)}.csv`,
  );

  const filtered = leads.filter(l => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || (l.email || '').toLowerCase().includes(q)
      || (l.phone || '').includes(search.trim())
      || (l.fullName || '').toLowerCase().includes(q)
      || (l.city || '').toLowerCase().includes(q)
      || (l.campaignName || '').toLowerCase().includes(q);
    const matchTab = tab === 'all'
      || (tab === 'new' && !l.isRead)
      || (tab === 'customers' && l.isRegistered)
      || (tab === 'notyet' && !l.isRegistered);
    return matchSearch && matchTab;
  });

  const unread = leads.filter(l => !l.isRead).length;
  const customers = leads.filter(l => l.isRegistered).length;
  const todayCount = leads.filter(l => isToday(l.createdAt)).length;

  return (
    <div className="admin-page">
      <PageHeader
        title="Meta ad leads"
        sub="Leads from your Facebook and Instagram lead ads. They arrive here on their own, within seconds of being submitted."
        right={
          <>
            <button className="adm-btn" onClick={load}>Refresh</button>
            <button className="adm-btn" onClick={exportCsv} disabled={!filtered.length}>Export CSV ({filtered.length})</button>
            <button className="adm-btn adm-btn-primary" onClick={exportMetaAudience} disabled={!filtered.length}
                    title="Meta Custom Audience format — upload in Ads Manager to retarget these people">
              Custom Audience CSV
            </button>
          </>
        }
      />

      <StatGrid>
        <Stat label="Not looked at yet" value={unread} tone={unread > 0 ? 'red' : undefined}
              action={tab === 'new' ? undefined : 'Open these'} onClick={() => setTab('new')} />
        <Stat label="Came in today" value={todayCount} tone={todayCount > 0 ? 'green' : undefined} />
        <Stat label="Became customers" value={customers} tone={customers > 0 ? 'green' : undefined} />
        <Stat label="Leads in total" value={total} />
      </StatGrid>

      {truncated && (
        <Card style={{ background: '#fff9ec', borderColor: '#f0e0bd' }}>
          <p style={{ margin: 0, fontSize: '.83rem', color: '#7a5a18', lineHeight: 1.6 }}>
            Showing the {leads.length} newest of {total}. The search, the counts and both exports cover those
            {' '}{leads.length} — the older ones are still safe in the database, just not on this screen.
          </p>
        </Card>
      )}

      <Card>
        <input className="adm-input" style={{ width: '100%', maxWidth: '340px', marginBottom: '.65rem' }}
               placeholder="Search name, phone, email, city or campaign"
               value={search} onChange={e => setSearch(e.target.value)} />
        <Chips value={tab} onChange={setTab}
               items={[
                 { key: 'new', label: 'New', count: unread },
                 { key: 'notyet', label: 'No account yet', count: leads.length - customers },
                 { key: 'customers', label: 'Became customers', count: customers },
                 { key: 'all', label: 'All', count: leads.length },
               ]} />
      </Card>

      <Card title={`${filtered.length} ${filtered.length === 1 ? 'lead' : 'leads'}`}>
        {loading ? (
          <Empty>Loading leads…</Empty>
        ) : filtered.length === 0 ? (
          <Empty>
            {leads.length === 0
              ? 'No leads yet. Once a lead ad is live and connected, they appear here within seconds.'
              : tab === 'new'
                ? 'Nothing new — you have looked at every lead.'
                : 'Nothing matches that search.'}
          </Empty>
        ) : filtered.map(l => (
          <div key={l.id} className="adm-item" style={{ gridTemplateColumns: 'minmax(0,1fr) auto',
                                                        background: !l.isRead ? '#fdf7f8' : undefined }}>
            <div style={{ minWidth: 0 }}>
              <div className="adm-item-t" style={{ display: 'flex', gap: '.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {!l.isRead && <Pill tone="red">New</Pill>}
                {l.fullName || 'No name given'}
                {l.isRegistered ? <Pill tone="green">Customer</Pill> : <Pill tone="amber">Not signed up</Pill>}
              </div>
              <div className="adm-item-s">
                {l.phone || 'no phone'}{l.email ? ` · ${l.email}` : ''}
                {[l.city, l.state].filter(Boolean).length ? ` · ${[l.city, l.state].filter(Boolean).join(', ')}` : ''}
              </div>
              <div className="adm-item-s">
                {l.campaignName || 'no campaign name'}{l.formName ? ` · ${l.formName}` : ''} · {formatDate(l.createdAt)}
              </div>
              <div className="adm-actions" style={{ marginTop: '.4rem', flexWrap: 'wrap' }}>
                {l.phone && (
                  <a href={waLink(l)} target="_blank" rel="noopener noreferrer" style={{ color: '#128C7E' }}>
                    WhatsApp them
                  </a>
                )}
                {l.email && <a href={`mailto:${l.email}`}>Email</a>}
                {!l.isRead && <button onClick={() => markRead(l.id)} style={{ color: '#2e7d32' }}>Mark as seen</button>}
                <button onClick={() => handleDelete(l.id)} style={{ color: '#c0392b' }}>Delete</button>
              </div>
            </div>
            <div />
          </div>
        ))}
      </Card>
    </div>
  );
}
