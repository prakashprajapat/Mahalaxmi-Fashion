'use client';
// Lightweight GA4 event tracking. Fires an event through gtag (the direct GA4 tag loaded
// in layout.tsx) and, as a fallback, pushes to the GTM dataLayer. Analytics must NEVER break
// the app, so every call is wrapped in try/catch and no-ops on the server.
//
// After these events start flowing, mark the ones you care about as "Key events" in
// GA4 → Admin → Events (toggle "Mark as key event").
type Params = Record<string, unknown>;

export function trackEvent(name: string, params: Params = {}): void {
  if (typeof window === 'undefined') return;
  try {
    const w = window as unknown as {
      gtag?: (...args: unknown[]) => void;
      dataLayer?: unknown[];
    };
    if (typeof w.gtag === 'function') {
      w.gtag('event', name, params);
    } else if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push({ event: name, ...params });
    }
  } catch {
    /* analytics is best-effort — never throw */
  }
}

// Build a GA4 ecommerce "items" array from cart-like objects.
export function toGa4Items(
  lines: Array<{ dbId?: number; sku?: string; name?: string; category?: string; quantity?: number; price?: number }>,
): Array<Record<string, unknown>> {
  return lines.map(l => ({
    item_id: l.sku || String(l.dbId ?? ''),
    item_name: l.name ?? '',
    item_category: l.category ?? '',
    price: l.price ?? 0,
    quantity: l.quantity ?? 1,
  }));
}
