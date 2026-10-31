// The two messages that are sent by a clock.
//
// Everything that matters here is a message that should NOT go. A duplicate
// "out for delivery" is embarrassing; a review ask to someone who already
// wrote one is worse; and a text saying "your payment did not go through"
// sent to someone whose bank is still processing it costs the shop the sale
// it had already won. So most of these cases assert silence.
//
// The schedule he asked for, in his words: "Review2 ... Ek Deliverd ke
// 1hourse ke bad useke bad 3 Bar Jana chahiye har 48 hourse ke bad", and
// USER_DROPPED2 "jab customer payment tak aata hai or vo order nahi karta
// hai" - which he settled at one hour.

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

const H = 3600e3;
const now = new Date('2026-10-31T12:00:00Z').getTime();
const ago = h => new Date(now - h * H).toISOString();

// ── the constants, as the C# declares them ───────────────────────────────
const REVIEW_ATTEMPTS = 3;
const REVIEW_FIRST = 1;      // hours after delivery
const REVIEW_GAP = 48;       // hours between the rest
const DROPPED_DELAY = 1;     // hours after the checkout
const REVIEW_WINDOW = 7 * 24;
const DROPPED_WINDOW = 24;
const ONE_PER_PHONE = 24;
const MAX_PER_RUN = 25;

const last10 = p => {
  const d = String(p ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};

// ── OrderMessenger.SendOnceAsync, including the unique index ─────────────
function makeMessenger(rows) {
  const sends = [...rows];
  return {
    sends,
    sendOnce(orderId, template, phone, attempt = 1) {
      if (!orderId || !String(orderId).trim()) return false;
      // The index, not a read-then-write.
      if (sends.some(s => s.orderId === orderId && s.template === template && s.attempt === attempt))
        return false;
      const row = { orderId, template, attempt, phone, sentAt: now, status: phone ? 'sent' : 'failed' };
      sends.push(row);
      return !!phone;
    },
  };
}

// ── CustomerMessageService.ReviewSweepAsync ──────────────────────────────
function reviewSweep(db, msg, { smsOff = false, reviewOff = false } = {}) {
  if (smsOff || reviewOff) return [];

  const firstDue = now - REVIEW_FIRST * H;
  const floor = now - REVIEW_WINDOW * H;
  const gapFloor = now - REVIEW_GAP * H;

  // Everything in the batch selection, as the EF query does it. Filtering
  // after the slice is what case 16 catches.
  const orders = db.orders
    .filter(o => o.status === 'Delivered' && o.deliveredAt != null
              && Date.parse(o.deliveredAt) <= firstDue
              && Date.parse(o.deliveredAt) >= floor
              && !db.reviews.some(r => r.orderId === o.orderId)
              && msg.sends.filter(m => m.orderId === o.orderId && m.template === 'Review').length < REVIEW_ATTEMPTS
              && !msg.sends.some(m => m.orderId === o.orderId && m.template === 'Review' && m.sentAt > gapFloor))
    .sort((a, b) => Date.parse(a.deliveredAt) - Date.parse(b.deliveredAt))
    .slice(0, MAX_PER_RUN);

  const out = [];
  for (const o of orders) {
    const done = msg.sends.filter(m => m.orderId === o.orderId && m.template === 'Review').length;
    const attempt = done + 1;
    if (attempt > REVIEW_ATTEMPTS) continue;
    if (msg.sendOnce(o.orderId, 'Review', o.phone, attempt)) out.push(`${o.orderId}#${attempt}`);
  }
  return out;
}

// ── CustomerMessageService.DroppedSweepAsync ─────────────────────────────
function droppedSweep(db, msg, { smsOff = false } = {}) {
  if (smsOff) return [];

  const due = now - DROPPED_DELAY * H;
  const floor = now - DROPPED_WINDOW * H;

  const drops = db.cashfree
    .filter(c => Date.parse(c.createdAt) <= due && Date.parse(c.createdAt) >= floor
              && c.paidAt == null && c.status !== 'paid'
              && (c.cfStatus == null || (c.cfStatus !== 'SUCCESS' && c.cfStatus !== 'PENDING'))
              && !db.orders.some(o => o.orderId === c.localOrderId)
              && !msg.sends.some(m => m.orderId === c.localOrderId && m.template === 'UserDropped'))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(0, MAX_PER_RUN);

  const since = now - ONE_PER_PHONE * H;
  const recent = new Set(msg.sends
    .filter(s => s.template === 'UserDropped' && s.sentAt >= since && s.phone)
    .map(s => last10(s.phone)).filter(p => p.length > 0));

  const out = [];
  for (const cf of drops) {
    const phone = cf.phone ?? null;
    const key = last10(phone);
    if (key.length === 0) { msg.sendOnce(cf.localOrderId, 'UserDropped', null, 1); continue; }
    if (recent.has(key)) continue;
    if (msg.sendOnce(cf.localOrderId, 'UserDropped', phone, 1)) { recent.add(key); out.push(cf.localOrderId); }
  }
  return out;
}

const order = (id, over = {}) => ({
  orderId: id, status: 'Delivered', deliveredAt: ago(2), phone: '9353568638', ...over,
});
const cfRow = (id, over = {}) => ({
  localOrderId: id, createdAt: ago(2), paidAt: null, status: 'created',
  cfStatus: 'USER_DROPPED', phone: '9353568638', ...over,
});

// ═══ 1. The review ask, on his schedule ══════════════════════════════════
{
  const db = { orders: [order('MFH1', { deliveredAt: ago(2) })], reviews: [], cashfree: [] };
  const msg = makeMessenger([]);
  t('1a an hour after delivery, the first one goes', reviewSweep(db, msg), ['MFH1#1']);

  // The sweep runs hourly. Every one of those runs must do nothing.
  const quiet = [];
  for (let i = 0; i < 40; i++) quiet.push(...reviewSweep(db, msg));
  t('1b and forty hourly sweeps later, still only one', quiet, []);
  t('1c one row, not forty', msg.sends.filter(s => s.template === 'Review').length, 1);
}

// ═══ 2. Not before the hour is up ════════════════════════════════════════
{
  const db = { orders: [order('MFH2', { deliveredAt: ago(0.5) })], reviews: [], cashfree: [] };
  t('2a half an hour is too soon', reviewSweep(db, makeMessenger([])), []);
}

// ═══ 3. Three times, 48 hours apart, and then it stops ═══════════════════
{
  const db = { orders: [order('MFH3', { deliveredAt: ago(200) })], reviews: [], cashfree: [] };

  // Two already gone, the last one 49 hours ago: the third is due.
  const msg = makeMessenger([
    { orderId: 'MFH3', template: 'Review', attempt: 1, phone: '9353568638', sentAt: now - 97 * H, status: 'sent' },
    { orderId: 'MFH3', template: 'Review', attempt: 2, phone: '9353568638', sentAt: now - 49 * H, status: 'sent' },
  ]);
  // Delivered 200 hours ago is outside the seven-day window, so nothing is
  // picked up at all - the window closing is itself a stop.
  t('3a an old delivery is left alone', reviewSweep(db, msg), []);

  // The same order, delivered inside the window.
  const db2 = { orders: [order('MFH3', { deliveredAt: ago(100) })], reviews: [], cashfree: [] };
  const msg2 = makeMessenger([
    { orderId: 'MFH3', template: 'Review', attempt: 1, phone: '9353568638', sentAt: now - 99 * H, status: 'sent' },
    { orderId: 'MFH3', template: 'Review', attempt: 2, phone: '9353568638', sentAt: now - 49 * H, status: 'sent' },
  ]);
  t('3b the third goes, as the third', reviewSweep(db2, msg2), ['MFH3#3']);
  t('3c and there is no fourth, ever', reviewSweep(db2, msg2), []);
}

// ═══ 4. 47 hours is not 48 ═══════════════════════════════════════════════
{
  const db = { orders: [order('MFH4', { deliveredAt: ago(50) })], reviews: [], cashfree: [] };
  const msg = makeMessenger([
    { orderId: 'MFH4', template: 'Review', attempt: 1, phone: '9353568638', sentAt: now - 47 * H, status: 'sent' },
  ]);
  t('4a the gap is respected', reviewSweep(db, msg), []);
}

// ═══ 5. She wrote the review. Stop. ══════════════════════════════════════
//
// The one that matters most. Being asked again for something you have
// already given is how a shop tells a customer that nobody is reading.
{
  const db = {
    orders: [order('MFH5', { deliveredAt: ago(60) })],
    reviews: [{ orderId: 'MFH5' }],
    cashfree: [],
  };
  const msg = makeMessenger([
    { orderId: 'MFH5', template: 'Review', attempt: 1, phone: '9353568638', sentAt: now - 59 * H, status: 'sent' },
  ]);
  t('5a nothing more is asked', reviewSweep(db, msg), []);
  t('5b not on the next sweep either', reviewSweep(db, msg), []);
  t('5c and no second row was written', msg.sends.filter(s => s.template === 'Review').length, 1);
}

// ═══ 6. Only delivered orders, and only ones with a delivery time ════════
{
  const db = {
    orders: [
      order('MFH6a', { status: 'Transit' }),
      order('MFH6b', { status: 'Return' }),
      order('MFH6c', { status: 'Delivered', deliveredAt: null }),
      order('MFH6d', { status: 'Cancelled' }),
    ],
    reviews: [], cashfree: [],
  };
  t('6a a parcel still travelling is not asked about', reviewSweep(db, makeMessenger([])), []);
}

// ═══ 7. An order with no phone number ════════════════════════════════════
{
  const db = { orders: [order('MFH7', { phone: null })], reviews: [], cashfree: [] };
  const msg = makeMessenger([]);
  t('7a nothing is sent', reviewSweep(db, msg), []);
  // But a row IS written, or the order is picked up again every hour until
  // the window closes - 168 pointless MSG91 calls for one missing number.
  t('7b and the attempt is written down anyway',
    msg.sends.filter(s => s.template === 'Review').map(s => s.status), ['failed']);
  const again = [];
  for (let i = 0; i < 10; i++) again.push(...reviewSweep(db, msg));
  t('7c so it is not retried hourly', again, []);
}

// ═══ 8. The abandoned payment, an hour later ═════════════════════════════
{
  const db = { orders: [], reviews: [], cashfree: [cfRow('MFH8', { createdAt: ago(2) })] };
  const msg = makeMessenger([]);
  t('8a one nudge', droppedSweep(db, msg), ['MFH8']);
  const quiet = [];
  for (let i = 0; i < 30; i++) quiet.push(...droppedSweep(db, msg));
  t('8b and only one', quiet, []);
}

// ═══ 9. A payment still in flight is NOT abandoned ═══════════════════════
//
// The worst possible message: "your payment did not go through", sent while
// the bank is still deciding. Then it succeeds, and the shop has told a
// paying customer their money failed.
{
  const db = { orders: [], reviews: [], cashfree: [
    cfRow('MFH9a', { cfStatus: 'PENDING' }),
    cfRow('MFH9b', { cfStatus: 'SUCCESS' }),
    cfRow('MFH9c', { cfStatus: 'USER_DROPPED', paidAt: ago(1) }),
    cfRow('MFH9d', { cfStatus: 'USER_DROPPED', status: 'paid' }),
  ] };
  t('9a pending, paid, and paid-late are all left alone', droppedSweep(db, makeMessenger([])), []);
}

// ═══ 10. It became an order after all ════════════════════════════════════
//
// The webhook writes the order, or she pays on a second try, or it is
// switched to Cash on Delivery. The payment row can still read USER_DROPPED.
{
  const db = {
    orders: [{ orderId: 'MFH10', status: 'Order Packed' }],
    reviews: [],
    cashfree: [cfRow('MFH10')],
  };
  t('10a a paying customer is not told she walked away', droppedSweep(db, makeMessenger([])), []);
}

// ═══ 11. One person, three attempts at the same payment ══════════════════
//
// Three rows, three order ids, one phone, one frustrated person. The unique
// index cannot catch this - every row qualifies on its own.
{
  const db = { orders: [], reviews: [], cashfree: [
    cfRow('MFH11a', { createdAt: ago(3), phone: '9353568638' }),
    cfRow('MFH11b', { createdAt: ago(2.9), phone: '+91 93535 68638' }),
    cfRow('MFH11c', { createdAt: ago(2.8), phone: '09353568638' }),
  ] };
  const msg = makeMessenger([]);
  t('11a one message, not three', droppedSweep(db, msg), ['MFH11a']);
  t('11b written as one number however it was typed',
    msg.sends.filter(s => s.template === 'UserDropped' && s.status === 'sent').length, 1);

  // A different person in the same batch still gets hers.
  const db2 = { orders: [], reviews: [], cashfree: [
    cfRow('MFH11d', { createdAt: ago(3), phone: '9353568638' }),
    cfRow('MFH11e', { createdAt: ago(2.9), phone: '9429429880' }),
  ] };
  t('11c two people, two messages', droppedSweep(db2, makeMessenger([])), ['MFH11d', 'MFH11e']);
}

// ═══ 12. Yesterday's drop, and the one before ════════════════════════════
//
// The floor is what stops the first sweep after a deploy from texting
// everyone in the table at once.
{
  const db = { orders: [], reviews: [], cashfree: [
    cfRow('MFH12a', { createdAt: ago(23) }),
    cfRow('MFH12b', { createdAt: ago(30), phone: '9429429880' }),
    cfRow('MFH12c', { createdAt: ago(0.5), phone: '9414141414' }),
  ] };
  t('12a inside a day yes, older no, and not before the hour', droppedSweep(db, makeMessenger([])), ['MFH12a']);
}

// ═══ 13. A dropped payment with no phone ═════════════════════════════════
{
  const db = { orders: [], reviews: [], cashfree: [cfRow('MFH13', { phone: null })] };
  const msg = makeMessenger([]);
  t('13a nothing sent', droppedSweep(db, msg), []);
  t('13b but recorded, so it is not reconsidered every hour',
    msg.sends.filter(s => s.orderId === 'MFH13').map(s => s.status), ['failed']);
  const again = [];
  for (let i = 0; i < 12; i++) again.push(...droppedSweep(db, msg));
  t('13c and it is not', again, []);
}

// ═══ 14. The switches ════════════════════════════════════════════════════
{
  const db = {
    orders: [order('MFH14')],
    reviews: [],
    cashfree: [cfRow('MFH14cf', { phone: '9429429880' })],
  };
  t('14a the master switch stops both', [
    reviewSweep(db, makeMessenger([]), { smsOff: true }),
    droppedSweep(db, makeMessenger([]), { smsOff: true }),
  ], [[], []]);

  // Turning off the review emails turns off the review texts too. A switch
  // that half works is worse than one that does not exist.
  t('14b review off stops the texts as well',
    reviewSweep(db, makeMessenger([]), { reviewOff: true }), []);
  t('14c but the dropped-payment nudge is a different thing',
    droppedSweep(db, makeMessenger([])), ['MFH14cf']);
}

// ═══ 15. Two sweeps at once ══════════════════════════════════════════════
//
// A restart while a sweep is running, or a second instance under pm2. Both
// read the same empty table and both decide to send.
{
  const db = { orders: [order('MFH15')], reviews: [], cashfree: [] };
  const msg = makeMessenger([]);          // one shared table, as in Postgres
  const a = reviewSweep(db, msg);
  const b = reviewSweep(db, msg);
  t('15a the first wins', a, ['MFH15#1']);
  t('15b the second writes nothing', b, []);
  t('15c one row', msg.sends.filter(s => s.template === 'Review').length, 1);
}

// ═══ 16. A busy day is batched, not skipped ══════════════════════════════
{
  const orders = Array.from({ length: 60 }, (_, i) =>
    order(`MFH16-${i}`, { deliveredAt: ago(2 + i * 0.01), phone: `94294${String(29880 + i)}` }));
  const db = { orders, reviews: [], cashfree: [] };
  const msg = makeMessenger([]);
  t('16a twenty-five in the first hour', reviewSweep(db, msg).length, MAX_PER_RUN);
  t('16b twenty-five in the second', reviewSweep(db, msg).length, MAX_PER_RUN);
  t('16c the last ten in the third', reviewSweep(db, msg).length, 10);
  t('16d sixty orders, sixty messages, none twice',
    new Set(msg.sends.map(s => s.orderId)).size, 60);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
