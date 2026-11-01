// Who gets the new-collection text, and - mostly - who does not.
//
// Every case here is money. One press sends a few hundred messages the shop
// pays for, to people who have never bought anything, and the three ways to
// get it wrong all cost something real:
//
//   texting a customer who already buys    -> an advert to somebody who is
//                                             already spending; a block, not a sale
//   texting the same number twice          -> the exact complaint the tick exists for
//   texting somebody texted last week      -> the same, spread over days
//
// The shop is 241 popup leads and 123 customers with a large overlap, so the
// overlap cases are not hypothetical.

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

const DAY = 86400e3;
const now = Date.now();
const daysAgo = d => new Date(now - d * DAY).toISOString();

// OutreachContact.Phone10
const phone10 = p => {
  const d = String(p ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
};

const QUIET_DAYS = 30;
const MAX_PER_PRESS = 300;

// ── OutreachController.AudienceAsync ─────────────────────────────────────
function audience(people, orders, invites, optedInOnly) {
  const buyers = new Set();
  for (const o of orders) {
    const ten = phone10(o.phone);
    if (ten) buyers.add(ten);
  }

  const since = now - QUIET_DAYS * DAY;
  const recent = new Set(
    invites.filter(i => i.channel === 'sms' && Date.parse(i.sentAt) >= since && i.phone)
           .map(i => phone10(i.phone)).filter(Boolean));

  const send = [], seen = new Set();
  let noNumber = 0, bought = 0, tooSoon = 0, noConsent = 0, duplicate = 0;

  for (const p of people) {
    const ten = phone10(p.phone);
    if (!ten) { noNumber++; continue; }
    if (buyers.has(ten)) { bought++; continue; }
    if (recent.has(ten)) { tooSoon++; continue; }
    if (optedInOnly && !p.consent) { noConsent++; continue; }
    if (seen.has(ten)) { duplicate++; continue; }
    seen.add(ten);
    send.push({ ...p, phone: ten });
  }
  return { send, noNumber, bought, tooSoon, noConsent, duplicate };
}

// ── the send, batching and recording as the controller does ──────────────
function sendEveryone(state, who, optedInOnly, batchFails = []) {
  const a = audience(state.people[who], state.orders, state.invites, optedInOnly);
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

const fresh = () => ({ people: { lead: [], customer: [] }, orders: [], invites: [] });

// ═══ 1. A customer who has bought is never in the list ═══════════════════
{
  const s = fresh();
  s.people.lead = [lead(1, '9353568638'), lead(2, '9429429880')];
  s.orders = [{ phone: '+91 93535 68638' }];      // same person, written differently
  const a = audience(s.people.lead, s.orders, [], false);
  t('1a only the one who never bought', a.send.map(p => p.id), [2]);
  t('1b and the other is counted as a buyer', a.bought, 1);
}

// ═══ 2. The same number on both lists gets ONE text ══════════════════════
//
// A popup lead who later made an account is two rows and one person. Two
// texts is the thing the shop would hear about.
{
  const s = fresh();
  s.people.lead = [lead(1, '9353568638'), lead(2, '09353568638'), lead(3, '+919353568638')];
  const a = audience(s.people.lead, [], [], false);
  t('2a one message, three rows', a.send.length, 1);
  t('2b and the other two are counted', a.duplicate, 2);
}

// ═══ 3. Texted in the last thirty days: left alone ═══════════════════════
{
  const s = fresh();
  s.people.lead = [lead(1, '9353568638'), lead(2, '9429429880'), lead(3, '9414141414')];
  s.invites = [
    { channel: 'sms', phone: '9353568638', sentAt: daysAgo(3) },
    { channel: 'sms', phone: '9429429880', sentAt: daysAgo(31) },   // long enough ago
    { channel: 'whatsapp', phone: '9414141414', sentAt: daysAgo(1) }, // a different channel
  ];
  const a = audience(s.people.lead, [], s.invites, false);
  t('3a the recent one is skipped, the old one is not', a.send.map(p => p.id), [2, 3]);
  t('3b counted', a.tooSoon, 1);
  // WhatsApp is not SMS. Writing on WhatsApp says nothing about whether a text
  // has gone, and treating them as one would silently halve the campaign.
  t('3c a WhatsApp message does not block a text', a.send.some(p => p.id === 3), true);
}

// ═══ 4. No mobile number ═════════════════════════════════════════════════
{
  const s = fresh();
  s.people.lead = [lead(1, null), lead(2, ''), lead(3, '12345'), lead(4, '9353568638')];
  const a = audience(s.people.lead, [], [], false);
  t('4a only the real number', a.send.map(p => p.id), [4]);
  t('4b the rest are counted rather than silently dropped', a.noNumber, 3);
}

// ═══ 5. The consent switch, for customers ════════════════════════════════
//
// Popup leads typed their number into a box offering a discount; customers
// have a box they may or may not have ticked. The screen offers the choice
// and shows both numbers, because defaulting to "only the ticked ones" on a
// shop where nobody ticked anything would look like a broken button.
{
  const s = fresh();
  s.people.customer = [cust(1, '9353568638', { consent: true }), cust(2, '9429429880'), cust(3, '9414141414')];
  t('5a everyone who never bought', audience(s.people.customer, [], [], false).send.length, 3);
  t('5b or only the ones who agreed', audience(s.people.customer, [], [], true).send.map(p => p.id), [1]);
  t('5c and the rest are counted', audience(s.people.customer, [], [], true).noConsent, 2);
}

// ═══ 6. Pressing twice does not text anybody twice ═══════════════════════
//
// The whole reason the send is written down.
{
  const s = fresh();
  s.people.lead = Array.from({ length: 5 }, (_, i) => lead(i + 1, `94294298${80 + i}`));
  const first = sendEveryone(s, 'lead', false);
  t('6a the first press sends to all five', first.sent, 5);
  const second = sendEveryone(s, 'lead', false);
  t('6b the second sends to nobody', second.sent, 0);
  t('6c and says they were done recently', second.skipped.tooSoon, 5);
  t('6d five rows written, not ten', s.invites.length, 5);
}

// ═══ 7. A batch that fails does not lose the ones that went ══════════════
//
// 250 people is three batches. If the third is refused, the first two are
// already recorded - so pressing again sends the remaining hundred rather
// than starting the whole list over and texting 200 people twice.
{
  const s = fresh();
  s.people.lead = Array.from({ length: 250 }, (_, i) => lead(i + 1, String(9000000000 + i)));
  const r = sendEveryone(s, 'lead', false, [3]);
  t('7a two hundred went', r.sent, 200);
  t('7b fifty did not', r.failed, 50);
  t('7c and only the ones that went are written down', s.invites.length, 200);

  const again = sendEveryone(s, 'lead', false);
  t('7d pressing again sends only the fifty that were missed', again.sent, 50);
}

// ═══ 8. More than one press worth ════════════════════════════════════════
{
  const s = fresh();
  s.people.lead = Array.from({ length: 420 }, (_, i) => lead(i + 1, String(9100000000 + i)));
  const r = sendEveryone(s, 'lead', false);
  t('8a three hundred in one press', r.sent, MAX_PER_PRESS);
  t('8b and it says how many are left', r.left, 120);
  const r2 = sendEveryone(s, 'lead', false);
  t('8c the next press finishes them', r2.sent, 120);
  t('8d with nobody done twice', new Set(s.invites.map(i => i.phone)).size, 420);
}

// ═══ 9. His real shape: leads and customers overlapping ══════════════════
//
// 241 leads, 123 customers, 20 of the leads already customers, and the
// customers who have ordered are the ones to leave out.
{
  const s = fresh();
  // 20 people are on both lists with the same number
  const shared = Array.from({ length: 20 }, (_, i) => String(9200000000 + i));
  s.people.lead = [
    ...shared.map((p, i) => lead(i + 1, p)),
    ...Array.from({ length: 221 }, (_, i) => lead(100 + i, String(9300000000 + i))),
  ];
  s.people.customer = [
    ...shared.map((p, i) => cust(500 + i, p)),
    ...Array.from({ length: 103 }, (_, i) => cust(600 + i, String(9400000000 + i))),
  ];
  // 40 of the customers have ordered
  s.orders = Array.from({ length: 40 }, (_, i) => ({ phone: String(9400000000 + i) }));

  const leads = sendEveryone(s, 'lead', false);
  t('9a every lead who never bought is texted once', leads.sent, 241);

  // Now the customers screen, with the leads already done this minute.
  const customers = sendEveryone(s, 'customer', false);
  t('9b the 20 who are also leads are not texted a second time',
    customers.skipped.tooSoon, 20);
  t('9c the 40 who have ordered are left out', customers.skipped.bought, 40);
  t('9d so the customers press sends the remaining 63', customers.sent, 63);
  t('9e and no number in the whole campaign was used twice',
    s.invites.length, new Set(s.invites.map(i => i.phone)).size);
}

// ═══ 10. Nobody to text ══════════════════════════════════════════════════
{
  const s = fresh();
  s.people.lead = [lead(1, '9353568638')];
  s.orders = [{ phone: '9353568638' }];
  const r = sendEveryone(s, 'lead', false);
  t('10a nothing is sent', r.sent, 0);
  t('10b and nothing is written down', s.invites.length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
