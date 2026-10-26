// Which backend statuses a screen's bucket stands for.
//
// The backend has more statuses than any screen has buckets, and an order in
// one nobody claims is an order nobody sees. That has now happened twice, the
// same way both times: an order written by the Cashfree or Razorpay WEBHOOK -
// the customer paid and never came back to the site - is saved as "Paid". The
// Orders screen was fixed for it. The Dashboard was not, so a paid, unpacked
// parcel was counted in no tile at all and the five tiles added up to one less
// than the Total Orders beside them.
//
// So the mapping lives here and both screens read it. Two copies of a rule
// like this do not stay the same; these two already did not.

export const STATUS_GROUPS: Record<string, string[]> = {
  // An order placed the ordinary way is "Pending". "Paid" is the webhook's,
  // and "Order Received" / "Pending confirmation" are older spellings that
  // still sit in the table.
  Pending: ['Pending', 'Paid', 'Order Received', 'Pending confirmation'],
  // "Order Packed" is the bench's own step before the label goes on.
  'Ready for Shipping': ['Ready for Shipping', 'Order Packed'],
  // Delhivery moves an order to Transit as soon as the AWB syncs; a manual
  // courier (India Post, DTDC) stops at "Shipped" and never moves again.
  Transit: ['Transit', 'Shipped'],
};

/** The statuses one bucket stands for. A bucket with no group is itself. */
export const statusesFor = (key: string): string[] => STATUS_GROUPS[key] ?? [key];

/** Does this bucket take an order in this status? */
export const bucketAccepts = (key: string, status: string): boolean =>
  statusesFor(key).includes(status);

/**
 * Every status the given buckets claim between them.
 *
 * Each screen passes ITS OWN bucket list, because they do not show the same
 * ones - the Dashboard has no On Hold tile and no Cancel Requested tile. A
 * screen uses this to find what it is not showing and say so, rather than
 * quietly dropping those orders.
 */
export const claimedBy = (keys: string[]): Set<string> =>
  new Set(keys.flatMap(statusesFor));
