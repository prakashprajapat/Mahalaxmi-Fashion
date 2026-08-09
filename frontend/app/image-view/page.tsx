import Link from 'next/link';
import type { Metadata } from 'next';

// Branded wrapper shown when someone opens a raw product image URL directly in the
// browser (e.g. from Google Images / a shared image link). Middleware rewrites
// /product-images/<file> → this page ONLY for real top-level navigations, so the
// image still loads normally inside <img>, feeds and crawlers.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Mahalaxmi Fashion Hub',
};

const BRAND = '#7a0a22';

export default function ImageViewPage({ searchParams }: { searchParams: { src?: string } }) {
  const raw = (searchParams.src ?? '').trim();
  // Security: only allow our own /product-images/ files (no open redirect / SSRF).
  const src = /^\/product-images\/[A-Za-z0-9._-]+\.(webp|jpe?g|png|avif|gif)$/i.test(raw) ? raw : '';

  return (
    <div style={{ minHeight: '100dvh', background: '#faf6f2', display: 'flex', flexDirection: 'column' }}>
      {/* Branded top bar with Home + Shop buttons */}
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '.75rem', padding: '.6rem 1rem',
          background: `linear-gradient(180deg, ${BRAND} 0%, #5c1420 100%)`,
          boxShadow: '0 2px 10px rgba(0,0,0,.15)',
        }}>
        <Link href="/" aria-label="Mahalaxmi Fashion Hub — Home"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '.55rem', textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp?v=5" alt="Mahalaxmi Fashion Hub"
            style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', objectFit: 'contain', padding: 4 }} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', letterSpacing: '.02em' }}>Mahalaxmi Fashion Hub</span>
        </Link>
        <nav style={{ display: 'flex', gap: '.5rem', flexShrink: 0 }}>
          <Link href="/"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', background: '#fff', color: BRAND, fontWeight: 700, fontSize: '.9rem', padding: '.5rem .95rem', borderRadius: 999, textDecoration: 'none' }}>
            🏠 Home
          </Link>
          <Link href="/products"
            style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,.16)', color: '#fff', fontWeight: 700, fontSize: '.9rem', padding: '.5rem .95rem', borderRadius: 999, border: '1px solid rgba(255,255,255,.5)', textDecoration: 'none' }}>
            Shop All
          </Link>
        </nav>
      </header>

      {/* The image */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', gap: '1rem' }}>
        {src ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Mahalaxmi Fashion Hub product"
              style={{ maxWidth: '100%', maxHeight: '78vh', width: 'auto', height: 'auto', borderRadius: 14, boxShadow: '0 10px 30px rgba(92,26,40,.18)', background: '#fff' }} />
            <Link href="/products"
              style={{ background: BRAND, color: '#fff', fontWeight: 800, fontSize: '.95rem', padding: '.7rem 1.6rem', borderRadius: 999, textDecoration: 'none', boxShadow: '0 6px 16px rgba(122,10,34,.28)' }}>
              🛍️ Browse Our Collection
            </Link>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: '#7a0a22' }}>
            <p style={{ fontWeight: 700, marginBottom: '1rem' }}>Image not available.</p>
            <Link href="/" style={{ background: BRAND, color: '#fff', fontWeight: 800, padding: '.7rem 1.6rem', borderRadius: 999, textDecoration: 'none' }}>🏠 Go to Home</Link>
          </div>
        )}
      </main>

      <footer style={{ textAlign: 'center', padding: '.75rem', color: '#8a6b72', fontSize: '.8rem' }}>
        © Mahalaxmi Fashion Hub, Balotra — Sarees, Nighty & Ethnic Wear
      </footer>
    </div>
  );
}
