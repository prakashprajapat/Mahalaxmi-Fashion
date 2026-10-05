'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { downloadCsv } from '@/lib/adminPaged';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';
import DateFilter, { ANY_DATES, inDateWindow, describeDateWindow, type DateWindow } from '@/components/admin/DateFilter';

interface Row {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  topic: string;
  rating: number;
  message: string;
  pageUrl: string | null;
  customerId: number | null;
  isHandled: boolean;
  adminNote: string | null;
  createdAt: string;
}

const TOPIC_LABEL: Record<string, string> = {
  website: 'Website / app',
  product: 'A product',
  delivery: 'Delivery',
  payment: 'Payment',
  idea: 'An idea',
  other: 'Something else',
};

function formatDate(raw: string) {
  const d = new Date(raw);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminFeedbackPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [dates, setDates] = useState<DateWindow>(ANY_DATES);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/feedback?limit=500', {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      const b = await r.json();
      setRows((b.feedback as Row[]) ?? []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const patch = async (id: number, body: Record<string, unknown>) => {
    await fetch(`/api/feedback/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
      body: JSON.stringify(body),
    });
  };

  const toggleHandled = async (r: Row) => {
    setRows(list => list.map(x => (x.id === r.id ? { ...x, isHandled: !x.isHandled } : x)));
    try { await patch(r.id, { isHandled: !r.isHandled }); }
    catch { setRows(list => list.map(x => (x.id === r.id ? { ...x, isHandled: r.isHandled } : x))); }
  };

  const saveNote = async (id: number) => {
    const text = noteText;
    setRows(list => list.map(x => (x.id === id ? { ...x, adminNote: text } : x)));
    setNoteFor(null); setNoteText('');
    try { await patch(id, { adminNote: text }); } catch { load(); }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this feedback? It cannot be brought back.')) return;
    await fetch(`/api/feedback/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getAdminToken()}` },
    });
    setRows(list => list.filter(x => x.id !== id));
  };

  const filtered = rows.filter(r => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || r.message.toLowerCase().includes(q)
      || (r.name ?? '').toLowerCase().includes(q)
      || (r.email ?? '').toLowerCase().includes(q)
      || (r.phone ?? '').includes(search.trim());
    const matchTopic = !filterTopic || r.topic === filterTopic;
    const matchTab = tab === 'all'
      || (tab === 'open' && !r.isHandled)
      || (tab === 'done' && r.isHandled)
      || (tab === 'unhappy' && r.rating > 0 && r.rating <= 2);
    return matchSearch && matchTopic && matchTab && inDateWindow(r.createdAt, dates);
  });

  const shown = [...filtered].sort((a, b) => {
    const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortDir === 'asc' ? d : -d;
  });

  const open = rows.filter(r => !r.isHandled).length;
  const unhappy = rows.filter(r => r.rating > 0 && r.rating <= 2).length;
  const rated = rows.filter(r => r.rating > 0);
  const avg = rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length) : 0;
  const ideas = rows.filter(r => r.topic === 'idea').length;

  const exportCsv = () => {
    downloadCsv(
      [['Date', 'Topic', 'Rating', 'Name', 'Phone', 'Email', 'Message', 'Handled', 'Note'],
       ...shown.map(r => [
         formatDate(r.createdAt), TOPIC_LABEL[r.topic] ?? r.topic,
         r.rating ? String(r.rating) : '', r.name || '', r.phone || '', r.email || '',
         r.message.replace(/\s+/g, ' '), r.isHandled ? 'Yes' : 'No', r.adminNote || '',
       ])],
      `feedback-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  return (
    <div className="admin-page">
      <PageHeader
        title="Feedback"
        sub="What shoppers said about the shop itself — the website, a parcel, a payment, an idea. Not product reviews; these mostly come from people who have not bought anything yet."
        right={
          <>
            <button className="adm-btn" onClick={load}>Refresh</button>
            <button className="adm-btn adm-btn-primary" onClick={exportCsv} disabled={!shown.length}>
              Export CSV ({shown.length})
            </button>
          </>
        }
      />

      <StatGrid>
        <Stat label="Waiting on you" value={open} tone={open > 0 ? 'red' : 'green'}
              action={open > 0 && tab !== 'open' ? 'Show these' : undefined}
              onClick={() => setTab('open')} />
        <Stat label="Average rating" value={avg ? `${avg.toFixed(1)} / 5` : '—'} />
        <Stat label="1 or 2 stars" value={unhappy} tone={unhappy > 0 ? 'red' : undefined}
              action={unhappy > 0 && tab !== 'unhappy' ? 'Read these first' : undefined}
              onClick={() => setTab('unhappy')} />
        <Stat label="Ideas" value={ideas} />
      </StatGrid>

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center', marginBottom: '.65rem' }}>
          <span style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase',
                         letterSpacing: '.04em', color: '#8a7f76' }}>Filter by</span>
          <input className="adm-input" style={{ flex: '1 1 200px', maxWidth: 340 }}
                 placeholder="Search the words, a name, a number" value={search}
                 onChange={e => setSearch(e.target.value)} />
          <select className="adm-input" style={{ width: '160px' }} value={filterTopic}
                  onChange={e => setFilterTopic(e.target.value)}>
            <option value="">Topic: any</option>
            {Object.entries(TOPIC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <DateFilter value={dates} onChange={setDates} label="Sent" />
          {(search || filterTopic || dates.key !== 'any') && (
            <button className="adm-btn" onClick={() => { setSearch(''); setFilterTopic(''); setDates(ANY_DATES); }}>Clear</button>
          )}
          <button className="adm-btn" onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}>
            {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
          </button>
        </div>
        <Chips value={tab} onChange={setTab}
               items={[
                 { key: 'open', label: 'Not handled', count: open },
                 { key: 'unhappy', label: '1–2 stars', count: unhappy },
                 { key: 'done', label: 'Handled', count: rows.length - open },
                 { key: 'all', label: 'All', count: rows.length },
               ]} />
      </Card>

      <Card title={`${shown.length} ${shown.length === 1 ? 'message' : 'messages'}${describeDateWindow(dates) ? ' \u00b7 ' + describeDateWindow(dates) : ''}`}>
        {loading ? (
          <Empty>Loading feedback…</Empty>
        ) : shown.length === 0 ? (
          <Empty>
            {rows.length === 0
              ? 'Nothing yet. Messages land here the moment someone sends one from the Feedback page.'
              : 'Nothing matches that search.'}
          </Empty>
        ) : (
          /* Feedback is read, not scanned - so each one keeps its own block with
             the words at full size, unlike the leads and coupons tables. */
          shown.map(r => {
            const ph = (r.phone || '').replace(/\D/g, '');
            return (
              <div key={r.id} className="adm-item" style={{ display: 'block', opacity: r.isHandled ? .72 : 1 }}>
                <div style={{ display: 'flex', gap: '.45rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.4rem' }}>
                  {r.rating > 0 && (
                    <span style={{ color: '#f5a623', fontSize: '.95rem', letterSpacing: '.06em' }}>
                      {'★'.repeat(r.rating)}<span style={{ color: '#ddd5d1' }}>{'★'.repeat(5 - r.rating)}</span>
                    </span>
                  )}
                  <Pill tone="grey">{TOPIC_LABEL[r.topic] ?? r.topic}</Pill>
                  {r.isHandled ? <Pill tone="green">Handled</Pill> : <Pill tone="amber">Waiting</Pill>}
                  {r.customerId && <Pill tone="grey">Customer #{r.customerId}</Pill>}
                  <span style={{ marginLeft: 'auto', fontSize: '.78rem', color: '#9a908a', whiteSpace: 'nowrap' }}>
                    {formatDate(r.createdAt)}
                  </span>
                </div>

                <p style={{ margin: '0 0 .5rem', fontSize: '.92rem', color: '#2d2724',
                            lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                  {r.message}
                </p>

                <div style={{ fontSize: '.82rem', color: '#8a7f76', marginBottom: '.4rem' }}>
                  {r.name || 'No name given'}
                  {r.phone ? ` · ${r.phone}` : ''}
                  {r.email ? ` · ${r.email}` : ''}
                  {!r.name && !r.phone && !r.email ? ' · no way to reply' : ''}
                </div>

                {r.pageUrl && (
                  <div style={{ fontSize: '.76rem', color: '#b3a9a3', marginBottom: '.4rem', wordBreak: 'break-all' }}>
                    Sent from {r.pageUrl}
                  </div>
                )}

                {r.adminNote && noteFor !== r.id && (
                  <p style={{ margin: '0 0 .45rem', fontSize: '.83rem', color: '#6b615c',
                              background: '#fbf9f8', border: '1px solid #f0eae7', borderRadius: 8,
                              padding: '.5rem .7rem', whiteSpace: 'pre-wrap' }}>
                    <strong>Your note:</strong> {r.adminNote}
                  </p>
                )}

                {noteFor === r.id && (
                  <div style={{ marginBottom: '.5rem' }}>
                    <textarea className="adm-input" rows={3} value={noteText}
                      placeholder="What you did about it — only you see this."
                      onChange={e => setNoteText(e.target.value)}
                      style={{ width: '100%', height: 'auto', padding: '.5rem .7rem', lineHeight: 1.5,
                               fontFamily: 'inherit', resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: '.5rem', marginTop: '.4rem' }}>
                      <button className="adm-btn adm-btn-primary" onClick={() => saveNote(r.id)}>Save note</button>
                      <button className="adm-btn" onClick={() => { setNoteFor(null); setNoteText(''); }}>Cancel</button>
                    </div>
                  </div>
                )}

                <div className="adm-actions" style={{ flexWrap: 'wrap', margin: 0 }}>
                  <button onClick={() => toggleHandled(r)}>
                    {r.isHandled ? 'Mark not handled' : 'Mark handled'}
                  </button>
                  {ph && (
                    <a href={`https://wa.me/91${ph.slice(-10)}`} target="_blank" rel="noopener noreferrer"
                       style={{ color: '#128C7E' }}>Reply on WhatsApp</a>
                  )}
                  {r.email && <a href={`mailto:${r.email}`}>Reply by email</a>}
                  <button onClick={() => { setNoteFor(r.id); setNoteText(r.adminNote ?? ''); }}>
                    {r.adminNote ? 'Edit note' : 'Add note'}
                  </button>
                  <button onClick={() => remove(r.id)} style={{ color: '#c0392b' }}>Delete</button>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
