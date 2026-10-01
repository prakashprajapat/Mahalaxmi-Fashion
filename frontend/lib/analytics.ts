'use client';
// Lightweight GA4 event tracking. Fires an event through gtag (the direct GA4 tag loaded
// in layout.tsx) and, as a fallback, pushes to the GTM dataLayer. Analytics must NEVER break
// the app, so every call is wrapped in try/catch and no-ops on the server.
//
// After these events start flowing, mark the ones you care about as "Key events" in
// GA4 → Admin → Events (toggle "Mark as key event").
import { storage } from '@/lib/safeStorage';

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
import { feedIdFor } from '@/lib/merchantFeed';

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

interface Ga4Item {
  item_id?: unknown; item_name?: unknown; quantity?: unknown; price?: unknown;
  /** Feed ki us row ka id jisme size aur rang dono tay hain. */
  item_variant_id?: unknown;
  /** Feed ka item_group_id — yani SKU, poore product ka. */
  item_group_id?: unknown;
}

// Har event ka apna id.
//
// Ye id browser aur server, dono ke saath jati hai — isi se Meta samajhta hai
// ki dono ek hi baat keh rahe hain aur use ek hi baar ginta hai. Pehle id sirf
// kharid ke saath jati thi (order id), isliye baki event server se bheje hi
// nahi ja sakte the: dogune dikhte.
function newEventId(): string {
  try {
    const c = (window as unknown as { crypto?: Crypto }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* purana browser */ }
  return `e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Wahi event, apne hi server se hokar Meta tak.
//
// Pixel ka raasta aadha band hai: ad blocker connect.facebook.net ko rok deta
// hai, iOS cookie kaat deta hai, aur app ya UPI redirect ke baad browser wapas
// aata hi nahi. Ye anurodh apne hi domain par jata hai, isliye blocker ise
// facebook ka anurodh samajh kar nahi rokta, aur server se Conversions API par
// chala jata hai — bina kisi teesre partner ke.
//
// Purchase yahan se nahi jata: wo server pe khud banta hai, jahan paisa pakka
// hota hai. Yahan se bhejne ka matlab hota "browser jo kahe wo sach".
function sendServerCopy(metaName: string, eventId: string, payload: Record<string, unknown>): void {
  if (metaName === 'Purchase') return;
  try {
    const contents = Array.isArray(payload.contents)
      ? (payload.contents as Array<Record<string, unknown>>).slice(0, 20).map(c => ({
          id: String(c.id ?? ''),
          quantity: Number(c.quantity ?? 1),
          price: Number(c.item_price ?? 0),
        }))
      : [];
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Login kiye hue grahak ka email/phone server khud nikal leta hai — bheja
    // nahi jata. Khule pate par kisi ka bhi email bhej kar milan bigaada ja
    // sakta tha.
    const tok = storage.get('mfh_token');
    if (tok) headers.Authorization = `Bearer ${tok}`;

    void fetch('/api/site-events', {
      method: 'POST',
      headers,
      keepalive: true,
      body: JSON.stringify({
        eventName: metaName,
        eventId,
        value: payload.value,
        currency: payload.currency,
        contentType: payload.content_type,
        sourceUrl: window.location.href,
        items: contents,
      }),
    }).catch(() => { /* analytics kabhi kaam nahi rokta */ });
  } catch { /* same */ }
}

function trackMeta(name: string, params: Params): void {
  const metaName = META_EVENTS[name];
  if (!metaName) return;                      // not an event Meta has a name for

  const w = window as unknown as {
    fbq?: (...args: unknown[]) => void;
    zaraz?: { track?: (name: string, data?: Record<string, unknown>) => void };
  };
  const hasFbq = typeof w.fbq === 'function';
  const hasZaraz = typeof w.zaraz?.track === 'function';
  // Pehle yahan se laut jate the jab pixel maujood na ho. Par pixel ka na hona
  // hi wo halat hai jisme server wala raasta sabse zyada kaam ka hai — blocker
  // ne use rok diya hai. Isliye ab rukte nahi; neeche server copy phir bhi
  // jati hai.

  const items = Array.isArray(params.items) ? (params.items as Ga4Item[]) : [];
  const payload: Record<string, unknown> = {
    currency: (params.currency as string) ?? 'INR',
    value: Number(params.value ?? 0),
  };
  if (items.length > 0) {
    // Meta content_ids ko catalogue ke id se milata hai. Catalogue me ek row
    // har size aur rang ki hai (MFH1143-free-size-black), aur SKU sirf unka
    // item_group_id hai. Akela SKU bhejne par kuch nahi milta — match rate 0%.
    //
    // Product khulte waqt size chuna hi nahi hota, isliye tab group bheja jata
    // hai aur content_type 'product_group' — Meta ko yahi batana padta hai ki
    // ye id group ka hai. Cart aur kharid ke waqt size aur rang dono maloom
    // hote hain, to wahan feed wali poori row ka id jata hai.
    const asVariant = items.every(i => String(i.item_variant_id ?? '').trim() !== '');
    const idOf = (i: Ga4Item) => String(
      (asVariant ? i.item_variant_id : (i.item_group_id ?? i.item_id)) ?? ''
    );
    payload.content_type = asVariant ? 'product' : 'product_group';
    payload.content_ids = items.map(idOf);
    payload.contents = items.map(i => ({
      id: idOf(i),
      quantity: Number(i.quantity ?? 1),
      item_price: Number(i.price ?? 0),
    }));
    payload.num_items = items.reduce((n, i) => n + Number(i.quantity ?? 1), 0);
    if (items.length === 1 && items[0].item_name) payload.content_name = String(items[0].item_name);
  }

  // The order id doubles as Meta's event id, so a purchase that reaches Meta
  // both from the browser and from the Conversions API is counted once. Without
  // it every sale would show twice the moment the server-side path is on.
  //
  // Baki event ka koi order id nahi hota, to ek nayi id bana lete hain — par
  // banti ek hi baar hai aur dono raaston par wahi jati hai. Yahi jodi ko ek
  // rakhti hai.
  const eventId = typeof params.transaction_id === 'string' && params.transaction_id
    ? params.transaction_id
    : newEventId();

  sendServerCopy(metaName, eventId, payload);

  if (hasFbq) {
    w.fbq!('track', metaName, payload, { eventID: eventId });
    return;
  }
  if (hasZaraz) w.zaraz!.track!(metaName, { ...payload, event_id: eventId });
}

// Build a GA4 ecommerce "items" array from cart-like objects.
export function toGa4Items(
  lines: Array<{
    dbId?: number; sku?: string; name?: string; category?: string; quantity?: number; price?: number;
    selectedSize?: string; selectedColor?: string;
  }>,
): Array<Record<string, unknown>> {
  return lines.map(l => ({
    item_id: l.sku || String(l.dbId ?? ''),
    item_name: l.name ?? '',
    item_category: l.category ?? '',
    price: l.price ?? 0,
    quantity: l.quantity ?? 1,
    item_group_id: l.sku || String(l.dbId ?? ''),
    item_variant_id: feedIdFor(l.sku, l.dbId, l.selectedSize, l.selectedColor),
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
