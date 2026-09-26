'use client';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import BottomNav from './BottomNav';
import FloatingCart from './FloatingCart';
import WhatsAppFloat from './WhatsAppFloat';
import HelpFab from './HelpFab';
import CompareBar from '@/components/product/CompareBar';
import RefCapture from '../RefCapture';
import { getCustomer } from '@/lib/auth';
import { setAnalyticsUserId } from '@/lib/analytics';

// Three widgets that have no business rendering on the server: a popup that
// waits 3.5 seconds, a chat launcher and a push opt-in. All still lazy, so
// their JS stays out of the first bundle.
//
// They used to say so with `{ ssr: false }`, which in the App Router makes the
// server emit <template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"> where
// each one would go. On hydration React reports each of those as error #418 and
// then #423 — four "Uncaught Error" lines in the console of every single page,
// for three widgets behaving exactly as asked. Nothing was broken, but four red
// errors on every page is how a real one goes unnoticed: the Google Ads tag
// below had been blocked for weeks underneath this noise.
//
// `mounted` says the same thing without lying to React. The server renders
// nothing here, the first client render renders nothing, so hydration matches —
// and the widgets appear a tick later, which is sooner than any of them shows
// anything anyway.
const WelcomePopup = dynamic(() => import('./WelcomePopup'));
const AiChatWidget = dynamic(() => import('../chat/AiChatWidget'));
const PushOptIn = dynamic(() => import('../push/PushOptIn'));

// The /influencer (affiliate creator portal) is a standalone page — it has its own
// header/footer and should NOT show the shop navbar, sidebar, footer or popups.
export default function StoreChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // False on the server and on the first client render, so the two agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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
      <Footer minimal={pathname?.startsWith('/checkout') ?? false} />
      <FloatingCart />
      {mounted && <WelcomePopup />}
      <CompareBar />
      <BottomNav />
      {/* Single combined launcher (WhatsApp + chatbot) instead of two overlapping floats */}
      {mounted && <AiChatWidget />}
      <HelpFab />
      {mounted && <PushOptIn />}
    </>
  );
}
