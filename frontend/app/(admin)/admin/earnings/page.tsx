'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { earningsApi, type EarningRow, type EarningsResponse } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { btn } from '@/components/admin/SeoFields';

// Shop settlement: what each shop that lists here has earned, what is payable
// today, and the button that says it has been handed over.
//
// The screen is the same component for the owner and for a vendor, and it is
// the SERVER that decides which of them is looking - what comes back for a
// staff member has no other shop in it and no platform column, because those
// fields are never put in the response rather than hidden once they arrive. So
// there is no `if (isOwner)` here holding back something the browser is already
// holding; the columns below simply have nothing to draw.
//
// One number deserves its own explanation, and gets one on screen: "to
// recover". A parcel can be delivered, the window can close, the shop can be
// paid - and the customer can still send it back afterwards through an
// exchange or a late return. Software cannot un-pay that. Folding it into
// "paid" would quietly lose it, so it is counted separately and says what to
// do: take it off the next settlement.

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const shortDate = (raw?: string | null) => {
  if (!raw) return '—';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const daysLeft = (raw: string) => {
  const ms = new Date(raw).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
};

export default function EarningsPage() {
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [shop, setShop] = useState('');
  const [status, setStatus] = useState('pending');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const token = getAdminToken();
    if (!token) { setLoading(false); return; }
    try {
      const res = await earningsApi.list(token, { shop: shop || undefined, status });
      setData(res);
      setPicked(new Set());
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not load the settlement.' });
    } finally {
      setLoading(false);
    }
  }, [shop, status]);

  useEffect(() => { load(); }, [load]);

  // Memoised only because `?? []` builds a fresh array on every render, and
  // the two useMemos below take it as a dependency - so without this they
  // recompute every time anything on the page changes.
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const isOwner = data?.isOwner === true;

  const payableRows = useMemo(() => rows.filter(r => r.payable), [rows]);

  const pickedTotal = useMemo(
    () => rows.filter(r => picked.has(r.id)).reduce((s, r) => s + r.staffAmount, 0),
    [rows, picked],
  );

  const toggle = (id: number) => setPicked(p => {
    const next = new Set(p);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => setPicked(p =>
    p.size === payableRows.length ? new Set() : new Set(payableRows.map(r => r.id)));

  async function pay() {
    const token = getAdminToken();
    if (!token || picked.size === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await earningsApi.pay([...picked], note, token);
      setMsg({ kind: res.success ? 'ok' : 'err', text: res.message });
      setNote('');
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not mark these paid.' });
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const token = getAdminToken();
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await earningsApi.refresh(token);
      setMsg({ kind: 'ok', text: res.message });
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not refresh.' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="admin-page"><div style={{ padding: '3rem', textAlign: 'center', color: '#a49a94' }}>Loading…</div></div>;
  }

  const t = data?.totals;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>{isOwner ? 'Shop settlement' : 'My earnings'}</h1>
        <p className="admin-page-sub">
          {isOwner
            ? `What each shop is owed for the goods it supplied. A sale counts once the parcel is delivered and its ${data?.holdDays ?? 7}-day return window has closed — before that it is held back, because a returned parcel owes nobody anything.`
            : `What you have earned on your listings. A sale becomes payable once the parcel is delivered and the ${data?.holdDays ?? 7}-day return window has closed.`}
        </p>
      </div>

      {data?.message && (
        <p style={{ padding: '.8rem 1rem', background: '#fffaf2', border: '1px solid #f0e2cc', borderRadius: 12, fontSize: '.85rem', color: '#6b5a3c' }}>
          {data.message}
        </p>
      )}

      {/* ── the numbers ────────────────────────────────────── */}
      {t && (
        <div style={{ display: 'grid', gap: '.8rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: '1.25rem' }}>
          <Tile label="Payable now" value={money(t.payableNow)} tone="good" />
          <Tile label="Still in return window" value={money(t.heldBack)} />
          <Tile label="Already paid" value={money(t.paid)} />
          {t.toRecover > 0 && (
            <Tile label="Paid, then returned" value={money(t.toRecover)} tone="bad"
                  hint="Take this off the next settlement." />
          )}
          {isOwner && t.platformKept != null && (
            <Tile label="Your platform fee" value={money(t.platformKept)} tone="accent" />
          )}
        </div>
      )}

      {/* ── filters ───────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        {isOwner && (data?.shops ?? []).length > 0 && (
          <select value={shop} onChange={e => setShop(e.target.value)} style={selectStyle}>
            <option value="">Every shop</option>
            {(data?.shops ?? []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
          <option value="pending">Not yet paid</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Returned / cancelled</option>
          <option value="all">Everything</option>
        </select>
        {isOwner && (
          <button type="button" onClick={refresh} disabled={busy} style={btn('ghost')}>
            {busy ? 'Working…' : 'Check for new deliveries'}
          </button>
        )}
      </div>

      {/* ── the pay bar ───────────────────────────────────────────────────
          Only shown once something is ticked, and it says the amount before
          it says the verb. Handing over cash is the irreversible half of this
          screen, so the figure being agreed is the loudest thing on it. */}
      {isOwner && picked.size > 0 && (
        <div style={{
          display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center',
          background: '#f2f8f3', border: '1.5px solid #bcd9c3', borderRadius: 12,
          padding: '.8rem 1rem', marginBottom: '1rem',
        }}>
          <strong style={{ fontSize: '.95rem', color: '#2f6b3d' }}>
            {picked.size} {picked.size === 1 ? 'sale' : 'sales'} · {money(pickedTotal)}
          </strong>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="How it was paid — UPI, cash, reference no."
            style={{ flex: '1 1 240px', border: '1.5px solid #bcd9c3', borderRadius: 10, padding: '.5rem .7rem', fontSize: '.85rem' }}
          />
          <button type="button" onClick={pay} disabled={busy} style={btn('primary')}>
            {busy ? 'Saving…' : 'Mark paid'}
          </button>
        </div>
      )}

      {msg && (
        <p style={{
          margin: '0 0 1rem', padding: '.7rem .9rem', borderRadius: 10, fontSize: '.85rem',
          background: msg.kind === 'ok' ? '#f2f8f3' : '#fdf3f2',
          color: msg.kind === 'ok' ? '#2f6b3d' : '#9c2f28',
          border: `1px solid ${msg.kind === 'ok' ? '#bcd9c3' : '#f0cfcb'}`,
        }}>
          {msg.text}
        </p>
      )}

      {/* ── the rows ──────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <p style={{ padding: '2.5rem', textAlign: 'center', color: '#a49a94', background: '#fff', border: '1px dashed #e5dcdd', borderRadius: 14, fontSize: '.88rem' }}>
          Nothing here yet. A sale appears once its parcel is marked Delivered and the product has a staff price on it.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
            <thead>
              <tr style={{ background: '#faf7f5', textAlign: 'left' }}>
                {isOwner && (
                  <th style={th}>
                    <input
                      type="checkbox"
                      checked={payableRows.length > 0 && picked.size === payableRows.length}
                      onChange={toggleAll}
                      disabled={payableRows.length === 0}
                      aria-label="Select everything payable"
                    />
                  </th>
                )}
                <th style={th}>Product</th>
                {isOwner && <th style={th}>Shop</th>}
                <th style={th}>Order</th>
                <th style={{ ...th, textAlign: 'right' }}>Qty</th>
                <th style={{ ...th, textAlign: 'right' }}>Sold at</th>
                <th style={{ ...th, textAlign: 'right' }}>Shop gets</th>
                {isOwner && <th style={{ ...th, textAlign: 'right' }}>You keep</th>}
                <th style={th}>Delivered</th>
                <th style={th}>State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <Row key={r.id} r={r} isOwner={isOwner} picked={picked.has(r.id)} onToggle={() => toggle(r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ margin: '1rem 0 0', fontSize: '.78rem', color: '#8a817b', lineHeight: 1.65 }}>
        Each line is fixed at the moment the parcel was delivered — the price the shop asked for
        then, and the price the customer actually paid. Changing a product&apos;s staff price later
        does not move money that has already been settled.
      </p>
    </div>
  );
}

function Row({ r, isOwner, picked, onToggle }: {
  r: EarningRow; isOwner: boolean; picked: boolean; onToggle: () => void;
}) {
  const returnedAfterPay = r.status === 'paid' && r.note;
  return (
    <tr style={{ borderTop: '1px solid #f3eeec', background: returnedAfterPay ? '#fdf3f2' : undefined }}>
      {isOwner && (
        <td style={td}>
          <input
            type="checkbox"
            checked={picked}
            onChange={onToggle}
            disabled={!r.payable}
            aria-label={`Select ${r.productName}`}
          />
        </td>
      )}
      <td style={td}>
        <div style={{ fontWeight: 600, color: '#2c2724' }}>{r.productName}</div>
        {r.sku && <div style={{ fontSize: '.74rem', color: '#a49a94' }}>{r.sku}</div>}
      </td>
      {isOwner && <td style={td}>{r.shopName ?? '—'}</td>}
      <td style={{ ...td, fontSize: '.78rem', color: '#6b625c' }}>{r.orderId}</td>
      <td style={{ ...td, textAlign: 'right' }}>{r.qty}</td>
      <td style={{ ...td, textAlign: 'right' }}>{money(r.soldUnit)}</td>
      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(r.staffAmount)}</td>
      {isOwner && (
        <td style={{ ...td, textAlign: 'right', color: r.platformAmount != null && r.platformAmount < 0 ? '#9c2f28' : '#2f6b3d', fontWeight: 600 }}>
          {r.platformAmount == null ? '—' : money(r.platformAmount)}
        </td>
      )}
      <td style={{ ...td, fontSize: '.78rem', color: '#6b625c' }}>{shortDate(r.deliveredAt)}</td>
      <td style={td}><State r={r} /></td>
    </tr>
  );
}

function State({ r }: { r: EarningRow }) {
  if (r.status === 'cancelled') return <Pill tone="muted" text="Returned" title={r.note ?? undefined} />;
  if (r.status === 'paid') {
    return r.note
      ? <Pill tone="bad" text="Returned after paying" title={r.note} />
      : <Pill tone="good" text={`Paid ${shortDate(r.paidAt)}`} title={r.paidNote ?? undefined} />;
  }
  if (r.payable) return <Pill tone="good" text="Payable" />;
  const d = daysLeft(r.payableAt);
  return <Pill tone="wait" text={d === 1 ? '1 day to go' : `${d} days to go`} title="Inside the return window." />;
}

function Pill({ tone, text, title }: { tone: 'good' | 'bad' | 'wait' | 'muted'; text: string; title?: string }) {
  const colours: Record<string, [string, string, string]> = {
    good:  ['#f2f8f3', '#bcd9c3', '#2f6b3d'],
    bad:   ['#fdf3f2', '#f0cfcb', '#9c2f28'],
    wait:  ['#fffaf2', '#f0e2cc', '#8a6420'],
    muted: ['#f6f4f3', '#e5dcdd', '#8a817b'],
  };
  const [bg, border, fg] = colours[tone];
  return (
    <span title={title} style={{
      display: 'inline-block', padding: '.2rem .55rem', borderRadius: 999,
      background: bg, border: `1px solid ${border}`, color: fg,
      fontSize: '.73rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  );
}

function Tile({ label, value, tone, hint }: {
  label: string; value: string; tone?: 'good' | 'bad' | 'accent'; hint?: string;
}) {
  const fg = tone === 'good' ? '#2f6b3d' : tone === 'bad' ? '#9c2f28' : tone === 'accent' ? '#722f37' : '#2c2724';
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '.9rem 1rem' }}>
      <div style={{ fontSize: '.73rem', color: '#8a817b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.45rem', fontWeight: 700, color: fg, marginTop: '.25rem' }}>{value}</div>
      {hint && <div style={{ fontSize: '.73rem', color: '#9c2f28', marginTop: '.2rem' }}>{hint}</div>}
    </div>
  );
}

const th: React.CSSProperties = { padding: '.65rem .8rem', fontSize: '.74rem', fontWeight: 700, color: '#6b625c', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '.65rem .8rem', verticalAlign: 'top' };
const selectStyle: React.CSSProperties = { border: '1.5px solid #e5dcdd', borderRadius: 10, padding: '.45rem .7rem', fontSize: '.85rem', background: '#fff', cursor: 'pointer' };
