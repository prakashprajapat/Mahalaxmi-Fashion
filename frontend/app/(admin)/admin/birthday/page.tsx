'use client';
import { useState, useEffect, useCallback } from 'react';
import { getAdminToken } from '@/lib/auth';

interface CelebrationEntry {
  customer: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth?: string;
    marriageDate?: string;
  };
  birthdayIn: number | null;
  anniversaryIn: number | null;
}

const API = '/api/customers';

export default function BirthdayPage() {
  const [data, setData]         = useState<CelebrationEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [days, setDays]         = useState(15);
  const [tab, setTab]           = useState<'all' | 'birthday' | 'anniversary'>('all');
  const [sending, setSending]   = useState<Record<string, boolean>>({});
  const [result, setResult]     = useState<Record<string, string>>({});
  // Dedup: remember who was already messaged this year so they are not messaged again
  const [sent, setSent]         = useState<Record<string, string>>({});
  const yearNow = new Date().getFullYear();
  const sentKey = (id: number, type: string) => `${id}-${type}-${yearNow}`;

  useEffect(() => {
    try { setSent(JSON.parse(localStorage.getItem('mfh_celeb_sent') ?? '{}')); } catch { /* ignore */ }
  }, []);

  const token = getAdminToken() ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/celebrations?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setData(json.celebrations ?? []);
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [days, token]);

  useEffect(() => { load(); }, [load]);

  const sendSms = async (entry: CelebrationEntry, type: 'birthday' | 'anniversary') => {
    const key = `${entry.customer.id}-${type}`;
    setSending(s => ({ ...s, [key]: true }));
    try {
      const res = await fetch(`${API}/send-celebration-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: entry.customer.phone }),
      });
      const json = await res.json();
      setResult(r => ({ ...r, [key]: res.ok ? '✅ SMS Sent!' : `❌ ${json.message}` }));
      if (res.ok) {
        setSent(prev => {
          const next = { ...prev, [sentKey(entry.customer.id, type)]: new Date().toISOString().slice(0, 10) };
          try { localStorage.setItem('mfh_celeb_sent', JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });
      }
    } catch (e) {
      setResult(r => ({ ...r, [key]: '❌ Network error' }));
    } finally {
      setSending(s => ({ ...s, [key]: false }));
    }
  };

  const filtered = data.filter(e => {
    if (days === 0 && e.birthdayIn !== 0 && e.anniversaryIn !== 0) return false; // Today: only those celebrating today
    if (tab === 'birthday')    return e.birthdayIn != null;
    if (tab === 'anniversary') return e.anniversaryIn != null;
    return true;
  });

  const badge = (n: number | null, label: string) => {
    if (n == null) return null;
    const color = n === 0 ? '#27ae60' : n <= 3 ? '#e67e22' : '#555';
    return (
      <span style={{ fontSize: '.75rem', fontWeight: 700, color, background: n === 0 ? '#e8f5e9' : n <= 3 ? '#fff3e0' : '#f5f5f5', padding: '.2rem .6rem', borderRadius: '12px', whiteSpace: 'nowrap' }}>
        {label}: {n === 0 ? 'Today! 🎉' : `in ${n} day${n === 1 ? '' : 's'}`}
      </span>
    );
  };

  const inp: React.CSSProperties = {
    border: '1.5px solid #ddd', borderRadius: '8px',
    padding: '.5rem .75rem', fontSize: '.9rem',
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '.5rem', color: '#1a1a1a' }}>
        🎂 Birthday &amp; Anniversary Offers
      </h1>
      <p style={{ color: '#666', fontSize: '.9rem', marginBottom: '1.5rem' }}>
        Send personalized SMS offers to customers whose birthday or anniversary is coming up.
        Configure MSG91 credentials in <strong>Settings → MSG91 Configuration</strong>.
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '.4rem' }}>
          {(['all', 'birthday', 'anniversary'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                padding: '.4rem .9rem', borderRadius: '20px', fontSize: '.85rem', fontWeight: 600, cursor: 'pointer',
                border: tab === t ? '2px solid #a7354d' : '1.5px solid #ddd',
                background: tab === t ? '#fdf0f3' : '#fff',
                color: tab === t ? '#a7354d' : '#555',
              }}>
              {t === 'all' ? 'All' : t === 'birthday' ? '🎂 Birthdays' : '💍 Anniversaries'}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.88rem', fontWeight: 600, color: '#444' }}>
          Window
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ ...inp, padding: '.4rem .6rem' }}>
            <option value={0}>Today</option>
            {[7, 15, 30].map(d => <option key={d} value={d}>Next {d} days</option>)}
          </select>
        </label>
        <button onClick={load} style={{ ...inp, background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#555' }}>
          🔄 Refresh
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', overflow: 'hidden' }}>
        {loading ? (
          <p style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
            No {tab === 'birthday' ? 'birthdays' : tab === 'anniversary' ? 'anniversaries' : 'celebrations'} in the next {days} days.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
            <thead style={{ background: '#f9f9f9' }}>
              <tr>
                {['Customer', 'Phone', 'Email', 'Occasion', 'Birthday SMS', 'Anniversary SMS'].map(h => (
                  <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '.78rem', color: '#888', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => {
                const c = entry.customer;
                const bKey = `${c.id}-birthday`;
                const aKey = `${c.id}-anniversary`;
                const bSent = sent[sentKey(c.id, 'birthday')];
                const aSent = sent[sentKey(c.id, 'anniversary')];
                return (
                  <tr key={c.id} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : undefined }}>
                    <td style={{ padding: '.75rem 1rem', fontWeight: 600 }}>
                      {c.firstName} {c.lastName}
                      <div style={{ fontSize: '.75rem', color: '#888', fontWeight: 400 }}>#{c.id}</div>
                    </td>
                    <td style={{ padding: '.75rem 1rem', fontFamily: 'monospace', color: '#555' }}>{c.phone || '—'}</td>
                    <td style={{ padding: '.75rem 1rem', color: '#555', fontSize: '.82rem' }}>{c.email}</td>
                    <td style={{ padding: '.75rem 1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                        {badge(entry.birthdayIn, '🎂 Birthday')}
                        {badge(entry.anniversaryIn, '💍 Anniversary')}
                      </div>
                    </td>
                    <td style={{ padding: '.75rem 1rem' }}>
                      {entry.birthdayIn != null && c.phone ? (
                        <div>
                          <button
                            onClick={() => sendSms(entry, 'birthday')}
                            disabled={sending[bKey] || !!bSent}
                            title={bSent ? `Already sent on ${bSent}` : ''}
                            style={{ background: bSent ? '#e8f5e9' : '#a7354d', color: bSent ? '#2e7d32' : '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .85rem', fontSize: '.8rem', fontWeight: 700, cursor: (sending[bKey] || bSent) ? 'not-allowed' : 'pointer', opacity: sending[bKey] ? .7 : 1 }}>
                            {bSent ? '✓ Sent' : sending[bKey] ? 'Sending…' : 'Send SMS'}
                          </button>
                          {result[bKey] && <div style={{ fontSize: '.75rem', marginTop: '.25rem', color: result[bKey].startsWith('✅') ? '#27ae60' : '#e74c3c' }}>{result[bKey]}</div>}
                        </div>
                      ) : <span style={{ color: '#ccc', fontSize: '.8rem' }}>—</span>}
                    </td>
                    <td style={{ padding: '.75rem 1rem' }}>
                      {entry.anniversaryIn != null && c.phone ? (
                        <div>
                          <button
                            onClick={() => sendSms(entry, 'anniversary')}
                            disabled={sending[aKey] || !!aSent}
                            title={aSent ? `Already sent on ${aSent}` : ''}
                            style={{ background: aSent ? '#e8f5e9' : '#6c3d8f', color: aSent ? '#2e7d32' : '#fff', border: 'none', borderRadius: '6px', padding: '.35rem .85rem', fontSize: '.8rem', fontWeight: 700, cursor: (sending[aKey] || aSent) ? 'not-allowed' : 'pointer', opacity: sending[aKey] ? .7 : 1 }}>
                            {aSent ? '✓ Sent' : sending[aKey] ? 'Sending…' : 'Send SMS'}
                          </button>
                          {result[aKey] && <div style={{ fontSize: '.75rem', marginTop: '.25rem', color: result[aKey].startsWith('✅') ? '#27ae60' : '#e74c3c' }}>{result[aKey]}</div>}
                        </div>
                      ) : <span style={{ color: '#ccc', fontSize: '.8rem' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '.82rem', color: '#999' }}>
          Showing {filtered.length} customer{filtered.length !== 1 ? 's' : ''} {days === 0 ? 'celebrating today' : `with celebrations in the next ${days} days`}. SMS uses the MSG91 template from Settings.
        </span>
        <span style={{ fontSize: '.82rem', fontWeight: 700, color: '#2e7d32', background: '#e8f5e9', padding: '.25rem .7rem', borderRadius: 8 }}>
          📨 Sent this year: {Object.keys(sent).filter(k => k.endsWith(`-${yearNow}`)).length} (these won&apos;t be messaged again)
        </span>
      </div>
    </div>
  );
}
