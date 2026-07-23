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
    // Push a GTM Custom Event to the dataLayer so Google Tag Manager triggers can fire
    // (e.g. a GA4 "view_item" event tag). Ensure dataLayer exists even before GTM loads.
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: name, ...params });
    // Also send directly to GA4 (gtag) when the direct GA4 tag is present.
    if (typeof w.gtag === 'function') {
      w.gtag('event', name, params);
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

// Direct Google Ads conversion (in addition to the GA4-imported one). Sending purchases
// straight to Google Ads gives PMax/Search a faster, first-party conversion signal to bid on.
// Env-gated like the FB Pixel / GTM tags: does nothing until BOTH the conversion id and label
// are configured, so it can never break checkout.
// Real values hard-coded as fallbacks (public — they ship in the client bundle anyway);
// env vars can still override per-environment.
//   NEXT_PUBLIC_GADS_ID             = "AW-18290575097"
//   NEXT_PUBLIC_GADS_PURCHASE_LABEL = "6VznCIS7sdUcEPmN0JFE"
export function trackAdsConversion(p: { value?: number; currency?: string; transactionId?: string }): void {
  if (typeof window === 'undefined') return;
  const id = process.env.NEXT_PUBLIC_GADS_ID ?? 'AW-18290575097';
  const label = process.env.NEXT_PUBLIC_GADS_PURCHASE_LABEL ?? '6VznCIS7sdUcEPmN0JFE';
  if (!id || !label) return;                       // not configured yet → no-op
  try {
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    if (typeof w.gtag === 'function') {
      w.gtag('event', 'conversion', {
        send_to: `${id}/${label}`,
        value: p.value ?? 0,
        currency: p.currency ?? 'INR',
        transaction_id: p.transactionId ?? '',     // same id as the GA4 purchase → dedupes
      });
    }
  } catch { /* best-effort — never throw */ }
}

// GA4 "Set up User ID" — tie a logged-in customer's sessions across devices to one identity.
// Call after login (and on load if already logged in). Never send PII; use the internal id only.
export function setAnalyticsUserId(id: string | number | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    const w = window as unknown as { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] };
    const uid = id ? String(id) : undefined;
    if (typeof w.gtag === 'function') w.gtag('set', { user_id: uid });
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ user_id: uid });
  } catch { /* best-effort */ }
}
