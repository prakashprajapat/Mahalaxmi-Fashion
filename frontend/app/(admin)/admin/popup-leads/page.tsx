'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { fetchAllPages, downloadCsv } from '@/lib/adminPaged';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';
import DateFilter, { ANY_DATES, inDateWindow, describeDateWindow, type DateWindow } from '@/components/admin/DateFilter';
import { WhatsAppSendButton, WhatsAppModeNote } from '@/components/admin/WhatsAppSend';

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
  // Pehle khaana chuniye, phir likhiye - Orders ki tarah. Ek number name me
  // dhoondhne ka koi matlab nahi hota, aur "sab" me dhoondhne par aksar woh
  // pankti bhi aa jati hai jo nahi chahiye thi.
  const [searchIn, setSearchIn] = useState('all');
  const [filterSource, setFilterSource] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // "Came in" was a sort arrow only. Sorting answers "in what order"; a shop
  // wants to ask "who came in this week", which is a different question.
  const [dates, setDates] = useState<DateWindow>(ANY_DATES);

  // Which invite is in flight, and which have gone this sitting - enough to
  // stop the same person being mailed twice in one go.
  const [inviting, setInviting] = useState<number | null>(null);
  const [invited, setInvited] = useState<Set<number>>(new Set());
  const [inviteMsg, setInviteMsg] = useState('');


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

  // The two buttons on this row used to look like they did something and did
  // not. WhatsApp opened a chat with an empty box, and Email was a mailto: that
  // handed the job to whatever mail program the computer happened to open -
  // which on this machine is nothing at all. So the shop clicked, saw a blank
  // window, and the lead never heard from anybody.
  //
  // Now the WhatsApp link carries the message, and this sends the real email
  // from the server, the same one the Customers screen sends.
  const sendInvite = async (l: Lead) => {
    if (!l.email) { setInviteMsg(`${l.name || 'This lead'} left no email address. Send it on WhatsApp instead.`); return; }
    if (invited.has(l.id) && !confirm(`An invite has already gone to ${l.email} in this sitting. Send it again?`)) return;
    setInviting(l.id); setInviteMsg('');
    try {
      const res = await fetch(`/api/popup-leads/${l.id}/shop-invite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.success) {
        setInvited(prev => new Set(prev).add(l.id));
        setInviteMsg(`Sent to ${body.sentTo ?? l.email}.`);
      } else {
        setInviteMsg(body?.message || 'The email could not be sent.');
      }
    } catch {
      setInviteMsg('The email could not be sent.');
    } finally {
      setInviting(null);
    }
  };

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
    const hit: Record<string, boolean> = {
      name:  (l.name || '').toLowerCase().includes(q),
      email: (l.email || '').toLowerCase().includes(q),
      phone: (l.phone || '').includes(search.trim()),
    };
    const matchSearch = !q || (searchIn === 'all' ? Object.values(hit).some(Boolean) : !!hit[searchIn]);
    const matchSource = !filterSource || l.source === filterSource;
    const matchTab = tab === 'all'
      || (tab === 'registered' && l.isRegistered)
      || (tab === 'not' && !l.isRegistered);
    const matchDates = inDateWindow(l.createdAt, dates);
    return matchSearch && matchSource && matchTab && matchDates;
  });

  // Jahan se lead aayi - har dukaan me do-teen jagah hi hoti hain, isliye naam
  // haath se likhne ki zaroorat nahi, list khud bana lete hain.
  const sources = Array.from(new Set(leads.map(l => l.source).filter(Boolean))).sort();
  const shown = [...filtered].sort((a, b) => {
    const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortDir === 'asc' ? d : -d;
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center', marginBottom: '.65rem' }}>
          <span style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase',
                         letterSpacing: '.04em', color: '#8a7f76' }}>Filter by</span>
          <select className="adm-input" style={{ width: '116px' }} value={searchIn}
                  onChange={e => setSearchIn(e.target.value)}>
            <option value="all">All fields</option>
            <option value="name">Name</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
          </select>
          <input className="adm-input" style={{ flex: '1 1 180px', maxWidth: 320 }}
                 placeholder={searchIn === 'all' ? 'Search name, email or phone' : 'Search'}
                 value={search} onChange={e => setSearch(e.target.value)} />
          <select className="adm-input" style={{ width: '150px' }} value={filterSource}
                  onChange={e => setFilterSource(e.target.value)}>
            <option value="">Source: all</option>
            {sources.map(sc => <option key={sc} value={sc}>{sc}</option>)}
          </select>
          <DateFilter value={dates} onChange={setDates} label="Came in" />
          {(search || filterSource || dates.key !== 'any') && (
            <button className="adm-btn" onClick={() => { setSearch(''); setFilterSource(''); setDates(ANY_DATES); }}>Clear</button>
          )}
        </div>
        <Chips value={tab} onChange={setTab}
               items={[
                 { key: 'all', label: 'All', count: leads.length },
                 { key: 'not', label: 'No account yet', count: notYet },
                 { key: 'registered', label: 'Became a customer', count: registered },
               ]} />
      </Card>

      <Card title={`${filtered.length} ${filtered.length === 1 ? 'lead' : 'leads'}${describeDateWindow(dates) ? ' \u00b7 ' + describeDateWindow(dates) : ''}`}>
        <WhatsAppModeNote />
        {inviteMsg && (
          <p style={{ fontSize: '.82rem', fontWeight: 700, margin: '0 0 .6rem',
                      color: inviteMsg.startsWith('Sent to') ? '#2e7d32' : '#c0392b' }}>{inviteMsg}</p>
        )}
        {loading ? (
          <Empty>Loading leads…</Empty>
        ) : filtered.length === 0 ? (
          <Empty>
            {leads.length === 0
              ? 'Nobody has filled in the popup yet. Leads land here the moment they do.'
              : 'Nothing matches that search.'}
          </Empty>
        ) : (
          /* Lead ki list bhi ab khaane me hai - naam, email, phone, kahan se
             aayi, account bana ya nahi, kab aayi. Aankh seedhi neeche utarti
             hai, aur ek jaisi cheez ek hi khaane me milti hai. */
          <div className="adm-table-wrap">
            <table className="adm-table adm-table-sticky">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>
                    <button type="button" className="adm-sort"
                            onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}>
                      Came in{sortDir === 'asc' ? ' \u25b2' : ' \u25bc'}
                    </button>
                  </th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(l => {
                  return (
                    <tr key={l.id}>
                      <td data-label="Name">
                        <div style={{ fontWeight: 650, color: '#2d2724', display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          {l.name || 'No name given'}
                          {isToday(l.createdAt) && <Pill tone="grey">Today</Pill>}
                        </div>
                      </td>
                      <td data-label="Email">{l.email || <span style={{ color: '#c4bab5' }}>&mdash;</span>}</td>
                      <td data-label="Phone" className="mono">{l.phone || <span style={{ color: '#c4bab5' }}>&mdash;</span>}</td>
                      <td data-label="Source">{l.source}</td>
                      <td data-label="Status">
                        {l.isRegistered ? <Pill tone="green">Customer</Pill> : <Pill tone="amber">No account</Pill>}
                      </td>
                      <td data-label="Came in" style={{ whiteSpace: 'nowrap' }}>{formatDate(l.createdAt)}</td>
                      <td data-label="Action">
                        <div className="adm-actions" style={{ flexWrap: 'wrap', margin: 0 }}>
                          <WhatsAppSendButton phone={l.phone ?? undefined} firstName={(l.name ?? '').split(' ')[0] || undefined} />
                          {l.email
                            ? <button onClick={() => sendInvite(l)} disabled={inviting === l.id} style={{ color: '#a7354d' }}>
                                {inviting === l.id ? 'Sending…' : invited.has(l.id) ? 'Mailed ✓' : 'Mail'}
                              </button>
                            : <span title="No email address on this lead" style={{ color: '#c4bab5' }}>Mail</span>}
                          <button onClick={() => handleDelete(l.id)} style={{ color: '#c0392b' }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
