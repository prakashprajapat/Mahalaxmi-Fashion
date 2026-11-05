'use client';
import { useEffect, useMemo, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { downloadCsv } from '@/lib/adminPaged';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';

// Customers -> Follow-up Calls.
// Two lists to work through by phone, with every call written down:
//   Review calls      delivered orders: has the customer reviewed yet?
//   Payment dropped   checkouts left unpaid: the USER_DROPPED2 text, the
//                     WhatsApp tick from SMS Logs, and whether she bought later.
//   Login failed      failed logins from Login History (no such account /
//                     wrong password): the help mail/SMS, and did they get in.

type Kind = 'review' | 'dropped' | 'login';
const API: Record<Kind, string> = { review: 'reviews', dropped: 'dropped', login: 'logins' };
const DEFAULT_DAYS: Record<Kind, number> = { review: 30, dropped: 15, login: 15 };
const REASON: Record<string, string> = { no_account: 'No such account', wrong_password: 'Wrong password' };
type Stage = 'todo' | 'callback' | 'called' | 'done';

interface Row {
  refId: string; when: string | null; name: string; phone: string; amount: number; items: string[];
  // review
  reviewed?: boolean; rating?: number | null; reviewStatus?: string | null; smsCount?: number; smsLast?: string | null;
  // dropped
  itemLinks?: string[];
  cfStatus?: string | null; smsAt?: string | null; smsStatus?: string | null; whatsAppAt?: string | null; boughtOrder?: string | null;
  // login
  email?: string | null; attempts?: number; reason?: string | null; method?: string | null; platform?: string | null; device?: string | null;
  hasAccount?: boolean; helpMail?: string | null; helpSms?: string | null; gotIn?: boolean;
  lastOutcome?: string | null; lastNote?: string | null; lastAt?: string | null; lastBy?: string | null;
  callbackAt?: string | null; calls: number; stage: Stage; waAt?: string | null;
}
interface SmsLogLite { id: number; vars?: string | null; message?: string | null; whatsappText?: string | null; sentAt: string }

const SITE = 'https://www.mahalaxmifashionhub.com';
function orderIdOfVars(v?: string | null): string | null {
  if (!v) return null;
  try {
    const o = JSON.parse(v) as Record<string, string>;
    if (o.order_id) return o.order_id.trim();
    const hit = Object.values(o).find(x => /^MFH\d+/i.test(String(x).trim()));
    return hit ? String(hit).trim() : null;
  } catch { return null; }
}

// The WhatsApp text for a row: the SMS that already went (from SMS Logs, in
// its WhatsApp layout) when there is one, otherwise a message written here.
function waText(kind: Kind, r: Row, log?: SmsLogLite): string {
  const hello = 'Dear ' + (r.name ? r.name.split(' ')[0] : 'Customer') + ',';
  if (kind === 'dropped') {
    if (log && (log.whatsappText || log.message)) return (log.whatsappText || log.message)!;
    return [
      'Dear Customer,', '',
      'Your payment for the following order at Mahalaxmi Fashion Hub was not completed.', '',
      `Order ID: ${r.refId}`,
      r.when ? `Transaction Date: ${new Date(r.when).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : '',
      r.itemLinks?.length ? `Item Details : ${r.itemLinks.join('\n')}` : r.items.length ? `Item Details : ${r.items.join(', ')}` : '',
      `Order Amount: ${Math.round(r.amount)}`, '',
      'You can visit our website to complete your purchase.', '',
      `Website: ${SITE.replace('https://', '')}`, '',
      'Thank you for choosing Mahalaxmi Fashion Hub.',
    ].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
  }
  if (kind === 'review') {
    const base = log && (log.whatsappText || log.message) ? (log.whatsappText || log.message)! : [
      hello, '',
      `Your order ${r.refId} from Mahalaxmi Fashion Hub has been delivered.`,
      r.items.length ? `Item: ${r.items.join(', ')}` : '', '',
      'How did you like it? Please share your review - it helps other customers a lot.',
    ].filter(Boolean).join('\n');
    return base.includes('/reviews') ? base
      : `${base}\n\nWrite a review: ${SITE}/reviews\n\nThank you for choosing Mahalaxmi Fashion Hub.`;
  }
  const noAccount = /no such account/i.test(r.reason ?? '') || r.hasAccount === false;
  return [
    hello, '',
    'We saw that you could not log in to Mahalaxmi Fashion Hub.', '',
    noAccount
      ? `Login with OTP - no password needed. Open ${SITE}/account, enter your mobile number or email and type the OTP we send. Your account is made in the same step.`
      : `Login with OTP - no password needed. Open ${SITE}/account, enter your mobile number or email and type the OTP we send.`,
    '',
    noAccount ? '' : `Forgot your password? Reset it here: ${SITE}/forgot-password`,
    '',
    'Thank you for choosing Mahalaxmi Fashion Hub.',
  ].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
}
interface Note { id: number; outcome: string; note?: string | null; callbackAt?: string | null; createdBy?: string | null; createdAt: string }

const OUTCOMES: Record<Kind, { key: string; label: string }[]> = {
  review: [
    { key: 'will_review', label: 'Will give review' },
    { key: 'reviewed', label: 'Review done' },
    { key: 'not_picked', label: 'Not picked' },
    { key: 'busy', label: 'Busy' },
    { key: 'call_later', label: 'Call later' },
    { key: 'switched_off', label: 'Switched off' },
    { key: 'complaint', label: 'Complaint / not happy' },
    { key: 'whatsapp_sent', label: 'Sent on WhatsApp' },
    { key: 'wrong_number', label: 'Wrong number' },
    { key: 'not_interested', label: 'Not interested' },
    { key: 'other', label: 'Other' },
  ],
  dropped: [
    { key: 'will_order', label: 'Will order' },
    { key: 'ordered', label: 'Ordered' },
    { key: 'payment_problem', label: 'Payment problem' },
    { key: 'not_picked', label: 'Not picked' },
    { key: 'busy', label: 'Busy' },
    { key: 'call_later', label: 'Call later' },
    { key: 'switched_off', label: 'Switched off' },
    { key: 'whatsapp_sent', label: 'Sent on WhatsApp' },
    { key: 'wrong_number', label: 'Wrong number' },
    { key: 'not_interested', label: 'Not interested' },
    { key: 'other', label: 'Other' },
  ],
  login: [
    { key: 'logged_in', label: 'Logged in now' },
    { key: 'account_made', label: 'Account made' },
    { key: 'helped_login', label: 'Explained OTP login' },
    { key: 'not_picked', label: 'Not picked' },
    { key: 'busy', label: 'Busy' },
    { key: 'call_later', label: 'Call later' },
    { key: 'switched_off', label: 'Switched off' },
    { key: 'whatsapp_sent', label: 'Sent on WhatsApp' },
    { key: 'wrong_number', label: 'Wrong number' },
    { key: 'not_interested', label: 'Not interested' },
    { key: 'other', label: 'Other' },
  ],
};
const outcomeLabel = (k?: string | null) =>
  [...OUTCOMES.review, ...OUTCOMES.dropped, ...OUTCOMES.login].find(o => o.key === k)?.label ?? (k || '');

const STAGE: Record<Stage, { label: string; tone: 'red' | 'amber' | 'green' | 'grey' }> = {
  todo: { label: 'To call', tone: 'red' },
  callback: { label: 'Call back', tone: 'amber' },
  called: { label: 'Called', tone: 'grey' },
  done: { label: 'Done', tone: 'green' },
};

const auth = () => ({ Authorization: `Bearer ${getAdminToken() ?? ''}` });
function when(raw?: string | null) {
  if (!raw) return '';
  return new Date(raw).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const money = (n: number) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
// datetime-local wants local time without a zone.
function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function FollowUpPage() {
  const [kind, setKind] = useState<Kind>('review');
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<'all' | Stage>('all');
  const [q, setQ] = useState('');

  const [open, setOpen] = useState<Row | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [callback, setCallback] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  // SMS that already went, by order id - the WhatsApp button sends the same text.
  const [smsByOrder, setSmsByOrder] = useState<Record<string, SmsLogLite>>({});

  const load = async () => {
    setLoading(true); setError(''); setSmsByOrder({});
    try {
      const res = await fetch(`/api/follow-ups/${API[kind]}?days=${days}`, { headers: auth() });
      if (!res.ok) throw new Error(res.status === 403 ? 'You do not have access to this list.' : `Could not load (${res.status})`);
      const b = await res.json();
      setRows(b.rows ?? []);
      if (kind !== 'login') {
        // Best effort: a staff member without the Campaigns page gets the
        // message written here instead.
        try {
          const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
          const lr = await fetch(`/api/sms-logs?from=${from}&limit=500`, { headers: auth() });
          if (lr.ok) {
            const lb = await lr.json();
            const map: Record<string, SmsLogLite> = {};
            for (const l of (lb.logs ?? []) as (SmsLogLite & { templateName?: string | null })[]) {
              const oid = orderIdOfVars(l.vars);
              if (!oid || map[oid] || !(l.whatsappText || l.message)) continue;
              // Only the message this list is about: the USER_DROPPED2 text
              // (the one with a WhatsApp layout), or the review ask - not the
              // shipped / delivered texts of the same order.
              if (kind === 'dropped' && !l.whatsappText) continue;
              if (kind === 'review' && !/review/i.test(l.templateName ?? '')) continue;
              map[oid] = l;
            }
            setSmsByOrder(map);
          }
        } catch { /* fallback text is used */ }
      }
    } catch (e) {
      setRows([]); setError(e instanceof Error ? e.message : 'Could not load');
    } finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [kind, days]);

  const counts = useMemo(() => {
    const c = { all: rows.length, todo: 0, callback: 0, called: 0, done: 0 } as Record<string, number>;
    rows.forEach(r => { c[r.stage] = (c[r.stage] ?? 0) + 1; });
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const dg = t.replace(/\D/g, '');
    return rows
      .filter(r => stage === 'all' || r.stage === stage)
      .filter(r => !t || r.refId.toLowerCase().includes(t) || r.name.toLowerCase().includes(t) || (r.email ?? '').toLowerCase().includes(t) || (dg.length >= 4 && r.phone.includes(dg)));
  }, [rows, stage, q]);

  const openRow = async (r: Row) => {
    setOpen(r); setNotes([]); setOutcome(''); setNote(''); setCallback(''); setFormErr('');
    try {
      const res = await fetch(`/api/follow-ups/notes?kind=${kind}&refId=${encodeURIComponent(r.refId)}`, { headers: auth() });
      const b = await res.json();
      setNotes(b.notes ?? []);
    } catch { /* the form still works */ }
  };

  const save = async () => {
    if (!open) return;
    if (!outcome) { setFormErr('Choose what happened on the call.'); return; }
    setSaving(true); setFormErr('');
    try {
      const res = await fetch('/api/follow-ups/notes', {
        method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, refId: open.refId, phone: open.phone, outcome, note, callbackAt: callback ? new Date(callback).toISOString() : null }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok || !b.success) { setFormErr(b.message || 'Could not save.'); return; }
      setOpen(null);
      await load();
    } finally { setSaving(false); }
  };

  const waHref = (r: Row) => `https://wa.me/91${r.phone}?text=${encodeURIComponent(waText(kind, r, smsByOrder[r.refId]))}`;
  // Clicking WhatsApp writes it down (a "Sent on WhatsApp" call note, and the
  // tick in SMS Logs for the same message), so the button shows a tick.
  const markWa = async (r: Row) => {
    const now = new Date().toISOString();
    setRows(rs => rs.map(x => (x.refId === r.refId ? { ...x, waAt: now } : x)));
    setOpen(o => (o && o.refId === r.refId ? { ...o, waAt: now } : o));
    const log = smsByOrder[r.refId];
    try {
      if (log) await fetch(`/api/sms-logs/${log.id}/whatsapp`, { method: 'POST', headers: auth() });
      await fetch('/api/follow-ups/notes', {
        method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, refId: r.refId, phone: r.phone, outcome: 'whatsapp_sent', note: 'WhatsApp message sent' }),
      });
    } catch { /* the tick stays for this visit */ }
  };
  const waSent = (r: Row) => r.waAt || (kind === 'dropped' ? r.whatsAppAt : null);
  const WaButton = ({ r, big }: { r: Row; big?: boolean }) => {
    const sent = waSent(r);
    return (
      <a className="adm-btn" href={waHref(r)} target="_blank" rel="noopener noreferrer" onClick={() => markWa(r)}
         title={sent ? `Sent on WhatsApp ${when(sent)}` : 'Open WhatsApp with the message'}
         style={{ padding: big ? undefined : '.2rem .5rem', fontSize: big ? undefined : 12,
                  ...(sent ? { background: '#e7f6f3', borderColor: '#128C7E', color: '#0b6b5f', fontWeight: 700 } : { color: '#128C7E' }) }}>
        {sent && (
          <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }}>
            <circle cx="12" cy="12" r="11" fill="#128C7E" />
            <path d="M7 12.5l3.2 3.2L17.5 8.5" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        WhatsApp
      </a>
    );
  };

  const delNote = async (id: number) => {
    if (!confirm('Delete this note?')) return;
    await fetch(`/api/follow-ups/notes/${id}`, { method: 'DELETE', headers: auth() });
    setNotes(ns => ns.filter(n => n.id !== id));
    load();
  };

  const exportExcel = () => {
    if (kind === 'login') {
      downloadCsv([
        ['Last try', 'Login id', 'Name', 'Phone', 'Email', 'Attempts', 'Why', 'Has account', 'Help mail', 'Help SMS', 'Got in later', 'Stage', 'Last call', 'Note', 'Call back', 'Calls'],
        ...shown.map(r => [when(r.when), r.refId, r.name, r.phone, r.email ?? '', String(r.attempts ?? 0), REASON[r.reason ?? ''] ?? r.reason ?? '',
          r.hasAccount ? 'Yes' : 'No', when(r.helpMail), when(r.helpSms), r.gotIn ? 'Yes' : 'No',
          STAGE[r.stage].label, outcomeLabel(r.lastOutcome), r.lastNote ?? '', when(r.callbackAt), String(r.calls)]),
      ], `follow-up-login-${new Date().toISOString().slice(0, 10)}.csv`);
      return;
    }
    downloadCsv([
      kind === 'review'
        ? ['Delivered', 'Order', 'Customer', 'Phone', 'Items', 'Amount', 'Review', 'Review SMS', 'Stage', 'Last call', 'Note', 'Call back', 'Calls']
        : ['Checkout', 'Order id', 'Customer', 'Phone', 'Items', 'Amount', 'USER_DROPPED2 SMS', 'WhatsApp', 'Bought later', 'Stage', 'Last call', 'Note', 'Call back', 'Calls'],
      ...shown.map(r => kind === 'review'
        ? [when(r.when), r.refId, r.name, r.phone, r.items.join('; '), String(r.amount),
           r.reviewed ? `Yes (${r.rating ?? ''})` : 'No', r.smsCount ? `${r.smsCount}x, last ${when(r.smsLast)}` : '',
           STAGE[r.stage].label, outcomeLabel(r.lastOutcome), r.lastNote ?? '', when(r.callbackAt), String(r.calls)]
        : [when(r.when), r.refId, r.name, r.phone, r.items.join('; '), String(r.amount),
           r.smsAt ? when(r.smsAt) : '', r.whatsAppAt ? when(r.whatsAppAt) : '', r.boughtOrder ?? '',
           STAGE[r.stage].label, outcomeLabel(r.lastOutcome), r.lastNote ?? '', when(r.callbackAt), String(r.calls)]),
    ], `follow-up-${kind}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const cell = { padding: '8px 6px', verticalAlign: 'top' as const };
  const small = { fontSize: 11, color: '#777' };

  return (
    <div className="admin-page">
      <PageHeader
        title="Follow-up Calls"
        sub="Call customers who have not reviewed, and those whose payment did not finish. Write down every call so the next person knows what was said."
        right={<>
          <button className="adm-btn" onClick={load}>Refresh</button>
          <button className="adm-btn adm-btn-primary" onClick={exportExcel} disabled={shown.length === 0}>Excel ({shown.length})</button>
        </>}
      />

      <Chips value={kind} onChange={k => { setKind(k as Kind); setStage('all'); setDays(DEFAULT_DAYS[k as Kind]); }}
             items={[{ key: 'review', label: 'Review calls' }, { key: 'dropped', label: 'Payment not completed (USER_DROPPED2)' },
                     { key: 'login', label: 'Login failed' }]} />

      <StatGrid cols={4}>
        <Stat label="To call" value={counts.todo} tone={counts.todo ? 'red' : undefined} onClick={() => setStage('todo')} />
        <Stat label="Call back due" value={counts.callback} onClick={() => setStage('callback')} />
        <Stat label="Called" value={counts.called} onClick={() => setStage('called')} />
        <Stat label={kind === 'review' ? 'Reviewed / closed' : kind === 'login' ? 'Logged in / closed' : 'Ordered / closed'} value={counts.done} tone="green" onClick={() => setStage('done')} />
      </StatGrid>

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <Chips value={stage} onChange={k => setStage(k as 'all' | Stage)} items={[
            { key: 'all', label: 'All', count: counts.all },
            { key: 'todo', label: 'To call', count: counts.todo },
            { key: 'callback', label: 'Call back', count: counts.callback },
            { key: 'called', label: 'Called', count: counts.called },
            { key: 'done', label: 'Done', count: counts.done },
          ]} />
          <input className="adm-input" value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'login' ? 'Name, mobile or email' : 'Name, mobile or order id'} style={{ flex: 1, minWidth: 180 }} />
          <select className="adm-input" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 150 }}>
            {[7, 15, 30, 60, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </div>

        {error && <p style={{ color: '#c0392b' }}>{error}</p>}
        {loading ? <Empty>Loading…</Empty> : shown.length === 0 ? <Empty>Nothing here.</Empty> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={cell}>{kind === 'review' ? 'Delivered' : kind === 'login' ? 'Last try' : 'Checkout'}</th>
                  <th style={cell}>Customer</th>
                  <th style={cell}>{kind === 'login' ? 'What went wrong' : 'Items'}</th>
                  <th style={cell}>{kind === 'review' ? 'Review' : kind === 'login' ? 'Help sent / got in' : 'SMS / WhatsApp'}</th>
                  <th style={cell}>Last call</th>
                  <th style={cell}></th>
                </tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.refId} style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      {when(r.when)}
                      {kind !== 'login' && <div style={{ ...small, fontFamily: 'monospace' }}>{r.refId}</div>}
                      {kind !== 'login' && <div style={small}>{money(r.amount)}</div>}
                    </td>
                    <td style={cell}>
                      <div style={{ fontWeight: 600 }}>{r.name || (kind === 'login' ? r.refId : '-')}</div>
                      {kind === 'login' && r.email && r.email !== r.name && <div style={small}>{r.email}</div>}
                      {r.phone && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                          <a href={`tel:+91${r.phone}`} style={{ color: '#2563eb' }}>{r.phone}</a>
                          <WaButton r={r} />
                        </div>
                      )}
                    </td>
                    <td style={{ ...cell, maxWidth: 320 }}>
                      {kind === 'login' ? (
                        <>
                          <Pill tone="red">{REASON[r.reason ?? ''] ?? (r.reason || 'Failed')}</Pill>
                          <div style={small}>{r.attempts} {r.attempts === 1 ? 'try' : 'tries'} · {r.method} · {r.platform === 'app' ? 'App' : 'Website'}{r.device ? ` · ${r.device}` : ''}</div>
                          <div style={small}>{r.hasAccount ? 'Has an account' : 'No account yet'}</div>
                        </>
                      ) : r.items.length ? r.items.map((it, i) => <div key={i}>{it}</div>) : <span style={small}>-</span>}
                    </td>
                    <td style={cell}>
                      {kind === 'login' ? (
                        <>
                          {r.gotIn ? <Pill tone="green">Logged in later</Pill> : <Pill tone="amber">Not in yet</Pill>}
                          <div style={small}>{r.helpMail ? `Help mail ${when(r.helpMail)}` : 'No help mail'}</div>
                          <div style={small}>{r.helpSms ? `Help SMS ${when(r.helpSms)}` : 'No help SMS'}</div>
                        </>
                      ) : kind === 'review' ? (
                        <>
                          {r.reviewed
                            ? <Pill tone="green">Reviewed{r.rating ? ` ${r.rating}/5` : ''}</Pill>
                            : <Pill tone="red">No review</Pill>}
                          <div style={small}>{r.smsCount ? `Review SMS ${r.smsCount}x, last ${when(r.smsLast)}` : 'No review SMS yet'}</div>
                        </>
                      ) : (
                        <>
                          {r.boughtOrder
                            ? <Pill tone="green">Ordered later</Pill>
                            : r.smsAt ? <Pill tone="grey">SMS sent</Pill> : <Pill tone="amber">No SMS</Pill>}
                          {r.smsAt && <div style={small}>USER_DROPPED2 {when(r.smsAt)}</div>}
                          {r.whatsAppAt && <div style={{ ...small, color: '#0b6b5f' }}>WhatsApp {when(r.whatsAppAt)}</div>}
                          {r.boughtOrder && <div style={{ ...small, fontFamily: 'monospace' }}>{r.boughtOrder}</div>}
                          {r.cfStatus && <div style={small}>Cashfree: {r.cfStatus.replace(/_/g, ' ').toLowerCase()}</div>}
                        </>
                      )}
                    </td>
                    <td style={{ ...cell, maxWidth: 280 }}>
                      <Pill tone={STAGE[r.stage].tone}>{STAGE[r.stage].label}</Pill>
                      {r.lastOutcome && (
                        <div style={{ marginTop: 3 }}>
                          <b>{outcomeLabel(r.lastOutcome)}</b>{r.calls > 1 ? <span style={small}> ({r.calls} calls)</span> : null}
                          {r.lastNote && <div style={{ color: '#444' }}>{r.lastNote.length > 120 ? r.lastNote.slice(0, 120) + '…' : r.lastNote}</div>}
                          <div style={small}>{when(r.lastAt)}{r.lastBy ? ` · ${r.lastBy}` : ''}</div>
                        </div>
                      )}
                      {r.callbackAt && r.stage !== 'done' && <div style={{ ...small, color: '#b45309' }}>Call back: {when(r.callbackAt)}</div>}
                    </td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      <button className="adm-btn adm-btn-primary" style={{ padding: '.3rem .65rem', fontSize: 12 }} onClick={() => openRow(r)}>
                        {r.calls ? 'Add call note' : 'Log call'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && (
        <div onClick={() => setOpen(null)}
             style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: '#fff', borderRadius: 12, width: 'min(640px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{open.name || 'Customer'}</div>
                <div style={small}>{kind === 'login' ? `${open.refId} · ${REASON[open.reason ?? ''] ?? open.reason ?? ''}` : `${open.refId} · ${money(open.amount)}`}</div>
              </div>
              <button className="adm-btn" onClick={() => setOpen(null)}>Close</button>
            </div>
            {open.phone && (
              <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
                <a className="adm-btn adm-btn-primary" href={`tel:+91${open.phone}`}>Call {open.phone}</a>
                <WaButton r={open} big />
              </div>
            )}
            {open.items.length > 0 && <div style={{ fontSize: 13, color: '#444', marginBottom: 10 }}>{open.items.join(', ')}</div>}

            <div style={{ fontSize: 12, fontWeight: 700, color: '#722f37', textTransform: 'uppercase', letterSpacing: '.05em', margin: '8px 0 6px' }}>What happened on the call</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {OUTCOMES[kind].map(o => (
                <button key={o.key} type="button" onClick={() => {
                  setOutcome(o.key);
                  if ((o.key === 'call_later' || o.key === 'busy' || o.key === 'not_picked') && !callback) {
                    const d = new Date(); d.setHours(d.getHours() + (o.key === 'call_later' ? 24 : 3)); setCallback(localInput(d));
                  }
                }}
                  className={`adm-chip${outcome === o.key ? ' on' : ''}`}>{o.label}</button>
              ))}
            </div>
            <textarea className="adm-input" rows={4} value={note} onChange={e => setNote(e.target.value)}
                      placeholder={kind === 'login'
                        ? 'What did the customer say? (e.g. forgot password, did not know about OTP login, logged in on call)'
                        : 'What did the customer say? (e.g. size was small, will review after using, wants exchange, will pay tonight)'}
                      style={{ width: '100%', marginTop: 10, fontFamily: 'inherit', resize: 'vertical' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13 }}>Call back on</label>
              <input type="datetime-local" className="adm-input" value={callback} onChange={e => setCallback(e.target.value)} style={{ width: 220 }} />
              {callback && <button className="adm-btn" onClick={() => setCallback('')}>Clear</button>}
            </div>
            {formErr && <p style={{ color: '#c0392b', fontSize: 13 }}>{formErr}</p>}
            <button className="adm-btn adm-btn-primary" style={{ marginTop: 10 }} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save call note'}</button>

            <div style={{ fontSize: 12, fontWeight: 700, color: '#722f37', textTransform: 'uppercase', letterSpacing: '.05em', margin: '18px 0 6px' }}>
              Call history ({notes.length})
            </div>
            {notes.length === 0 ? <div style={small}>No calls yet.</div> : notes.map(n => (
              <div key={n.id} style={{ borderLeft: '3px solid #e5d3d6', padding: '4px 10px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ fontSize: 13 }}>{outcomeLabel(n.outcome)}</b>
                  <button onClick={() => delNote(n.id)} style={{ background: 'none', border: 0, color: '#c0392b', cursor: 'pointer', fontSize: 11 }}>Delete</button>
                </div>
                {n.note && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.note}</div>}
                <div style={small}>{when(n.createdAt)}{n.createdBy ? ` · ${n.createdBy}` : ''}{n.callbackAt ? ` · call back ${when(n.callbackAt)}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
