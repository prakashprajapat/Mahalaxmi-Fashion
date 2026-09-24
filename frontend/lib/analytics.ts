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

  // And the same event to Meta. Separate try/catch on purpose: a fault on one
  // side must not cost the other its event.
  try {
    trackMeta(name, params);
  } catch {
    /* best-effort */
  }
}

// ── Meta (Facebook / Instagram) ───────────────────────────────────────────────
//
// Meta's ads optimise on what people BOUGHT, not on how many arrived. Until now
// the only thing the Pixel sent was a PageView, which tells Meta nothing it can
// bid on. Rather than scattering fbq() calls through the app, every existing
// trackEvent call is mirrored here under Meta's own names.
//
// Two ways the Pixel can be installed and only one of them may be used, or the
// event is counted twice:
//   - on the page (Admin → Settings → Facebook Pixel ID) — window.fbq
//   - at the edge (Cloudflare Zaraz) — window.zaraz
// fbq wins when both somehow exist, which is the case where a double would
// otherwise happen.

/** GA4's name for a thing → Meta's name for the same thing. */
const META_EVENTS: Record<string, string> = {
  view_item: 'ViewContent',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  purchase: 'Purchase',
  sign_up: 'CompleteRegistration',
  generate_lead: 'Lead',
  add_to_wishlist: 'AddToWishlist',
  search: 'Search',
};

interface Ga4Item { item_id?: unknown; item_name?: unknown; quantity?: unknown; price?: unknown }

function trackMeta(name: string, params: Params): void {
  const metaName = META_EVENTS[name];
  if (!metaName) return;                      // not an event Meta has a name for

  const w = window as unknown as {
    fbq?: (...args: unknown[]) => void;
    zaraz?: { track?: (name: string, data?: Record<string, unknown>) => void };
  };
  const hasFbq = typeof w.fbq === 'function';
  const hasZaraz = typeof w.zaraz?.track === 'function';
  if (!hasFbq && !hasZaraz) return;           // no Pixel installed yet — nothing to do

  const items = Array.isArray(params.items) ? (params.items as Ga4Item[]) : [];
  const payload: Record<string, unknown> = {
    currency: (params.currency as string) ?? 'INR',
    value: Number(params.value ?? 0),
  };
  if (items.length > 0) {
    payload.content_type = 'product';
    payload.content_ids = items.map(i => String(i.item_id ?? ''));
    payload.contents = items.map(i => ({
      id: String(i.item_id ?? ''),
      quantity: Number(i.quantity ?? 1),
      item_price: Number(i.price ?? 0),
    }));
    payload.num_items = items.reduce((n, i) => n + Number(i.quantity ?? 1), 0);
    if (items.length === 1 && items[0].item_name) payload.content_name = String(items[0].item_name);
  }

  // The order id doubles as Meta's event id, so a purchase that reaches Meta
  // both from the browser and from the Conversions API is counted once. Without
  // it every sale would show twice the moment the server-side path is on.
  const eventId = typeof params.transaction_id === 'string' && params.transaction_id
    ? params.transaction_id
    : undefined;

  if (hasFbq) {
    w.fbq!('track', metaName, payload, eventId ? { eventID: eventId } : undefined);
    return;
  }
  w.zaraz!.track!(metaName, eventId ? { ...payload, event_id: eventId } : payload);
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
    const w = window as unknown as {
      gtag?: (...args: unknown[]) => void;
      dataLayer?: unknown[];
    };

    // Always announce it on the dataLayer, so a Google Ads conversion tag in
    // Tag Manager has something to fire on. Without this the conversion would
    // exist only in the gtag call below, and the moment the direct tags are
    // switched off (Settings → tagsViaGtm) Ads would stop recording sales
    // entirely — the one failure in this changeover that costs real money and
    // shows no error anywhere.
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({
      event: 'ads_conversion',
      value: p.value ?? 0,
      currency: p.currency ?? 'INR',
      transaction_id: p.transactionId ?? '',
    });

    // And directly, while the direct Ads tag is still the one doing the work.
    // When Tag Manager takes over, gtag is no longer defined here and this is
    // simply skipped — which is why both paths have to exist during the switch.
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

// Read the GA4 client id from the browser's _ga cookie (format: GA1.1.<clientId>).
// Sent with the order so the SERVER-side purchase event (Measurement Protocol) attributes
// to the same GA4 session/user as the shopper. Returns '' if GA hasn't set the cookie yet.
export function getGaClientId(): string {
  if (typeof document === 'undefined') return '';
  try {
    const m = document.cookie.match(/_ga=GA\d\.\d\.(\d+\.\d+)/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
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
