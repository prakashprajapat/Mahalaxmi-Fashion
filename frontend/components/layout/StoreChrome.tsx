'use client';
import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import Footer from './Footer';
import FloatingCart from './FloatingCart';
import WelcomePopup from './WelcomePopup';
import WhatsAppFloat from './WhatsAppFloat';

// The /influencer (affiliate creator portal) is a standalone page — it has its own
// header/footer and should NOT show the shop navbar, sidebar, footer or popups.
export default function StoreChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Bare (no shop chrome) on the /influencer route AND on the affiliate.* subdomain.
  // The affiliate subdomain serves /influencer via an internal nginx rewrite, so the
  // browser URL stays "/" — we detect it by hostname on the client.
  const isAffiliateHost = typeof window !== 'undefined' && window.location.hostname.startsWith('affiliate.');
  const bare = (pathname?.startsWith('/influencer') ?? false) || isAffiliateHost;

  if (bare) {
    return (
      <>
        {children}
        <WhatsAppFloat />
      </>
    );
  }

  return (
    <>
      <Navbar />
      {children}
      <Footer />
      <FloatingCart />
      <WelcomePopup />
      <WhatsAppFloat />
    </>
  );
}
