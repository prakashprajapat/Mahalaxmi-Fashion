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
