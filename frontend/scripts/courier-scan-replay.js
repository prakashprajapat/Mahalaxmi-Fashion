// The event, the rollup, and which one the dashboard was counting.
//
// Order MFH17928926171597816, AWB 55746510000604. The tracking modal:
//
//     Out for delivery - 2 Nov, 8:55 am - Chennai_Puthagaram_D
//
// with the step lit green. The dashboard, on the next screen:
//
//     OUT FOR DELIVERY   0   of 7 on the way
//
// Both read Delhivery. Both read THE SAME HTTP RESPONSE, from the same
// endpoint, in the same call. They read different parts of it:
//
//   the modal   Shipment.Scans[]  - the events
//   the sweep   Shipment.Status   - the rollup, which becomes CourierStatus
//                                   and CourierNote, which every dashboard
//                                   box is counted from
//
// The newest scan says "Out for delivery". The rollup says the parcel is in
// transit, because that is what a rollup describes - the leg, not this
// morning's event. So the box could never have counted it.
//
// This is the third time this exact confusion has cost something: the RTO
// status that read only the label, the RTO arrival that read only the rollup,
// and now this. Hence a replay.
//
// Run: node frontend/scripts/courier-scan-replay.js

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

// ── DelhiveryService.CourierDate, as far as this needs it ────────────────
const courierDate = raw => {
  if (!raw || !String(raw).trim()) return null;
  const n = Date.parse(String(raw).trim().replace(' ', 'T'));
  return Number.isNaN(n) ? null : n;
};

// ── DelhiveryService.TrackAsync: the newest scan ─────────────────────────
//
// By TIME, not by position. Delhivery has sent this array oldest-first and
// newest-first at different times, which is why SplitLegs sorts rather than
// trusting the order. Taking [0] or the last element would be right about
// half the time, which is the worst kind of right.
function newestScan(scans) {
  let last = '', newest = -Infinity;
  for (const raw of scans ?? []) {
    const d = raw.ScanDetail ?? raw;
    const remark = (d.Instructions ?? d.Scan ?? '').trim();
    if (remark.length === 0) continue;
    const at = courierDate(d.ScanDateTime ?? d.StatusDateTime);
    const when = at === null ? -Infinity : at;
    if (last.length === 0 || when > newest) { newest = when; last = remark; }
  }
  return last;
}

// ── DelhiveryTrackingSyncService: what gets stored ───────────────────────
const storedNote = line => {
  const n = (line.lastScan ?? '').trim();
  return n.length > 0 ? n : (line.instruction ?? '').trim();
};

// ── lib/courierFollowUp.followUpOf ───────────────────────────────────────
const SETTLED = ['Delivered', 'Cancelled', 'Return', 'Returned', 'Exchanged'];
const says = (hay, ...needles) => needles.some(n => hay.includes(n));
function followUpOf(o) {
  if (SETTLED.includes((o.status ?? '').trim())) return null;
  const text = `${o.courierStatus ?? ''} ${o.courierNote ?? ''}`.toLowerCase();
  if (text.trim().length === 0) return null;
  if (says(text, 'call placed', 'call made', 'contacted consignee', 'customer contacted')) return 'called';
  if (says(text,
    'consignee unavailable', 'consignee not available', 'customer unavailable',
    'no client instruction', 'no instructions', 'instructions to reattempt',
    'destination unable to receive', 'on hold',
    'address incomplete', 'incorrect address', 'refused', 'delivery attempted')) return 'stuck';
  if (says(text, 'out for delivery', 'out-for-delivery')) return 'outForDelivery';
  return null;
}

// The whole path, end to end: the courier's payload -> the stored row -> the box.
const boxFor = (payload, orderStatus = 'Transit') => followUpOf({
  status: orderStatus,
  courierStatus: payload.status,
  courierNote: storedNote({ instruction: payload.instruction, lastScan: newestScan(payload.scans) }),
});

const scan = (remark, when) => ({ ScanDetail: { Instructions: remark, ScanDateTime: when } });

// ═══ 1. His own parcel ═══════════════════════════════════════════════════
{
  // Newest-first, as Delhivery sent it in his modal.
  const payload = {
    status: 'In Transit',
    instruction: 'In Transit',
    scans: [
      scan('Out for delivery', '2026-11-02 08:55:00'),
      scan('Shipment Received at Facility', '2026-11-02 08:23:00'),
      scan('Bag Received at Facility', '2026-11-02 07:50:00'),
      scan('Bag Added To Trip', '2026-11-02 00:37:00'),
    ],
  };

  t('1a the rollup alone says nothing useful',
    followUpOf({ status: 'Transit', courierStatus: 'In Transit', courierNote: 'In Transit' }), null);
  t('1b which is the 0 on his dashboard', boxFor({ ...payload, scans: [] }), null);
  t('1c the newest scan is the event', newestScan(payload.scans), 'Out for delivery');
  t('1d and the box now counts it', boxFor(payload), 'outForDelivery');
}

// ═══ 2. Newest by time, whichever way round the array arrives ════════════
{
  const oldestFirst = [
    scan('Bag Added To Trip', '2026-11-02 00:37:00'),
    scan('Bag Received at Facility', '2026-11-02 07:50:00'),
    scan('Shipment Received at Facility', '2026-11-02 08:23:00'),
    scan('Out for delivery', '2026-11-02 08:55:00'),
  ];
  const newestFirst = [...oldestFirst].reverse();

  t('2a oldest-first', newestScan(oldestFirst), 'Out for delivery');
  t('2b newest-first', newestScan(newestFirst), 'Out for delivery');
  // The thing that makes sorting necessary rather than tidy: a shuffled array
  // still has to give the same answer.
  const shuffled = [oldestFirst[2], oldestFirst[0], oldestFirst[3], oldestFirst[1]];
  t('2c in no order at all', newestScan(shuffled), 'Out for delivery');

  // And what taking a position would have done.
  const first = a => ((a[0].ScanDetail.Instructions));
  t('2d taking the first element is wrong half the time',
    [first(oldestFirst), first(newestFirst)], ['Bag Added To Trip', 'Out for delivery']);
}

// ═══ 3. Scans that say nothing ═══════════════════════════════════════════
{
  t('3a no scans at all', newestScan([]), '');
  t('3b undefined', newestScan(undefined), '');
  t('3c blank remarks are skipped',
    newestScan([scan('   ', '2026-11-02 09:00:00'), scan('Out for delivery', '2026-11-02 08:55:00')]),
    'Out for delivery');
  t('3d a scan with no readable time still beats nothing',
    newestScan([{ ScanDetail: { Scan: 'Out for delivery' } }]), 'Out for delivery');
  t('3e but never beats one that is dated',
    newestScan([
      { ScanDetail: { Scan: 'Added to Bag' } },
      scan('Out for delivery', '2026-11-02 08:55:00'),
    ]), 'Out for delivery');
  t('3f the flat shape, without ScanDetail',
    newestScan([{ Instructions: 'Out for delivery', ScanDateTime: '2026-11-02 08:55:00' }]),
    'Out for delivery');
}

// ═══ 4. The rollup is still the fallback ═════════════════════════════════
//
// A response with no scans must behave exactly as it did before.
{
  t('4a no scans, the rollup stands',
    storedNote({ instruction: 'Call placed to consignee', lastScan: '' }),
    'Call placed to consignee');
  t('4b and the box reads it',
    boxFor({ status: 'Pending', instruction: 'Call placed to consignee', scans: [] }), 'called');
  t('4c a scan beats the rollup when there is one',
    storedNote({ instruction: 'In Transit', lastScan: 'Out for delivery' }), 'Out for delivery');
}

// ═══ 5. The other two boxes still work ═══════════════════════════════════
{
  t('5a a call placed, as a scan',
    boxFor({ status: 'Pending', instruction: 'Pending',
             scans: [scan('Call placed to consignee', '2026-11-02 10:00:00')] }), 'called');

  t('5b the parcel that started all of this',
    boxFor({ status: 'Pending', instruction: 'Pending',
             scans: [scan('No client instructions to Reattempt', '2026-10-29 14:00:00')] }), 'stuck');

  // One order, one list, most urgent first: a parcel that went out AND was
  // phoned about is one parcel and one phone call.
  t('5c the more urgent answer wins',
    boxFor({ status: 'Pending', instruction: 'Out for delivery',
             scans: [scan('Call placed to consignee', '2026-11-02 10:00:00')] }), 'called');

  t('5d a settled order is on no list',
    boxFor({ status: 'In Transit', instruction: 'In Transit',
             scans: [scan('Out for delivery', '2026-11-02 08:55:00')] }, 'Delivered'), null);
}

// ═══ 6. The RTO test gets both sentences ════════════════════════════════
//
// Yesterday's fix read the arrival out of the rollup. "RETURN Accepted"
// arrives as a SCAN, so until now it reached that test only when the rollup
// happened to carry it too.
{
  const isReturnLeg = (status, type) => {
    if (String(type ?? '').trim().toUpperCase() === 'RT') return true;
    const s = String(status ?? '').toLowerCase();
    return s.includes('rto') || s.includes('dto') || s.includes('return');
  };
  const isBackWithUs = (status, type, instruction) => {
    if (!isReturnLeg(status, type)) return false;
    const s = String(status ?? '').toLowerCase();
    if (s.includes('delivered') || s.includes('received') || s.includes('accepted')
        || s.includes('returned') || s.includes('to origin')) return true;
    const n = String(instruction ?? '').toLowerCase();
    return n.includes('return accepted') || n.includes('rto delivered')
        || n.includes('return delivered') || n.includes('returned to origin')
        || n.includes('received at origin');
  };

  const line = {
    status: 'RTO', statusType: 'RT', instruction: 'In Transit',
    lastScan: newestScan([
      scan('RETURN Accepted', '2026-11-01 15:41:00'),
      scan('Dispatched for RTO', '2026-11-01 13:42:00'),
    ]),
  };
  t('6a the rollup alone does not say it is home',
    isBackWithUs(line.status, line.statusType, line.instruction), false);
  t('6b both sentences together do',
    isBackWithUs(line.status, line.statusType, `${line.instruction} ${storedNote(line)}`), true);
  t('6c and two hours earlier it was not',
    isBackWithUs('RTO', 'RT', 'In Transit Dispatched for RTO'), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
