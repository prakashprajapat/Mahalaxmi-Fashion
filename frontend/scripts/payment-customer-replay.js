// The customer's phone on a payment row - and the wallet id underneath it.
//
// Cashfree's own export has a Customer Phone against every single
// transaction. The payments screen showed a dash for all but two rows, and
// those two were cust_16 and cust_4 - the only shoppers who were signed in.
//
// The whole bug was one line:
//
//     CustomerJson = JsonSerializer.Serialize(req.Customer)
//
// req.Customer is the SIGNED-IN customer object. For a guest it is null, so
// the column held the text "null". The phone was never missing: create-order
// refuses a request that does not carry ten digits, so it is the one thing
// the row is guaranteed to have.
//
// Two readers are modelled here, and the second one is why this file exists:
//
//   Pick(...)      the payments screen - customer_json, then shipping_json
//   walletId(...)  the WEBHOOK, which reads a top-level "id" out of the same
//                  column to decide whose wallet to deduct from
//
// Changing the shape of a column that something else reads for MONEY is the
// way to turn a cosmetic fix into a refund. Both old and new shapes are
// replayed through both readers.
//
// Run: node frontend/scripts/payment-customer-replay.js

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

// ── CashfreeController.ListPayments.Field ────────────────────────────────
function field(json, key) {
  if (json === null || json === undefined || String(json).trim() === '') return null;
  let el;
  try { el = JSON.parse(json); } catch { return null; }
  if (el === null || typeof el !== 'object' || Array.isArray(el)) return null;
  if (!(key in el)) return null;
  const v = el[key];
  return typeof v === 'string' ? v : String(v);
}

// ── CashfreeController.ListPayments.Pick ─────────────────────────────────
const pick = (...values) => {
  for (const v of values) if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
  return '';
};

// ── the three fields as the screen builds them ───────────────────────────
const person = row => ({
  name: pick(field(row.customerJson, 'name'),
             field(row.shippingJson, 'name'),
             // A signed-in customer object spells the name in two halves.
             `${field(row.customerJson, 'firstName') ?? ''} ${field(row.customerJson, 'lastName') ?? ''}`.trim()),
  phone: pick(field(row.customerJson, 'phone'), field(row.shippingJson, 'phone')),
  email: pick(field(row.customerJson, 'email'), field(row.shippingJson, 'email')),
});

// ── CashfreeController webhook recovery: whose wallet ────────────────────
//
// custId is the guest linked from the order; the signed-in id in the column
// wins when it is there. This is the reader that made "id" a load-bearing
// name in the new shape.
function walletId(customerJson, custId) {
  let out = custId;
  try {
    const cj = JSON.parse(customerJson === null || customerJson === undefined || String(customerJson).trim() === ''
      ? '{}' : customerJson);
    if (cj !== null && typeof cj === 'object' && !Array.isArray(cj) && 'id' in cj) {
      const idStr = typeof cj.id === 'string' ? cj.id : String(cj.id);
      const n = parseInt(idStr, 10);
      if (!Number.isNaN(n) && n > 0 && /^\d+$/.test(idStr.trim())) out = n;
    }
  } catch { /* custId stands */ }
  return out;
}

// ── the two shapes ───────────────────────────────────────────────────────

// What create-order wrote BEFORE: the signed-in customer object, or null.
const oldGuest = () => JSON.stringify(null);
const oldSignedIn = (id = 16) => JSON.stringify({
  id, customerCode: 'MFHCUS0016', firstName: 'Prakash', lastName: 'Prajapat',
  email: 'p@example.com', phone: '6375394642',
});

// What it writes NOW.
const fresh = (over = {}) => JSON.stringify({
  name: 'Sunita Devi',
  phone: '9826199868',
  email: 'sunita@example.com',
  id: '',
  account: null,
  ...over,
});

// The checkout has always sent this, on every row, guest or not.
const shippingOf = (over = {}) => JSON.stringify({
  name: 'Sunita Devi', email: 'sunita@example.com', phone: '9826199868',
  address: '12 Station Road', city: 'Balotra', pincode: '344022', state: 'Rajasthan',
  ...over,
});

// ═══ 1. A guest row written before the fix ═══════════════════════════════
//
// Eighty-four of his rows look like this. The phone was one column away the
// whole time.
{
  const row = { customerJson: oldGuest(), shippingJson: shippingOf() };
  t('1a the old column said nothing', field(row.customerJson, 'phone'), null);
  t('1b the screen finds the phone anyway', person(row).phone, '9826199868');
  t('1c and the name', person(row).name, 'Sunita Devi');
  t('1d and the email', person(row).email, 'sunita@example.com');
}

// ═══ 2. A signed-in row written before the fix ═══════════════════════════
//
// cust_16 on his export. The phone showed; the NAME did not, because that
// object spells it in two halves and has no "name" of its own.
{
  const row = { customerJson: oldSignedIn(), shippingJson: shippingOf({ name: '', phone: '' }) };
  t('2a the phone was already there', person(row).phone, '6375394642');
  t('2b the name comes from the two halves', person(row).name, 'Prakash Prajapat');
}

// ═══ 3. A row written after the fix ══════════════════════════════════════
{
  const row = { customerJson: fresh(), shippingJson: shippingOf() };
  t('3a straight off the row', person(row).phone, '9826199868');
  t('3b name', person(row).name, 'Sunita Devi');
  t('3c email', person(row).email, 'sunita@example.com');
}

// ═══ 4. The column wins, the shipping fills the gaps ═════════════════════
{
  const row = {
    customerJson: fresh({ name: '', email: '' }),
    shippingJson: shippingOf({ name: 'Different Name', email: 'ship@example.com' }),
  };
  t('4a a blank falls through', person(row).name, 'Different Name');
  t('4b and so does a blank email', person(row).email, 'ship@example.com');
  t('4c what is filled in is kept', person(row).phone, '9826199868');
}

// ═══ 5. Nothing anywhere ═════════════════════════════════════════════════
//
// The empty string is what the screen shows as a dash. It must not be the
// word "null", which is what a missing fallback used to produce.
{
  t('5a both null', person({ customerJson: null, shippingJson: null }),
    { name: '', phone: '', email: '' });
  t('5b both the text null', person({ customerJson: 'null', shippingJson: 'null' }),
    { name: '', phone: '', email: '' });
  t('5c unreadable json on both sides',
    person({ customerJson: '{broken', shippingJson: '[1,2' }),
    { name: '', phone: '', email: '' });
  t('5d an array where an object was expected',
    person({ customerJson: '[]', shippingJson: '[]' }),
    { name: '', phone: '', email: '' });
}

// ═══ 6. A number typed the way people type it ════════════════════════════
{
  const row = { customerJson: oldGuest(), shippingJson: shippingOf({ phone: '+91 98261 99868' }) };
  t('6a shown as the shopper wrote it', person(row).phone, '+91 98261 99868');
  // The search box has always matched on the last ten digits, so a pasted
  // Cashfree number still finds this row.
  const last10 = s => {
    const d = String(s).replace(/\D/g, '');
    return d.length >= 10 ? d.slice(-10) : d;
  };
  t('6b and it is still the same number', last10(person(row).phone), '9826199868');
}

// ═══ 7. THE WALLET. Both shapes through the webhook's reader ═════════════
//
// This is the one that costs money if it is wrong: the webhook deducts the
// wallet from whoever this says.
{
  t('7a old shape, signed in', walletId(oldSignedIn(16), 0), 16);
  t('7b old shape, guest - the linked id stands', walletId(oldGuest(), 41), 41);
  t('7c old shape, guest, nothing linked', walletId(oldGuest(), 0), 0);

  t('7d new shape, signed in, id as text', walletId(fresh({ id: '16' }), 0), 16);
  t('7e new shape, guest - blank id, linked id stands', walletId(fresh({ id: '' }), 41), 41);
  t('7f new shape, guest, nothing linked', walletId(fresh({ id: '' }), 0), 0);

  // The mistake this case exists to catch: had the signed-in object been
  // moved under "account" WITHOUT keeping a top-level id, every redeem on a
  // recovered order would have gone to the guest row instead.
  const buried = JSON.stringify({ name: 'X', phone: '9826199868', account: { id: 16 } });
  t('7g an id only under account is NOT found - which is why it is kept at the top',
    walletId(buried, 41), 41);

  t('7h malformed, the linked id stands', walletId('{broken', 41), 41);
  t('7i a word where the id should be', walletId(fresh({ id: 'sixteen' }), 41), 41);
  t('7j a negative id is not an id', walletId(fresh({ id: '-3' }), 41), 41);
  t('7k zero is not an id', walletId(fresh({ id: '0' }), 41), 41);
}

// ═══ 8. His own export, every row ════════════════════════════════════════
//
// Twenty-nine transactions, every one of them carrying a phone at Cashfree.
// Before the fallback, the twenty-three guest rows showed a dash.
{
  const csv = [
    ['MFH17935246529798308', '7004954199', 'guest'],
    ['MFH17935209907851517', '6375394642', 'cust'],
    ['MFH17935136917393568', '8075538181', 'guest'],
    ['MFH17934999613667181', '8793469003', 'guest'],
    ['MFH17934779153414621', '9826199868', 'guest'],
    ['MFH17933651898039725', '7978931006', 'guest'],
    ['MFH17933646295621309', '7978931006', 'guest'],
    ['MFH17933380020877293', '9353568638', 'guest'],
    ['MFH17927820495364544', '6375394642', 'cust'],
    ['MFH17932570894445975', '9770260120', 'guest'],
    ['MFH17932120095157313', '9079160885', 'cust'],
    ['MFH17929419980635876', '8850283643', 'guest'],
    ['MFH17928926171597816', '9840775645', 'guest'],
    ['MFH17928644467171081', '9790113318', 'guest'],
    ['MFH17928633507671444', '9415208188', 'guest'],
    ['MFH17928284720138753', '9942699466', 'guest'],
    ['MFH17928280477647007', '6375394642', 'cust'],
    ['MFH17927825881553383', '8006003797', 'cust'],
    ['MFH17927577455359390', '6375394642', 'cust'],
    ['MFH17926623821469617', '6375394642', 'cust'],
    ['MFH17926468190317122', '6375394642', 'guest'],
    ['MFH17925879045847831', '7587348789', 'cust'],
    ['MFH17923966822147091', '8279801585', 'guest'],
    ['MFH17923844141092953', '9079160885', 'cust'],
    ['MFH17923318691623358', '9894587208', 'guest'],
    ['MFH17923028656288777', '9874612732', 'cust'],
  ];

  // Rows as they are stored today: the customer column holds the signed-in
  // object or nothing, and the shipping column holds what was typed in.
  const stored = csv.map(([order, phone, kind]) => ({
    order,
    customerJson: kind === 'cust' ? oldSignedIn(16) : oldGuest(),
    shippingJson: shippingOf({ phone, name: 'Shopper' }),
  }));

  // Ten of the twenty-six. Written as 11 the first time, which was me
  // counting the list by eye instead of counting it - the test was wrong,
  // and the sixteen guest rows showing a dash was never in doubt.
  const before = stored.filter(r => (field(r.customerJson, 'phone') ?? '') !== '').length;
  t('8a before: only the signed-in rows had a number', before, 10);
  t('8b sixteen rows showed a dash', csv.length - before, 16);

  const after = stored.filter(r => person(r).phone !== '').length;
  t('8c after: every row has one', after, csv.length);

  // The signed-in rows keep the number the account carries, which is the
  // same one Cashfree printed for them.
  t('8d cust_16 rows read 6375394642',
    stored.filter(r => field(r.customerJson, 'id') === '16')
          .every(r => person(r).phone === '6375394642'), true);

  t('8e and nobody shows the word null',
    stored.some(r => Object.values(person(r)).includes('null')), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
