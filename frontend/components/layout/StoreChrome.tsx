'use client';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import FloatingCart from './FloatingCart';
import WhatsAppFloat from './WhatsAppFloat';
import RefCapture from '../RefCapture';
import { getCustomer } from '@/lib/auth';
import { setAnalyticsUserId } from '@/lib/analytics';

// Non-critical, only shows after a 3.5s delay — load its JS lazily so it stays
// out of the initial bundle and doesn't block first paint / hydration.
const WelcomePopup = dynamic(() => import('./WelcomePopup'), { ssr: false });
// AI shopping assistant — client-only, lazy so it never blocks first paint.
const AiChatWidget = dynamic(() => import('../chat/AiChatWidget'), { ssr: false });

// The /influencer (affiliate creator portal) is a standalone page — it has its own
// header/footer and should NOT show the shop navbar, sidebar, footer or popups.
export default function StoreChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // GA4 "Set up User ID": once a customer is logged in, tie their sessions to one identity
  // (cross-device). Runs on load and whenever auth changes. Uses the non-PII customer code.
  useEffect(() => {
    const apply = () => {
      const c = getCustomer();
      setAnalyticsUserId(c ? (c.customerCode || c.id) : null);
    };
    apply();
    window.addEventListener('auth-changed', apply);
    return () => window.removeEventListener('auth-changed', apply);
  }, []);

  // Bare (no shop chrome) on the /influencer route AND on the affiliate.* subdomain.
  // The affiliate subdomain serves /influencer via an internal nginx rewrite, so the
  // browser URL stays "/" — we detect it by hostname on the client.
  const isAffiliateHost = typeof window !== 'undefined' && window.location.hostname.startsWith('affiliate.');
  const bare = (pathname?.startsWith('/influencer') ?? false) || isAffiliateHost;

  if (bare) {
    return (
      <>
        <RefCapture />
        {children}
        <WhatsAppFloat />
      </>
    );
  }

  return (
    <>
      <RefCapture />
      <Navbar />
      {children}
      <Footer />
      <FloatingCart />
      <WelcomePopup />
      <WhatsAppFloat />
      <AiChatWidget />
    </>
  );
}
