// Who gets the new-collection text, and - mostly - who does not.
//
// Every case here is money. One press sends a few hundred messages the shop
// pays for, so the ways to get it wrong all cost something real: an advert to
// somebody who spent money this week, the same number twice, a second text
// two hours after the first.
//
// The three waiting periods are the shop's call:
//
//   ordered, not cancelled    30 days from the order
//   the order was cancelled   48 hours - a sale that nearly happened is the
//                             warmest lead there is
//   already texted            48 hours, unless Resend is pressed
//
// The shop is 241 popup leads and 123 customers with a large overlap, so the
// overlap cases are not hypothetical.

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

const HOUR = 3600e3, DAY = 24 * HOUR;
const now = Date.now();
const hoursAgo = h => new Date(now - h * HOUR).toISOString();
const daysAgo = d => new Date(now - d * DAY).toISOString();

const AFTER_AN_ORDER = 30 * DAY;
const AFTER_A_CANCELLATION = 48 * HOUR;
const AFTER_A_TEXT = 48 * HOUR;
const MAX_PER_PRESS = 300;

const phone10 = p => {
  const d = String(p ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
};

// ── OutreachController.QuietUntilOrdersAsync ─────────────────────────────
function quietUntilOrders(orders) {
  const until = new Map();
  for (const o of orders) {
    const ten = phone10(o.phone);
    if (!ten) continue;
    const cancelled = String(o.status ?? '').toLowerCase().startsWith('cancel');
    const at = Date.parse(cancelled ? o.updatedAt : (o.placedAt ?? o.createdAt));
    const free = at + (cancelled ? AFTER_A_CANCELLATION : AFTER_AN_ORDER);
    if (!until.has(ten) || free > until.get(ten)) until.set(ten, free);
  }
  return until;
}

function quietUntilTexts(invites) {
  const until = new Map();
  for (const i of invites) {
    if (i.channel !== 'sms' || !i.phone) continue;
    const free = Date.parse(i.sentAt) + AFTER_A_TEXT;
    if (free < now) continue;
    const ten = phone10(i.phone);
    if (!until.has(ten) || free > until.get(ten)) until.set(ten, free);
  }
  return until;
}

// ── OutreachController.AudienceAsync ─────────────────────────────────────
function audience(people, orders, invites, optedInOnly, resend) {
  const afterOrders = quietUntilOrders(orders);
  const afterTexts = quietUntilTexts(invites);

  const cancelledSoon = new Set();
  for (const [ten, free] of afterOrders)
    if (free > now && free - now <= AFTER_A_CANCELLATION) cancelledSoon.add(ten);

  const send = [], seen = new Set();
  let noNumber = 0, ordered = 0, cancelled = 0, texted = 0, noConsent = 0, duplicate = 0;

  for (const p of people) {
    const ten = phone10(p.phone);
    if (!ten) { noNumber++; continue; }
    const freeAt = afterOrders.get(ten);
    if (freeAt !== undefined && freeAt > now) {
      if (cancelledSoon.has(ten)) cancelled++; else ordered++;
      continue;
    }
    if (!resend && (afterTexts.get(ten) ?? 0) > now) { texted++; continue; }
    if (optedInOnly && !p.consent) { noConsent++; continue; }
    if (seen.has(ten)) { duplicate++; continue; }
    seen.add(ten);
    send.push({ ...p, phone: ten });
  }
  return { send, noNumber, ordered, cancelled, texted, noConsent, duplicate };
}

function sendEveryone(state, who, { optedInOnly = false, resend = false, batchFails = [] } = {}) {
  const a = audience(state.people[who], state.orders, state.invites, optedInOnly, resend);
  const take = a.send.slice(0, MAX_PER_PRESS);
  let sent = 0, failed = 0, batchNo = 0;
  for (let i = 0; i < take.length; i += 100) {
    const batch = take.slice(i, i + 100);
    batchNo++;
    if (batchFails.includes(batchNo)) { failed += batch.length; continue; }
    for (const p of batch)
      state.invites.push({ audience: who, personId: p.id, channel: 'sms', phone: p.phone, sentAt: new Date(now).toISOString() });
    sent += batch.length;
  }
  return { sent, failed, left: Math.max(0, a.send.length - take.length), skipped: a };
}

const lead = (id, phone, over = {}) => ({ id, name: `L${id}`, phone, consent: true, ...over });
const cust = (id, phone, over = {}) => ({ id, name: `C${id}`, phone, consent: false, ...over });
const order = (phone, over = {}) => ({ phone, status: 'Delivered', placedAt: daysAgo(1), createdAt: daysAgo(1), updatedAt: daysAgo(1), ...over });
const fresh = () => ({ people: { lead: [], customer: [] }, orders: [], invites: [] });

// ═══ 1. Ordered: thirty days, then they are due again ════════════════════
{
  const s = fresh();
  s.people.lead = [lead(1, '9353568638'), lead(2, '9429429880')];
  s.orders = [
    order('+91 93535 68638', { placedAt: daysAgo(10), createdAt: daysAgo(10) }),   // too recent
    order('9429429880', { placedAt: daysAgo(31), createdAt: daysAgo(31) }),        // long enough ago
  ];
  const a = audience(s.people.lead, s.orders, [], false, false);
  t('1a the recent buyer waits', a.send.map(p => p.id), [2]);
  t('1b counted as ordered, not as cancelled', [a.ordered, a.cancelled], [1, 0]);
}

// ═══ 2. Twenty-nine days is not thirty ═══════════════════════════════════
{
  const s = fresh();
  s.people.lead = [lead(1, '9353568638')];
  s.orders = [order('9353568638', { placedAt: daysAgo(29), createdAt: daysAgo(29) })];
  t('2a still waiting', audience(s.people.lead, s.orders, [], false, false).send.length, 0);

  s.orders = [order('9353568638', { placedAt: daysAgo(30.1), createdAt: daysAgo(30.1) })];
  t('2b and then due', audience(s.people.lead, s.orders, [], false, false).send.length, 1);
}

// ═══ 3. A cancelled order waits only 48 hours ════════════════════════════
//
// The warmest lead there is: they chose, they got as far as ordering, and
// something stopped them.
{
  const s = fresh();
  s.people.lead = [lead(1, '9353568638'), lead(2, '9429429880')];
  s.orders = [
    order('9353568638', { status: 'Cancelled', updatedAt: hoursAgo(10) }),   // too recent
    order('9429429880', { status: 'Cancelled', updatedAt: hoursAgo(49) }),   // due
  ];
  const a = audience(s.people.lead, s.orders, [], false, false);
  t('3a ten hours is too soon', a.send.map(p => p.id), [2]);
  t('3b and it is counted as a cancellation, not an order', [a.cancelled, a.ordered], [1, 0]);
}

// ═══ 4. Bought AND cancelled: the longer wait wins ═══════════════════════
//
// Somebody who bought on Monday and cancelled a second order on Wednesday is
// still a customer who bought on Monday. Reading only the latest row would
// text them an advert two days after they spent money.
{
  const s = fresh();
  s.people.lead = [lead(1, '9353568638')];
  s.orders = [
    order('9353568638', { placedAt: daysAgo(2), createdAt: daysAgo(2) }),        // a real order
    order('9353568638', { status: 'Cancelled', updatedAt: hoursAgo(50) }),       // cancelled, already past 48h
  ];
  const a = audience(s.people.lead, s.orders, [], false, false);
  t('4a the thirty-day wait still applies', a.send.length, 0);
  t('4b and it reads as an order, not a cancellation', [a.ordered, a.cancelled], [1, 0]);

  // Once the order is old enough, the stale cancellation does not hold them.
  s.orders[0] = order('9353568638', { placedAt: daysAgo(40), createdAt: daysAgo(40) });
  t('4c then they are due', audience(s.people.lead, s.orders, [], false, false).send.length, 1);
}

// ═══ 5. Texted in the last 48 hours ══════════════════════════════════════
{
  const s = fresh();
  s.people.lead = [lead(1, '9353568638'), lead(2, '9429429880'), lead(3, '9414141414')];
  s.invites = [
    { channel: 'sms', phone: '9353568638', sentAt: hoursAgo(5) },
    { channel: 'sms', phone: '9429429880', sentAt: hoursAgo(49) },
    { channel: 'whatsapp', phone: '9414141414', sentAt: hoursAgo(1) },
  ];
  const a = audience(s.people.lead, [], s.invites, false, false);
  t('5a five hours ago waits, forty-nine does not', a.send.map(p => p.id), [2, 3]);
  t('5b counted', a.texted, 1);
  // WhatsApp is not SMS. Treating them as one would silently halve the campaign.
  t('5c a WhatsApp message does not block a text', a.send.some(p => p.id === 3), true);
}

// ═══ 6. Resend sets aside the text rule, and only that one ═══════════════
{
  const s = fresh();
  s.people.lead = [lead(1, '9353568638'), lead(2, '9429429880')];
  s.invites = [{ channel: 'sms', phone: '9353568638', sentAt: hoursAgo(2) }];
  s.orders = [order('9429429880', { placedAt: daysAgo(3), createdAt: daysAgo(3) })];

  const plain = audience(s.people.lead, s.orders, s.invites, false, false);
  t('6a without resend, neither', plain.send.length, 0);

  const again = audience(s.people.lead, s.orders, s.invites, false, true);
  t('6b resend reaches the one who was texted', again.send.map(p => p.id), [1]);
  // The one who ordered three days ago is still left out. An advert to
  // somebody who spent money this week is wrong however often it is asked for.
  t('6c but not the one who just bought', again.ordered, 1);
}

// ═══ 7. The same number on both lists gets ONE text ══════════════════════
{
  const s = fresh();
  s.people.lead = [lead(1, '9353568638'), lead(2, '09353568638'), lead(3, '+919353568638')];
  const a = audience(s.people.lead, [], [], false, false);
  t('7a one message, three rows', a.send.length, 1);
  t('7b and the other two are counted', a.duplicate, 2);
}

// ═══ 8. No mobile number ═════════════════════════════════════════════════
{
  const s = fresh();
  s.people.lead = [lead(1, null), lead(2, ''), lead(3, '12345'), lead(4, '9353568638')];
  const a = audience(s.people.lead, [], [], false, false);
  t('8a only the real number', a.send.map(p => p.id), [4]);
  t('8b the rest are counted rather than silently dropped', a.noNumber, 3);
}

// ═══ 9. The consent switch, for customers ════════════════════════════════
{
  const s = fresh();
  s.people.customer = [cust(1, '9353568638', { consent: true }), cust(2, '9429429880'), cust(3, '9414141414')];
  t('9a everyone who is due', audience(s.people.customer, [], [], false, false).send.length, 3);
  t('9b or only the ones who agreed', audience(s.people.customer, [], [], true, false).send.map(p => p.id), [1]);
  t('9c and the rest are counted', audience(s.people.customer, [], [], true, false).noConsent, 2);
}

// ═══ 10. Pressing twice does not text anybody twice ══════════════════════
{
  const s = fresh();
  s.people.lead = Array.from({ length: 5 }, (_, i) => lead(i + 1, `94294298${80 + i}`));
  t('10a the first press sends to all five', sendEveryone(s, 'lead').sent, 5);
  const second = sendEveryone(s, 'lead');
  t('10b the second sends to nobody', second.sent, 0);
  t('10c because they were texted two minutes ago', second.skipped.texted, 5);
  t('10d five rows written, not ten', s.invites.length, 5);
  // And Resend is how he overrides exactly that.
  t('10e resend reaches them again', sendEveryone(s, 'lead', { resend: true }).sent, 5);
}

// ═══ 11. A batch that fails does not lose the ones that went ═════════════
{
  const s = fresh();
  s.people.lead = Array.from({ length: 250 }, (_, i) => lead(i + 1, String(9000000000 + i)));
  const r = sendEveryone(s, 'lead', { batchFails: [3] });
  t('11a two hundred went', r.sent, 200);
  t('11b fifty did not', r.failed, 50);
  t('11c and only the ones that went are written down', s.invites.length, 200);
  t('11d pressing again sends only the fifty that were missed', sendEveryone(s, 'lead').sent, 50);
}

// ═══ 12. More than one press worth ═══════════════════════════════════════
{
  const s = fresh();
  s.people.lead = Array.from({ length: 420 }, (_, i) => lead(i + 1, String(9100000000 + i)));
  const r = sendEveryone(s, 'lead');
  t('12a three hundred in one press', r.sent, MAX_PER_PRESS);
  t('12b and it says how many are left', r.left, 120);
  t('12c the next press finishes them', sendEveryone(s, 'lead').sent, 120);
  t('12d with nobody done twice', new Set(s.invites.map(i => i.phone)).size, 420);
}

// ═══ 13. His real shape ══════════════════════════════════════════════════
//
// 241 leads, 123 customers, 20 on both lists with the same number, 40
// customers who ordered this month and 5 whose order was cancelled yesterday.
{
  const s = fresh();
  const shared = Array.from({ length: 20 }, (_, i) => String(9200000000 + i));
  s.people.lead = [
    ...shared.map((p, i) => lead(i + 1, p)),
    ...Array.from({ length: 221 }, (_, i) => lead(100 + i, String(9300000000 + i))),
  ];
  s.people.customer = [
    ...shared.map((p, i) => cust(500 + i, p)),
    ...Array.from({ length: 103 }, (_, i) => cust(600 + i, String(9400000000 + i))),
  ];
  s.orders = [
    ...Array.from({ length: 40 }, (_, i) => order(String(9400000000 + i), { placedAt: daysAgo(5), createdAt: daysAgo(5) })),
    ...Array.from({ length: 5 }, (_, i) => order(String(9400000050 + i), { status: 'Cancelled', updatedAt: hoursAgo(20) })),
  ];

  const leads = sendEveryone(s, 'lead');
  t('13a every lead who is due is texted once', leads.sent, 241);

  const customers = sendEveryone(s, 'customer');
  t('13b the 20 who are also leads are not texted a second time', customers.skipped.texted, 20);
  t('13c the 40 who ordered this month wait', customers.skipped.ordered, 40);
  t('13d the 5 cancelled yesterday wait too, and are counted apart', customers.skipped.cancelled, 5);
  t('13e so this press sends the remaining 58', customers.sent, 58);
  t('13f and no number in the whole campaign was used twice',
    s.invites.length, new Set(s.invites.map(i => i.phone)).size);

  // Two days on, the five cancellations are the warmest leads in the shop.
  // Only those five are asked about here - handing the whole list an empty
  // invite history would make the 58 just-texted look due as well, which is
  // the test being wrong rather than the rule.
  const theFive = s.people.customer.filter(c => /^94000000(5[0-4])$/.test(c.phone));
  const later = audience(
    theFive,
    s.orders.map(o => (String(o.status).toLowerCase().startsWith('cancel')
      ? { ...o, updatedAt: hoursAgo(49) } : o)),
    s.invites, false, false);
  t('13g five customers whose order was cancelled', theFive.length, 5);
  t('13h and two days on they are due', later.send.length, 5);
}

// ═══ 14. Nobody due ══════════════════════════════════════════════════════
{
  const s = fresh();
  s.people.lead = [lead(1, '9353568638')];
  s.orders = [order('9353568638', { placedAt: daysAgo(2), createdAt: daysAgo(2) })];
  const r = sendEveryone(s, 'lead');
  t('14a nothing is sent', r.sent, 0);
  t('14b and nothing is written down', s.invites.length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
