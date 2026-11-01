// The discount that got stuck, and the page that must not be pulled away.
//
// Two unrelated screens, one shape of mistake in both: a cheap guard written
// to stop needless work, keyed on less than the question it was guarding.
//
//   the checkout    "have I already asked about this coupon?" keyed on who is
//                   asking and not on what is in the cart
//   the app         "may I reload this page?" nearly keyed on a substring of
//                   the whole URL, which a product called Dupion matches
//
// Run: node frontend/scripts/coupon-and-refresh-replay.js

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

// ═════════════════════════════════════════════════════════════════════════
// PART ONE - the checkout's re-validate guard
// ═════════════════════════════════════════════════════════════════════════
//
// "Discount welcome code me badi hui hone par, vapis kam kar dete hai to vo
// discount fix ho jata hai."
//
// WELCOME10 is 10% off. Apply it to one Kurti at Rs 499 and it takes Rs 50.
// Add a second and it takes Rs 100. Take that one away again and it should go
// back to Rs 50 - and it did not. His screenshot: one Kurti, Rs 499, Rs 100
// off, total Rs 399.
//
// The effect that re-asks the server had `subtotal` in its dependency list,
// so it RAN on every quantity change. Its guard key was
// code|phone|email - no subtotal - so every one of those runs looked like a
// question already asked, and turned straight round.

const serverDiscount = (code, subtotal) => {
  if (code !== 'WELCOME10') return 0;
  // Ceiling, in the customer's favour, as CartPricing.CouponDiscount does.
  return Math.min(Math.ceil(subtotal * 10 / 100), subtotal);
};

// The screen, with a guard key of whatever shape is being tried.
function checkout(keyOf) {
  const state = { code: null, discount: 0, subtotal: 0, phone: '', email: '', asked: 0 };
  let guard = '';

  const settle = () => {
    if (!state.code) return;
    const key = keyOf(state);
    if (guard === key) return;              // the question looks already asked
    if (!state.phone && !state.email) return;
    guard = key;
    state.asked++;
    state.discount = serverDiscount(state.code, state.subtotal);
  };

  return {
    state,
    apply(code) { state.code = code; state.discount = serverDiscount(code, state.subtotal); settle(); },
    identify(phone, email) { state.phone = phone; state.email = email ?? ''; settle(); },
    setSubtotal(n) { state.subtotal = n; settle(); },
    get total() { return Math.max(0, state.subtotal - state.discount); },
  };
}

const OLD_KEY = s => `${s.code}|${s.phone}|${s.email}`;
const NEW_KEY = s => `${s.code}|${s.phone}|${s.email}|${s.subtotal}`;

// ═══ 1. His exact screen, on the old key ═════════════════════════════════
//
// The first draft of this case applied the coupon at Rs 499 and expected the
// discount to climb to Rs 100 when a second Kurti was added. It does not: on
// the old key the discount FREEZES at whatever the cart was worth the first
// time the server was asked, and never moves again in either direction. The
// test was wrong, and being wrong is what made the fault precise.
//
// So his screenshot is the coupon settling while TWO were in the cart, and
// the second one then taken away.
{
  const c = checkout(OLD_KEY);
  c.setSubtotal(998);                       // two Kurtis in the cart
  c.identify('9079160885', 'prakashprajapat683@gmail.com');
  c.apply('WELCOME10');
  t('1a two Kurtis, ten per cent of 998', c.state.discount, 100);

  c.setSubtotal(499);                       // she takes one away
  t('1b back to one, and the discount is STUCK', c.state.discount, 100);
  t('1c which is the Rs 399 on his screen', c.total, 399);
  t('1d the server would bill 449 for it', 499 - serverDiscount('WELCOME10', 499), 449);
}

// ═══ 2. Frozen the other way too ═════════════════════════════════════════
//
// Settle at one Kurti and add a second: the discount stays at Rs 50 when she
// has earned Rs 100. Less alarming than the first - she is shown a smaller
// discount than she gets - but the screen and the bill still disagree.
{
  const c = checkout(OLD_KEY);
  c.setSubtotal(499);
  c.identify('9079160885', 'a@b.com');
  c.apply('WELCOME10');
  c.setSubtotal(998);
  t('2a stuck low', c.state.discount, 50);
  t('2b and the server would have given a hundred', serverDiscount('WELCOME10', 998), 100);
}

// ═══ 3. Both journeys, on the new key ════════════════════════════════════
{
  const down = checkout(NEW_KEY);
  down.setSubtotal(998);
  down.identify('9079160885', 'prakashprajapat683@gmail.com');
  down.apply('WELCOME10');
  t('3a two Kurtis, a hundred', down.state.discount, 100);
  down.setSubtotal(499);
  t('3b one Kurti, fifty', down.state.discount, 50);
  t('3c the total she is shown is the total she is charged', down.total, 449);

  const up = checkout(NEW_KEY);
  up.setSubtotal(499);
  up.identify('9079160885', 'a@b.com');
  up.apply('WELCOME10');
  up.setSubtotal(998);
  t('3d and it climbs as well as falls', up.state.discount, 100);
}

// ═══ 4. The guard still guards ═══════════════════════════════════════════
//
// The point of the key is to not ask the same question twice. Widening it
// must not turn it off.
{
  const c = checkout(NEW_KEY);
  c.setSubtotal(499);
  c.identify('9079160885', 'a@b.com');
  c.apply('WELCOME10');
  const afterApply = c.state.asked;

  c.identify('9079160885', 'a@b.com');     // the same details typed again
  c.identify('9079160885', 'a@b.com');
  c.setSubtotal(499);                       // and the same cart re-reported
  t('4a nothing new is asked', c.state.asked, afterApply);

  c.setSubtotal(998);
  t('4b a real change is', c.state.asked, afterApply + 1);

  c.identify('9876543210', 'a@b.com');     // a different shopper
  t('4c and so is a different person', c.state.asked, afterApply + 2);
}

// ═══ 5. Nobody to check yet ══════════════════════════════════════════════
//
// A coupon applied before she has typed anything: the server cannot recognise
// an empty shopper, so the effect waits rather than asking about nobody.
{
  const c = checkout(NEW_KEY);
  c.setSubtotal(499);
  c.apply('WELCOME10');
  t('5a nothing asked of the server yet', c.state.asked, 0);
  // The optimistic figure from applying it is still shown, as before.
  t('5b but she can see what it is worth', c.state.discount, 50);

  c.identify('9079160885', '');
  t('5c and the moment she is somebody, it is checked', c.state.asked, 1);
}

// ═══ 6. The cart emptied and refilled ════════════════════════════════════
{
  const c = checkout(NEW_KEY);
  c.setSubtotal(499);
  c.identify('9079160885', 'a@b.com');
  c.apply('WELCOME10');
  c.setSubtotal(0);
  t('6a nothing in the cart, nothing off', c.state.discount, 0);
  c.setSubtotal(1497);
  t('6b three of them, a hundred and fifty', c.state.discount, 150);
}

// ═════════════════════════════════════════════════════════════════════════
// PART TWO - the app's three-minute refresh
// ═════════════════════════════════════════════════════════════════════════
//
// MainActivity.shouldRefresh. A WebView holds a page for days, so coming back
// after three minutes away fetches it again. What it must NOT do is pull a
// page out from under a customer who is in the middle of paying.

const SITE = 'mahalaxmifashionhub.com';
const NEVER_REFRESH = ['/checkout', '/order-success', '/order-confirmation', '/payment'];

function shouldRefresh(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }

  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'https' && scheme !== 'http') return false;

  const host = parsed.hostname.toLowerCase();
  if (host !== SITE && !host.endsWith('.' + SITE)) return false;

  const path = (parsed.pathname || '/').toLowerCase();
  return !NEVER_REFRESH.some(p => path === p || path.startsWith(p + '/'));
}

// What a plain substring match over the whole URL would have done.
const substringVersion = url => {
  const u = url.toLowerCase();
  if (!u.startsWith('http')) return false;
  if (['/checkout', '/order-success', '/payment', 'cashfree', 'razorpay', 'upi'].some(p => u.includes(p))) return false;
  return u.includes(SITE);
};

// ═══ 6. Ordinary pages ═══════════════════════════════════════════════════
{
  const yes = [
    'https://www.mahalaxmifashionhub.com/',
    'https://www.mahalaxmifashionhub.com/women',
    'https://www.mahalaxmifashionhub.com/product/premium-top-kurtis',
    'https://mahalaxmifashionhub.com/collections/nighty',
    'https://www.mahalaxmifashionhub.com/account/orders',
  ];
  for (const u of yes) t(`6 refreshed: ${u}`, shouldRefresh(u), true);
}

// ═══ 7. The pages a reload would damage ══════════════════════════════════
{
  const no = [
    'https://www.mahalaxmifashionhub.com/checkout',
    'https://www.mahalaxmifashionhub.com/checkout/',
    'https://www.mahalaxmifashionhub.com/checkout?cf_order=MFH1793',
    'https://www.mahalaxmifashionhub.com/order-success/MFH17935246529798308',
    'https://www.mahalaxmifashionhub.com/payment/retry',
  ];
  for (const u of no) t(`7 left alone: ${u}`, shouldRefresh(u), false);
}

// ═══ 8. Somebody else's page ═════════════════════════════════════════════
//
// Her bank, Cashfree, a UPI handoff. She may be four minutes inside one of
// these - longer than the timer - and reloading loses a paid order.
{
  const no = [
    'https://payments.cashfree.com/order/#MFH1793',
    'https://api.razorpay.com/v1/checkout',
    'https://netbanking.hdfcbank.com/netbanking/',
    'upi://pay?pa=shop@okaxis',
    'about:blank',
    'file:///android_asset/offline.html',
    'https://mahalaxmifashionhub.com.evil.example/women',
  ];
  for (const u of no) t(`8 not ours, not reloaded: ${u}`, shouldRefresh(u), false);
}

// ═══ 9. The substring version, and why it is not used ════════════════════
//
// "upi" sits inside Dupion. A shop that sells Dupion sarees would have had
// those pages quietly stop refreshing for ever, and nothing on screen would
// ever have said so.
{
  const dupion = 'https://www.mahalaxmifashionhub.com/product/dupion-silk-saree';
  t('9a the substring version refuses it', substringVersion(dupion), false);
  t('9b the path version refreshes it', shouldRefresh(dupion), true);

  // And the reverse: a path-based rule still catches the real checkout.
  t('9c both agree on the checkout',
    [substringVersion('https://www.mahalaxmifashionhub.com/checkout'),
     shouldRefresh('https://www.mahalaxmifashionhub.com/checkout')], [false, false]);
}

// ═══ 10. The timer ═══════════════════════════════════════════════════════
const STALE_AFTER_MS = 3 * 60 * 1000;
function awayFor(ms, { leftAt = Date.now() - ms } = {}) {
  const away = leftAt === 0 ? 0 : Date.now() - leftAt;
  return away >= STALE_AFTER_MS;
}
{
  t('10a two minutes is not stale', awayFor(2 * 60 * 1000), false);
  t('10b three minutes is', awayFor(3 * 60 * 1000 + 50), true);
  t('10c an hour certainly is', awayFor(60 * 60 * 1000), true);
  // First launch: onResume runs with no onPause behind it, and the page has
  // only just been asked for.
  t('10d a fresh start is not a return', awayFor(0, { leftAt: 0 }), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
