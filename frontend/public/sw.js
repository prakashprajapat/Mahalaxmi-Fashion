// Service worker for Mahalaxmi Fashion Hub PWA.
//  - Installability (Add to Home Screen) + a light network-first cache with offline fallback.
//  - Web Push: shows notifications for offers, restock, cart reminders, order updates.
const CACHE = 'mfh-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Only handle same-origin GET requests; let the browser handle everything else normally
  // (cross-origin, POST, RSC prefetch quirks) so we never break those requests.
  if (req.method !== 'GET') return;
  let sameOrigin = false;
  try { sameOrigin = new URL(req.url).origin === self.location.origin; } catch { return; }
  if (!sameOrigin) return;

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      // Network failed — serve a cached copy, else ALWAYS return a valid Response
      // (returning undefined here caused "Failed to convert value to 'Response'").
      const cached = await caches.match(req);
      if (cached) return cached;
      return new Response('You are offline. Please check your connection.', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
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
