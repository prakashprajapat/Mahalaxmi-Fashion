// The dashboard counted one parcel and the page it linked to showed none.
//
// "FAILED DELIVERY 1" on the dashboard, and clicking it landed on Orders with
// "No orders in this queue."
//
// Both screens use the SAME followUpOf, so the words were never the problem.
// The dashboard counts over EVERY order the shop has; the orders screen first
// splits them into Orders and Returns and shows one half. The parcel was in
// Return Transit - a delivery that did not happen and is now on its way back -
// which lives under Returns. A box that counts one set must not land on a page
// that shows another.

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

// ── lib/courierFollowUp.followUpOf ───────────────────────────────────────
const SETTLED = ['Delivered', 'Cancelled', 'Return', 'Returned', 'Exchanged'];
const says = (h, ...n) => n.some(x => h.includes(x));

function followUpOf(o) {
  const status = (o.status ?? '').trim();
  if (SETTLED.includes(status)) return null;
  const text = `${o.courierStatus ?? ''} ${o.courierNote ?? ''}`.toLowerCase();
  if (text.trim().length === 0) return null;
  if (says(text, 'call placed', 'call made', 'contacted consignee', 'customer contacted')) return 'called';
  // Copied from lib/courierFollowUp.ts as it actually stands. An earlier draft
  // of this replay copied a stale version missing 'no client instruction' and
  // failed four cases - the replay was wrong, not the shop.
  if (says(text, 'consignee unavailable', 'consignee not available', 'customer unavailable',
    'no client instruction', 'no instructions', 'instructions to reattempt',
    'destination unable to receive', 'on hold',
    'address incomplete', 'incorrect address', 'refused', 'delivery attempted')) return 'stuck';
  if (says(text, 'out for delivery', 'out-for-delivery')) return 'outForDelivery';
  return null;
}

const RETURN_STATUSES = ['Return Requested', 'Return Transit', 'Return'];

// ── the dashboard box ────────────────────────────────────────────────────
const dashboardCount = (orders, key) => orders.filter(o => followUpOf(o) === key).length;

// ── the orders screen, before and after ──────────────────────────────────
function screenOld(orders, { mainTab = 'orders', activeTab = 'all', courierFilter = '' } = {}) {
  return orders
    .filter(o => mainTab === 'returns'
      ? RETURN_STATUSES.includes(o.status)
      : !RETURN_STATUSES.includes(o.status))
    .filter(o => activeTab === 'all' || o.status === activeTab)
    .filter(o => !courierFilter || followUpOf(o) === courierFilter);
}

function screenNew(orders, { mainTab = 'orders', activeTab = 'all', courierFilter = '' } = {}) {
  const main = courierFilter
    ? orders
    : orders.filter(o => mainTab === 'returns'
        ? RETURN_STATUSES.includes(o.status)
        : !RETURN_STATUSES.includes(o.status));
  return main
    .filter(o => !!courierFilter || activeTab === 'all' || o.status === activeTab)
    .filter(o => !courierFilter || followUpOf(o) === courierFilter);
}

const ord = (id, status, over = {}) => ({ id, status, courierStatus: '', courierNote: '', ...over });

// ═══ 1. Exactly what he saw ══════════════════════════════════════════════
{
  // 26 orders: 24 under Orders, 2 under Returns. One of the returns is a
  // parcel coming back after a failed delivery.
  const orders = [
    ...Array.from({ length: 22 }, (_, i) => ord(`MFH${i}`, 'Delivered')),
    ord('MFH-A', 'Transit', { courierStatus: 'In Transit' }),
    ord('MFH-B', 'Shipped'),
    ord('MFH-RTO', 'Return Transit', { courierStatus: 'Undelivered', courierNote: 'No client instructions to Reattempt' }),
    ord('MFH-REQ', 'Return Requested'),
  ];

  t('1a the dashboard counts one', dashboardCount(orders, 'stuck'), 1);
  t('1b and the old screen showed none', screenOld(orders, { courierFilter: 'stuck' }).length, 0);
  t('1c the new one shows the parcel the box counted',
    screenNew(orders, { courierFilter: 'stuck' }).map(o => o.id), ['MFH-RTO']);
  t('1d the two now agree',
    dashboardCount(orders, 'stuck'), screenNew(orders, { courierFilter: 'stuck' }).length);
}

// ═══ 2. It finds them in the Orders half too ═════════════════════════════
//
// The fix must not trade one half for the other.
{
  const orders = [
    ord('MFH-1', 'Transit', { courierNote: 'Consignee unavailable' }),
    ord('MFH-RTO', 'Return Transit', { courierNote: 'No client instructions to Reattempt' }),
    ord('MFH-3', 'Transit', { courierStatus: 'Out for delivery' }),
  ];
  t('2a both halves, one list', screenNew(orders, { courierFilter: 'stuck' }).map(o => o.id),
    ['MFH-1', 'MFH-RTO']);
  t('2b and the dashboard agrees', dashboardCount(orders, 'stuck'), 2);
  t('2c out for delivery is its own box', screenNew(orders, { courierFilter: 'outForDelivery' }).map(o => o.id),
    ['MFH-3']);
}

// ═══ 3. The status tabs step aside as well ═══════════════════════════════
//
// Arriving from the dashboard with a status tab remembered from last time
// would hide the parcel just as effectively as the queue did.
{
  const orders = [
    ord('MFH-1', 'Transit', { courierNote: 'Consignee unavailable' }),
    ord('MFH-2', 'Shipped', { courierNote: 'Address incomplete' }),
  ];
  t('3a the old screen, with a tab on, showed one of the two',
    screenOld(orders, { activeTab: 'Transit', courierFilter: 'stuck' }).map(o => o.id), ['MFH-1']);
  t('3b the new one shows both',
    screenNew(orders, { activeTab: 'Transit', courierFilter: 'stuck' }).map(o => o.id), ['MFH-1', 'MFH-2']);
}

// ═══ 4. Without a courier filter nothing changes ═════════════════════════
//
// The queues are right for everything else: Orders and Returns are two
// different jobs, and this must not merge them.
{
  const orders = [
    ord('MFH-1', 'Transit'),
    ord('MFH-RTO', 'Return Transit'),
    ord('MFH-REQ', 'Return Requested'),
  ];
  t('4a the Orders tab is unchanged', screenNew(orders).map(o => o.id), ['MFH-1']);
  t('4b and so is Returns',
    screenNew(orders, { mainTab: 'returns' }).map(o => o.id), ['MFH-RTO', 'MFH-REQ']);
  t('4c and a status tab still narrows',
    screenNew(orders, { activeTab: 'Transit' }).map(o => o.id), ['MFH-1']);
  t('4d exactly as before the change',
    screenNew(orders).map(o => o.id), screenOld(orders).map(o => o.id));
}

// ═══ 5. A settled parcel is nobody's follow-up ═══════════════════════════
{
  const orders = [
    ord('MFH-D', 'Delivered', { courierNote: 'Consignee unavailable' }),   // it arrived in the end
    ord('MFH-R', 'Return', { courierNote: 'Consignee unavailable' }),      // already home
    ord('MFH-C', 'Cancelled', { courierNote: 'Consignee unavailable' }),
  ];
  t('5a none of them', screenNew(orders, { courierFilter: 'stuck' }).length, 0);
  t('5b and the dashboard says the same', dashboardCount(orders, 'stuck'), 0);
}

// ═══ 6. Nothing to show says so ══════════════════════════════════════════
{
  const orders = [ord('MFH-1', 'Transit', { courierStatus: 'In Transit' })];
  t('6a an empty result is still an empty result',
    screenNew(orders, { courierFilter: 'stuck' }).length, 0);
  // The difference is that now it agrees with the number that was clicked.
  t('6b and the box that led here said zero too', dashboardCount(orders, 'stuck'), 0);
}

// ═══ 7. Whatever the shop has, the two always agree ══════════════════════
//
// The real guarantee. Every box, over a mixed set.
{
  const statuses = ['Pending', 'Order Packed', 'Ready for Shipping', 'Shipped', 'Transit',
                    'Delivered', 'Cancelled', 'Return Requested', 'Return Transit', 'Return'];
  const notes = ['', 'In Transit', 'Out for delivery', 'Consignee unavailable',
                 'No client instructions to Reattempt', 'Call placed to consignee', 'Address incomplete'];
  const orders = [];
  let n = 0;
  for (const s of statuses) for (const note of notes) orders.push(ord(`O${n++}`, s, { courierNote: note }));

  for (const key of ['stuck', 'outForDelivery', 'called']) {
    t(`7-${key} the box and the page agree`,
      dashboardCount(orders, key), screenNew(orders, { courierFilter: key }).length);
  }
  // And the old screen did not, which is the bug in one line.
  const disagreed = ['stuck', 'outForDelivery', 'called']
    .filter(k => dashboardCount(orders, k) !== screenOld(orders, { courierFilter: k }).length);
  t('7d the old screen disagreed on every one of them', disagreed.length, 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
