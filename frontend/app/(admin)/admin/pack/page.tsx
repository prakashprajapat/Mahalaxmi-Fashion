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
 * The camera is there for when the gun is not. It uses the browser's own
 * BarcodeDetector where that exists and says so plainly where it does not,
 * rather than shipping a megabyte of scanner library for a fallback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ordersApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card } from '@/components/admin/Ui';
import type { Order } from '@/types';

type Note = { kind: 'ok' | 'warn' | 'err'; text: string } | null;

// Chrome ships this; Safari and Firefox do not. Declared here rather than
// pulled from lib.dom, which does not have it yet.
interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?(): Promise<string[]>;
}

export default function PackAndScanPage() {
  const [order, setOrder] = useState<Order | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[]>([]);       // order ids finished this session
  const [code, setCode] = useState('');

  const [camErr, setCamErr] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLInputElement>(null);
  const focusBox = useCallback(() => { boxRef.current?.focus(); }, []);
  useEffect(focusBox, [focusBox, order, busy]);

  // ── Step 1: the label ─────────────────────────────────────────────────────
  const loadOrder = async (scanned: string) => {
    setBusy(true); setNote(null);
    try {
      const token = getAdminToken() ?? '';
      const r = await ordersApi.getById(scanned, token);
      const o = r.order;
      if (!o) { setNote({ kind: 'err', text: `No order matches ${scanned}.` }); return; }

      if (o.bagBarcode) {
        setOrder(o);
        setNote({ kind: 'warn', text: `This parcel already has bag ${o.bagBarcode}. Scanning another bag will replace it.` });
        return;
      }
      setOrder(o);
      setNote({ kind: 'ok', text: 'Label read. Now scan the bag.' });
    } catch (e) {
      setNote({ kind: 'err', text: (e as Error).message || 'Could not look that order up.' });
    } finally { setBusy(false); }
  };

  // ── Step 2: the bag ───────────────────────────────────────────────────────
  const saveBag = async (scanned: string) => {
    if (!order) return;
    setBusy(true); setNote(null);
    const token = getAdminToken() ?? '';
    try {
      const r = await ordersApi.setBagBarcode(order.id, scanned, token);

      if (!r.readyToShip) {
        // Saved, but the order cannot advance - no AWB yet, or it is already
        // past this point. Say which; do not pretend the parcel is away.
        //
        // The order is let go all the same. Holding on to it looked tidier and
        // was a trap: the packer reads the warning, moves to the next parcel
        // and scans ITS label - and the screen, still holding the old order,
        // takes that AWB for a bag code and writes it over the bag that was
        // just recorded. There is nothing more this screen can do for this
        // parcel, so the next scan belongs to the next one.
        setNote({ kind: 'warn', text: r.note || `Bag recorded against ${r.orderId}.` });
        setOrder(null);
        return;
      }

      // The one door every status change goes through, so the invoice number,
      // the Delhivery push and the customer's SMS all still happen.
      try {
        await ordersApi.updateStatus({ orderId: r.orderId, status: 'Ready for Shipping' }, token);
        setDone(d => [r.orderId, ...d].slice(0, 25));
        setNote({ kind: 'ok', text: `${r.orderId} → Ready to Ship. Bag ${r.bagBarcode}. Next parcel.` });
        setOrder(null);
      } catch (e) {
        // The bag IS saved. Only the status move failed, and saying so is the
        // difference between a packer re-scanning the bag (which would work)
        // and a packer thinking the whole thing failed.
        setNote({
          kind: 'err',
          text: `Bag ${r.bagBarcode} is saved, but the order could not be moved to Ready to Ship: `
            + `${(e as Error).message}. Scan the label again to retry.`,
        });
        setOrder(null);
      }
    } catch (e) {
      setNote({ kind: 'err', text: (e as Error).message || 'Could not record that bag.' });
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
  //
  // The stream lives in STATE, and an effect hangs it on the <video>. The
  // first version opened the camera and then reached for the element inside a
  // setTimeout(0), which is a race with React's render: when the ref was not
  // attached yet the code hit `if (!v) return` and gave up without a word.
  // The camera light came on, the box stayed black, and the reading loop
  // never started. An effect cannot lose that race - it runs after the DOM is
  // committed, so the element is there by definition.
  const [stream, setStream] = useState<MediaStream | null>(null);
  const camOpen = stream !== null;

  // `handle` is rebuilt on every render and the loop below must always call
  // the current one, without the effect tearing down and restarting each time.
  const handleRef = useRef(handle);
  handleRef.current = handle;

  // Just drops the stream. The effect below owns stopping the tracks, so
  // there is one place that does it - a state updater is meant to be a pure
  // function of what came before, and React is allowed to run it twice.
  const stopCam = useCallback(() => setStream(null), []);

  const startCam = async () => {
    setCamErr('');
    if (!(window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector) {
      setCamErr('This browser cannot read barcodes from the camera. Use Chrome, or a scanner gun.');
      return;
    }
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }));
    } catch (e) {
      // The browser says exactly what went wrong and the packer can act on
      // most of them. One message for all four had him allowing a permission
      // that was never the problem.
      const name = (e as { name?: string })?.name ?? '';
      setCamErr(
        name === 'NotAllowedError'  ? 'Camera access was refused. Allow it for this site in the browser, then press Camera again.'
        : name === 'NotFoundError'  ? 'No camera was found on this device. Use a scanner gun.'
        : name === 'NotReadableError' ? 'The camera is being used by another app. Close it and press Camera again.'
        : name === 'SecurityError'  ? 'The camera needs a secure (https) connection.'
        : 'The camera could not be opened. Use a scanner gun.'
      );
    }
  };

  // Show the picture and read it. One effect, so the two can never disagree
  // about whether the camera is running.
  useEffect(() => {
    if (!stream) return;
    const v = videoRef.current;
    if (!v) return;

    v.srcObject = stream;
    // autoPlay is on the element as well; this covers the browsers that want
    // to be asked, and says so when the ask is refused rather than leaving a
    // black rectangle to be puzzled over.
    v.play().catch(() => setCamErr('The camera opened but the picture will not play. Use a scanner gun.'));

    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Ctor) return;
    const detector = new Ctor();

    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      try {
        // Before the first frame arrives the video has no size and detect()
        // throws. That is ordinary for the first moment, not an error.
        if (v.readyState >= 2) {
          const hit = (await detector.detect(v)).find(f => f.rawValue?.trim());
          if (hit) {
            stopCam();
            await handleRef.current(hit.rawValue);
            return;
          }
        }
      } catch { /* a frame that will not decode is normal; try the next */ }
      if (!stopped) timer = setTimeout(tick, 250);
    };
    tick();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [stream, stopCam]);

  // A camera left running is a light on the phone and a flat battery by
  // evening, so every track is stopped when the page goes.
  useEffect(() => () => { stream?.getTracks().forEach(t => t.stop()); }, [stream]);

  const step = order ? 2 : 1;
  const noteColour = note?.kind === 'ok' ? '#1a7f4b' : note?.kind === 'warn' ? '#8a6100' : '#a3122b';
  const noteBg     = note?.kind === 'ok' ? '#eaf7f0' : note?.kind === 'warn' ? '#fdf5e3' : '#fdeced';

  return (
    <div className="admin-page">
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
              autoFocus
              placeholder={step === 1 ? 'AWB or order number' : 'The code printed on the bag'}
              style={{
                flex: '1 1 260px', minWidth: 0, padding: '.7rem .8rem', fontSize: '1.05rem',
                fontFamily: 'monospace', border: '2px solid #111', borderRadius: 6,
              }}
            />
            <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !code.trim()}>
              {busy ? 'Working…' : 'Enter'}
            </button>
            <button type="button" className="adm-btn" onClick={camOpen ? stopCam : startCam} disabled={busy}>
              {camOpen ? 'Close camera' : '📷 Camera'}
            </button>
          </div>
          <div style={{ fontSize: '.73rem', color: '#888', marginTop: '.35rem' }}>
            A scanner gun types here on its own — leave the cursor in the box and keep scanning.
          </div>
        </form>

        {camErr && <p style={{ color: '#a3122b', fontSize: '.8rem', marginTop: '.6rem' }}>{camErr}</p>}
        {camOpen && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ width: '100%', maxWidth: 420, marginTop: '.8rem', borderRadius: 8, background: '#000' }}
          />
        )}

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

      {done.length > 0 && (
        <Card title={`Packed in this session (${done.length})`}>
          <div style={{ fontFamily: 'monospace', fontSize: '.8rem', lineHeight: 1.9 }}>
            {done.map(id => <div key={id}>✓ {id}</div>)}
          </div>
        </Card>
      )}
    </div>
  );
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
