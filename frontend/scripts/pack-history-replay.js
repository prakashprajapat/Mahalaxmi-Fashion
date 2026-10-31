// Taking a pack back.
//
// Undo is the dangerous half of this. A history that is only read cannot hurt
// anybody; a button that puts an order back to "Order Packed" can hide a
// parcel from the people watching it, free a bag that is sealed around a
// parcel on a van, or unpack the wrong pack entirely.
//
// So most of these cases are about undo REFUSING, and the refusals are the
// point. What it must never do:
//
//   - touch a parcel the courier has already scanned
//   - undo the same entry twice
//   - let Tuesday's entry unpack the bag Thursday's re-pack put it in
//   - remove anything from the history, ever

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

const PACKED = 'packed', BAG_CHANGED = 'bag changed', BAG_CLEARED = 'bag cleared', UNDONE = 'undone';
const GONE = ['Shipped', 'Transit', 'Return Transit', 'Delivered', 'Return', 'Returned', 'Exchanged'];

// ── PackController.WhyNotUndoable ────────────────────────────────────────
function whyNot(action, status, courierStatus, isLatest) {
  if (action === UNDONE) return 'This one is itself an undo.';
  if (!isLatest) return 'Something has happened to this parcel since. Only the newest entry can be taken back.';
  if (action === BAG_CLEARED) return 'Nothing to take back - the bag was already cleared.';

  const s = (status ?? '').trim();
  if (s.length === 0) return 'That order is no longer in the system.';
  if (GONE.some(g => g.toLowerCase() === s.toLowerCase()))
    return `The parcel has moved on - it is at "${s}". Undo here would only hide it from the people watching it.`;
  if ((courierStatus ?? '').trim().length > 0)
    return `Delhivery has already scanned this parcel ("${courierStatus}"). It is in their hands now.`;
  if (s.toLowerCase().startsWith('cancel'))
    return `That order is "${s}". Reopen it first if it is really being packed again.`;
  return null;
}

// ── the bench, as the two controllers run it ─────────────────────────────
function makeBench() {
  const events = [];
  let nextId = 1;
  const orders = {};

  const add = (e) => { const row = { id: nextId++, createdAt: Date.now(), ...e }; events.push(row); return row; };
  const latestIdFor = (orderId) =>
    events.filter(e => e.orderId === orderId).reduce((m, e) => Math.max(m, e.id), 0);

  return {
    events, orders,
    place(orderId, o) { orders[orderId] = { status: 'Order Packed', bag: null, awb: 'AWB1', courierStatus: '', invoice: null, ...o }; },

    // OrdersController.SetBagBarcode
    scanBag(orderId, bag, who = 'packer@shop') {
      const o = orders[orderId];
      const clash = Object.entries(orders).find(([id, x]) => id !== orderId && x.bag === bag);
      if (clash) return { ok: false, message: `That bag is already recorded against order ${clash[0]}.` };
      const previousBag = o.bag;
      add({ orderId, awb: o.awb, action: previousBag ? BAG_CHANGED : PACKED,
            bagBarcode: bag, previousBag, previousStatus: o.status, newStatus: o.status, who });
      o.bag = bag;
      return { ok: true, readyToShip: !!o.awb };
    },

    // What the screen does straight after, through UpdateStatus.
    readyToShip(orderId) {
      const o = orders[orderId];
      o.status = 'Ready for Shipping';
      if (!o.invoice) o.invoice = 'MFH/26-27/0001';   // issued once, never re-issued
    },

    // OrdersController.ClearBagBarcode
    clearBag(orderId, who = 'packer@shop') {
      const o = orders[orderId];
      add({ orderId, awb: o.awb, action: BAG_CLEARED, bagBarcode: null,
            previousBag: o.bag, previousStatus: o.status, newStatus: o.status, who });
      o.bag = null;
    },

    // PackController.Undo
    undo(eventId, who = 'owner@shop', reason = '') {
      const ev = events.find(e => e.id === eventId);
      if (!ev) return { ok: false, message: 'That entry is not in the history.' };
      const o = orders[ev.orderId];
      if (!o) return { ok: false, message: 'That order is no longer in the system.' };

      const isLatest = latestIdFor(ev.orderId) === ev.id;
      const why = whyNot(ev.action, o.status, o.courierStatus, isLatest);
      if (why) return { ok: false, message: why };

      const hadBag = o.bag, hadStatus = o.status;
      o.bag = null;
      const target = (ev.previousStatus ?? '').trim();
      if (target && target.toLowerCase() !== o.status.toLowerCase()) o.status = target;

      add({ orderId: o === orders[ev.orderId] ? ev.orderId : ev.orderId, awb: o.awb, action: UNDONE,
            bagBarcode: null, previousBag: hadBag, previousStatus: hadStatus,
            newStatus: o.status, who, note: reason });

      const stillStands = [];
      if (o.invoice) stillStands.push(`Invoice ${o.invoice} stays with this order`);
      if (o.awb) stillStands.push(`Waybill ${o.awb} is still live at Delhivery`);
      stillStands.push('Any message already sent to the customer cannot be unsent.');
      return { ok: true, status: o.status, bagFreed: hadBag, stillStands };
    },

    canUndo(eventId) {
      const ev = events.find(e => e.id === eventId);
      const o = orders[ev.orderId];
      return whyNot(ev.action, o?.status, o?.courierStatus, latestIdFor(ev.orderId) === ev.id) === null;
    },
  };
}

// ═══ 1. An ordinary pack, written down ═══════════════════════════════════
{
  const b = makeBench();
  b.place('MFH1014');
  b.scanBag('MFH1014', 'BAG-001');
  b.readyToShip('MFH1014');

  t('1a one entry, kept', b.events.length, 1);
  t('1b it says what happened', [b.events[0].action, b.events[0].bagBarcode, b.events[0].who],
    [PACKED, 'BAG-001', 'packer@shop']);
  // The status BEFORE the pack, not after: it is the only thing an undo has
  // to aim at, and by the time undo is pressed the order says Ready for
  // Shipping.
  t('1c and where the order stood before it', b.events[0].previousStatus, 'Order Packed');
  t('1d the order moved on', b.orders['MFH1014'].status, 'Ready for Shipping');
}

// ═══ 2. Undo puts it back and frees the bag ══════════════════════════════
{
  const b = makeBench();
  b.place('MFH1014');
  b.scanBag('MFH1014', 'BAG-001');
  b.readyToShip('MFH1014');

  const r = b.undo(1, 'owner@shop', 'wrong parcel in the bag');
  t('2a it worked', r.ok, true);
  t('2b back where it was', b.orders['MFH1014'].status, 'Order Packed');
  t('2c and the bag is free', [b.orders['MFH1014'].bag, r.bagFreed], [null, 'BAG-001']);
  t('2d the undo is a NEW row, not a deletion', b.events.length, 2);
  t('2e the original still says what it said', b.events[0].action, PACKED);
  t('2f and the reason is kept with it', b.events[1].note, 'wrong parcel in the bag');
}

// ═══ 3. The freed bag can be used again ══════════════════════════════════
//
// The unique index on bag_barcode is why undo nulls the bag rather than
// leaving it: otherwise that thaili is unusable on any order, for good.
{
  const b = makeBench();
  b.place('MFH1', {}); b.place('MFH2', {});
  b.scanBag('MFH1', 'BAG-001');
  t('3a the same bag is refused elsewhere while it is in use',
    b.scanBag('MFH2', 'BAG-001').ok, false);
  b.undo(1);
  t('3b and accepted once the pack is undone', b.scanBag('MFH2', 'BAG-001').ok, true);
}

// ═══ 4. The courier has it. No. ══════════════════════════════════════════
//
// The one that matters. A scan means the parcel is in a van; putting the
// order back to "Order Packed" would take it off every screen that is
// watching it, and free a bag that is sealed around it.
{
  const b = makeBench();
  b.place('MFH1014', { courierStatus: 'Out for delivery' });
  b.scanBag('MFH1014', 'BAG-001');
  b.readyToShip('MFH1014');
  const r = b.undo(1);
  t('4a refused', r.ok, false);
  t('4b and it says why, in words', r.message.includes('Delhivery has already scanned'), true);
  t('4c nothing moved', [b.orders['MFH1014'].status, b.orders['MFH1014'].bag],
    ['Ready for Shipping', 'BAG-001']);
}

// ═══ 5. The parcel has moved on ══════════════════════════════════════════
{
  for (const status of ['Shipped', 'Transit', 'Delivered', 'Return', 'Return Transit']) {
    const b = makeBench();
    b.place('MFH1', {});
    b.scanBag('MFH1', 'BAG-001');
    b.orders['MFH1'].status = status;
    t(`5-${status} is refused`, b.undo(1).ok, false);
  }
}

// ═══ 6. Twice on the same entry ══════════════════════════════════════════
{
  const b = makeBench();
  b.place('MFH1014');
  b.scanBag('MFH1014', 'BAG-001');
  b.readyToShip('MFH1014');

  t('6a the first works', b.undo(1).ok, true);
  const second = b.undo(1);
  t('6b the second is refused', second.ok, false);
  t('6c because something happened since', second.message.includes('newest entry'), true);
  t('6d and no third row was written', b.events.length, 2);
}

// ═══ 7. Tuesday's entry must not unpack Thursday's bag ═══════════════════
//
// The hazard that is easy to miss: the old row still says "packed" and still
// remembers a status to put back, so without the newest-entry rule it would
// cheerfully undo a pack it had nothing to do with.
{
  const b = makeBench();
  b.place('MFH1014');
  b.scanBag('MFH1014', 'BAG-001');          // Tuesday - event 1
  b.readyToShip('MFH1014');
  b.undo(1);                                 // opened again        - event 2
  b.scanBag('MFH1014', 'BAG-999');           // Thursday, new bag   - event 3
  b.readyToShip('MFH1014');

  const r = b.undo(1);
  t('7a Tuesday cannot touch Thursday', r.ok, false);
  t('7b the new bag is untouched', b.orders['MFH1014'].bag, 'BAG-999');
  t('7c but Thursday itself can be undone', b.undo(3).ok, true);
  t('7d and then the new bag is free', b.orders['MFH1014'].bag, null);
}

// ═══ 8. An undo row is not itself undoable ═══════════════════════════════
{
  const b = makeBench();
  b.place('MFH1', {});
  b.scanBag('MFH1', 'BAG-001');
  b.undo(1);
  const r = b.undo(2);
  t('8a refused', r.ok, false);
  t('8b and says so plainly', r.message, 'This one is itself an undo.');
}

// ═══ 9. A cancelled order ════════════════════════════════════════════════
{
  const b = makeBench();
  b.place('MFH1', {});
  b.scanBag('MFH1', 'BAG-001');
  b.orders['MFH1'].status = 'Cancelled';
  const r = b.undo(1);
  t('9a refused', r.ok, false);
  t('9b and points at the real fix', r.message.includes('Reopen it first'), true);
}

// ═══ 10. The invoice number is never taken back ══════════════════════════
//
// A GST number belongs to the order it was issued against. Wiping it would
// either leave a hole in the book or hand the same number to a second parcel
// later; re-packing reuses the one already there.
{
  const b = makeBench();
  b.place('MFH1014');
  b.scanBag('MFH1014', 'BAG-001');
  b.readyToShip('MFH1014');
  const issued = b.orders['MFH1014'].invoice;

  const r = b.undo(1);
  t('10a the number stays on the order', b.orders['MFH1014'].invoice, issued);
  t('10b and the screen says so rather than letting it be discovered',
    r.stillStands.some(l => l.includes('Invoice')), true);
  t('10c as it does for the live waybill',
    r.stillStands.some(l => l.includes('still live at Delhivery')), true);
  t('10d and for the message already sent',
    r.stillStands.some(l => l.includes('cannot be unsent')), true);

  b.scanBag('MFH1014', 'BAG-002');
  b.readyToShip('MFH1014');
  t('10e packing again reuses it, it does not take a second number',
    b.orders['MFH1014'].invoice, issued);
}

// ═══ 11. Re-packing into a fresh bag reads as its own entry ══════════════
{
  const b = makeBench();
  b.place('MFH1', {});
  b.scanBag('MFH1', 'BAG-001');
  b.scanBag('MFH1', 'BAG-002');
  t('11a two entries', b.events.map(e => e.action), [PACKED, BAG_CHANGED]);
  t('11b the second remembers the first bag', b.events[1].previousBag, 'BAG-001');
}

// ═══ 12. A bag cleared by hand ═══════════════════════════════════════════
{
  const b = makeBench();
  b.place('MFH1', {});
  b.scanBag('MFH1', 'BAG-001');
  b.clearBag('MFH1');
  t('12a it is written down too', b.events[1].action, BAG_CLEARED);
  t('12b with the bag that went', b.events[1].previousBag, 'BAG-001');
  const r = b.undo(2);
  t('12c and there is nothing to take back', r.message.includes('already cleared'), true);
}

// ═══ 13. The history outlives the page ═══════════════════════════════════
//
// The whole complaint. `done` held twenty-five order ids until a refresh;
// these rows answer "which bag did this go in" a week later.
{
  const b = makeBench();
  for (let i = 1; i <= 30; i++) { b.place(`MFH${i}`, {}); b.scanBag(`MFH${i}`, `BAG-${i}`); }
  t('13a all thirty are kept, not the last twenty-five', b.events.length, 30);
  const found = b.events.find(e => e.bagBarcode === 'BAG-3');
  t('13b and one can be found by its bag', found.orderId, 'MFH3');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
