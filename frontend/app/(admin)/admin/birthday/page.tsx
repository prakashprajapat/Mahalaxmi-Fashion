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

// Server par likha hua ek bheja hua offer. Pehle ye hisab sirf is browser ke
// khaane me tha, isliye logout karte hi "Resend" gayab ho jata tha.
interface SendRow {
  customerId: number;
  occasion: OccType;
  slab: number;
  year: number;
  couponCode?: string | null;
  smsSent: boolean;
  emailSent: boolean;
  sentAt: string;
}

type OccType = 'birthday' | 'anniversary';

// 'both' = SMS aur email dono. 'email' = sirf email — un grahakon ke liye jinka
// number darj nahi hai, aur tab bhi jab dukandar sirf mail bhejna chahe.
type Channel = 'both' | 'email';

const API = '/api/customers';

// Day-slabs. A customer sits in exactly one slab per occasion, by how many days
// away the date is, and moves into the next tighter one as it approaches.
const SLABS = [
  { days: 30, label: '30 days', min: 16, max: 30 },
  { days: 15, label: '15 days', min: 8,  max: 15 },
  { days: 7,  label: '7 days',  min: 1,  max: 7  },
  { days: 0,  label: 'Today',   min: 0,  max: 0  },
] as const;

export default function BirthdayPage() {
  const [data, setData]       = useState<CelebrationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [slab, setSlab]       = useState<number>(0);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [result, setResult]   = useState<Record<string, string>>({});
  // Kamyabi alag se. Pehle lal/hara iss baat se tay hota tha ki jawab "Sent"
  // se shuru hota hai ya nahi — par jawab "SMS + Email — code BD-..." se shuru
  // hota hai, isliye kamyab bhejna bhi lal dikhta tha.
  const [resultOk, setResultOk] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Kya ja chuka hai: key = `${id}-${type}-${slab}-${year}`.
  //
  // Ye ab server se aata hai, is browser ke khaane se nahi. Purane sends jo is
  // deploy se pehle sirf yahan likhe gaye the, unhe mitaya nahi gaya — dono ko
  // milakar dekha jata hai, aur server ki baat upar rehti hai.
  const [sent, setSent] = useState<Record<string, string>>({});
  const [localSent, setLocalSent] = useState<Record<string, string>>({});

  // Saal grahak ke DIN ka, bhejne ka nahi. 28 December ko bheji gayi 3 January
  // wali badhai agle saal ke janmdin ki hai — server bhi yahi saal likhta hai.
  const occYear = (daysIn: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysIn);
    return d.getFullYear();
  };
  const sentKey = (id: number, type: OccType, slabDays: number, year: number) =>
    `${id}-${type}-${slabDays}-${year}`;

  useEffect(() => {
    try { setLocalSent(JSON.parse(localStorage.getItem('mfh_celeb_sent') ?? '{}')); } catch { /* ignore */ }
  }, []);

  const token = getAdminToken() ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Pull the widest window once and put people into slabs here.
      const res = await fetch(`${API}/celebrations?days=30`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setData(json.celebrations ?? []);
      const map: Record<string, string> = {};
      ((json.sends ?? []) as SendRow[]).forEach(r => {
        map[`${r.customerId}-${r.occasion}-${r.slab}-${r.year}`] = (r.sentAt || '').slice(0, 10);
      });
      setSent(map);
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [slab, data]);

  const sendSms = async (c: CelebrationEntry['customer'], type: OccType, slabDays: number,
                         daysIn: number, channel: Channel = 'both') => {
    const key = `${c.id}-${type}-${slabDays}`;
    setSending(s => ({ ...s, [key]: true }));
    try {
      const res = await fetch(`${API}/send-celebration-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // customerId bhi jata hai. Pehle server grahak ko sirf number se
        // dhoondhta tha, isliye bina number wale is raaste par aate hi nahi
        // the — na coupon banta, na email jati.
        body: JSON.stringify({
          customerId: c.id,
          phone: c.phone || null,
          occasion: type,
          slab: slabDays,
          channel: c.phone ? channel : 'email',
        }),
      });
      const json = await res.json();
      // Ab do raaste hain — SMS aur email — aur dono alag chalte hain. Ek chal
      // jaye to offer pahunch gayi, par kaunsa chala ye likha jata hai, warna
      // "Sent" dikhta rehta aur asal me aadha kaam hota.
      //
      // MSG91 ka request id saath me. "Sent" sirf itna kehta hai ki MSG91 ne
      // sandesh le liya — pahuncha ya nahi, ye uski report batati hai, aur
      // wahan ki pankti isi id se milti hai. Bina iske nambar se chhanna padta
      // tha.
      const went = [json.smsSent ? 'SMS' : null, json.emailSent ? 'Email' : null].filter(Boolean).join(' + ');
      setResultOk(r => ({ ...r, [key]: res.ok }));
      setResult(r => ({
        ...r,
        [key]: res.ok
          ? `${went || 'Sent'} — code ${json.couponCode ?? '—'}`
            + (json.emailSent && json.emailTo ? ` · ${json.emailTo}` : '')
            + (json.requestId ? ` · MSG91 ref ${json.requestId}` : '')
            + (json.smsSent && json.emailSent ? '' : ` · ${json.message}`)
          : json.message,
      }));
      if (res.ok) {
        // Server ne apne yahan likh liya hai; yahan sirf is pankti ko turant
        // badal dete hain, taki agle Refresh ka intezar na karna pade. Browser
        // wali purani copy bhi rakhi jati hai — net beech me toote to kam se
        // kam is machine par hisab bana rahe.
        const k = sentKey(c.id, type, slabDays, occYear(daysIn));
        const today = new Date().toISOString().slice(0, 10);
        setSent(prev => ({ ...prev, [k]: today }));
        setLocalSent(prev => {
          const next = { ...prev, [k]: today };
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

  // Kab bheja tha — server pehle, uske baad is browser ki purani copy. Teesri
  // koshish un sends ke liye hai jo is sudhar se pehle sirf browser me likhe
  // gaye the, jahan saal bhejne ka tha, grahak ke din ka nahi.
  const sentOn = (id: number, type: OccType, daysIn: number): string | undefined => {
    const k = sentKey(id, type, active.days, occYear(daysIn));
    return sent[k] ?? localSent[k] ?? localSent[sentKey(id, type, active.days, new Date().getFullYear())];
  };
  // Email bhi ek raasta hai. Pehle sirf number dekha jata tha, isliye jinke
  // paas email tha par number nahi, unke saamne koi batan hi nahi aata tha.
  const isSendable = (r: { c: { phone: string; email: string; id: number }; type: OccType; daysIn: number }) =>
    (Boolean(r.c.phone) || Boolean(r.c.email)) && !sentOn(r.c.id, r.type, r.daysIn);
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
    const byMail = targets.filter(r => !r.c.phone).length;
    const note = byMail === 0 ? 'SMS and email'
      : byMail === targets.length ? 'email'
      : `SMS and email (${byMail} of them by email only \u2014 no number on file)`;
    if (!confirm(`Send a real ${note} to ${targets.length} customer${targets.length === 1 ? '' : 's'} now?`)) return;
    setBulkBusy(true);
    for (const r of targets) {
      // eslint-disable-next-line no-await-in-loop
      await sendSms(r.c, r.type, active.days, r.daysIn);
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
        sub="One offer per slab, as the date gets closer: 30 days, 15, 7, then the day itself. Each one sends a real SMS and an email, both carrying the same coupon code \u2014 and a customer with no number on file can still be sent the email on its own."
        right={<button className="adm-btn" onClick={load}>Refresh</button>}
      />

      <StatGrid>
        <Stat label="Celebrating today" value={slabCount(0)} tone={slabCount(0) > 0 ? 'green' : undefined}
              action={slab === 0 ? undefined : 'Open today'} onClick={() => setSlab(0)} />
        <Stat label="Not yet sent in this slab" value={waiting} tone={waiting > 0 ? 'red' : undefined} />
        {/* Ye ginti sirf khule hue slab ki hai, poore catalogue ki nahi —
            isliye naam bhi wahi kehta hai. */}
        {/* Email ab bhi ja sakti hai, isliye ye ginti "nahi pahunch sakte"
            nahi kehti — sirf itna ki inhe SMS nahi jayegi. */}
        <Stat label="Email only in this slab (no number)" value={noPhone}
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
          const wasSent = sentOn(c.id, type, daysIn);
          const picked = selected.has(rowKey(c.id, type));
          const failed = result[k] !== undefined && resultOk[k] === false;
          const canSms   = Boolean(c.phone);
          const canEmail = Boolean(c.email);
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
                  {wasSent && <Pill tone="green">Offer sent</Pill>}
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
                {!canSms && !canEmail ? (
                  <span style={{ fontSize: '.76rem', color: '#a49a94' }}>No phone or email</span>
                ) : !canSms ? (
                  // Number nahi hai, email hai. Pehle yahan sirf "No phone"
                  // likha aata tha aur baat wahin ruk jati thi — jabki offer
                  // email se ja sakti thi.
                  <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {wasSent && <span style={{ fontSize: '.74rem', color: '#7d736d' }} title={`Sent on ${wasSent}`}>{wasSent}</span>}
                    <button className={wasSent ? 'adm-btn' : 'adm-btn adm-btn-primary'}
                            style={{ padding: '.35rem .8rem', fontSize: '.78rem' }}
                            onClick={() => sendSms(c, type, active.days, daysIn, 'email')} disabled={sending[k]}
                            title={`Send the offer by email to ${c.email} — no SMS, there is no number on file`}>
                      {sending[k] ? 'Sending…' : wasSent ? 'Resend email' : 'Send email'}
                    </button>
                  </div>
                ) : wasSent ? (
                  // Bheja ja chuka hai — par "bheja gaya" ka matlab sirf itna hai
                  // ki MSG91 ne le liya. Template galat ho, variable khali rah
                  // jayein, ya grahak ka phone band ho, to sandesh pahunchta hi
                  // nahi — aur pehle is pankti par koi batan hi nahi bachta tha,
                  // yani theek karne ke baad dobara bhejne ka koi rasta nahi.
                  //
                  // Dobara bhejne me coupon barbaad nahi hota: server us grahak
                  // ka pehle wala bina istemal kiya coupon hi dhoondh kar bhejta
                  // hai, naya tabhi banata hai jab koi ho hi na.
                  <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '.74rem', color: '#7d736d' }} title={`Sent on ${wasSent}`}>{wasSent}</span>
                    <button className="adm-btn" style={{ padding: '.35rem .8rem', fontSize: '.78rem' }}
                            onClick={() => sendSms(c, type, active.days, daysIn)} disabled={sending[k]}
                            title="Send the same offer again, by SMS and email — the same coupon code goes out, not a new one">
                      {sending[k] ? 'Sending…' : 'Resend'}
                    </button>
                    {canEmail && (
                      <button className="adm-btn" style={{ padding: '.35rem .8rem', fontSize: '.78rem' }}
                              onClick={() => sendSms(c, type, active.days, daysIn, 'email')} disabled={sending[k]}
                              title={`Send only the email to ${c.email} — MSG91 is not touched, so no SMS goes out`}>
                        Resend email
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button className="adm-btn adm-btn-primary" style={{ padding: '.35rem .8rem', fontSize: '.78rem' }}
                            onClick={() => sendSms(c, type, active.days, daysIn)} disabled={sending[k]}
                            title="Send the offer by SMS and email — one coupon code in both">
                      {sending[k] ? 'Sending…' : 'Send offer'}
                    </button>
                    {canEmail && (
                      <button className="adm-btn" style={{ padding: '.35rem .8rem', fontSize: '.78rem' }}
                              onClick={() => sendSms(c, type, active.days, daysIn, 'email')} disabled={sending[k]}
                              title={`Send only the email to ${c.email} — MSG91 is not touched, so no SMS goes out`}>
                        Email only
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {/* Pehle yahan likha tha ki ye hisab sirf browser ka hai. Ab nahi. */}
      <Card>
        <p style={{ margin: 0, fontSize: '.82rem', color: '#7d736d', lineHeight: 1.7 }}>
          <strong>“Sent” is now kept on the server.</strong> Log out, log in from another computer or from
          your phone — the same record is there, so an offer already sent shows <em>Resend</em>, not
          <em> Send offer</em>, and a customer does not get the same offer twice. Each slab is counted on its
          own: 30 days, 15, 7 and the day itself are four separate offers, all carrying one coupon code.
        </p>
        <p style={{ margin: '.5rem 0 0', fontSize: '.82rem', color: '#7d736d' }}>
          Offers recorded on the server: <strong>{Object.keys(sent).length}</strong>
        </p>
      </Card>
    </div>
  );
}
