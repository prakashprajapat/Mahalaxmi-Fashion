'use client';
import { usePathname } from 'next/navigation';

// Preload the hero logo (the LCP element on the storefront) so the browser
// discovers it immediately instead of after HTML parse.
//   • Only emitted on storefront pages, where the logo is actually shown at the
//     top of the navbar right away.
//   • NOT emitted on /admin pages — the admin panel has its own header and never
//     uses this logo, so preloading it there just triggers the browser's
//     "preloaded but not used within a few seconds" console warning.
// React/Next hoists this <link> into <head> automatically.
export default function LogoPreload() {
  const pathname = usePathname() || '';
  if (pathname.startsWith('/admin')) return null;
  return <link rel="preload" as="image" href="/logo.webp?v=5" />;
}
