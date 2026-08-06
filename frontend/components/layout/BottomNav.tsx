'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* Mobile-only bottom navigation bar. Hidden on desktop via CSS. */
export default function BottomNav() {
  const pathname = usePathname() || '/';
  const is = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    window.dispatchEvent(new Event('mfh-open-menu'));
  };

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <Link href="/" className={`bnav-item${is('/') ? ' active' : ''}`}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 3.2 3 10.5V21h6v-6h6v6h6V10.5L12 3.2Z" /></svg>
        <span>Home</span>
      </Link>
      <a href="#" onClick={openMenu} className="bnav-item">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" /></svg>
        <span>Categories</span>
      </a>
      <Link href="/orders" className={`bnav-item${is('/orders') || is('/tracking') ? ' active' : ''}`}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3.5 7 12 3l8.5 4v10L12 21l-8.5-4V7Zm8.5 1.9 5.6-2.6L12 3.8 6.4 6.3 12 8.9Zm-1 2L5 8.4v7.3l6 2.8v-7.6Z" /></svg>
        <span>My Orders</span>
      </Link>
      <Link href="/contact" className={`bnav-item${is('/contact') ? ' active' : ''}`}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2Zm7.1 3.8c-1.7 0-2.9 1-2.9 2.6h1.9c0-.6.4-1 1-1s1 .3 1 .9c0 .5-.3.7-.9 1.1-.7.5-1.1 1-1 2h1.8c0-.5.3-.8.9-1.2.7-.5 1.2-1 1.2-2 0-1.4-1.2-2.4-3-2.4Zm-.9 6.6h1.9V15h-1.9v-1.6Z" /></svg>
        <span>Help</span>
      </Link>
      <Link href="/account" className={`bnav-item${is('/account') || is('/wishlist') ? ' active' : ''}`}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.9 0-7 2.2-7 5v1h14v-1c0-2.8-3.1-5-7-5Z" /></svg>
        <span>Account</span>
      </Link>
    </nav>
  );
}
