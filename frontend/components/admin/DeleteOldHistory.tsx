'use client';
import { useEffect, useState } from 'react';
import { getAdminToken, isOwnerAdmin } from '@/lib/auth';

// "Delete everything before [date]" for a history table, so old rows do not
// pile up in the database. Owner only - the server checks that too.
export default function DeleteOldHistory({ endpoint, what, keepNote, onDone }: {
  endpoint: string;          // e.g. /api/login-events/delete-old
  what: string;              // e.g. "login records"
  keepNote?: string;         // what is never deleted
  onDone?: () => void;
}) {
  const [owner, setOwner] = useState(false);
  const [before, setBefore] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { setOwner(isOwnerAdmin()); }, []);
  if (!owner) return null;

  const run = async () => {
    if (!before) return;
    const day = new Date(before + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!confirm(`Delete all ${what} from before ${day}? This cannot be undone.`)) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken() ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ before }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok || !b.success) { setMsg(b.message || 'Could not delete.'); return; }
      setMsg(`${b.deleted ?? 0} old ${what} deleted.`);
      setBefore('');
      onDone?.();
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, justifyContent: 'flex-end', margin: '.25rem 0 .75rem' }}>
      {msg && <span style={{ fontSize: 13, color: '#1a7f4b', fontWeight: 600 }}>{msg}</span>}
      <span style={{ fontSize: 13, color: '#555' }} title={keepNote}>Delete old history before</span>
      <input type="date" className="adm-input" value={before} onChange={e => setBefore(e.target.value)} style={{ width: 170 }} />
      <button className="adm-btn" style={{ color: '#c0392b' }} disabled={!before || busy} onClick={run}>
        {busy ? 'Deleting…' : 'Delete old'}
      </button>
      {keepNote && <div style={{ flexBasis: '100%', textAlign: 'right', fontSize: 11, color: '#888' }}>{keepNote}</div>}
    </div>
  );
}
