// A parcel that is home must read as home, and the money must be owed.
//
// Order MFH17919491518985415, AWB 55746510000464. Refused in West Bengal,
// carried back to Balotra, and scanned there:
//
//     Dispatched for RTO   1 Nov, 1:42 pm   Balotra_Ward45_D
//     RETURN Accepted      1 Nov, 3:41 pm   Balotra_Ward45_D
//
// The shop's own town, two hours apart, the second one being the shop taking
// its parcel back. The order sat in Return Transit, the goods sat on the
// shelf, and the Refunds screen said "Nothing to refund right now."
//
// Three things are replayed here, all three of them on the path between a
// parcel arriving and money going back to a customer:
//
//   isBackWithUs        DelhiveryService - the courier's words for "you have
//                       it back", which did not include the one it used
//   onlinePaidAmount    RefundOpener - what the customer is out of pocket,
//                       which ignored cash a COD customer actually handed over
//   the modal's gates   the admin screen - which button is offered, and to
//                       which kind of return
//
// Run: node frontend/scripts/return-home-replay.js

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

// ── DelhiveryService.IsReturnLeg ─────────────────────────────────────────
function isReturnLeg(status, statusType) {
  const t2 = String(statusType ?? '').trim().toUpperCase();
  if (t2 === 'RT') return true;
  const s = String(status ?? '').toLowerCase();
  return s.includes('rto') || s.includes('dto') || s.includes('return');
}

// ── DelhiveryService.IsBackWithUs ────────────────────────────────────────
function isBackWithUs(status, statusType) {
  if (!isReturnLeg(status, statusType)) return false;
  const s = String(status ?? '').toLowerCase();
  return s.includes('delivered') || s.includes('received')
      || s.includes('accepted') || s.includes('to origin');
}

// What it used to be, kept so the cases can say what changed.
function isBackWithUsOld(status, statusType) {
  if (!isReturnLeg(status, statusType)) return false;
  const s = String(status ?? '').toLowerCase();
  return s.includes('delivered') || s.includes('received');
}

// ── RefundOpener.OnlinePaidAmount ────────────────────────────────────────
const round2 = n => Math.round(n * 100) / 100;
function onlinePaidAmount(order) {
  const isCod = String(order.method ?? '').toLowerCase() === 'cod';
  const reachedTheCustomer = order.deliveredAt !== null && order.deliveredAt !== undefined;
  const paid = (isCod && !reachedTheCustomer)
    ? order.advancePaid
    : order.total - order.walletUsed;
  return paid > 0 ? round2(paid) : 0;
}

const order = (over = {}) => ({
  method: 'cashfree', total: 528, walletUsed: 0, advancePaid: 0, deliveredAt: null, ...over,
});

// ── the return modal's gates ─────────────────────────────────────────────
const modal = o => ({
  // Approve / Reject answer a request SHE made.
  askDecision: !o.returnDecision && o.status === 'Return Requested',
  // Mark as Returned follows the goods, not the paperwork.
  markReturned: o.status === 'Return Transit',
  // "nobody asked for this one"
  rtoBanner: !o.returnDecision && o.status === 'Return Transit',
  // the reverse-pickup panel, unchanged
  reversePickup: o.returnDecision === 'approved' && o.status !== 'Return',
});

// What it used to offer.
const modalOld = o => ({
  askDecision: !o.returnDecision,
  markReturned: o.returnDecision === 'approved'
    && ['Return Requested', 'Return Transit', 'Return'].includes(o.status)
    && o.status !== 'Return',
  rtoBanner: false,
  reversePickup: o.returnDecision === 'approved' && o.status !== 'Return',
});

// ═══ 1. His own parcel ═══════════════════════════════════════════════════
{
  t('1a the old rule said it was still travelling',
    isBackWithUsOld('RETURN Accepted', 'RT'), false);
  t('1b it is home', isBackWithUs('RETURN Accepted', 'RT'), true);
  t('1c two hours earlier it was not',
    isBackWithUs('Dispatched for RTO', 'RT'), false);
}

// ═══ 2. Every wording, both directions ═══════════════════════════════════
{
  const onTheWayBack = [
    ['Out for Return', 'RT'],
    ['Dispatched for RTO', 'RT'],
    ['RTO In Transit', 'RT'],
    ['In Transit', 'RT'],
    ['Vehicle Departed', 'RT'],
  ];
  for (const [s, ty] of onTheWayBack) {
    t(`2 "${s}" is the way home but not home yet`,
      [isReturnLeg(s, ty), isBackWithUs(s, ty)], [true, false]);
  }

  const home = [
    ['RTO Delivered', 'RT'],
    ['RETURN Accepted', 'RT'],
    ['Return Accepted', ''],
    ['Returned to Origin', ''],
    ['RTO Received at Origin', ''],
    ['DTO Delivered', ''],
  ];
  for (const [s, ty] of home) {
    t(`2 "${s}" is home`, isBackWithUs(s, ty), true);
  }
}

// ═══ 3. The forward journey is not a return ══════════════════════════════
//
// The one that must not slip: "accepted" on its own, going OUT, is a pickup
// being accepted from the shop. If that read as home, every parcel would open
// a refund the day it was handed to the courier.
{
  const forward = [
    ['Manifested', 'UD'],
    ['Pickup Accepted', 'PP'],
    ['Shipment Received at Facility', 'UD'],
    ['Out for delivery', 'UD'],
    ['Delivered', 'DL'],
    ['Undelivered', 'UD'],
    ['On hold. Destination unable to receive', 'UD'],
  ];
  for (const [s, ty] of forward) {
    t(`3 "${s}" is not a return at all`,
      [isReturnLeg(s, ty), isBackWithUs(s, ty)], [false, false]);
  }

  // And the one the 29 October fix was about: "Return Delivered" must never
  // be read as the customer having received anything.
  t('3 "Return Delivered" is a return, and it is home',
    [isReturnLeg('Return Delivered', ''), isBackWithUs('Return Delivered', '')], [true, true]);
}

// ═══ 4. Nothing, and nonsense ════════════════════════════════════════════
{
  t('4a null', [isReturnLeg(null, null), isBackWithUs(null, null)], [false, false]);
  t('4b empty', [isReturnLeg('', ''), isBackWithUs('', '')], [false, false]);
  t('4c case does not matter', isBackWithUs('rto delivered', ''), true);
  t('4d spaces round the status type', isBackWithUs('In Transit', '  rt  '), false);
}

// ═══ 5. What is owed - prepaid ═══════════════════════════════════════════
{
  t('5a the whole thing', onlinePaidAmount(order({ total: 528 })), 528);
  t('5b less the wallet part, which goes back on its own',
    onlinePaidAmount(order({ total: 528, walletUsed: 100 })), 428);
  t('5c paid entirely from the wallet - nothing to send',
    onlinePaidAmount(order({ total: 528, walletUsed: 528 })), 0);
  t('5d and a wallet larger than the order never goes negative',
    onlinePaidAmount(order({ total: 528, walletUsed: 600 })), 0);
  t('5e paise survive', onlinePaidAmount(order({ total: 465.75 })), 465.75);
}

// ═══ 6. What is owed - COD that never reached her ════════════════════════
//
// An RTO. The courier collected no cash, so only what was paid online before
// dispatch is owed. This part was already right and must stay right.
{
  t('6a nothing paid, nothing owed',
    onlinePaidAmount(order({ method: 'cod', total: 528, advancePaid: 0 })), 0);
  t('6b only the advance',
    onlinePaidAmount(order({ method: 'cod', total: 528, advancePaid: 50 })), 50);
  t('6c not the whole order',
    onlinePaidAmount(order({ method: 'cod', total: 2599, advancePaid: 50 })), 50);
}

// ═══ 7. What is owed - COD she received and sent back ════════════════════
//
// She handed the courier the money at her door. The old rule returned the
// advance and nothing else, so the Refunds screen said nothing was owed on an
// order she had paid for in full.
{
  const got = order({ method: 'cod', total: 528, advancePaid: 0, deliveredAt: '2026-10-24T10:08:00Z' });
  t('7a the cash is owed', onlinePaidAmount(got), 528);

  const withAdvance = order({ method: 'cod', total: 528, advancePaid: 50, deliveredAt: '2026-10-24T10:08:00Z' });
  t('7b advance and cash together, counted once',
    onlinePaidAmount(withAdvance), 528);

  const withWallet = order({ method: 'cod', total: 528, walletUsed: 100, deliveredAt: '2026-10-24T10:08:00Z' });
  t('7c the wallet part still goes back separately',
    onlinePaidAmount(withWallet), 428);

  // The distinction the whole rule rests on.
  const rto = order({ method: 'cod', total: 528, advancePaid: 50, deliveredAt: null });
  t('7d delivered and not delivered are different answers',
    [onlinePaidAmount(withAdvance), onlinePaidAmount(rto)], [528, 50]);
}

// ═══ 8. The modal - a return SHE asked for ═══════════════════════════════
{
  const asked = { status: 'Return Requested', returnDecision: null };
  t('8a she is asked about, not told', modal(asked).askDecision, true);
  t('8b and no Mark as Returned yet', modal(asked).markReturned, false);
  t('8c no RTO banner on a real request', modal(asked).rtoBanner, false);

  const approved = { status: 'Return Transit', returnDecision: 'approved' };
  t('8d once approved, the button is there', modal(approved).markReturned, true);
  t('8e and the reverse pickup panel', modal(approved).reversePickup, true);
  t('8f nothing left to decide', modal(approved).askDecision, false);

  const done = { status: 'Return', returnDecision: 'approved' };
  t('8g a closed return offers nothing',
    [modal(done).askDecision, modal(done).markReturned], [false, false]);

  const rejected = { status: 'Delivered', returnDecision: 'rejected' };
  t('8h a rejected one offers nothing either',
    [modal(rejected).askDecision, modal(rejected).markReturned, modal(rejected).rtoBanner],
    [false, false, false]);
}

// ═══ 9. The modal - a parcel the courier brought back ════════════════════
//
// His two stuck orders. No returnDecision, because nobody asked for anything.
{
  const rto = { status: 'Return Transit', returnDecision: null };

  t('9a it used to ask him to approve a request nobody made',
    modalOld(rto).askDecision, true);
  t('9b and withheld the only button he wanted',
    modalOld(rto).markReturned, false);

  t('9c now there is nothing to approve', modal(rto).askDecision, false);
  t('9d the button is there', modal(rto).markReturned, true);
  t('9e and it says why there is no request', modal(rto).rtoBanner, true);
  t('9f no reverse pickup - the parcel is already on its way',
    modal(rto).reversePickup, false);

  // Once he presses it.
  const closed = { status: 'Return', returnDecision: null };
  t('9g closed out, the banner goes', modal(closed).rtoBanner, false);
  t('9h and the button with it', modal(closed).markReturned, false);
}

// ═══ 10. The whole journey, end to end ═══════════════════════════════════
//
// A COD order delivered on 24 October, sent back, scanned home on 1 November.
{
  const o = order({ method: 'cod', total: 649, advancePaid: 0, deliveredAt: '2026-10-24T10:08:00Z' });
  let status = 'Delivered';
  const refunds = [];

  const scans = [
    ['Out for delivery', 'UD'],
    ['Dispatched for RTO', 'RT'],
    ['RETURN Accepted', 'RT'],
  ];
  for (const [s, ty] of scans) {
    if (isBackWithUs(s, ty)) {
      if (status !== 'Return') {
        status = 'Return';
        const owed = onlinePaidAmount(o);
        if (owed > 0 && !refunds.length) refunds.push({ owed, status: 'pending' });
      }
    } else if (isReturnLeg(s, ty) && status !== 'Return' && status !== 'Return Transit') {
      status = 'Return Transit';
    }
  }

  t('10a it ends up Returned', status, 'Return');
  t('10b one pending refund', refunds, [{ owed: 649, status: 'pending' }]);

  // Running the sweep again must not open a second one.
  for (const [s, ty] of scans) {
    if (isBackWithUs(s, ty) && status !== 'Return') refunds.push({ owed: 649, status: 'pending' });
  }
  t('10c and the next sweep opens nothing', refunds.length, 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
