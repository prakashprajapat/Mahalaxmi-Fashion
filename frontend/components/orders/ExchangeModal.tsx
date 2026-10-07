'use client';
import { useEffect, useMemo, useState } from 'react';
import { exchangesApi, ordersApi, productsApi } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { Order, Product } from '@/types';

// Asking to swap one thing for another.
//
// The shop's policy used to turn an exchange into a return plus a fresh order,
// which is tidy for the shop and poor for the customer: the money goes back to
// their bank and they have to order and pay again while the first parcel is
// still travelling. The owner chose to keep the money and swap the goods, so
// this form has to say three things clearly - what is going back, what is
// coming instead, and who owes whom the difference.
//
// Everything here is written to be read by somebody who is already slightly
// annoyed: the size did not fit, or the wrong thing arrived. No cleverness, one
// question at a time, and the money stated in words before anything is sent.

const REASONS = [
  { value: 'Size did not fit', ours: false },
  { value: 'Changed my mind about the colour', ours: false },
  { value: 'Wrong size sent', ours: true },
  { value: 'Wrong item sent', ours: true },
  { value: 'Damaged on arrival', ours: true },
  { value: 'Defective', ours: true },
];

/** Sizes and colours a product offers, read out of the extra details it carries. */
function variantsOf(p: Product | null): { sizes: string[]; colours: string[] } {
  if (!p?.extraJson) return { sizes: [], colours: [] };
  try {
    const e = JSON.parse(p.extraJson);
    const names = (list: unknown): string[] =>
      Array.isArray(list)
        ? list.map((x: any) => (typeof x === 'string' ? x : x?.name)).filter(Boolean)
        : [];
    return { sizes: names(e.sizes), colours: names(e.colors ?? e.colours) };
  } catch {
    return { sizes: [], colours: [] };
  }
}

const label: React.CSSProperties = { fontSize: '.82rem', fontWeight: 650, display: 'block', marginBottom: '.3rem', color: '#2d2724' };
const field: React.CSSProperties = {
  width: '100%', border: '1.5px solid #ddd', borderRadius: 8, padding: '.55rem .7rem',
  fontSize: '.88rem', background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit',
};

export default function ExchangeModal({ order, onClose, onDone }: {
  order: Order;
  onClose: () => void;
  onDone: () => void;
}) {
  const lines = order.cart ?? [];

  const [haveIdx, setHaveIdx] = useState(0);
  const [mode, setMode] = useState<'same' | 'other'>('same');
  const [wantProduct, setWantProduct] = useState<Product | null>(null);
  const [wantSize, setWantSize] = useState('');
  const [wantColour, setWantColour] = useState('');
  const [reason, setReason] = useState(REASONS[0].value);
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const have = lines[haveIdx];

  // The thing being swapped FOR. Same product by default, because nine times in
  // ten this is a size that did not fit.
  useEffect(() => {
    if (!have) return;
    setWantSize(''); setWantColour(''); setResults([]); setSearch('');
    if (mode === 'same') {
      productsApi.getById(Number(have.id))
        .then(r => setWantProduct(r.product ?? null))
        .catch(() => setWantProduct(null));
    } else {
      setWantProduct(null);
    }
  }, [haveIdx, mode, have]);

  const variants = useMemo(() => variantsOf(wantProduct), [wantProduct]);

  const newPrice = wantProduct
    ? (wantProduct.discountPrice && wantProduct.discountPrice > 0 ? wantProduct.discountPrice : wantProduct.price)
    : 0;
  const paid = have?.price ?? 0;
  const difference = wantProduct ? newPrice - paid : 0;

  const ourFault = REASONS.find(r => r.value === reason)?.ours ?? false;

  const doSearch = async () => {
    const q = search.trim();
    if (q.length < 2) return;
    try {
      const r = await productsApi.search(q, 12);
      setResults(r.products ?? []);
    } catch {
      setResults([]);
    }
  };

  const submit = async () => {
    const token = getToken();
    if (!token) { setMsg('Please sign in again.'); return; }
    if (!have) { setMsg('Pick the item you want to exchange.'); return; }
    if (!wantProduct) { setMsg('Pick what you would like instead.'); return; }
    if (variants.sizes.length > 0 && !wantSize) { setMsg('Please choose a size.'); return; }

    setBusy(true); setMsg('');
    try {
      // Photos go through the same door the return photos use, so there is one
      // place that decides what this server will accept and where it is kept.
      const photos: string[] = [];
      for (const f of files.slice(0, 4)) {
        const r = await ordersApi.uploadReturnMedia(order.id, f, 'openingPhoto', token);
        if (r?.url) photos.push(r.url);
      }

      await exchangesApi.create({
        orderId: order.id,
        haveProductId: Number(have.id),
        haveSize: have.size || undefined,
        haveColour: have.color || undefined,
        wantProductId: wantProduct.dbId,
        wantSize: wantSize || undefined,
        wantColour: wantColour || undefined,
        reason,
        description: description.trim() || undefined,
        photos,
      }, token);

      onDone();
    } catch (e) {
      setMsg((e as Error).message || 'The request could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose}
         style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(30,22,20,.55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560,
                    maxHeight: '92vh', overflowY: 'auto', padding: '1.4rem' }}>

        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#722f37' }}>Exchange an item</h2>
        <p style={{ margin: '.35rem 0 1.1rem', fontSize: '.84rem', color: '#6b615c', lineHeight: 1.6 }}>
          Order {order.id}. Send one item back and we will post a different one — your money stays with
          the order, so there is nothing to pay again.
        </p>

        {/* ── what is going back ─────────────────────────────────────────── */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={label}>Which item</label>
          <select value={haveIdx} onChange={e => setHaveIdx(Number(e.target.value))} style={field}>
            {lines.map((l, i) => (
              <option key={i} value={i}>
                {l.name}{l.size ? ` — ${l.size}` : ''}{l.color ? ` / ${l.color}` : ''} — ₹{l.price}
              </option>
            ))}
          </select>
        </div>

        {/* ── what is coming instead ─────────────────────────────────────── */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={label}>What would you like instead</label>
          <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.6rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setMode('same')}
              style={{ padding: '.45rem .9rem', borderRadius: 999, cursor: 'pointer', fontSize: '.82rem', fontWeight: 650,
                       border: mode === 'same' ? '1.5px solid #722f37' : '1.5px solid #e3dad6',
                       background: mode === 'same' ? '#f7eff0' : '#fff', color: '#722f37' }}>
              The same item, different size or colour
            </button>
            <button type="button" onClick={() => setMode('other')}
              style={{ padding: '.45rem .9rem', borderRadius: 999, cursor: 'pointer', fontSize: '.82rem', fontWeight: 650,
                       border: mode === 'other' ? '1.5px solid #722f37' : '1.5px solid #e3dad6',
                       background: mode === 'other' ? '#f7eff0' : '#fff', color: '#722f37' }}>
              Something else
            </button>
          </div>

          {mode === 'other' && (
            <>
              <div style={{ display: 'flex', gap: '.4rem', marginBottom: '.5rem' }}>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } }}
                  placeholder="Search for a product…" style={{ ...field, flex: 1 }} />
                <button type="button" onClick={doSearch}
                  style={{ padding: '.55rem 1rem', borderRadius: 8, border: 'none', background: '#722f37', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '.84rem' }}>
                  Find
                </button>
              </div>
              {results.length > 0 && (
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #f2ece9', borderRadius: 8, marginBottom: '.6rem' }}>
                  {results.map(p => (
                    <button key={p.dbId} type="button" onClick={() => { setWantProduct(p); setResults([]); setWantSize(''); setWantColour(''); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.5rem .7rem', border: 'none',
                               borderBottom: '1px solid #f7f2f0', background: '#fff', cursor: 'pointer', fontSize: '.85rem' }}>
                      {p.name} — ₹{p.discountPrice && p.discountPrice > 0 ? p.discountPrice : p.price}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {wantProduct && (
            <div style={{ background: '#faf6f2', border: '1px solid #efe6e2', borderRadius: 10, padding: '.8rem' }}>
              <p style={{ margin: '0 0 .6rem', fontWeight: 700, fontSize: '.88rem', color: '#2d2724' }}>{wantProduct.name}</p>

              {variants.sizes.length > 0 && (
                <div style={{ marginBottom: '.6rem' }}>
                  <label style={label}>Size</label>
                  <select value={wantSize} onChange={e => setWantSize(e.target.value)} style={field}>
                    <option value="">— choose —</option>
                    {variants.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {variants.colours.length > 0 && (
                <div>
                  <label style={label}>Colour</label>
                  <select value={wantColour} onChange={e => setWantColour(e.target.value)} style={field}>
                    <option value="">— any —</option>
                    {variants.colours.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── the money, said plainly before anything is sent ─────────────── */}
        {wantProduct && (
          <div style={{ background: difference === 0 ? '#f6faf6' : '#fffaf2',
                        border: `1px solid ${difference === 0 ? '#d9ecd9' : '#f0e2cc'}`,
                        borderRadius: 10, padding: '.8rem 1rem', marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontSize: '.86rem', color: '#2d2724', lineHeight: 1.6 }}>
              You paid <strong>₹{paid}</strong>. The new item is <strong>₹{newPrice}</strong>.{' '}
              {difference === 0 && <>Nothing to pay either way.</>}
              {difference > 0 && <>You would pay <strong>₹{difference}</strong> more.</>}
              {difference < 0 && <>We would return <strong>₹{-difference}</strong> to your wallet.</>}
            </p>
          </div>
        )}

        {/* ── why ────────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={label}>Why are you exchanging it</label>
          <select value={reason} onChange={e => setReason(e.target.value)} style={field}>
            {REASONS.map(r => <option key={r.value} value={r.value}>{r.value}</option>)}
          </select>
          <p style={{ margin: '.4rem 0 0', fontSize: '.78rem', color: '#8a7f76', lineHeight: 1.55 }}>
            {ourFault
              ? 'That is our mistake, so we pay the courier both ways.'
              : 'Return postage for a change of size or mind is paid by you, as in our returns policy.'}
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={label}>Anything else we should know <span style={{ fontWeight: 400, color: '#8a7f76' }}>(optional)</span></label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            placeholder="For example: the length was fine but the shoulders were tight."
            style={{ ...field, resize: 'vertical' }} />
        </div>

        <div style={{ marginBottom: '1.1rem' }}>
          <label style={label}>Photos <span style={{ fontWeight: 400, color: '#8a7f76' }}>(optional, up to 4 — needed if it arrived damaged)</span></label>
          <input type="file" accept="image/*" multiple
            onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 4))}
            style={{ fontSize: '.82rem' }} />
        </div>

        {msg && <p style={{ fontSize: '.85rem', color: '#c0392b', fontWeight: 650, margin: '0 0 .8rem' }}>{msg}</p>}

        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={submit} disabled={busy || !wantProduct}
            style={{ padding: '.7rem 1.4rem', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: '.9rem',
                     background: busy || !wantProduct ? '#d8cfca' : '#722f37', color: '#fff',
                     cursor: busy || !wantProduct ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Sending…' : 'Ask for this exchange'}
          </button>
          <button type="button" onClick={onClose}
            style={{ padding: '.7rem 1.2rem', borderRadius: 9, border: '1.5px solid #e3dad6', background: '#fff', color: '#722f37', fontWeight: 650, fontSize: '.88rem', cursor: 'pointer' }}>
            Not now
          </button>
        </div>

        <p style={{ margin: '.9rem 0 0', fontSize: '.78rem', color: '#8a7f76', lineHeight: 1.55 }}>
          We check the size is on the shelf before agreeing, and tell you either way. Nothing is charged
          or refunded until then.
        </p>
      </div>
    </div>
  );
}
