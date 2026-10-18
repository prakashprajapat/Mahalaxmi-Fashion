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
