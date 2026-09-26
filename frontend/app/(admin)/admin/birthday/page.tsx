'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';

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

// Day-slabs. A customer sits in exactly one slab per occasion, by how many days
// away the date is, and moves into the next tighter one as it approaches.
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
  const [slab, setSlab]       = useState<number>(0);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [result, setResult]   = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // What this browser has already sent: key = `${id}-${type}-${slabDays}-${year}`.
  // See the note at the bottom of the page — this record is per-browser.
  const [sent, setSent] = useState<Record<string, string>>({});
  const yearNow = new Date().getFullYear();
  const sentKey = (id: number, type: OccType, slabDays: number) => `${id}-${type}-${slabDays}-${yearNow}`;

  useEffect(() => {
    try { setSent(JSON.parse(localStorage.getItem('mfh_celeb_sent') ?? '{}')); } catch { /* ignore */ }
  }, []);

  const token = getAdminToken() ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Pull the widest window once and put people into slabs here.
      const res = await fetch(`${API}/celebrations?days=30`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setData(json.celebrations ?? []);
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
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
      setResult(r => ({ ...r, [key]: res.ok ? `Sent — code ${json.couponCode ?? '—'}` : json.message }));
      if (res.ok) {
        setSent(prev => {
          const next = { ...prev, [sentKey(c.id, type, slabDays)]: new Date().toISOString().slice(0, 10) };
          try { localStorage.setItem('mfh_celeb_sent', JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });
      }
    } catch {
      setResult(r => ({ ...r, [key]: 'Could not reach the server.' }));
    } finally {
      setSending(s => ({ ...s, [key]: false }));
    }
  };

  const active = SLABS.find(s => s.days === slab)!;
  const inActive = (n: number | null) => n != null && n >= active.min && n <= active.max;

  const rows: { c: CelebrationEntry['customer']; type: OccType; daysIn: number }[] = [];
  data.forEach(e => {
    if (inActive(e.birthdayIn))    rows.push({ c: e.customer, type: 'birthday',    daysIn: e.birthdayIn! });
    if (inActive(e.anniversaryIn)) rows.push({ c: e.customer, type: 'anniversary', daysIn: e.anniversaryIn! });
  });
  rows.sort((a, b) => a.daysIn - b.daysIn);

  const rowKey = (id: number, type: OccType) => `${id}-${type}`;
  const isSendable = (r: { c: { phone: string; id: number }; type: OccType }) =>
    Boolean(r.c.phone) && !sent[sentKey(r.c.id, r.type, active.days)];
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
    if (!confirm(`Send a real SMS to ${targets.length} customer${targets.length === 1 ? '' : 's'} now?`)) return;
    setBulkBusy(true);
    for (const r of targets) {
      // eslint-disable-next-line no-await-in-loop
      await sendSms(r.c, r.type, active.days);
    }
    setBulkBusy(false);
    setSelected(new Set());
  };

  const slabCount = (sd: number) => {
    const s = SLABS.find(x => x.days === sd)!;
    let n = 0;
    data.forEach(e => {
      if (e.birthdayIn    != null && e.birthdayIn    >= s.min && e.birthdayIn    <= s.max) n++;
      if (e.anniversaryIn != null && e.anniversaryIn >= s.min && e.anniversaryIn <= s.max) n++;
    });
    return n;
  };

  const noPhone = rows.filter(r => !r.c.phone).length;
  const waiting = selectableRows.length;

  return (
    <div className="admin-page">
      <PageHeader
        title="Birthday &amp; anniversary offers"
        sub="One offer per slab, as the date gets closer: 30 days, 15, 7, then the day itself. Each one sends a real SMS with its own coupon code."
        right={<button className="adm-btn" onClick={load}>Refresh</button>}
      />

      <StatGrid>
        <Stat label="Celebrating today" value={slabCount(0)} tone={slabCount(0) > 0 ? 'green' : undefined}
              action={slab === 0 ? undefined : 'Open today'} onClick={() => setSlab(0)} />
        <Stat label="Not yet sent in this slab" value={waiting} tone={waiting > 0 ? 'red' : undefined} />
        <Stat label="No phone number on file" value={noPhone}
              action={noPhone > 0 ? 'Add their numbers' : undefined}
              href={noPhone > 0 ? '/admin/customers' : undefined} />
        <Stat label="In the next 30 days"
              value={SLABS.reduce((s, x) => s + slabCount(x.days), 0)} />
      </StatGrid>

      <Card>
        <Chips value={String(slab)} onChange={k => setSlab(Number(k))}
               items={SLABS.map(s => ({
                 key: String(s.days),
                 label: s.days === 0 ? 'Today' : `${s.label} away`,
                 count: slabCount(s.days),
               }))} />
        <p style={{ fontSize: '.8rem', color: '#7d736d', margin: 0, lineHeight: 1.6 }}>
          {active.days === 0
            ? 'Customers whose day is today.'
            : `Customers whose day is ${active.min}–${active.max} days away.`}
          {' '}The wording and the discount come from the MSG91 templates in{' '}
          <Link href="/admin/settings" style={{ color: '#722f37', fontWeight: 700 }}>Settings</Link> — the
          server picks the right template for the slab, so a message a month early does not read “Happy Birthday”.
        </p>
      </Card>

      {selected.size > 0 && (
        <div className="adm-card" style={{ background: '#fff9ec', borderColor: '#f0e0bd', display: 'flex',
                                           gap: '.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '.84rem' }}>{selected.size} selected</strong>
          <button className="adm-btn adm-btn-primary" disabled={bulkBusy || selBirthdayCount === 0}
                  onClick={() => bulkSend('birthday')}>
            Send birthday offer ({selBirthdayCount})
          </button>
          <button className="adm-btn adm-btn-primary" disabled={bulkBusy || selAnnivCount === 0}
                  onClick={() => bulkSend('anniversary')}>
            Send anniversary offer ({selAnnivCount})
          </button>
          {bulkBusy && <span style={{ fontSize: '.8rem', color: '#7a5a18', fontWeight: 700 }}>Sending…</span>}
          <button className="adm-btn" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <Card
        title={`${rows.length} ${rows.length === 1 ? 'person' : 'people'} in this slab`}
        right={selectableRows.length > 0 && (
          <label style={{ fontSize: '.76rem', color: '#7d736d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select all {selectableRows.length} not yet sent
          </label>
        )}
      >
        {loading ? (
          <Empty>Loading…</Empty>
        ) : rows.length === 0 ? (
          <Empty>
            Nobody has a {active.days === 0 ? 'birthday or anniversary today' : `date ${active.min}–${active.max} days away`}.
            Dates come from the customer&apos;s own profile, so a customer with no date on file never appears here.
          </Empty>
        ) : rows.map((row, i) => {
          const { c, type, daysIn } = row;
          const k = `${c.id}-${type}-${active.days}`;
          const wasSent = sent[sentKey(c.id, type, active.days)];
          const picked = selected.has(rowKey(c.id, type));
          const failed = result[k] && !result[k].startsWith('Sent');
          return (
            <div key={k + i} className="adm-item" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto',
                                                           background: picked ? '#fdf7f8' : undefined }}>
              <input type="checkbox" checked={picked} disabled={!isSendable(row)}
                     onChange={() => toggleRow(c.id, type)}
                     style={{ marginTop: '.15rem', visibility: isSendable(row) ? 'visible' : 'hidden' }} />
              <div style={{ minWidth: 0 }}>
                <div className="adm-item-t" style={{ display: 'flex', gap: '.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {c.firstName} {c.lastName}
                  <Pill tone={type === 'birthday' ? 'amber' : 'grey'}>
                    {type === 'birthday' ? 'Birthday' : 'Anniversary'}{daysIn === 0 ? ' today' : ` in ${daysIn} day${daysIn === 1 ? '' : 's'}`}
                  </Pill>
                  {wasSent && <Pill tone="green">Sent from this browser</Pill>}
                </div>
                <div className="adm-item-s">
                  {c.phone || 'no phone number'}{c.email ? ` · ${c.email}` : ''}
                </div>
                {result[k] && (
                  <div style={{ fontSize: '.76rem', marginTop: '.25rem', fontWeight: 700,
                                color: failed ? '#c0392b' : '#2e7d32' }}>{result[k]}</div>
                )}
              </div>
              <div className="adm-item-r">
                {!c.phone ? (
                  <span style={{ fontSize: '.76rem', color: '#a49a94' }}>No phone</span>
                ) : wasSent ? (
                  <span style={{ fontSize: '.74rem', color: '#7d736d' }} title={`Sent on ${wasSent}`}>{wasSent}</span>
                ) : (
                  <button className="adm-btn adm-btn-primary" style={{ padding: '.35rem .8rem', fontSize: '.78rem' }}
                          onClick={() => sendSms(c, type, active.days)} disabled={sending[k]}>
                    {sending[k] ? 'Sending…' : 'Send offer'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {/* Said out loud, because a record that looks firm and is not costs money. */}
      <Card style={{ background: '#fff9ec', borderColor: '#f0e0bd' }}>
        <p style={{ margin: 0, fontSize: '.82rem', color: '#7a5a18', lineHeight: 1.7 }}>
          <strong>“Sent” is remembered by this browser only.</strong> It is kept in this browser&apos;s own
          storage, not on the server — so a send from your phone is not known to your laptop, and clearing
          browser data forgets all of it. Until that record moves to the server, send from one device, and if you
          are unsure whether an offer already went out, check the customer for an unused BD- or AN- coupon
          before sending again.
        </p>
        <p style={{ margin: '.5rem 0 0', fontSize: '.82rem', color: '#7a5a18' }}>
          Sent from this browser this year: <strong>{Object.keys(sent).filter(k => k.endsWith(`-${yearNow}`)).length}</strong>
        </p>
      </Card>
    </div>
  );
}
