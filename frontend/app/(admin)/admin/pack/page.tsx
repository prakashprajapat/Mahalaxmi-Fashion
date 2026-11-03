'use client';

/**
 * Pack & Scan — the packing bench.
 *
 * Two scans per parcel and nothing typed:
 *
 *   1. the label, which the gun reads as the AWB;
 *   2. the thaili, which carries its own printed code from the bag maker.
 *
 * The second scan ties THIS order to THAT physical bag, and the order moves
 * itself to Ready to Ship. From there Delhivery's own scan at pickup is what
 * carries it into Transit, through the tracking sync that already runs.
 *
 * One box, not two. A scanner gun is a keyboard that types fast and presses
 * Enter, so the box simply takes whatever arrives and decides what it was: no
 * order in hand yet means this is a label, an order in hand means it is the
 * bag. The packer never clicks between fields, which is the whole point of
 * having a gun.
 *
 * The camera is there for when the gun is not. On a phone it opens by
 * itself, full screen (components/admin/PackScanner): label, then bag, then a
 * Save / Relink check. It reads with the browser's own BarcodeDetector where
 * that exists (Chrome) and with ZXing everywhere else (Safari on iPhone).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ordersApi, packApi, type PackEvent } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card } from '@/components/admin/Ui';
import PackScanner, { type LookupResult, type SaveResult, type BagCheck } from '@/components/admin/PackScanner';
import { isTouchPhone } from '@/lib/barcodeScan';
import type { Order } from '@/types';

type Note = { kind: 'ok' | 'warn' | 'err'; text: string } | null;

export default function PackAndScanPage() {
  const [order, setOrder] = useState<Order | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[]>([]);       // order ids finished this session
  const [code, setCode] = useState('');

  // The bench's own history. It used to live in `done` above and nowhere else,
  // which meant it lasted until somebody pressed F5 - and the questions it
  // gets asked (which bag did this go in, who packed it) are asked days later.
  const [history, setHistory] = useState<PackEvent[]>([]);
  const [histQ, setHistQ] = useState('');
  const [histBusy, setHistBusy] = useState(false);
  const [undoId, setUndoId] = useState<number | null>(null);
  const [undoWhy, setUndoWhy] = useState('');
  const [undoBusy, setUndoBusy] = useState(false);
  const [afterUndo, setAfterUndo] = useState<string[] | null>(null);

  const loadHistory = useCallback(async (q = '') => {
    setHistBusy(true);
    try {
      const r = await packApi.history(getAdminToken() ?? '', q);
      setHistory(r.events ?? []);
    } catch {
      setHistory([]);
    } finally { setHistBusy(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const doUndo = async (ev: PackEvent) => {
    setUndoBusy(true); setAfterUndo(null);
    try {
      const r = await packApi.undo(ev.id, undoWhy, getAdminToken() ?? '');
      setAfterUndo(r.stillStands ?? []);
      setNote({
        kind: 'ok',
        text: `${r.orderId} is back at "${r.status}".`
          + (r.bagFreed ? ` Bag ${r.bagFreed} is free to use again.` : ''),
      });
      setUndoId(null); setUndoWhy('');
      await loadHistory(histQ);
    } catch (e) {
      setNote({ kind: 'err', text: (e as Error).message || 'That could not be undone.' });
    } finally { setUndoBusy(false); }
  };

  const boxRef = useRef<HTMLInputElement>(null);
  const focusBox = useCallback(() => { boxRef.current?.focus(); }, []);

  // ── Step 1: the label ─────────────────────────────────────────────────────
  // Pure: finds the order for a scanned label and says what it found. Used by
  // the scanner-gun box below and by the phone camera screen alike.
  const lookupLabel = useCallback(async (scanned: string): Promise<LookupResult> => {
    const token = getAdminToken() ?? '';
    // A bag code scanned here (bag first, or the wrong code) is not an order.
    // Say so plainly instead of "No order matches", which reads like a
    // broken label.
    const bagError = async () => {
      try {
        const h = await packApi.history(token, scanned, 5);
        const isBag = (h.events ?? []).some(ev => (ev.bagBarcode ?? '').toLowerCase() === scanned.toLowerCase());
        if (isBag) return `${scanned} is a BAG code. Scan the shipping label (AWB) first, then the bag.`;
      } catch { /* fall through to the plain message */ }
      return null;
    };
    try {
      let r;
      try { r = await ordersApi.getById(scanned, token); }
      catch (e) { return { error: (await bagError()) ?? ((e as Error).message || `No order matches ${scanned}.`) }; }
      const o = r.order;
      if (!o) return { error: (await bagError()) ?? `No order matches ${scanned}.` };
      if (o.bagBarcode) return { order: o, warn: `This parcel already has bag ${o.bagBarcode}. Scanning another bag will replace it.` };
      return { order: o };
    } catch (e) {
      return { error: (e as Error).message || 'Could not look that order up.' };
    }
  }, []);

  const loadOrder = async (scanned: string) => {
    setBusy(true); setNote(null);
    try {
      const r = await lookupLabel(scanned);
      if (!r.order) { setNote({ kind: 'err', text: r.error || `No order matches ${scanned}.` }); return; }
      setOrder(r.order);
      setNote(r.warn ? { kind: 'warn', text: r.warn } : { kind: 'ok', text: 'Label read. Now scan the bag.' });
    } finally { setBusy(false); }
  };

  // ── Step 2: the bag ───────────────────────────────────────────────────────
  // Pure as well: records the bag, moves the order on, and says what happened.
  const saveBagFor = useCallback(async (o: Order, scanned: string, relink?: boolean): Promise<SaveResult> => {
    // The label scanned twice. The server refuses this too; saying it here is
    // instant and keeps the parcel on screen so the bag can be scanned next.
    const same = (x?: string | null) => !!x && x.trim().toLowerCase() === scanned.trim().toLowerCase();
    if (same(o.awb) || same(o.id)) {
      return { kind: 'err', text: 'That is the shipping label again. Now scan the code printed on the BAG.' };
    }
    const token = getAdminToken() ?? '';
    let r;
    try {
      r = await ordersApi.setBagBarcode(o.id, scanned, token, relink);
    } catch (e) {
      return { kind: 'err', text: (e as Error).message || 'Could not record that bag.' };
    }

    if (r.alreadyLinked) return { kind: 'warn', text: r.note || `Bag ${r.bagBarcode} is already linked to this order.` };

    if (!r.readyToShip) {
      // Saved, but the order cannot advance - no AWB yet, or it is already
      // past this point. Say which; do not pretend the parcel is away.
      loadHistory(histQ);
      return { kind: 'warn', text: r.note || `Bag recorded against ${r.orderId}.` };
    }

    // The one door every status change goes through, so the invoice number,
    // the Delhivery push and the customer's SMS all still happen.
    try {
      await ordersApi.updateStatus({ orderId: r.orderId, status: 'Ready for Shipping' }, token);
      setDone(d => [r.orderId, ...d].slice(0, 25));
      loadHistory(histQ);
      return { kind: 'ok', text: `${r.orderId} → Ready to Ship. Bag ${r.bagBarcode}. Next parcel.` };
    } catch (e) {
      // The bag IS saved. Only the status move failed, and saying so is the
      // difference between a packer re-scanning the bag (which would work)
      // and a packer thinking the whole thing failed.
      return {
        kind: 'err',
        text: `Bag ${r.bagBarcode} is saved, but the order could not be moved to Ready to Ship: `
          + `${(e as Error).message}. Scan the label again to retry.`,
      };
    }
  }, [loadHistory, histQ]);

  const checkBagFor = useCallback(
    (o: Order, bag: string): Promise<BagCheck> => ordersApi.checkBag(o.id, bag, getAdminToken() ?? ''),
    []);

  const saveBag = async (scanned: string) => {
    if (!order) return;
    setBusy(true); setNote(null);
    try {
      const r = await saveBagFor(order, scanned);
      setNote(r);
      // The label-again mistake keeps the parcel on screen; anything else lets
      // it go. Holding on to it after a save was a trap: the packer moves on,
      // scans the NEXT label, and the screen takes that AWB for a bag code.
      const labelAgain = r.kind === 'err' && r.text.startsWith('That is the shipping label again');
      const failedToRecord = r.kind === 'err' && !r.text.startsWith('Bag ');
      if (!labelAgain && !failedToRecord) setOrder(null);
    } finally { setBusy(false); }
  };

  const handle = async (raw: string) => {
    const scanned = raw.trim();
    if (!scanned || busy) return;
    setCode('');
    if (!order) await loadOrder(scanned);
    else await saveBag(scanned);
  };

  // ── The camera, when there is no gun ────────────────────────────────────
  // Full screen. On a phone it opens by itself when the page opens.
  const [camOpen, setCamOpen] = useState(false);
  useEffect(() => { if (isTouchPhone()) setCamOpen(true); }, []);
  // Keep the cursor in the box for the scanner gun - but not on a phone, where
  // focusing it pops the keyboard up over the camera.
  useEffect(() => { if (!camOpen && !isTouchPhone()) focusBox(); }, [focusBox, order, busy, camOpen]);

  const step = order ? 2 : 1;
  const noteColour = note?.kind === 'ok' ? '#1a7f4b' : note?.kind === 'warn' ? '#8a6100' : '#a3122b';
  const noteBg     = note?.kind === 'ok' ? '#eaf7f0' : note?.kind === 'warn' ? '#fdf5e3' : '#fdeced';

  return (
    <div className="admin-page">
      {camOpen && (
        <PackScanner
          lookup={lookupLabel}
          save={saveBagFor}
          check={checkBagFor}
          onClose={() => { setCamOpen(false); loadHistory(histQ); }}
        />
      )}
      <PageHeader
        title="Pack & Scan"
        sub="Scan the label, then the bag. The order moves to Ready to Ship on its own."
        right={<Link href="/admin/orders" className="adm-btn">← Orders</Link>}
      />

      <Card>
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.9rem', flexWrap: 'wrap' }}>
          <Step n={1} on={step === 1} text="Scan the label (AWB)" />
          <Step n={2} on={step === 2} text="Scan the bag" />
        </div>

        <form
          onSubmit={e => { e.preventDefault(); handle(code); }}
        >
          <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, marginBottom: '.3rem' }}>
            {step === 1 ? 'Scan the shipping label' : 'Scan the bag'}
          </label>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <input
              ref={boxRef}
              value={code}
              onChange={e => setCode(e.target.value)}
              disabled={busy}
              placeholder={step === 1 ? 'AWB or order number' : 'The code printed on the bag'}
              style={{
                flex: '1 1 260px', minWidth: 0, padding: '.7rem .8rem', fontSize: '1.05rem',
                fontFamily: 'monospace', border: '2px solid #111', borderRadius: 6,
              }}
            />
            <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !code.trim()}>
              {busy ? 'Working…' : 'Enter'}
            </button>
            <button type="button" className="adm-btn" onClick={() => { setOrder(null); setNote(null); setCamOpen(true); }} disabled={busy}>
              Camera
            </button>
          </div>
          <div style={{ fontSize: '.73rem', color: '#888', marginTop: '.35rem' }}>
            A scanner gun types here on its own — leave the cursor in the box and keep scanning.
          </div>
        </form>

        {note && (
          <p style={{
            marginTop: '.9rem', padding: '.6rem .75rem', borderRadius: 6,
            background: noteBg, color: noteColour, fontSize: '.85rem', fontWeight: 600,
          }}>
            {note.text}
          </p>
        )}
      </Card>

      {order && (
        <Card title={`Order ${order.id}`} right={
          <button className="adm-btn" onClick={() => { setOrder(null); setNote(null); }}>Cancel</button>
        }>
          <div style={{ fontSize: '.85rem', lineHeight: 1.7 }}>
            <div><strong>{order.customerName || order.shippingName || '—'}</strong> · {order.status}</div>
            <div style={{ color: '#666' }}>AWB: {order.awb || 'not assigned yet'}</div>
            {order.bagBarcode && <div style={{ color: '#666' }}>Bag: {order.bagBarcode}</div>}
            <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem', color: '#444' }}>
              {(order.cart ?? []).map((l, i) => (
                <li key={i}>
                  {l.name} — {l.size || '—'} / {l.color || '—'} × {l.quantity}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <Card
        title="History"
        right={
          <span style={{ display: 'inline-flex', gap: '.4rem' }}>
            <input
              value={histQ}
              onChange={e => setHistQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); loadHistory(histQ); } }}
              placeholder="Order, AWB or bag"
              style={{ padding: '.4rem .6rem', border: '1px solid #ccc', borderRadius: 6, fontSize: '.82rem', width: 170 }}
            />
            <button className="adm-btn" onClick={() => loadHistory(histQ)} disabled={histBusy}>
              {histBusy ? 'Looking\u2026' : 'Search'}
            </button>
          </span>
        }
      >
        {afterUndo && afterUndo.length > 0 && (
          <div style={{
            marginBottom: '.9rem', padding: '.7rem .8rem', borderRadius: 8,
            background: '#fff8e8', border: '1px solid #f0dcb0', fontSize: '.84rem', color: '#6b4e13',
          }}>
            <strong>Undone — but these still stand:</strong>
            <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.6 }}>
              {afterUndo.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </div>
        )}

        {history.length === 0 ? (
          <p style={{ color: '#888', fontSize: '.85rem', margin: 0 }}>
            {histBusy ? 'Looking\u2026' : 'Nothing packed yet. Every scan from here on is kept.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
            {history.map(ev => (
              <div key={ev.id} style={{
                border: '1px solid #eee', borderRadius: 8, padding: '.6rem .75rem',
                background: ev.action === 'undone' ? '#fbf6f7' : '#fff',
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'baseline' }}>
                  <strong style={{ fontFamily: 'monospace', fontSize: '.88rem' }}>{ev.orderId}</strong>
                  <span style={{ fontSize: '.78rem', color: '#a7354d', fontWeight: 700 }}>{ev.action}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: '.75rem', color: '#999' }}>{whenIst(ev.createdAt)}</span>
                </div>

                <div style={{ fontSize: '.8rem', color: '#555', marginTop: '.25rem', lineHeight: 1.6 }}>
                  {ev.bagBarcode && <>Bag <code>{ev.bagBarcode}</code>{ev.previousBag ? <> (was <code>{ev.previousBag}</code>)</> : null} · </>}
                  {ev.previousBag && !ev.bagBarcode && <>Bag <code>{ev.previousBag}</code> freed · </>}
                  {ev.awb && <>AWB {ev.awb} · </>}
                  {ev.who && <>by {ev.who}</>}
                  {ev.note && <> · {ev.note}</>}
                </div>

                <div style={{ fontSize: '.78rem', color: '#777', marginTop: '.2rem' }}>
                  {ev.previousStatus && ev.previousStatus !== ev.currentStatus
                    ? <>was &ldquo;{ev.previousStatus}&rdquo;, now &ldquo;{ev.currentStatus}&rdquo;</>
                    : <>now &ldquo;{ev.currentStatus}&rdquo;</>}
                  {ev.hasInvoice && <> · invoice issued</>}
                </div>

                {undoId === ev.id ? (
                  <div style={{ marginTop: '.6rem', padding: '.6rem .7rem', background: '#fdf3f2', border: '1px solid #f0cdc9', borderRadius: 8 }}>
                    <p style={{ margin: '0 0 .4rem', fontSize: '.82rem', color: '#8c2b22', lineHeight: 1.6 }}>
                      This frees the bag and puts the order back to
                      &ldquo;{ev.previousStatus || ev.currentStatus}&rdquo;. It does <strong>not</strong> cancel
                      the waybill at Delhivery, does not take back the invoice number, and cannot unsend
                      a message the customer has already had.
                    </p>
                    <input
                      value={undoWhy}
                      onChange={e => setUndoWhy(e.target.value)}
                      placeholder="Why? (kept with the entry)"
                      style={{ width: '100%', padding: '.45rem .6rem', border: '1px solid #ccc', borderRadius: 6, fontSize: '.82rem' }}
                    />
                    <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                      <button className="adm-btn adm-btn-primary" disabled={undoBusy} onClick={() => doUndo(ev)}>
                        {undoBusy ? 'Undoing\u2026' : 'Yes, undo it'}
                      </button>
                      <button className="adm-btn" disabled={undoBusy} onClick={() => { setUndoId(null); setUndoWhy(''); }}>
                        Keep it
                      </button>
                    </div>
                  </div>
                ) : ev.canUndo ? (
                  <button className="adm-btn" style={{ marginTop: '.5rem' }} onClick={() => { setUndoId(ev.id); setUndoWhy(''); setAfterUndo(null); }}>
                    Undo this pack
                  </button>
                ) : (
                  <p style={{ margin: '.4rem 0 0', fontSize: '.76rem', color: '#999' }}>
                    {ev.undoBlockedBecause}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function whenIst(raw: string) {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? raw : d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function Step({ n, on, text }: { n: number; on: boolean; text: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '.4rem',
      padding: '.3rem .7rem', borderRadius: 999, fontSize: '.78rem', fontWeight: 700,
      background: on ? '#a7354d' : '#f1f1f2', color: on ? '#fff' : '#777',
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: 999, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '.7rem',
        background: on ? 'rgba(255,255,255,.25)' : '#ddd', color: on ? '#fff' : '#666',
      }}>{n}</span>
      {text}
    </span>
  );
}
