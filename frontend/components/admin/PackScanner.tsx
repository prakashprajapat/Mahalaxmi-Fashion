'use client';

/**
 * Full-screen camera packing, for the phone.
 *
 *   Step 1  point at the shipping label  -> the AWB is read and the order found
 *   Step 2  point at the bag (thaili)    -> its code is read
 *   Step 3  both codes new               -> saved at once, camera back to step 1
 *           either code already used     -> Relink / scan another bag
 *           bag on a parcel already gone -> refused, scan another bag
 * The camera stays open across all three steps
 * so the phone does not ask for permission again, and after a save it goes
 * straight back to step 1 for the next parcel.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Order } from '@/types';
import { cameraErrorText, makeFrameReader, openBackCamera, type FrameReader } from '@/lib/barcodeScan';

export type LookupResult = { order?: Order; error?: string; warn?: string };
export type SaveResult = { kind: 'ok' | 'warn' | 'err'; text: string };
export type BagCheck = {
  orderStatus: string; orderBag?: string | null; orderLocked: boolean; sameBag: boolean; isLabel: boolean;
  bagOrderId?: string | null; bagOrderStatus?: string | null; bagLocked: boolean;
};

type Stage = 'awb' | 'bag' | 'confirm' | 'saving' | 'done';

const PLUM = '#7a2c3b';

export default function PackScanner({
  lookup, save, check, onClose,
}: {
  lookup: (code: string) => Promise<LookupResult>;
  save: (order: Order, bag: string, relink?: boolean) => Promise<SaveResult>;
  check: (order: Order, bag: string) => Promise<BagCheck>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [reader, setReader] = useState<FrameReader | null>(null);
  const [camErr, setCamErr] = useState('');
  const [starting, setStarting] = useState(true);

  const [stage, setStage] = useState<Stage>('awb');
  const [order, setOrder] = useState<Order | null>(null);
  const [bag, setBag] = useState('');
  const [msg, setMsg] = useState<SaveResult | null>(null);
  const [askExit, setAskExit] = useState(false);
  // Why step 3 is asking instead of saving: what is already linked where.
  const [why, setWhy] = useState('');
  const [working, setWorking] = useState(false);

  // ── open the camera and the reader once ─────────────────────────────────
  const start = useCallback(async () => {
    setStarting(true); setCamErr('');
    try {
      const [s, r] = await Promise.all([openBackCamera(), makeFrameReader()]);
      setStream(s); setReader(r);
    } catch (e) {
      setCamErr(cameraErrorText(e));
    } finally { setStarting(false); }
  }, []);
  useEffect(() => { start(); }, [start]);

  useEffect(() => {
    const v = videoRef.current;
    if (!stream || !v) return;
    v.srcObject = stream;
    v.play().catch(() => { /* iOS sometimes needs a tap; the overlay is a tap target */ });
    // Continuous focus where the phone allows it - a fixed-focus picture of a
    // label held close is a blur no decoder can read.
    const track = stream.getVideoTracks()[0];
    try {
      track?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
    } catch { /* not supported */ }
    return () => { stream.getTracks().forEach(t => t.stop()); };
  }, [stream]);

  // ── the reading loop: only while a code is wanted ───────────────────────
  const stageRef = useRef(stage); stageRef.current = stage;
  const orderRef = useRef(order); orderRef.current = order;
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const onCode = useCallback(async (code: string) => {
    // The same bad code read ten times a second is one mistake, not ten.
    const now = Date.now();
    if (code === lastRef.current.code && now - lastRef.current.at < 2500) return;
    lastRef.current = { code, at: now };
    try { navigator.vibrate?.(60); } catch { /* iPhone has no vibrate */ }

    if (stageRef.current === 'awb') {
      setWorking(true);
      const r = await lookup(code);
      setWorking(false);
      if (!r.order) { setMsg({ kind: 'err', text: r.error || `No order matches ${code}.` }); return; }
      setOrder(r.order);
      setMsg(r.warn ? { kind: 'warn', text: r.warn } : { kind: 'ok', text: 'Label read. Now point at the BAG code.' });
      setStage('bag');
      return;
    }
    if (stageRef.current === 'bag') {
      const o = orderRef.current;
      const same = (x?: string | null) => !!x && x.trim().toLowerCase() === code.trim().toLowerCase();
      if (o && (same(o.awb) || same(o.id))) {
        setMsg({ kind: 'err', text: 'That is the shipping label again. Point at the code printed on the BAG.' });
        return;
      }
      if (!o) return;
      setWorking(true);
      let c: BagCheck;
      try { c = await check(o, code); }
      catch (e) { setWorking(false); setMsg({ kind: 'err', text: (e as Error).message || 'Could not check that bag. Try again.' }); return; }

      if (c.isLabel) {
        setWorking(false);
        setMsg({ kind: 'err', text: 'That is a shipping label, not a bag. Point at the code printed on the BAG.' });
        return;
      }
      if (c.sameBag) {
        setWorking(false);
        setBag(code);
        setMsg({ kind: 'warn', text: `Bag ${code} is already linked to this order. Nothing to change.` });
        setStage('done');
        return;
      }
      if (c.orderLocked && c.orderBag) {
        setWorking(false);
        setBag(code);
        setMsg({ kind: 'err', text: `This order is already "${c.orderStatus}" in bag ${c.orderBag}. Its bag cannot be changed now.` });
        setStage('done');
        return;
      }
      if (c.bagOrderId && c.bagLocked) {
        // Keep scanning: the packer needs a different bag, not a different screen.
        setWorking(false);
        setMsg({ kind: 'err', text: `Bag ${code} went out with order ${c.bagOrderId} ("${c.bagOrderStatus}"). It cannot be relinked. Scan a different bag.` });
        return;
      }
      setBag(code);
      if (c.bagOrderId || c.orderBag) {
        setWorking(false);
        setWhy([
          c.orderBag ? `This order is already in bag ${c.orderBag}.` : '',
          c.bagOrderId ? `Bag ${code} is linked to order ${c.bagOrderId} ("${c.bagOrderStatus}").` : '',
        ].filter(Boolean).join(' '));
        setMsg(null);
        setStage('confirm');
        return;
      }
      // Both new: save straight away, no question.
      setStage('saving');
      const r = await save(o, code, false);
      setWorking(false);
      setMsg(r);
      setStage('done');
    }
  }, [lookup, check, save]);

  useEffect(() => {
    const v = videoRef.current;
    if (!reader || !stream || !v || (stage !== 'awb' && stage !== 'bag') || working) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      let hit: string | null = null;
      try { hit = await reader.read(v); } catch { /* next frame */ }
      if (stopped) return;
      if (hit) { await onCode(hit); }
      if (!stopped) timer = setTimeout(tick, reader.engine === 'native' ? 200 : 120);
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [reader, stream, stage, working, onCode]);

  // ── actions ─────────────────────────────────────────────────────────────
  const restart = () => {
    setOrder(null); setBag(''); setMsg(null); setWhy(''); lastRef.current = { code: '', at: 0 }; setStage('awb');
  };
  const scanAnotherBag = () => { setBag(''); setMsg(null); setWhy(''); lastRef.current = { code: '', at: 0 }; setStage('bag'); };

  const doRelink = async () => {
    if (!order || !bag) return;
    setStage('saving');
    const r = await save(order, bag, true);
    setMsg(r);
    if (r.kind === 'err') { setStage('confirm'); return; }
    setStage('done');
  };

  // After a good save, the next parcel by itself.
  useEffect(() => {
    if (stage !== 'done' || msg?.kind !== 'ok') return;
    const t = setTimeout(restart, 1800);
    return () => clearTimeout(t);
  }, [stage, msg]);

  const scanning = stage === 'awb' || stage === 'bag';
  const stepNo = stage === 'awb' ? 1 : stage === 'bag' ? 2 : 3;
  const title = stage === 'awb' ? 'Scanning AWB Barcode' : stage === 'bag' ? 'Scanning Bag Code' : stage === 'done' ? (msg?.kind === 'ok' ? 'Saved' : 'Done') : stage === 'saving' ? 'Saving…' : 'Already linked - Relink?';
  const aim = stage === 'awb' ? 'Point camera at the AWB barcode on the label' : 'Point camera at the code on the bag (thaili)';
  const msgColour = msg?.kind === 'ok' ? '#1a7f4b' : msg?.kind === 'warn' ? '#8a6100' : '#a3122b';
  const msgBg = msg?.kind === 'ok' ? '#eaf7f0' : msg?.kind === 'warn' ? '#fdf5e3' : '#fdeced';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#111', display: 'flex', flexDirection: 'column', color: '#fff' }}>
      {/* camera */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }} onClick={() => videoRef.current?.play().catch(() => {})}>
        <video ref={videoRef} autoPlay muted playsInline
               style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: scanning ? 1 : 0.35 }} />

        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '14px 16px', textAlign: 'center', background: 'linear-gradient(rgba(0,0,0,.6), transparent)' }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{title}</div>
          <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>STEP {stepNo} OF 3</div>
          <button aria-label="Close" onClick={e => { e.stopPropagation(); setAskExit(true); }}
                  style={{ position: 'absolute', right: 10, top: 8, background: 'none', border: 0, color: '#fff', fontSize: 28, lineHeight: 1, padding: 8 }}>×</button>
        </div>

        {scanning && !camErr && (
          <>
            <div style={{
              position: 'absolute', left: '8%', right: '8%', top: '50%',
              height: stage === 'awb' ? '22%' : '38%', transform: 'translateY(-50%)',
              border: '3px solid rgba(255,255,255,.9)', borderRadius: 10, boxShadow: '0 0 0 9999px rgba(0,0,0,.35)',
            }}>
              <div style={{ position: 'absolute', left: 6, right: 6, top: '50%', height: 2, background: '#e2394f', opacity: .8 }} />
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18, textAlign: 'center', fontWeight: 600, fontSize: 14, padding: '0 16px', textShadow: '0 1px 3px #000' }}>
              {working ? 'Looking up the order…' : starting ? 'Opening camera…' : aim}
            </div>
          </>
        )}

        {camErr && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', gap: 14 }}>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>{camErr}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={start} style={btn(true)}>Try again</button>
              <button onClick={onClose} style={btn(false)}>Type instead</button>
            </div>
          </div>
        )}
      </div>

      {/* bottom panel */}
      <div style={{ background: '#fff', color: '#222', padding: '12px 14px calc(14px + env(safe-area-inset-bottom))', borderTopLeftRadius: 14, borderTopRightRadius: 14 }}>
        {msg && (
          <div style={{ background: msgBg, color: msgColour, borderRadius: 8, padding: '8px 10px', fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="AWB Barcode Number" active={stage === 'awb'} value={order ? (order.awb || order.id) : stage === 'awb' ? 'Scanning…' : ''} />
          <Field label="Bag Code" active={stage === 'bag'} value={bag || (stage === 'bag' ? 'Scanning…' : 'Not scanned yet')} muted={!bag && stage !== 'bag'} />
        </div>

        {order && (stage === 'confirm' || stage === 'saving' || stage === 'done' || stage === 'bag') && (
          <div style={{ fontSize: 13, color: '#555', marginTop: 10, lineHeight: 1.55 }}>
            <strong style={{ color: '#222' }}>{order.id}</strong> · {order.customerName || order.shippingName || '—'} · {order.status}
            {(order.cart ?? []).slice(0, 3).map((l, i) => (
              <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {l.name} — {l.size || '—'} / {l.color || '—'} × {l.quantity}
              </div>
            ))}
            {why && stage === 'confirm' && (
              <div style={{ color: '#8a6100', fontWeight: 600 }}>{why} Relink to put this order in bag {bag}.</div>
            )}
          </div>
        )}

        {(stage === 'confirm' || (stage === 'saving' && why)) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <button onClick={scanAnotherBag} disabled={stage === 'saving'} style={btn(false)}>Scan another bag</button>
            <button onClick={doRelink} disabled={stage === 'saving'} style={btn(true)}>{stage === 'saving' ? 'Saving…' : 'Relink'}</button>
            <button onClick={restart} disabled={stage === 'saving'} style={{ ...btn(false), gridColumn: '1 / -1', border: 0, color: '#777', padding: 6 }}>Start over with a new label</button>
          </div>
        )}

        {stage === 'bag' && (
          <button onClick={restart} style={{ ...btn(false), width: '100%', marginTop: 10 }}>Wrong label? Start over</button>
        )}

        {stage === 'done' && (
          <button onClick={restart} style={{ ...btn(true), width: '100%', marginTop: 12 }}>Scan next parcel</button>
        )}
      </div>

      {askExit && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end' }} onClick={() => setAskExit(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', color: '#222', width: '100%', borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: '16px 16px calc(16px + env(safe-area-inset-bottom))' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Exit scanning?</div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 14 }}>
              {order && stage !== 'done' ? 'This parcel is not saved yet. If you exit now it stays as it was.' : 'The camera will close.'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setAskExit(false)} style={btn(false)}>Keep scanning</button>
              <button onClick={onClose} style={btn(true)}>Yes, exit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, active, muted }: { label: string; value: string; active: boolean; muted?: boolean }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, border: `1.5px solid ${active ? PLUM : '#ddd'}`, borderRadius: 10, padding: '8px 10px',
      background: active ? '#fff' : '#f6f6f7',
    }}>
      <div style={{ fontSize: 11.5, color: active ? PLUM : '#888', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14.5, fontFamily: 'monospace', marginTop: 2, color: muted ? '#aaa' : '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || ' '}
      </div>
    </div>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    padding: '12px 14px', borderRadius: 10, fontSize: 15, fontWeight: 700,
    border: primary ? 0 : '1.5px solid #ccc', background: primary ? PLUM : '#fff', color: primary ? '#fff' : '#222',
  };
}
