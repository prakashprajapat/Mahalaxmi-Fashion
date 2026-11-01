// Reading the cart off a payment row.
//
// The payments screen shows every checkout that reached a payment page, and
// until now it said how much was nearly spent without ever saying on what.
// The cart has been sitting on the row the whole time - cart_json, written
// when the checkout opened - so this is a reader, not a join. That matters:
// the rows worth looking at are precisely the ones that never became an
// order, and an order table cannot answer for those.
//
// Mirrors CashfreeController.ListPayments:
//
//   Items(cartJson)   the reader, which must never throw
//   the search        by product name and by SKU
//   SHOW_LINES        three on screen, every line in the spreadsheet
//
// A cart that cannot be read gives an empty list and never an error. That is
// the one rule worth stating out loud, because CartPricing - reading the same
// column - does the opposite and refuses. It is right to refuse: money
// depends on it. Nothing here does, and a screen that goes blank because one
// old row has an odd cart in it is worse than a screen that says so.
//
// Run: node frontend/scripts/payment-items-replay.js

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

// ── CashfreeController.ListPayments.Items ────────────────────────────────
function items(json) {
  const out = [];
  if (json === null || json === undefined || String(json).trim() === '') return out;

  let root;
  try { root = JSON.parse(json); } catch { return out; }
  if (!Array.isArray(root)) return out;

  for (const line of root) {
    if (line === null || typeof line !== 'object' || Array.isArray(line)) continue;

    const text = key => (typeof line[key] === 'string' ? line[key].trim() : '');

    // A quantity arrives as a number from the checkout and as text from
    // anything that has been through a spreadsheet.
    let qty = 1;
    if ('quantity' in line) {
      const q = line.quantity;
      if (typeof q === 'number' && Number.isInteger(q)) qty = Math.max(1, q);
      else if (typeof q === 'string' && /^-?\d+$/.test(q)) qty = Math.max(1, parseInt(q, 10));
    }

    const name = text('name');
    const sku = text('sku');
    if (name.length === 0 && sku.length === 0) continue;   // nothing to show, nothing to search

    out.push({
      name: name.length > 0 ? name : sku,
      sku,
      size: text('size'),
      quantity: qty,
      image: text('image'),
    });
  }
  return out;
}

// ── the search, as the controller spells it ──────────────────────────────
const itemHit = (row, needle) => row.items.some(i =>
  i.name.toLowerCase().includes(needle.toLowerCase())
  || i.sku.toLowerCase().includes(needle.toLowerCase()));

// ── the screen ───────────────────────────────────────────────────────────
const SHOW_LINES = 3;
const lineText = l =>
  `${l.name}${l.size ? ` (${l.size})` : ''}${l.quantity > 1 ? ` x${l.quantity}` : ''}`;
const onScreen = list => ({
  lines: list.slice(0, SHOW_LINES).map(lineText),
  more: list.length > SHOW_LINES ? list.length - SHOW_LINES : 0,
});

// What the checkout actually writes (buildCartLines in the checkout page).
const checkoutLine = (over = {}) => ({
  id: '41',
  name: 'Red Anarkali Kurta',
  sku: 'MFH1230',
  size: 'M / Maroon',
  image: '/p/41.webp',
  quantity: 1,
  price: 649,
  lineTotal: 649,
  category: 'Kurta',
  subcategory: 'Anarkali',
  gstRate: 5,
  hsn: '6211',
  color: 'Maroon',
  colorCode: '#800000',
  colorPhoto: '',
  colorColumn: 'C',
  ...over,
});

// ═══ 1. A real checkout cart ═════════════════════════════════════════════
{
  const got = items(JSON.stringify([checkoutLine()]));
  t('1a one line', got.length, 1);
  t('1b the name', got[0].name, 'Red Anarkali Kurta');
  t('1c size and colour arrive joined', got[0].size, 'M / Maroon');
  t('1d the sku comes too, for searching', got[0].sku, 'MFH1230');
  t('1e and how it reads', lineText(got[0]), 'Red Anarkali Kurta (M / Maroon)');
}

// ═══ 2. Quantity, every way it arrives ═══════════════════════════════════
{
  const n = items(JSON.stringify([checkoutLine({ quantity: 3 })]));
  t('2a a number', n[0].quantity, 3);
  t('2b and it shows', lineText(n[0]), 'Red Anarkali Kurta (M / Maroon) x3');

  const s = items(JSON.stringify([checkoutLine({ quantity: '2' })]));
  t('2c text from a spreadsheet', s[0].quantity, 2);

  const missing = items(JSON.stringify([{ name: 'Dupatta' }]));
  t('2d missing means one', missing[0].quantity, 1);

  const zero = items(JSON.stringify([checkoutLine({ quantity: 0 })]));
  t('2e zero is not a cart line, it is a bad number', zero[0].quantity, 1);

  const neg = items(JSON.stringify([checkoutLine({ quantity: -4 })]));
  t('2f nor is a negative one', neg[0].quantity, 1);

  const junk = items(JSON.stringify([checkoutLine({ quantity: 'two' })]));
  t('2g a word falls back to one', junk[0].quantity, 1);

  // One item is the usual case, so saying "x1" after every line would be
  // noise on nearly every row.
  t('2h one is not written out', lineText(items(JSON.stringify([checkoutLine()]))[0]).includes('x'), false);
}

// ═══ 3. A line with no name ══════════════════════════════════════════════
//
// The SKU is what the shop looks a product up by anyway, so a nameless line
// is still worth a row.
{
  const bySku = items(JSON.stringify([{ sku: 'MFH1230', quantity: 1 }]));
  t('3a the sku stands in for the name', bySku[0].name, 'MFH1230');

  const nothing = items(JSON.stringify([{ quantity: 2, price: 500 }]));
  t('3b no name and no sku is not a row', nothing.length, 0);

  const blank = items(JSON.stringify([{ name: '   ', sku: '  ' }]));
  t('3c and neither is whitespace', blank.length, 0);
}

// ═══ 4. Carts that cannot be read ════════════════════════════════════════
//
// Each of these must give an empty list rather than throw. A payment row with
// an odd cart on it is still a payment row, and the amount and the status are
// what the page is for.
{
  t('4a null', items(null), []);
  t('4b undefined', items(undefined), []);
  t('4c empty text', items(''), []);
  t('4d whitespace', items('   '), []);
  t('4e not json at all', items('{not json'), []);
  t('4f an object, not an array', items('{"name":"Kurta"}'), []);
  t('4g a bare number', items('42'), []);
  t('4h the empty array', items('[]'), []);
  t('4i nulls inside the array', items('[null,null]'), []);
  t('4j a string inside the array', items('["Kurta"]'), []);
  t('4k an array inside the array', items('[["Kurta"]]'), []);
}

// ═══ 5. A mixed cart ═════════════════════════════════════════════════════
//
// Good lines are kept even when a neighbour is rubbish - one bad line must
// not blank the whole cart.
{
  const got = items(JSON.stringify([
    checkoutLine({ name: 'Red Anarkali Kurta' }),
    null,
    { price: 200 },
    'nonsense',
    checkoutLine({ name: 'Cotton Dupatta', sku: 'MFH0907', size: '', quantity: 2 }),
  ]));
  t('5a two survive', got.map(i => i.name), ['Red Anarkali Kurta', 'Cotton Dupatta']);
  t('5b no size, no brackets', lineText(got[1]), 'Cotton Dupatta x2');
}

// ═══ 6. Three on screen, all of them in the spreadsheet ══════════════════
{
  const five = items(JSON.stringify(
    ['A', 'B', 'C', 'D', 'E'].map(n => checkoutLine({ name: n, size: '' }))));
  const view = onScreen(five);
  t('6a three lines', view.lines, ['A', 'B', 'C']);
  t('6b and a count for the rest', view.more, 2);

  const three = items(JSON.stringify(
    ['A', 'B', 'C'].map(n => checkoutLine({ name: n, size: '' }))));
  t('6c exactly three says nothing extra', onScreen(three).more, 0);

  const four = items(JSON.stringify(
    ['A', 'B', 'C', 'D'].map(n => checkoutLine({ name: n, size: '' }))));
  t('6d four says one more', onScreen(four).more, 1);

  // The Excel column takes the lot.
  t('6e the spreadsheet keeps all five',
    five.map(lineText).join('; '), 'A; B; C; D; E');
  t('6f and the count is of pieces, not lines',
    [...five, ...items(JSON.stringify([checkoutLine({ quantity: 3 })]))]
      .reduce((n, l) => n + (l.quantity || 1), 0), 8);
}

// ═══ 7. Searching by what was in the cart ════════════════════════════════
//
// "Which payments had the Midi Dress in them" is usually the shop asking
// whether one product is losing sales at the payment page.
{
  const row = { items: items(JSON.stringify([
    checkoutLine({ name: 'Midi Dress', sku: 'MFH1230' }),
    checkoutLine({ name: 'Cotton Dupatta', sku: 'MFH0907' }),
  ])) };

  t('7a by name', itemHit(row, 'Midi'), true);
  t('7b case does not matter', itemHit(row, 'midi dress'), true);
  t('7c by sku', itemHit(row, 'MFH0907'), true);
  t('7d part of a sku', itemHit(row, '0907'), true);
  t('7e the second line counts too', itemHit(row, 'Dupatta'), true);
  t('7f something that is in neither', itemHit(row, 'Lehenga'), false);

  const empty = { items: [] };
  t('7g a row with no cart matches nothing', itemHit(empty, 'Midi'), false);
}

// ═══ 8. The walked-away row from his own screen ══════════════════════════
//
// MFH17934779153414621, Rs 649, UPI, "Walked away" at 1:48 am. Before this
// the screen said the amount and nothing else; the question he asked was
// which item it was.
{
  const row = {
    orderId: 'MFH17934779153414621',
    amount: 649,
    status: 'USER_DROPPED',
    items: items(JSON.stringify([checkoutLine({ price: 649, lineTotal: 649 })])),
  };
  t('8a the screen can now answer it',
    onScreen(row.items).lines, ['Red Anarkali Kurta (M / Maroon)']);
  t('8b and it is findable by product',
    itemHit(row, 'Anarkali'), true);
}

// ═══ 9. A row stored before carts were carried here ══════════════════════
{
  const row = { orderId: 'MFH17934235586712661', amount: 499, items: items(null) };
  t('9a no cart', row.items.length, 0);
  // The screen says "not recorded" rather than leaving the cell blank: an
  // empty cell reads as an empty basket, which is a different thing.
  t('9b nothing to show, and nothing claimed', onScreen(row.items),
    { lines: [], more: 0 });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
