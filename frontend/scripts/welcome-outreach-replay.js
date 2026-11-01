// The welcome text and email that nobody presses a button for.
//
// WelcomeOutreach fires on its own, four times a day or forty, with nobody
// watching. That is what makes it worth a replay: the hand-pressed buttons
// have a person reading a name before anything is spent, and this has none.
// Two of the cases below are the ones that would cost real money -
// advertising to somebody who spent money this week, and sending the same
// welcome twice to one human being who is on both lists.
//
// What it mirrors, line for line:
//
//   WelcomeOutreach.SendAsync        the master switch, both channels' gate
//   WelcomeOutreach.QuietUntilAsync  30 days from an order, 48 hours from a
//                                    cancellation, latest answer wins
//   WelcomeOutreach.TryTextAsync     once per NUMBER, ever
//   WelcomeOutreach.TryEmailAsync    once per ADDRESS, ever
//
// Run: node frontend/scripts/welcome-outreach-replay.js

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

const HOUR = 3600e3, DAY = 24 * HOUR;
const now = Date.now();
const hoursAgo = h => new Date(now - h * HOUR).toISOString();
const daysAgo = d => new Date(now - d * DAY).toISOString();

const ORDER_LOOKBACK = 31 * DAY;
const AFTER_AN_ORDER = 30 * DAY;
const AFTER_A_CANCELLATION = 48 * HOUR;

// ── OutreachContact ──────────────────────────────────────────────────────
const phone10 = p => {
  const d = String(p ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
};
const addrOf = e => {
  const s = String(e ?? '').trim().toLowerCase();
  return s.length ? s : null;
};

// ── WelcomeOutreach.QuietUntilAsync ──────────────────────────────────────
//
// The window is what makes this cheap enough to run on a signup: a month and
// a day of orders rather than the whole table. An order placed in August and
// cancelled this morning is still caught, because updatedAt is asked about as
// well as the placed date - without that, the 48-hour cancellation rule would
// quietly stop applying to anything older than a month.
function quietUntil(orders, ten) {
  const since = now - ORDER_LOOKBACK;
  let latest = null;
  for (const o of orders) {
    const placed = Date.parse(o.placedAt ?? o.createdAt);
    const updated = Date.parse(o.updatedAt);
    if (!(placed >= since || updated >= since)) continue;      // outside the window

    if (phone10(o.phone) !== ten) continue;

    const cancelled = String(o.status ?? '').toLowerCase().startsWith('cancel');
    const at = cancelled ? updated : placed;
    const free = at + (cancelled ? AFTER_A_CANCELLATION : AFTER_AN_ORDER);
    if (latest === null || free > latest) latest = free;
  }
  return latest;
}

// ── WelcomeOutreach.SendAsync ────────────────────────────────────────────
function welcome(state, { audience, personId, name, email, phone, emailAlreadySent = false }) {
  const out = { text: false, mail: false, why: null };

  if (String(state.settings.welcomeOutreachEnabled ?? '').trim().toLowerCase() === 'off') {
    out.why = 'switched off';
    return out;
  }

  const ten = phone10(phone);
  const addr = addrOf(email);
  if (ten === null && addr === null) { out.why = 'no way to reach them'; return out; }

  // One gate for both channels: both are adverts, and the thirty-day rule is
  // about the person, not about the channel it arrives on.
  if (ten !== null) {
    const free = quietUntil(state.orders, ten);
    if (free !== null && free > now) { out.why = 'bought recently'; return out; }
  }

  const first = String(name ?? '').trim().split(/\s+/).filter(Boolean)[0] ?? '';

  // The text — once per NUMBER, ever.
  if (ten !== null
      && !state.invites.some(i => i.channel === 'sms' && i.phone === ten)
      && String(state.settings.msg91TplNewCollection ?? '').trim().length > 0) {
    const link = String(state.settings.smsSiteLink ?? '').trim()
      || 'https://www.mahalaxmifashionhub.com';
    const ok = state.msg91(ten, link);
    if (ok) {
      state.invites.push({ audience, personId, channel: 'sms', phone: ten, sentBy: 'automatic' });
      state.texts.push({ to: ten, link });
      out.text = true;
    }
  }

  // The email — once per ADDRESS, ever, and not at all if the coupon email
  // has just gone to the same person.
  if (!emailAlreadySent
      && addr !== null && addr.includes('@') && state.mailConfigured
      && !state.invites.some(i => i.channel === 'email' && i.email === addr)) {
    const ok = state.smtp(addr);
    if (ok) {
      state.invites.push({ audience, personId, channel: 'email', email: addr, sentBy: 'automatic' });
      state.mails.push({ to: addr, first });
      out.mail = true;
    }
  }

  return out;
}

const fresh = (over = {}) => ({
  settings: { msg91TplNewCollection: '6a5afffae75b96ff54019a02', smsSiteLink: '' },
  orders: [],
  invites: [],
  texts: [],
  mails: [],
  mailConfigured: true,
  msg91: () => true,
  smtp: () => true,
  ...over,
});

const order = (phone, over = {}) => ({
  phone,
  status: 'Delivered',
  placedAt: daysAgo(1),
  createdAt: daysAgo(1),
  updatedAt: daysAgo(1),
  ...over,
});

// ═══ 1. A stranger fills the popup ═══════════════════════════════════════
{
  const s = fresh();
  const r = welcome(s, { audience: 'lead', personId: 1, name: 'Dinesh Kumar', email: 'dinesh@gmail.com', phone: '8749039868' });
  t('1a the text goes', r.text, true);
  t('1b the email goes', r.mail, true);
  t('1c both are written down', s.invites.length, 2);
  t('1d the link is the default', s.texts[0].link, 'https://www.mahalaxmifashionhub.com');
  t('1e greeted by first name only', s.mails[0].first, 'Dinesh');
}

// ═══ 2. The same person, weeks later, makes an account ═══════════════════
//
// The one that costs a block on WhatsApp if it is wrong. March's popup and
// April's account are two rows and one person.
{
  const s = fresh();
  welcome(s, { audience: 'lead', personId: 1, name: 'Dinesh', email: 'dinesh@gmail.com', phone: '8749039868' });
  const again = welcome(s, { audience: 'customer', personId: 51, name: 'Dinesh Kumar', email: 'dinesh@gmail.com', phone: '+91 87490 39868' });
  t('2a no second text', again.text, false);
  t('2b no second email', again.mail, false);
  t('2c nothing new written down', s.invites.length, 2);
  t('2d one text in all', s.texts.length, 1);
}

// ═══ 3. The number is written three ways ═════════════════════════════════
{
  const s = fresh();
  welcome(s, { audience: 'lead', personId: 1, phone: '+91 87490 39868' });
  t('3a stored as ten digits', s.invites[0].phone, '8749039868');
  const b = welcome(s, { audience: 'lead', personId: 2, phone: '08749039868' });
  t('3b a leading zero is the same number', b.text, false);
  const c = welcome(s, { audience: 'customer', personId: 9, phone: '918749039868' });
  t('3c and so is the country code', c.text, false);
}

// ═══ 4. Somebody who has just bought ═════════════════════════════════════
//
// A guest ordered on Monday and makes an account on Thursday. The order
// messages are already going to them; an advert reads as a shop not paying
// attention - and it is the shop's own thirty-day rule.
{
  const s = fresh();
  s.orders = [order('9352460180', { placedAt: daysAgo(3), createdAt: daysAgo(3), updatedAt: daysAgo(3) })];
  const r = welcome(s, { audience: 'customer', personId: 7, name: 'Suresh', email: 'suresh@gmail.com', phone: '9352460180' });
  t('4a no text', r.text, false);
  t('4b no email either - both are adverts', r.mail, false);
  t('4c and the reason is recorded', r.why, 'bought recently');
  t('4d nothing written down', s.invites.length, 0);
}

// ═══ 5. Thirty days is thirty days ═══════════════════════════════════════
{
  const a = fresh();
  a.orders = [order('9352460180', { placedAt: daysAgo(29), createdAt: daysAgo(29), updatedAt: daysAgo(29) })];
  t('5a 29 days is not 30', welcome(a, { audience: 'customer', personId: 7, phone: '9352460180' }).text, false);

  const b = fresh();
  b.orders = [order('9352460180', { placedAt: daysAgo(30.5), createdAt: daysAgo(30.5), updatedAt: daysAgo(30.5) })];
  t('5b 30 days and a half is', welcome(b, { audience: 'customer', personId: 7, phone: '9352460180' }).text, true);
}

// ═══ 6. A cancellation waits forty-eight hours, not thirty days ══════════
{
  const a = fresh();
  a.orders = [order('9352460180', { status: 'Cancelled', placedAt: daysAgo(5), createdAt: daysAgo(5), updatedAt: hoursAgo(10) })];
  t('6a ten hours after a cancellation, nothing', welcome(a, { audience: 'lead', personId: 2, phone: '9352460180' }).text, false);

  const b = fresh();
  b.orders = [order('9352460180', { status: 'Cancelled', placedAt: daysAgo(5), createdAt: daysAgo(5), updatedAt: hoursAgo(49) })];
  t('6b forty-nine hours after, the warmest lead there is', welcome(b, { audience: 'lead', personId: 2, phone: '9352460180' }).text, true);
}

// ═══ 7. Bought Monday, cancelled a second order Wednesday ════════════════
//
// The cancellation is the MORE RECENT event and carries the SHORTER wait.
// Reading only the last row would text an advert to somebody who spent money
// two days ago. The latest answer wins, so the order's thirty days hold.
{
  const s = fresh();
  s.orders = [
    order('9352460180', { placedAt: daysAgo(2), createdAt: daysAgo(2), updatedAt: daysAgo(2) }),
    order('9352460180', { status: 'Cancelled', placedAt: daysAgo(4), createdAt: daysAgo(4), updatedAt: hoursAgo(60) }),
  ];
  t('7a the order still holds them back', welcome(s, { audience: 'customer', personId: 7, phone: '9352460180' }).text, false);
}

// ═══ 8. An old order cancelled this morning ══════════════════════════════
//
// Placed forty days ago, so outside the window by its placed date. If the
// query asked only about that date, the cancellation rule would have stopped
// applying to anything older than a month.
{
  const s = fresh();
  s.orders = [order('9352460180', { status: 'Cancelled', placedAt: daysAgo(40), createdAt: daysAgo(40), updatedAt: hoursAgo(3) })];
  t('8a the cancellation is what counts', welcome(s, { audience: 'lead', personId: 2, phone: '9352460180' }).text, false);

  const old = fresh();
  old.orders = [order('9352460180', { placedAt: daysAgo(40), createdAt: daysAgo(40), updatedAt: daysAgo(40) })];
  t('8b an order that old holds nobody back', welcome(old, { audience: 'lead', personId: 2, phone: '9352460180' }).text, true);
}

// ═══ 9. Somebody else's order is not theirs ══════════════════════════════
{
  const s = fresh();
  s.orders = [order('9999999999', { placedAt: daysAgo(1), createdAt: daysAgo(1), updatedAt: daysAgo(1) })];
  t('9a a different number changes nothing', welcome(s, { audience: 'lead', personId: 2, phone: '9352460180' }).text, true);
}

// ═══ 10. The master switch ═══════════════════════════════════════════════
{
  const s = fresh();
  s.settings.welcomeOutreachEnabled = 'off';
  const r = welcome(s, { audience: 'lead', personId: 1, email: 'a@b.com', phone: '9352460180' });
  t('10a nothing at all', [r.text, r.mail], [false, false]);
  t('10b and it says why', r.why, 'switched off');

  const on = fresh();
  on.settings.welcomeOutreachEnabled = '';
  t('10c blank means on', welcome(on, { audience: 'lead', personId: 1, phone: '9352460180' }).text, true);

  const caps = fresh();
  caps.settings.welcomeOutreachEnabled = 'OFF';
  t('10d case does not matter', welcome(caps, { audience: 'lead', personId: 1, phone: '9352460180' }).text, false);
}

// ═══ 11. No flow id in Settings ══════════════════════════════════════════
//
// The state the shop is in until he pastes MFHBULK's id. The email must not
// be held hostage to it.
{
  const s = fresh();
  s.settings.msg91TplNewCollection = '';
  const r = welcome(s, { audience: 'lead', personId: 1, name: 'Asha', email: 'asha@gmail.com', phone: '9352460180' });
  t('11a no text', r.text, false);
  t('11b the email still goes', r.mail, true);
  t('11c and only the email is written down', s.invites.map(i => i.channel), ['email']);
}

// ═══ 12. The coupon email has already gone ═══════════════════════════════
//
// Register sends the welcome code; a second email in the same minute is how a
// shop lands in a spam folder.
{
  const s = fresh();
  const r = welcome(s, { audience: 'customer', personId: 51, name: 'Priya', email: 'priya@gmail.com', phone: '9352460180', emailAlreadySent: true });
  t('12a the text goes', r.text, true);
  t('12b the email does not', r.mail, false);
  t('12c only the text is written down', s.invites.map(i => i.channel), ['sms']);
}

// ═══ 13. Half an identity ════════════════════════════════════════════════
{
  const onlyMail = fresh();
  const a = welcome(onlyMail, { audience: 'lead', personId: 3, email: 'meena@gmail.com', phone: '' });
  t('13a email only, email sent', [a.text, a.mail], [false, true]);

  const onlyPhone = fresh();
  const b = welcome(onlyPhone, { audience: 'customer', personId: 52, email: null, phone: '9352460180' });
  t('13b phone only, text sent', [b.text, b.mail], [true, false]);

  const neither = fresh();
  const c = welcome(neither, { audience: 'lead', personId: 4, email: '  ', phone: '12345' });
  t('13c nine digits and no address reach nobody', [c.text, c.mail], [false, false]);
  t('13d and it says why', c.why, 'no way to reach them');
}

// ═══ 14. What was typed into the box is not always an address ════════════
{
  const s = fresh();
  const r = welcome(s, { audience: 'lead', personId: 5, email: 'ghar', phone: '9352460180' });
  t('14a a word is not an address', r.mail, false);
  t('14b the text still goes', r.text, true);
}

// ═══ 15. Nothing is written down for a message that did not go ═══════════
{
  const refused = fresh({ msg91: () => false });
  const r = welcome(refused, { audience: 'lead', personId: 6, email: 'raj@gmail.com', phone: '9352460180' });
  t('15a MSG91 refused, so no text', r.text, false);
  t('15b nothing recorded for it', refused.invites.filter(i => i.channel === 'sms').length, 0);
  t('15c the email is unaffected', r.mail, true);

  // And the point of not recording it: the next press of the everyone button
  // still finds them.
  const later = welcome(fresh({ invites: refused.invites }), { audience: 'lead', personId: 6, phone: '9352460180' });
  t('15d they are still due', later.text, true);

  const noMail = fresh({ smtp: () => false });
  const m = welcome(noMail, { audience: 'lead', personId: 6, email: 'raj@gmail.com', phone: '9352460180' });
  t('15e the mail server refused', m.mail, false);
  t('15f nothing recorded for it', noMail.invites.filter(i => i.channel === 'email').length, 0);
}

// ═══ 16. Email not set up on the server ══════════════════════════════════
{
  const s = fresh({ mailConfigured: false });
  const r = welcome(s, { audience: 'lead', personId: 7, email: 'raj@gmail.com', phone: '9352460180' });
  t('16a no email', r.mail, false);
  t('16b the text is not held up by it', r.text, true);
}

// ═══ 17. The link the shop set ═══════════════════════════════════════════
{
  const s = fresh();
  s.settings.smsSiteLink = 'mahalaxmifashionhub.com';
  welcome(s, { audience: 'lead', personId: 8, phone: '9352460180' });
  t('17a what Settings says is what is sent', s.texts[0].link, 'mahalaxmifashionhub.com');
}

// ═══ 18. A hand-pressed button already reached them ══════════════════════
//
// The shop texted this lead from the row button on Tuesday. Wednesday's
// account must not bring a second one.
{
  const s = fresh();
  s.invites = [{ audience: 'lead', personId: 2, channel: 'sms', phone: '9352460180', sentBy: 'owner@shop' }];
  const r = welcome(s, { audience: 'customer', personId: 60, email: 'new@gmail.com', phone: '9352460180' });
  t('18a no text', r.text, false);
  t('18b but the email is a different channel and a new address', r.mail, true);
}

// ═══ 19. A busy evening ══════════════════════════════════════════════════
//
// Nine people in an hour: four strangers, one who bought yesterday, one who
// cancelled this morning, one already on the list from the popup, one with a
// bad address, one with nothing usable.
{
  const s = fresh();
  s.orders = [
    order('9400000005', { placedAt: hoursAgo(20), createdAt: hoursAgo(20), updatedAt: hoursAgo(20) }),
    order('9400000006', { status: 'Cancelled', placedAt: daysAgo(6), createdAt: daysAgo(6), updatedAt: hoursAgo(4) }),
  ];
  s.invites = [{ audience: 'lead', personId: 70, channel: 'sms', phone: '9400000007', sentBy: 'automatic' }];

  const arrivals = [
    { audience: 'lead',     personId: 1, name: 'A', email: 'a@gmail.com', phone: '9400000001' },
    { audience: 'lead',     personId: 2, name: 'B', email: 'b@gmail.com', phone: '9400000002' },
    { audience: 'customer', personId: 3, name: 'C', email: 'c@gmail.com', phone: '9400000003' },
    { audience: 'customer', personId: 4, name: 'D', email: 'd@gmail.com', phone: '9400000004' },
    { audience: 'customer', personId: 5, name: 'E', email: 'e@gmail.com', phone: '9400000005' },
    { audience: 'lead',     personId: 6, name: 'F', email: 'f@gmail.com', phone: '9400000006' },
    { audience: 'customer', personId: 7, name: 'G', email: 'g@gmail.com', phone: '9400000007' },
    { audience: 'lead',     personId: 8, name: 'H', email: 'ghar',        phone: '9400000008' },
    { audience: 'lead',     personId: 9, name: 'I', email: '',            phone: '123' },
  ];
  const got = arrivals.map(a => welcome(s, a));

  // Four strangers and the one whose address was a word - that number is
  // fine, it is only the email that is not.
  //
  // First written as 6, counting G as well. G is the one already ticked from
  // the popup, so G is exactly who must NOT be texted: the expectation was
  // wrong, not the rule, and 19e below is the case that says so.
  t('19a five texted - four strangers and the bad-address one',
    got.filter(r => r.text).length, 5);
  t('19b emails to the four strangers, and to G whose address is new',
    got.filter(r => r.mail).length, 5);
  t('19c the buyer gets nothing', [got[4].text, got[4].mail], [false, false]);
  t('19d the fresh cancellation gets nothing', [got[5].text, got[5].mail], [false, false]);
  t('19e G is already texted, so only mailed', [got[6].text, got[6].mail], [false, true]);
  t('19f the bad address gets a text and no mail', [got[7].text, got[7].mail], [true, false]);
  t('19g the unreachable one gets nothing', [got[8].text, got[8].mail], [false, false]);
  t('19h no number is texted twice',
    new Set(s.texts.map(x => x.to)).size, s.texts.length);
  t('19i and running the same evening again sends nothing',
    arrivals.map(a => welcome(s, a)).filter(r => r.text || r.mail).length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
