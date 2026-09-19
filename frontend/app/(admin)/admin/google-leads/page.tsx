'use client';
import { useCallback, useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';

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
  const [unread, setUnread] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/googleleads?limit=200', { headers: auth() });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.message || 'Could not load the leads.'); return; }
      setLeads(d.leads ?? []);
      setTotal(d.total ?? 0);
      setUnread(d.unread ?? 0);
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
        : 'Nothing new — Google has no leads we have not already saved.');
      await load();
    } catch { setError('Could not reach the server.'); }
    finally { setSyncing(false); }
  };

  const markRead = async (id: number) => {
    await fetch(`/api/googleleads/${id}/read`, { method: 'POST', headers: auth() }).catch(() => {});
    setLeads(list => list.map(l => l.id === id ? { ...l, isRead: true } : l));
    setUnread(u => Math.max(0, u - 1));
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

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 .3rem' }}>Google Ad Leads</h1>
      <p style={{ margin: '0 0 1.25rem', color: '#666', fontSize: '.9rem', lineHeight: 1.6 }}>
        People who filled in a lead form on your Google ads. Google throws this data away after
        about 60 days, so press Sync now and then — once a lead is here, it stays.
      </p>

      {notice && (
        <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', color: '#1b5e20', borderRadius: 10, padding: '.7rem 1rem', marginBottom: '1rem', fontSize: '.88rem' }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6c2', color: '#8a1c13', borderRadius: 10, padding: '.7rem 1rem', marginBottom: '1rem', fontSize: '.88rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button onClick={sync} disabled={syncing}
          style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: 8, padding: '.6rem 1.2rem', fontWeight: 700, fontSize: '.88rem', cursor: syncing ? 'default' : 'pointer', opacity: syncing ? .6 : 1 }}>
          {syncing ? 'Asking Google…' : '↻ Sync from Google'}
        </button>
        <button onClick={download} disabled={total === 0}
          style={{ background: '#fff', color: '#555', border: '1.5px solid #ddd', borderRadius: 8, padding: '.6rem 1.1rem', fontWeight: 600, fontSize: '.86rem', cursor: 'pointer', opacity: total === 0 ? .5 : 1 }}>
          ⬇ Download CSV
        </button>
        <span style={{ fontSize: '.85rem', color: '#777' }}>
          {total} lead{total === 1 ? '' : 's'}{unread > 0 && <b style={{ color: '#a7354d' }}> · {unread} unread</b>}
        </span>
        <span style={{ flex: 1 }} />
        {lastSync && (
          <span style={{ fontSize: '.78rem', color: '#999' }}>
            last synced {new Date(lastSync).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#999' }}>Loading…</p>
      ) : leads.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '2rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 .4rem', fontSize: '1rem', fontWeight: 600 }}>No Google leads yet</p>
          <p style={{ margin: 0, color: '#888', fontSize: '.87rem', lineHeight: 1.7 }}>
            Press <b>Sync from Google</b> to check. If it comes back empty, your campaigns have no
            lead form asset yet — that is the piece that collects names and numbers inside the ad.
          </p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, overflowX: 'auto' }}>
          <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
            <thead>
              <tr style={{ background: '#fafafa', textAlign: 'left' }}>
                <th style={{ padding: '.6rem .8rem' }}>Name</th>
                <th style={{ padding: '.6rem .8rem' }}>Phone</th>
                <th style={{ padding: '.6rem .8rem' }}>Email</th>
                <th style={{ padding: '.6rem .8rem' }}>City</th>
                <th style={{ padding: '.6rem .8rem' }}>Campaign</th>
                <th style={{ padding: '.6rem .8rem' }}>When</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id}
                  onClick={() => !l.isRead && markRead(l.id)}
                  style={{
                    borderTop: '1px solid #f2f2f2',
                    background: l.isRead ? 'transparent' : '#fffdf2',
                    cursor: l.isRead ? 'default' : 'pointer',
                  }}>
                  <td data-label="Name" style={{ padding: '.6rem .8rem' }}>
                    <b>{l.fullName || '—'}</b>
                    {!l.isRead && <span style={{ marginLeft: '.4rem', fontSize: '.68rem', fontWeight: 700, color: '#a7354d' }}>NEW</span>}
                    {l.isRegistered && <span style={{ display: 'block', fontSize: '.72rem', color: '#1b5e20' }}>already a customer</span>}
                  </td>
                  <td data-label="Phone" style={{ padding: '.6rem .8rem', whiteSpace: 'nowrap' }}>
                    {l.phone ? <a href={`tel:${l.phone}`} style={{ color: '#a7354d' }}>{l.phone}</a> : '—'}
                  </td>
                  <td data-label="Email" style={{ padding: '.6rem .8rem', wordBreak: 'break-all' }}>{l.email || '—'}</td>
                  <td data-label="City" style={{ padding: '.6rem .8rem' }}>
                    {l.city || '—'}
                    {l.postalCode && <span style={{ display: 'block', fontSize: '.72rem', color: '#999' }}>{l.postalCode}</span>}
                  </td>
                  <td data-label="Campaign" style={{ padding: '.6rem .8rem' }}>{l.campaignName || l.assetName || '—'}</td>
                  <td data-label="When" style={{ padding: '.6rem .8rem', whiteSpace: 'nowrap' }}>
                    {new Date(l.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ margin: '1.1rem 0 0', fontSize: '.78rem', color: '#999', lineHeight: 1.75 }}>
        These same people can be sent back to Meta and Google as an ad audience from{' '}
        <b>Marketing → Audiences</b>, where &ldquo;Google Ad Leads&rdquo; is one of the sources.
      </p>
    </div>
  );
}
