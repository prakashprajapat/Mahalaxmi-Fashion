'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { settingsApi } from '@/lib/api';

const DEFAULT_WA = '919429429880';
const DEFAULT_ADDRESS = 'Ward No. 45, Near Mahadev Temple, Balotra, Rajasthan';
const normalizeWa = (raw?: string) => {
  const d = (raw || '').replace(/\D/g, '');
  return !d ? DEFAULT_WA : d.length === 10 ? '91' + d : d;
};

// Brand icon for a social platform (matched by name). Falls back to a generic globe.
function SocialIcon({ name }: { name: string }) {
  const k = (name || '').toLowerCase();
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true } as const;
  if (k.includes('whatsapp')) return <svg {...p}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884M20.463 3.488A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
  if (k.includes('instagram')) return <svg {...p}><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.332.014 7.052.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>;
  if (k.includes('facebook')) return <svg {...p}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>;
  if (k.includes('youtube')) return <svg {...p}><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>;
  if (k.includes('twitter') || k === 'x' || k.includes('/x')) return <svg {...p}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
  return <svg {...p}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93A8.001 8.001 0 014.06 13H7v2a2 2 0 002 2v1.93zM17.9 17.39A2 2 0 0016 16h-1v-3a1 1 0 00-1-1H8v-2h2a1 1 0 001-1V7h2a2 2 0 002-2v-.41A8.003 8.003 0 0117.9 17.39z"/></svg>;
}

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
      // Ensure the brand's Instagram, Facebook & YouTube always show if the admin hasn't set them.
      if (!list.some(x => x.name.toLowerCase().includes('instagram')))
        list.push({ name: 'Instagram', url: 'https://www.instagram.com/mahalaxmifashionhub.blt/' });
      if (!list.some(x => x.name.toLowerCase().includes('facebook')))
        list.push({ name: 'Facebook', url: 'https://www.facebook.com/mahalaxmifashionhub.blt/' });
      if (!list.some(x => x.name.toLowerCase().includes('youtube')))
        list.push({ name: 'YouTube', url: 'https://www.youtube.com/@Mahalaxmifashionhub' });
      setSocials(list);
    }).catch(() => {});
  }, []);

  const storeName = info.storeName?.trim() || 'Mahalaxmi Fashion Hub';
  const tagline = info.tagline?.trim() || 'Designer sarees, daily nightwear, petticoats and fabric essentials - curated with a boutique touch.';
  const address = info.address?.trim() || DEFAULT_ADDRESS;
  const wa = normalizeWa(info.whatsapp || info.phone);
  const waDisplay = '+' + wa.replace(/^(\d{2})(\d+)/, '$1 $2');

  // Icon row for Connect: WhatsApp always; Instagram/Facebook/YouTube/Twitter etc. come from
  // Admin → Settings → Social Media (add the platform name + URL there and its icon appears).
  const connectSocials = (() => {
    const list: { name: string; url: string }[] = [{ name: 'WhatsApp', url: `https://wa.me/${wa}` }];
    socials.forEach(s => {
      const n = (s.name || '').toLowerCase();
      if (n && s.url && !list.some(x => x.name.toLowerCase() === n)) list.push({ name: s.name, url: s.url });
    });
    return list;
  })();

  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <Link className="brand footer-brand" href="/" style={{ display: 'inline-block' }}>
            <Image
              src="/logo-color.webp"
              alt={storeName}
              width={210}
              height={90}
              loading="lazy"
              style={{ width: '210px', maxWidth: '100%', height: 'auto' }}
            />
          </Link>
          <p>{tagline}</p>
          <p className="site-footer-contact">{address}</p>
        </div>

        <nav className="site-footer-col">
          <h2>Shop</h2>
          <Link href="/women">Women</Link>
          <Link href="/men">Men</Link>
          <Link href="/kids">Kids</Link>
          <Link href="/beauty">Beauty</Link>
          <Link href="/fabrics">Fabrics</Link>
          <Link href="/more">More</Link>
        </nav>

        <nav className="site-footer-col">
          <h2>Help</h2>
          <Link href="/return-exchange">Returns &amp; Exchange</Link>
          <Link href="/shipping-delivery-policy">Shipping Policy</Link>
          <Link href="/cancellation-policy">Cancellation</Link>
          <Link href="/safety-center">Safety Center</Link>
          <Link href="/blog">Blog &amp; Style Guides</Link>
          <Link href="/about-us">About Us</Link>
          <Link href="/contact">Contact Us</Link>
          <a href="https://affiliate.mahalaxmifashionhub.com/">💸 Earn With Us</a>
        </nav>

        <nav className="site-footer-col">
          <h2>Popular</h2>
          <Link href="/products?category=saree">Wedding Sarees</Link>
          <Link href="/products?category=saree">Silk Sarees</Link>
          <Link href="/products?category=nighty">Cotton Nighty</Link>
          <Link href="/reviews">Customer Reviews</Link>
        </nav>

        <nav className="site-footer-col">
          <h2>Connect</h2>
          <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap', margin: '.1rem 0 .7rem' }}>
            {connectSocials.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.name} title={s.name}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.14)', color: '#fff' }}>
                <SocialIcon name={s.name} />
              </a>
            ))}
          </div>
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem' }}>WhatsApp {waDisplay}</a>
          <div className="footer-app-row" aria-label="Mobile apps coming soon">
            <span className="footer-app-btn"><small>Coming soon on</small><strong>App Store</strong></span>
            <span className="footer-app-btn"><small>Coming soon on</small><strong>Play Store</strong></span>
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
