// Service worker for Mahalaxmi Fashion Hub PWA.
//  - Installability (Add to Home Screen) + a light cache for static assets/images.
//  - Web Push: shows notifications for offers, restock, cart reminders, order updates.
const CACHE = 'mfh-v6';
// Product photos live at /_next/image?... and are immutable per URL (the source
// filename carries a timestamp), so they get their own cache with its own cap.
const IMG_CACHE = 'mfh-img-v1';
const IMG_MAX = 300;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== IMG_CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Oldest-first eviction. Without it a heavy browser could keep every photo the
// shop has ever shown; 300 is comfortably more than a shopping session needs.
async function trimImageCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= IMG_MAX) return;
  for (const k of keys.slice(0, keys.length - IMG_MAX)) await cache.delete(k);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Only handle same-origin GET requests; let the browser handle everything else.
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  // CRITICAL: never intercept page navigations, Next.js build assets/data, or API calls.
  // Letting the browser handle these directly means a slow/flaky mobile connection retries
  // normally and we NEVER serve a stale page or a "503 Offline" for an HTML document or a
  // JS chunk. Intercepting them was what crashed the app with
  // "Application error: a client-side exception has occurred" right after a deploy on slow
  // networks (a failed chunk fetch returned 503 → the page could not hydrate).
  if (req.mode === 'navigate') return;
  if (url.pathname.startsWith('/_next/static/')) return;  // JS/CSS chunks — see above
  if (url.pathname.startsWith('/api/')) return;
  if (url.searchParams.has('_rsc')) return;   // Next.js RSC prefetch/data — let browser handle

  // Product photos. These were excluded along with the rest of /_next/, which
  // meant every photo in the app went to the server on every single view —
  // the app's own images were the one thing it never kept. They are safe to
  // cache in a way chunks are not: a photo's URL contains the source file name,
  // which is stamped with the time it was uploaded, so a replaced photo is a
  // different URL and a stale one is impossible.
  //
  // Served from cache first so the app paints instantly, then refreshed in the
  // background so a re-upload still arrives. A failure here can only ever cost
  // an image, never a page or a script.
  if (url.pathname === '/_next/image') {
    e.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const hit = await cache.match(req);
      const fresh = fetch(req).then((res) => {
        if (res && res.status === 200) {
          cache.put(req, res.clone()).then(() => trimImageCache(cache)).catch(() => {});
        }
        return res;
      }).catch(() => null);
      // On a cache hit we answer at once and let the refresh finish on its own.
      // waitUntil keeps the worker alive for it; without that the browser is
      // free to shut the worker down mid-request and the refresh never lands.
      if (hit) { e.waitUntil(fresh); return hit; }
      return (await fresh) || new Response('', { status: 504, statusText: 'Offline' });
    })());
    return;
  }

  if (url.pathname.startsWith('/_next/')) return;   // anything else under /_next/

  // For the remaining same-origin GETs (images, icons, fonts, manifest): network-first with
  // a cached fallback so they still work offline. This can never break page or JS loading.
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      // Last resort for a non-critical asset (e.g. an image) — a broken asset, never a crash.
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

// ---- Web Push ----------------------------------------------------------------
// Payload (JSON) sent from the backend:
//   { title, body, url, image, icon, tag }
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch { data = { body: e.data ? e.data.text() : '' }; }

  const title = data.title || 'Mahalaxmi Fashion Hub';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    image: data.image || undefined,
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      try {
        if (new URL(c.url).pathname === new URL(target, self.location.origin).pathname && 'focus' in c) {
          return c.focus();
        }
      } catch {}
    }
    if (clients.openWindow) return clients.openWindow(target);
  })());
});
