import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page Not Found | Mahalaxmi Fashion Hub',
  description: 'The page you are looking for does not exist.',
};

export default function NotFound() {
  return (
    <>
      <style>{`
        .nf-wrap {
          min-height: 70vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 3rem 1.5rem;
          background: #fff;
        }
        .nf-logo {
          width: 80px;
          height: 80px;
          object-fit: contain;
          margin-bottom: 1.5rem;
        }
        .nf-code {
          font-size: 6rem;
          font-weight: 900;
          color: #a7354d;
          line-height: 1;
          margin: 0 0 .5rem;
          letter-spacing: -.04em;
        }
        .nf-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1a1a1a;
          margin: 0 0 .75rem;
        }
        .nf-desc {
          color: #777;
          font-size: .95rem;
          max-width: 420px;
          line-height: 1.6;
          margin: 0 auto 2rem;
        }
        .nf-actions {
          display: flex;
          gap: .75rem;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 2.5rem;
        }
        .nf-divider {
          width: 48px;
          height: 3px;
          background: linear-gradient(90deg, #7a0a22, #a7354d);
          border-radius: 2px;
          margin: 0 auto 2rem;
        }
        .nf-links-title {
          font-size: .82rem;
          font-weight: 700;
          color: #aaa;
          text-transform: uppercase;
          letter-spacing: .08em;
          margin-bottom: 1rem;
        }
        .nf-links {
          display: flex;
          flex-wrap: wrap;
          gap: .5rem;
          justify-content: center;
          max-width: 500px;
        }
        .nf-links a {
          background: #f5f5f5;
          color: #555;
          padding: .4rem .85rem;
          border-radius: 20px;
          font-size: .82rem;
          font-weight: 600;
          text-decoration: none;
          transition: background .2s, color .2s;
        }
        .nf-links a:hover {
          background: #a7354d;
          color: #fff;
        }
      `}</style>

      <div className="nf-wrap">
        <img src="/Logo.png" alt="Mahalaxmi Fashion Hub" className="nf-logo" />

        <p className="nf-code">404</p>
        <h1 className="nf-title">Page Not Found</h1>
        <p className="nf-desc">
          Oops! The page you are looking for has been moved, deleted, or never existed.
          Let us help you find what you need.
        </p>

        <div className="nf-actions">
          <Link href="/" className="button primary">
            ⌂ Go to Homepage
          </Link>
          <Link href="/products" className="button secondary">
            🛍️ Browse Products
          </Link>
        </div>

        <div className="nf-divider" />

        <p className="nf-links-title">Popular Categories</p>
        <div className="nf-links">
          <Link href="/products?category=saree">Saree</Link>
          <Link href="/products?category=nighty">Nighty</Link>
          <Link href="/products?category=petticoat">Petticoat</Link>
          <Link href="/women">Women</Link>
          <Link href="/men">Men</Link>
          <Link href="/products?category=popline">Popline</Link>
          <Link href="/best-sellers">Best Sellers</Link>
          <Link href="/contact">Contact Us</Link>
        </div>
      </div>
    </>
  );
}
