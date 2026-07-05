import type { MetadataRoute } from 'next';

// Web App Manifest → served at /manifest.webmanifest. Enables "Add to Home Screen"
// (install as an app) on Android/Chrome and iOS Safari.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mahalaxmi Fashion Hub',
    short_name: 'Mahalaxmi',
    description: 'Premium Indian Fashion — Sarees, Nighty, Petticoat & More. Shop ethnic wear online.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#a7354d',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
