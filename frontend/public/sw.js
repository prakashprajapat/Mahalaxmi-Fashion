// Minimal service worker — required for PWA installability (Add to Home Screen).
// Network-first with a tiny offline fallback; no aggressive caching so content stays fresh.
const CACHE = 'mfh-v2';

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
