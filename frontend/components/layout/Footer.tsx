'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { settingsApi } from '@/lib/api';

const DEFAULT_WA = '919429429880';
const DEFAULT_ADDRESS = 'Ward No. 45, Near Mahadev Temple, Balotra, Rajasthan';
const normalizeWa = (raw?: string) => {
  const d = (raw || '').replace(/\D/g, '');
  return !d ? DEFAULT_WA : d.length === 10 ? '91' + d : d;
};

export default function Footer() {
  // Store info + social links are managed in Admin → Settings.
  const [socials, setSocials] = useState<{ name: string; url: string }[]>([]);
  const [info, setInfo] = useState<Record<string, string>>({});
  useEffect(() => {
    settingsApi.getAll().then(r => {
      const s = r.settings ?? {};
      setInfo(s);
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

  const storeName = info.storeName?.trim() || 'Mahalaxmi Fashion Hub';
  const tagline = info.tagline?.trim() || 'Designer sarees, daily nightwear, petticoats and fabric essentials - curated with a boutique touch.';
  const address = info.address?.trim() || DEFAULT_ADDRESS;
  const wa = normalizeWa(info.whatsapp || info.phone);
  const waDisplay = '+' + wa.replace(/^(\d{2})(\d+)/, '$1 $2');

  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <Link className="brand footer-brand" href="/" style={{ display: 'inline-block' }}>
            <img
              src="/logo-color.webp"
              alt={storeName}
              width={210}
              height={90}
              loading="lazy"
              decoding="async"
              style={{ width: '210px', maxWidth: '100%', height: 'auto' }}
            />
          </Link>
          <p>{tagline}</p>
          <p className="site-footer-contact">{address}</p>
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
          <a href="https://affiliate.mahalaxmifashionhub.com/">💸 Earn With Us</a>
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
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp {waDisplay}</a>
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
        <small>&copy; {new Date().getFullYear()} {storeName}. All rights reserved.</small>
        <nav className="site-footer-legal">
          <Link href="/about-us">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/terms-conditions">Terms</Link>
          <Link href="/shipping-delivery-policy">Shipping</Link>
          <Link href="/return-policy">Returns</Link>
          <Link href="/cancellation-policy">Cancellation</Link>
          <Link href="/become-supplier">Become a Supplier</Link>
        </nav>
      </div>
    </footer>
  );
}
