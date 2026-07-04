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

// Day-slabs. A customer sits in exactly one slab per occasion, based on how many
// days away it is, and moves into the next tighter slab as the date approaches.
const SLABS = [
  { days: 30, label: '30 days', min: 16, max: 30 },
  { days: 15, label: '15 days', min: 8,  max: 15 },
  { days: 7,  label: '7 days',  min: 1,  max: 7  },
  { days: 0,  label: 'Today',   min: 0,  max: 0  },
] as const;

type OccType = 'birthday' | 'anniversary';

export default function BirthdayPage() {
  const [data, setData]       = useState<CelebrationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [slab, setSlab]       = useState<number>(0); // active slab (days): 30 | 15 | 7 | 0
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [result, setResult]   = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Per-slab send tracking: key = `${id}-${type}-${slabDays}-${year}`
  const [sent, setSent]       = useState<Record<string, string>>({});
  const yearNow = new Date().getFullYear();
  const sentKey = (id: number, type: OccType, slabDays: number) => `${id}-${type}-${slabDays}-${yearNow}`;

  useEffect(() => {
    try { setSent(JSON.parse(localStorage.getItem('mfh_celeb_sent') ?? '{}')); } catch { /* ignore */ }
  }, []);

  const token = getAdminToken() ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Always pull the widest window (30d) and bucket into slabs on the client.
      const res = await fetch(`${API}/celebrations?days=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setData(json.celebrations ?? []);
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  // Clear selection whenever the slab or the underlying data changes
  useEffect(() => { setSelected(new Set()); }, [slab, data]);

  const sendSms = async (c: CelebrationEntry['customer'], type: OccType, slabDays: number) => {
    const key = `${c.id}-${type}-${slabDays}`;
    setSending(s => ({ ...s, [key]: true }));
    try {
      const res = await fetch(`${API}/send-celebration-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: c.phone, occasion: type, slab: slabDays }),
      });
      const json = await res.json();
      setResult(r => ({ ...r, [key]: res.ok ? '✅ SMS Sent!' : `❌ ${json.message}` }));
      if (res.ok) {
        setSent(prev => {
          const next = { ...prev, [sentKey(c.id, type, slabDays)]: new Date().toISOString().slice(0, 10) };
          try { localStorage.setItem('mfh_celeb_sent', JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });
      }
    } catch {
      setResult(r => ({ ...r, [key]: '❌ Network error' }));
    } finally {
      setSending(s => ({ ...s, [key]: false }));
    }
  };

  const active = SLABS.find(s => s.days === slab)!;
  const inActive = (n: number | null) => n != null && n >= active.min && n <= active.max;

  // Build one row per (customer, occasion) that falls inside the active slab.
  const rows: { c: CelebrationEntry['customer']; type: OccType; daysIn: number }[] = [];
  data.forEach(e => {
    if (inActive(e.birthdayIn))    rows.push({ c: e.customer, type: 'birthday',    daysIn: e.birthdayIn! });
    if (inActive(e.anniversaryIn)) rows.push({ c: e.customer, type: 'anniversary', daysIn: e.anniversaryIn! });
  });
  rows.sort((a, b) => a.daysIn - b.daysIn);

  // ── Multi-select + bulk send ──────────────────────────────────────────────
  const rowKey = (id: number, type: OccType) => `${id}-${type}`;
  const isSendable = (r: { c: { phone: string; id: number }; type: OccType }) =>
    !!r.c.phone && !sent[sentKey(r.c.id, r.type, active.days)];
  const selectableRows = rows.filter(isSendable);
  const allSelected = selectableRows.length > 0 && selectableRows.every(r => selected.has(rowKey(r.c.id, r.type)));
  const selBirthdayCount = selectableRows.filter(r => r.type === 'birthday'    && selected.has(rowKey(r.c.id, r.type))).length;
  const selAnnivCount    = selectableRows.filter(r => r.type === 'anniversary' && selected.has(rowKey(r.c.id, r.type))).length;

  const toggleRow = (id: number, type: OccType) => setSelected(prev => {
    const next = new Set(prev);
    const k = rowKey(id, type);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableRows.map(r => rowKey(r.c.id, r.type))));

  const bulkSend = async (occasion: OccType) => {
    const targets = selectableRows.filter(r => r.type === occasion && selected.has(rowKey(r.c.id, r.type)));
    if (targets.length === 0) return;
    setBulkBusy(true);
    for (const r of targets) {
      // eslint-disable-next-line no-await-in-loop
      await sendSms(r.c, r.type, active.days);
    }
    setBulkBusy(false);
    setSelected(new Set());
  };

  // Count how many customers sit in each slab, for the tab badges
  const slabCount = (sd: number) => {
    const s = SLABS.find(x => x.days === sd)!;
    let n = 0;
    data.forEach(e => {
      if (e.birthdayIn    != null && e.birthdayIn    >= s.min && e.birthdayIn    <= s.max) n++;
      if (e.anniversaryIn != null && e.anniversaryIn >= s.min && e.anniversaryIn <= s.max) n++;
    });
    return n;
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '.5rem', color: '#1a1a1a' }}>
        🎂 Birthday &amp; Anniversary Offers
      </h1>
      <p style={{ color: '#666', fontSize: '.9rem', marginBottom: '1.5rem' }}>
        Customers move through the slabs as their date approaches — <strong>30 → 15 → 7 → Today</strong>.
        Send one offer per slab; the button disappears once sent, and reappears in the next slab.
        Configure MSG91 in <strong>Settings → MSG91 Configuration</strong>.
      </p>

      {/* Slab tabs */}
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {SLABS.map(s => {
          const isActive = slab === s.days;
          const cnt = slabCount(s.days);
          return (
            <button key={s.days} onClick={() => setSlab(s.days)}
              style={{
                padding: '.45rem 1rem', borderRadius: '20px', fontSize: '.88rem', fontWeight: 700, cursor: 'pointer',
                border: isActive ? '2px solid #a7354d' : '1.5px solid #ddd',
                background: isActive ? '#a7354d' : '#fff',
                color: isActive ? '#fff' : '#555',
              }}>
              {s.days === 0 ? '🎉 Today' : `${s.label}`} <span style={{ opacity: .85 }}>({cnt})</span>
            </button>
          );
        })}
        <button onClick={load} style={{ border: '1.5px solid #ddd', borderRadius: '8px', padding: '.45rem .8rem', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#555', fontSize: '.85rem' }}>
          🔄 Refresh
        </button>
      </div>

      {/* Bulk send bar */}
      {selected.size > 0 && (
        <div style={{ background: '#fff3cd', borderRadius: '8px', padding: '.6rem 1rem', marginBottom: '1rem', display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '.85rem' }}>{selected.size} selected</strong>
          <button disabled={bulkBusy || selBirthdayCount === 0} onClick={() => bulkSend('birthday')}
            style={{ background: selBirthdayCount ? '#a7354d' : '#e5b8c2', color: '#fff', border: 'none', borderRadius: 6, padding: '.4rem .9rem', fontSize: '.82rem', fontWeight: 700, cursor: (bulkBusy || !selBirthdayCount) ? 'not-allowed' : 'pointer' }}>
            🎂 Send Birthday Offer ({selBirthdayCount})
          </button>
          <button disabled={bulkBusy || selAnnivCount === 0} onClick={() => bulkSend('anniversary')}
            style={{ background: selAnnivCount ? '#6c3d8f' : '#c9b6da', color: '#fff', border: 'none', borderRadius: 6, padding: '.4rem .9rem', fontSize: '.82rem', fontWeight: 700, cursor: (bulkBusy || !selAnnivCount) ? 'not-allowed' : 'pointer' }}>
            💍 Send Anniversary Offer ({selAnnivCount})
          </button>
          {bulkBusy && <span style={{ fontSize: '.8rem', color: '#856404' }}>Sending…</span>}
          <button onClick={() => setSelected(new Set())} style={{ background: '#f5f5f5', border: 'none', borderRadius: 6, padding: '.4rem .8rem', fontSize: '.82rem', cursor: 'pointer' }}>Clear</button>
        </div>
      )}

      {/* Details table for the active slab */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', overflow: 'hidden' }}>
        {loading ? (
          <p style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
            No customers in the {active.days === 0 ? 'Today' : active.label} slab.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
            <thead style={{ background: '#f9f9f9' }}>
              <tr>
                <th style={{ padding: '.75rem 1rem', width: 36 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectableRows.length === 0} />
                </th>
                {['Customer', 'Phone', 'Email', 'Occasion', 'Send Offer'].map(h => (
                  <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '.78rem', color: '#888', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const { c, type, daysIn } = row;
                const k = `${c.id}-${type}-${active.days}`;
                const wasSent = sent[sentKey(c.id, type, active.days)];
                const isBday = type === 'birthday';
                return (
                  <tr key={k + i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : undefined, background: selected.has(`${c.id}-${type}`) ? '#fdf0f3' : undefined }}>
                    <td style={{ padding: '.75rem 1rem' }}>
                      {c.phone && !wasSent
                        ? <input type="checkbox" checked={selected.has(`${c.id}-${type}`)} onChange={() => toggleRow(c.id, type)} />
                        : null}
                    </td>
                    <td style={{ padding: '.75rem 1rem', fontWeight: 600 }}>
                      {c.firstName} {c.lastName}
                      <div style={{ fontSize: '.75rem', color: '#888', fontWeight: 400 }}>#{c.id}</div>
                    </td>
                    <td style={{ padding: '.75rem 1rem', fontFamily: 'monospace', color: '#555' }}>{c.phone || '—'}</td>
                    <td style={{ padding: '.75rem 1rem', color: '#555', fontSize: '.82rem' }}>{c.email}</td>
                    <td style={{ padding: '.75rem 1rem' }}>
                      <span style={{ fontSize: '.78rem', fontWeight: 700, color: isBday ? '#a7354d' : '#6c3d8f', background: isBday ? '#fdf0f3' : '#f3edf9', padding: '.2rem .6rem', borderRadius: '12px', whiteSpace: 'nowrap' }}>
                        {isBday ? '🎂 Birthday' : '💍 Anniversary'} · {daysIn === 0 ? 'Today! 🎉' : `in ${daysIn} day${daysIn === 1 ? '' : 's'}`}
                      </span>
                    </td>
                    <td style={{ padding: '.75rem 1rem' }}>
                      {!c.phone ? (
                        <span style={{ color: '#ccc', fontSize: '.8rem' }}>No phone</span>
                      ) : wasSent ? (
                        <span style={{ fontSize: '.8rem', fontWeight: 700, color: '#2e7d32', background: '#e8f5e9', padding: '.35rem .7rem', borderRadius: 8 }}
                          title={`Sent on ${wasSent}`}>
                          ✓ Sent for this slab
                        </span>
                      ) : (
                        <div>
                          <button
                            onClick={() => sendSms(c, type, active.days)}
                            disabled={sending[k]}
                            style={{ background: isBday ? '#a7354d' : '#6c3d8f', color: '#fff', border: 'none', borderRadius: '6px', padding: '.4rem .95rem', fontSize: '.82rem', fontWeight: 700, cursor: sending[k] ? 'not-allowed' : 'pointer', opacity: sending[k] ? .7 : 1 }}>
                            {sending[k] ? 'Sending…' : `Send ${active.days === 0 ? 'Today' : active.label} Offer`}
                          </button>
                          {result[k] && <div style={{ fontSize: '.75rem', marginTop: '.25rem', color: result[k].startsWith('✅') ? '#27ae60' : '#e74c3c' }}>{result[k]}</div>}
                        </div>
                      )}
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
          {active.days === 0 ? 'Customers celebrating today.' : `Customers with a celebration ${active.days === 30 ? '16–30' : active.days === 15 ? '8–15' : '1–7'} days away.`} SMS uses the MSG91 template from Settings.
        </span>
        <span style={{ fontSize: '.82rem', fontWeight: 700, color: '#2e7d32', background: '#e8f5e9', padding: '.25rem .7rem', borderRadius: 8 }}>
          📨 Offers sent this year: {Object.keys(sent).filter(k => k.endsWith(`-${yearNow}`)).length}
        </span>
      </div>
    </div>
  );
}
