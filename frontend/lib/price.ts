// Pure price helpers — safe to import from both server and client components.
// Shipping is a manual per-product charge folded silently into the final customer price.

export interface PricedProduct {
  price: number;
  discountPrice?: number;
  shippingCharge?: number;
}

// Base (discounted) unit rate before shipping — used for GST/discount base, not what the customer pays.
export function unitBase(p: PricedProduct): number {
  return (p.discountPrice != null && p.discountPrice > 0) ? p.discountPrice : p.price;
}

// Final unit price the customer actually pays = discounted rate + manual per-product shipping.
export function finalUnitPrice(p: PricedProduct): number {
  return unitBase(p) + (p.shippingCharge ?? 0);
}

// The date that belongs on a tax invoice.
//
// Not the day the customer placed the order. The GST number is handed out
// when the parcel is confirmed for shipping, so dating by the order instead
// put the series out of sequence the first time an older order was packed
// after a newer one - MFH/26-27/011 dated 18/10 followed by 012 dated 17/10,
// which is a broken series, not a cosmetic slip.
//
// Orders invoiced before this was recorded keep the order date, because those
// invoices are already printed and in the customer's hands.
export function invoiceDateOf(o: {
  invoicedAt?: string | null; placedAt?: string | null; createdAt?: string | null;
}): Date {
  return new Date(o.invoicedAt ?? o.placedAt ?? o.createdAt ?? Date.now());
}

// A rupee figure as a shop writes one.
//
// toLocaleString('en-IN') alone printed Rs.760.10 as "760.1", because it drops
// a trailing zero - a money amount with one decimal place, which reads like a
// mistake even when the figure is right. Whole rupees stay whole (no "440.00"
// on every row); anything with paise shows both places.
export function inr(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const whole = Number.isInteger(v);
  return v.toLocaleString('en-IN', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}
