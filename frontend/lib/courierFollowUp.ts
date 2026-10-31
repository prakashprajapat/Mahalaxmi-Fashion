// Which parcels somebody has to do something about today.
//
// Our own order status answers where a parcel is in the SHOP's process -
// packed, shipped, delivered. It cannot answer the question an owner asks in
// the morning, which is: which parcels are on a van right now, and which
// customers has the courier already phoned. Both of those are the courier's
// words, and both are reasons to pick up the phone.
//
// The third group is the one that costs money. "Consignee unavailable", "no
// instructions to reattempt", "on hold" - a parcel sitting on one of those is
// not a parcel in transit, it is a parcel on its way back. MFH17919491518985415
// spent nine days collecting those lines before anyone noticed it had turned
// round, by which point it was in Ahmedabad going the wrong way.

export type FollowUpKey = 'called' | 'stuck' | 'outForDelivery';

export interface FollowUpGroup {
  key: FollowUpKey;
  label: string;
  /** Said in the shop's words, not the courier's, because the courier's are a log line. */
  why: string;
  colour: string;
}

export const FOLLOW_UP_GROUPS: FollowUpGroup[] = [
  {
    key: 'called',
    label: 'Courier called the customer',
    why: 'Ring them yourself. A call nobody answered is an undelivered parcel tomorrow.',
    colour: '#c26a12',
  },
  {
    key: 'stuck',
    label: 'Delivery did not happen',
    why: 'These turn into returns if nothing is done. Confirm the address or the time.',
    colour: '#c0392b',
  },
  {
    key: 'outForDelivery',
    label: 'Out for delivery today',
    why: 'On a van now. Nothing to do unless the customer asks.',
    colour: '#1d74a8',
  },
];

/** Statuses where a parcel is no longer travelling, so nothing here applies. */
const SETTLED = ['Delivered', 'Cancelled', 'Return', 'Returned', 'Exchanged'];

const says = (haystack: string, ...needles: string[]) =>
  needles.some(n => haystack.includes(n));

/**
 * Which follow-up list an order belongs on, or null for none.
 *
 * One order lands on at most ONE list. A parcel that is out for delivery AND
 * has been called about is one parcel and one phone call, and showing it twice
 * would make two jobs out of one - so the more urgent answer wins, in the order
 * the groups are declared above.
 */
export function followUpOf(o: {
  status?: string | null;
  courierStatus?: string | null;
  courierNote?: string | null;
}): FollowUpKey | null {
  const status = (o.status ?? '').trim();
  if (SETTLED.includes(status)) return null;

  // Both halves, together: Delhivery puts the useful sentence in Instructions
  // and the plain state in Status, and which one carries a given phrase is not
  // consistent between scans.
  const text = `${o.courierStatus ?? ''} ${o.courierNote ?? ''}`.toLowerCase();
  if (text.trim().length === 0) return null;

  // A call placed is the one with a person on the other end of it.
  if (says(text, 'call placed', 'call made', 'contacted consignee', 'customer contacted'))
    return 'called';

  // Deliberately NOT 'undelivered' on its own: that is the word Delhivery uses
  // while a parcel is still being attempted, and it would put half the
  // in-transit list on a red list that means act now.
  //
  // 'no client instruction' is here because of a parcel that was already
  // lost when this was written. Delhivery logs "No client instructions to
  // Reattempt", and the first version of this list said 'no instructions' -
  // which does not match it. The one phrase that most needed catching would
  // have been the one that slipped through, on the exact order that prompted
  // all of this. The words a courier uses are not the words you would guess;
  // these are copied off his own scans.
  if (says(text,
    'consignee unavailable', 'consignee not available', 'customer unavailable',
    'no client instruction', 'no instructions', 'instructions to reattempt',
    'destination unable to receive', 'on hold',
    'address incomplete', 'incorrect address', 'refused', 'delivery attempted'))
    return 'stuck';

  if (says(text, 'out for delivery', 'out-for-delivery'))
    return 'outForDelivery';

  return null;
}

/** The orders on each list, in one pass, keeping the declared order of the groups. */
export function groupForFollowUp<T extends {
  status?: string | null; courierStatus?: string | null; courierNote?: string | null;
}>(orders: T[]): Record<FollowUpKey, T[]> {
  const out: Record<FollowUpKey, T[]> = { called: [], stuck: [], outForDelivery: [] };
  for (const o of orders) {
    const key = followUpOf(o);
    if (key) out[key].push(o);
  }
  return out;
}
