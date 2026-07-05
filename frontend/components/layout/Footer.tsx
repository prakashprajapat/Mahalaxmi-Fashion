'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { settingsApi } from '@/lib/api';

export default function Footer() {
  // Social links are managed in Admin → Settings → Social Media (stored as JSON).
  const [socials, setSocials] = useState<{ name: string; url: string }[]>([]);
  useEffect(() => {
    settingsApi.getAll().then(r => {
      const s = r.settings ?? {};
      let list: { name: string; url: string }[] = [];
      try {
        const parsed = JSON.parse(s.socialLinks || '[]');
        if (Array.isArray(parsed)) list = parsed.filter((x: any) => x && x.url);
      } catch {}
      if (list.length === 0) {
        if (s.facebook)  list.push({ name: 'Facebook',  url: s.facebook });
        if (s.instagram) list.push({ name: 'Instagram', url: s.instagram });
      }
      setSocials(list);
    }).catch(() => {});
  }, []);

  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <Link className="brand footer-brand" href="/" style={{ display: 'inline-block' }}>
            <img
              src="/logo-color.webp"
              alt="Mahalaxmi Fashion Hub"
              style={{ width: '210px', maxWidth: '100%', height: 'auto' }}
            />
          </Link>
          <p>Designer sarees, daily nightwear, petticoats and fabric essentials - curated with a boutique touch.</p>
          <p className="site-footer-contact">Ward No. 45, Near Mahadev Temple, Balotra, Rajasthan</p>
        </div>

        <nav className="site-footer-col">
          <h2>Shop</h2>
          <Link href="/products?category=saree">Saree</Link>
          <Link href="/products?category=women">Women</Link>
          <Link href="/products?category=nighty">Nighty</Link>
          <Link href="/products?category=petticoat">Petticoat</Link>
          <Link href="/products?category=popline">Popline Fabric</Link>
          <Link href="/products?bestSeller=true">Best Sellers</Link>
        </nav>

        <nav className="site-footer-col">
          <h2>Help</h2>
          <Link href="/return-exchange">Returns &amp; Exchange</Link>
          <Link href="/shipping-delivery-policy">Shipping Policy</Link>
          <Link href="/cancellation-policy">Cancellation</Link>
          <Link href="/safety-center">Safety Center</Link>
          <Link href="/about-us">About Us</Link>
          <Link href="/contact">Contact Us</Link>
          <Link href="/become-supplier">Become a Supplier</Link>
        </nav>

        <nav className="site-footer-col">
          <h2>Popular</h2>
          <Link href="/products?category=saree">Wedding Sarees</Link>
          <Link href="/products?category=saree">Silk Sarees</Link>
          <Link href="/products?category=nighty">Cotton Nighty</Link>
          <Link href="/products?category=petticoat">Petticoats</Link>
          <Link href="/reviews">Customer Reviews</Link>
        </nav>

        <nav className="site-footer-col">
          <h2>Connect</h2>
          <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer">WhatsApp +91 9429429880</a>
          {socials.length > 0
            ? socials.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">{s.name || 'Link'}</a>
              ))
            : (
              <>
                <a href="https://www.instagram.com/mahalaxmifashionhub.blt/" target="_blank" rel="noopener noreferrer">Instagram</a>
                <a href="https://www.facebook.com/mahalaxmifashionhub.blt/" target="_blank" rel="noopener noreferrer">Facebook</a>
              </>
            )}
          <div className="footer-app-row" aria-label="Mobile apps coming soon">
            <span className="footer-app-btn"><small>Coming soon on</small><strong>App Store</strong></span>
            <span className="footer-app-btn"><small>Coming soon on</small><strong>Google Play</strong></span>
          </div>
        </nav>
      </div>

      <div className="site-footer-baseline">
        <small>&copy; {new Date().getFullYear()} Mahalaxmi Fashion Hub. All rights reserved.</small>
        <nav className="site-footer-legal">
          <Link href="/about-us">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/terms-conditions">Terms</Link>
          <Link href="/shipping-delivery-policy">Shipping</Link>
          <Link href="/return-policy">Returns</Link>
          <Link href="/cancellation-policy">Cancellation</Link>
        </nav>
      </div>
    </footer>
  );
}
