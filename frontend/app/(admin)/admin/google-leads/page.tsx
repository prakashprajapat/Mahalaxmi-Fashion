'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';

interface Lead {
  id: number;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  postalCode: string | null;
  campaignName: string | null;
  assetName: string | null;
  isRead: boolean;
  submittedAt: string;
  isRegistered: boolean;
}

const auth = () => ({ Authorization: `Bearer ${getAdminToken()}` });

export default function GoogleLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/googleleads?limit=200', { headers: auth() });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.message || 'Could not load the leads.'); return; }
      setLeads(d.leads ?? []);
      setTotal(d.total ?? 0);
      setLastSync(d.lastSync ?? null);
    } catch { setError('Could not reach the server.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/googleleads/sync', { method: 'POST', headers: auth() });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.message || 'The sync did not go through.'); return; }
      setNotice(d.added > 0
        ? `${d.added} new lead${d.added === 1 ? '' : 's'} brought in.`
        : 'Nothing new — Google has no leads that are not already saved here.');
      await load();
    } catch { setError('Could not reach the server.'); }
    finally { setSyncing(false); }
  };

  const markRead = async (id: number) => {
    await fetch(`/api/googleleads/${id}/read`, { method: 'POST', headers: auth() }).catch(() => {});
    setLeads(list => list.map(l => l.id === id ? { ...l, isRead: true } : l));
  };

  const download = () => {
    fetch('/api/audiences/export?source=googleleads', { headers: auth() })
      .then(async r => {
        if (!r.ok) throw new Error();
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = `google-leads-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setError('Could not download the list.'));
  };

  const unread = leads.filter(l => !l.isRead).length;
  const customers = leads.filter(l => l.isRegistered).length;

  const filtered = leads.filter(l => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || (l.fullName || '').toLowerCase().includes(q)
      || (l.phone || '').includes(search.trim())
      || (l.email || '').toLowerCase().includes(q)
      || (l.city || '').toLowerCase().includes(q)
      || (l.campaignName || '').toLowerCase().includes(q);
    const matchTab = tab === 'all'
      || (tab === 'new' && !l.isRead)
      || (tab === 'customers' && l.isRegistered);
    return matchSearch && matchTab;
  });

  return (
    <div className="admin-page">
      <PageHeader
        title="Google ad leads"
        sub="People who filled in a lead form on your Google ads. Google throws this data away after about 60 days — once it is here, it stays."
        right={
          <>
            <button className="adm-btn adm-btn-primary" onClick={sync} disabled={syncing}>
              {syncing ? 'Asking Google…' : 'Sync from Google'}
            </button>
            <button className="adm-btn" onClick={download} disabled={total === 0}>Download CSV</button>
          </>
        }
      />

      {notice && (
        <Card style={{ background: '#f2faf3', borderColor: '#cbe6cf' }}>
          <p style={{ margin: 0, fontSize: '.86rem', color: '#2e7d32', fontWeight: 600 }}>{notice}</p>
        </Card>
      )}
      {error && (
        <Card style={{ background: '#fdf3f2', borderColor: '#f0cdc9' }}>
          <p style={{ margin: 0, fontSize: '.86rem', color: '#c0392b', fontWeight: 600 }}>{error}</p>
        </Card>
      )}

      <StatGrid>
        <Stat label="Not looked at yet" value={unread} tone={unread > 0 ? 'red' : undefined}
              action={tab === 'new' ? undefined : 'Open these'} onClick={() => setTab('new')} />
        <Stat label="Leads saved here" value={total} />
        <Stat label="Already customers" value={customers} tone={customers > 0 ? 'green' : undefined} />
        <Stat label="Last sync"
              value={lastSync
                ? new Date(lastSync).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : 'Never'}
              action={lastSync ? undefined : 'Press Sync to check'} />
      </StatGrid>

      {leads.length > 0 && (
        <Card>
          <input className="adm-input" style={{ width: '100%', maxWidth: '340px', marginBottom: '.65rem' }}
                 placeholder="Search name, phone, email, city or campaign"
                 value={search} onChange={e => setSearch(e.target.value)} />
          <Chips value={tab} onChange={setTab}
                 items={[
                   { key: 'all', label: 'All', count: leads.length },
                   { key: 'new', label: 'New', count: unread },
                   { key: 'customers', label: 'Already customers', count: customers },
                 ]} />
        </Card>
      )}

      <Card title={leads.length ? `${filtered.length} ${filtered.length === 1 ? 'lead' : 'leads'}` : 'No leads yet'}>
        {loading ? (
          <Empty>Loading…</Empty>
        ) : leads.length === 0 ? (
          <Empty>
            Press <strong>Sync from Google</strong> to check. If it comes back empty, your campaigns have no
            lead form asset yet — that is the piece inside the ad that collects names and numbers.
          </Empty>
        ) : filtered.length === 0 ? (
          <Empty>{tab === 'new' ? 'Nothing new — you have looked at every lead.' : 'Nothing matches that search.'}</Empty>
        ) : filtered.map(l => {
          const ph = (l.phone || '').replace(/\D/g, '').slice(-10);
          return (
            <div key={l.id} className="adm-item" style={{ gridTemplateColumns: 'minmax(0,1fr) auto',
                                                          background: !l.isRead ? '#fffdf5' : undefined }}>
              <div style={{ minWidth: 0 }}>
                <div className="adm-item-t" style={{ display: 'flex', gap: '.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {!l.isRead && <Pill tone="red">New</Pill>}
                  {l.fullName || 'No name given'}
                  {l.isRegistered && <Pill tone="green">Already a customer</Pill>}
                </div>
                <div className="adm-item-s">
                  {l.phone || 'no phone'}{l.email ? ` · ${l.email}` : ''}
                  {l.city ? ` · ${l.city}` : ''}{l.postalCode ? ` ${l.postalCode}` : ''}
                </div>
                <div className="adm-item-s">
                  {l.campaignName || l.assetName || 'no campaign name'}
                  {' · '}{new Date(l.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
                <div className="adm-actions" style={{ marginTop: '.4rem', flexWrap: 'wrap' }}>
                  {ph && <a href={`https://wa.me/91${ph}`} target="_blank" rel="noopener noreferrer" style={{ color: '#128C7E' }}>WhatsApp</a>}
                  {l.phone && <a href={`tel:${l.phone}`}>Call</a>}
                  {l.email && <a href={`mailto:${l.email}`}>Email</a>}
                  {!l.isRead && <button onClick={() => markRead(l.id)} style={{ color: '#2e7d32' }}>Mark as seen</button>}
                </div>
              </div>
              <div />
            </div>
          );
        })}
      </Card>

      <p style={{ fontSize: '.79rem', color: '#9a908a', margin: '.85rem 0 0', lineHeight: 1.7 }}>
        These same people can go back to Google and Meta as an ad audience from{' '}
        <Link href="/admin/audiences" style={{ color: '#722f37', fontWeight: 700 }}>Audiences</Link>, where
        “Google Ad Leads” is one of the sources.
      </p>
    </div>
  );
}
