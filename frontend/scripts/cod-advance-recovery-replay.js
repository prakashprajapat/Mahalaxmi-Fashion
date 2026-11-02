// The Rs 499 that would have walked out with the parcel.
//
// Order MFH17935926277716384. Cash on Delivery, Rs 599, with the Rs 100
// advance paid online - Cashfree's receipt says Rs 100.0 at 09:40 on 2 Nov.
// The admin screen said PREPAID, Rs 599.
//
// The browser never got back to PlaceOrder, so the webhook wrote the order
// itself. That recovery block wrote, unconditionally:
//
//     Method = "cashfree"      ->  the screen says Prepaid
//     Status = "Paid"
//     Total  = the catalogue value, Rs 599
//                                   and nothing set AdvancePaid
//
// So the shop believed Rs 599 had been collected when Rs 100 moved. The
// courier would be handed a parcel marked paid and told to collect nothing.
//
// The amounts on the cashfree_orders row already say which it was, and
// create-order ENFORCES that they do: an advance is refused unless it matches
// the shop's own codAdvanceAmount, a prepaid order unless it covers the
// catalogue floor.
//
// Run: node frontend/scripts/cod-advance-recovery-replay.js

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

// ── CashfreeController.Webhook, the recovery block ───────────────────────
function recover(row, catalogueValue) {
  const fullTotal = row.fullTotal > 0 ? row.fullTotal : row.amountPaise / 100;
  const paidNow = row.amountPaise / 100;
  const wasDue = fullTotal - row.walletUsed;

  // One rupee of slack, so rounding is never read as a gap. The test can only
  // move an order the SAFE way - a wrongly prepaid order becomes COD, never
  // the reverse - because reading a genuine prepaid order as an advance would
  // tell the courier to collect money already paid.
  const isCodAdvance = paidNow + 1 < wasDue;

  return {
    method: isCodAdvance ? 'cod' : 'cashfree',
    status: isCodAdvance ? 'Pending' : 'Paid',
    total: catalogueValue,
    walletUsed: row.walletUsed,
    advancePaid: isCodAdvance ? paidNow : 0,
  };
}

// What it used to write.
const recoverOld = (row, catalogueValue) => ({
  method: 'cashfree', status: 'Paid', total: catalogueValue,
  walletUsed: row.walletUsed, advancePaid: 0,
});

// ── OrdersController: what the courier is told to collect ────────────────
const codCollect = o =>
  o.method === 'cod' ? Math.max(0, o.total - o.walletUsed - o.advancePaid) : 0;

// ── PaymentsController.Reconcile: what it expects Cashfree to have taken ─
const expectedAtGateway = o => (o.method === 'cod' ? o.advancePaid : o.total - o.walletUsed);

const row = (over = {}) => ({ amountPaise: 10000, fullTotal: 599, walletUsed: 0, ...over });

// ═══ 1. His order ════════════════════════════════════════════════════════
{
  const r = row();                       // Rs 100 taken, Rs 599 order
  const was = recoverOld(r, 599);
  t('1a it used to be written as prepaid', was.method, 'cashfree');
  t('1b marked fully paid', was.status, 'Paid');
  t('1c with no advance recorded', was.advancePaid, 0);
  t('1d so the courier collected NOTHING', codCollect(was), 0);
  t('1e and Rs 499 walked out with the parcel', 599 - 100 - codCollect(was), 499);

  const now = recover(r, 599);
  t('1f it is a COD order', now.method, 'cod');
  t('1g waiting to be packed, not paid', now.status, 'Pending');
  t('1h the advance is written down', now.advancePaid, 100);
  t('1i and the courier collects the rest', codCollect(now), 499);
  t('1j nothing is lost', now.advancePaid + codCollect(now), 599);
}

// ═══ 2. A real prepaid order is untouched ════════════════════════════════
//
// The direction that must never slip. Calling a prepaid order an advance
// would tell the courier to collect money the customer has already paid.
{
  const r = row({ amountPaise: 59900, fullTotal: 599 });
  const o = recover(r, 599);
  t('2a prepaid', [o.method, o.status], ['cashfree', 'Paid']);
  t('2b nothing for the courier', codCollect(o), 0);
  t('2c and no advance invented', o.advancePaid, 0);
}

// ═══ 3. Prepaid with the wallet in it ════════════════════════════════════
//
// The case the comparison exists for: Cashfree charges LESS than the order
// total on a perfectly ordinary prepaid order, because the wallet took the
// rest. Comparing against the total alone would read every one of these as an
// advance.
{
  const r = row({ amountPaise: 49900, fullTotal: 599, walletUsed: 100 });
  const o = recover(r, 599);
  t('3a still prepaid', o.method, 'cashfree');
  t('3b the courier collects nothing', codCollect(o), 0);

  const half = recover(row({ amountPaise: 30000, fullTotal: 599, walletUsed: 299 }), 599);
  t('3c a big wallet is still prepaid', half.method, 'cashfree');

  // And a COD advance on an order that also used the wallet is still an
  // advance: Rs 100 paid, Rs 100 of wallet, Rs 399 left for the courier.
  const codWallet = recover(row({ amountPaise: 10000, fullTotal: 599, walletUsed: 100 }), 599);
  t('3d advance plus wallet', [codWallet.method, codWallet.advancePaid], ['cod', 100]);
  t('3e the courier collects what is left', codCollect(codWallet), 399);
}

// ═══ 4. Rounding is not a gap ════════════════════════════════════════════
{
  t('4a one rupee short is still prepaid',
    recover(row({ amountPaise: 59800, fullTotal: 599 }), 599).method, 'cashfree');
  t('4b fifty paise short too',
    recover(row({ amountPaise: 59850, fullTotal: 599 }), 599).method, 'cashfree');
  // Two rupees is a gap, not a rounding. Nothing in the shop produces one,
  // and if something did, COD is the safe way to be wrong.
  t('4c two rupees short reads as an advance',
    recover(row({ amountPaise: 59700, fullTotal: 599 }), 599).method, 'cod');
}

// ═══ 5. A row that never carried a full total ════════════════════════════
//
// fullTotal falls back to the amount, so paid equals due and it reads as
// prepaid - which is what this block did before and must keep doing.
{
  const o = recover(row({ amountPaise: 59900, fullTotal: 0 }), 599);
  t('5a prepaid', o.method, 'cashfree');
  t('5b no advance', o.advancePaid, 0);
}

// ═══ 6. An advance as large as the order ═════════════════════════════════
//
// If codAdvanceAmount ever equals or exceeds the order, the checkout caps it
// at the amount due and the whole thing is paid online. It reads as prepaid,
// and that is harmless: there is nothing left for anyone to collect. Written
// down because the label is then arguably wrong while the money is right.
{
  const o = recover(row({ amountPaise: 59900, fullTotal: 599 }), 599);
  t('6a reads as prepaid', o.method, 'cashfree');
  t('6b and nothing is owed either way', codCollect(o), 0);
}

// ═══ 7. Reconcile stops disagreeing with itself ══════════════════════════
//
// Corroboration that the fix is the right shape: the payments reconcile
// screen compares what Cashfree captured against what the ORDER says should
// have been captured. On his order those two disagreed by Rs 499, so it had
// already been flagging these as AMOUNT_MISMATCH.
{
  const captured = 100;
  const was = recoverOld(row(), 599);
  const now = recover(row(), 599);
  t('7a before: the order expected 599 against 100 captured',
    expectedAtGateway(was), 599);
  t('7b which is a mismatch', Math.abs(expectedAtGateway(was) - captured) > 0.5, true);
  t('7c after: it expects the advance', expectedAtGateway(now), 100);
  t('7d and matches', Math.abs(expectedAtGateway(now) - captured) > 0.5, false);
}

// ═══ 8. The browser coming back later ════════════════════════════════════
//
// PlaceOrder completes the recovered row and overwrites Method, Status and
// AdvancePaid with its own. The guard that refuses to reopen a finalised
// order looks for "Paid", "Delivered" or "Cancelled" - and a recovered COD
// order is now "Pending", so the browser is still allowed to finish it.
{
  const recovered = recover(row(), 599);
  const BLOCKED = ['Paid', 'Delivered', 'Cancelled'];
  t('8a the recovered COD order is not blocked', BLOCKED.includes(recovered.status), false);
  t('8b a recovered prepaid order is, as before',
    BLOCKED.includes(recover(row({ amountPaise: 59900 }), 599).status), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
