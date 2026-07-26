import type { MetadataRoute } from 'next';

// Web App Manifest — makes the site installable as an app (Add to Home Screen).
// Next.js serves this at /manifest.webmanifest and auto-injects <link rel="manifest">.
// Icons reference existing files in /public (icon-192.png, icon-512.png).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mahalaxmi Fashion Hub',
    short_name: 'Mahalaxmi',
    description:
      'Sarees, Nighty, Petticoat & family ethnic wear — COD, free shipping over ₹999, pan-India delivery.',
    start_url: '/?utm_source=pwa',
    scope: '/',
    // 'browser' makes the site NON-installable in Chrome, so the "Install / Create
    // shortcut" web prompt no longer appears (customers install the app from the Play
    // Store instead). This does NOT affect the published Play Store (TWA) app — that
    // verifies via /.well-known/assetlinks.json, not this manifest — and the service
    // worker (offline) keeps working.
    display: 'browser',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#a7354d',
    lang: 'en-IN',
    dir: 'ltr',
    categories: ['shopping', 'lifestyle'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'New Arrivals', short_name: 'New', url: '/products?utm_source=pwa_shortcut' },
      { name: 'Track Order', short_name: 'Track', url: '/tracking?utm_source=pwa_shortcut' },
      { name: 'My Wishlist', short_name: 'Wishlist', url: '/wishlist?utm_source=pwa_shortcut' },
    ],
  };
}
