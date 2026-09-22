import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { settingsApi } from '@/lib/api';
import PWARegister from '@/components/pwa/PWARegister';
import LogoPreload from '@/components/LogoPreload';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#a7354d',
};

const SITE_URL = 'https://www.mahalaxmifashionhub.com';
const GA4_ID   = process.env.NEXT_PUBLIC_GA4_ID ?? 'G-SFMFYD4NE6';

async function getSeoSettings(): Promise<Record<string, string>> {
  try {
    const { settings } = await settingsApi.getAll();
    return settings ?? {};
  } catch {
    return {};
  }
}

// Global site metadata — defaults + admin-editable values (Settings → SEO sections).
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSeoSettings();

  const defaultTitle = s.seoHomeTitle?.trim()
    // Sarees led this title while the shop had none in stock. Nighties (34)
    // and petticoats (6) lead now, and Balotra is in it: the brand name is
    // crowded — Mahalaxmi Hosiery, Sri Mahalaxmi Hosiery, Mahalaxmi Textile,
    // Mahalaxmi Mills all rank for it — and the town is what separates them.
    || 'Cotton Nighty & Petticoat Online, Balotra – Mahalaxmi Fashion Hub';
  const defaultDesc  = s.seoHomeDescription?.trim()
    || 'Shop cotton nighties, sarees, petticoats, innerwear & fabrics online at Mahalaxmi Fashion Hub, Balotra (Rajasthan). Quality-checked, COD available, free shipping over ₹999, pan-India delivery.';
  const keywords     = s.seoKeywords?.trim()
    || 'cotton nighty online, nighty for women, saree online, petticoat online, nighty combo pack, mahalaxmi fashion hub, fashion store balotra, online fashion rajasthan, innerwear online, ethnic wear women';
  const ogImage      = s.seoOgImage?.trim() || '/og-image.jpg';
  const twitterSite  = s.seoTwitterSite?.trim();
  const googleVerif  = s.googleSiteVerification?.trim();
  const bingVerif    = s.bingSiteVerification?.trim();

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: defaultTitle,
      template: '%s | Mahalaxmi Fashion Hub',
    },
    description: defaultDesc,
    keywords,
    authors: [{ name: 'Mahalaxmi Fashion Hub' }],
    creator: 'Mahalaxmi Fashion Hub',
    publisher: 'Mahalaxmi Fashion Hub',
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      locale: 'en_IN',
      url: SITE_URL,
      siteName: 'Mahalaxmi Fashion Hub',
      title: defaultTitle,
      description: defaultDesc,
      images: [{ url: ogImage, width: 1200, height: 630, alt: 'Mahalaxmi Fashion Hub — Ethnic Wear for the Entire Family' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: defaultTitle,
      description: defaultDesc,
      images: [ogImage],
      ...(twitterSite ? { site: twitterSite, creator: twitterSite } : {}),
    },
    applicationName: 'Mahalaxmi Fashion Hub',
    appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Mahalaxmi' },
    other: { 'mobile-web-app-capable': 'yes' },
    icons: {
      icon: [
        { url: '/favicon.ico?v=8', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
        { url: '/favicon-32.png?v=8', type: 'image/png', sizes: '32x32' },
        { url: '/icon-192.png?v=9', type: 'image/png', sizes: '192x192' },
      ],
      apple: '/apple-touch-icon.png?v=9',
      shortcut: '/favicon.ico?v=8',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    verification: {
      ...(googleVerif ? { google: googleVerif } : {}),
      ...(bingVerif ? { other: { 'msvalidate.01': bingVerif } } : {}),
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSeoSettings();
  const gtmId = s.gtmId?.trim();
  const fbPixelId = s.facebookPixelId?.trim();

  return (
    <html lang="en">
      <head>
        {/* Preconnect to external image/asset hosts for faster product images */}
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />

        {/* Preload the hero logo (the LCP element on the home page) so the browser
            discovers it immediately instead of after HTML parse — fixes "LCP request discovery".
            Rendered only on storefront pages (skipped on /admin, where the logo isn't used —
            that avoids the "preloaded but not used" console warning on admin pages). */}
        <LogoPreload />

        {/* Hero heading font (Playfair Display) — loaded NON-render-blocking:
            fetched with media="print" (so it doesn't block first paint), then a tiny
            script flips it to "all". display=swap keeps text visible meanwhile. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          id="pf-font"
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&display=swap"
          rel="stylesheet"
          media="print"
        />
        <Script id="pf-font-swap" strategy="afterInteractive">{`var _l=document.getElementById('pf-font');if(_l){_l.media='all';}`}</Script>

        {/* Consent Mode (privacy compliance) — runs FIRST, before GA/GTM/Pixel.
            Tracking storage is granted by default. There is no consent banner:
            the shop chose to drop it, and since the banner was the only thing
            that could ever flip consent to granted, leaving the default at
            denied would have silently killed Google Ads conversion tracking and
            the Meta Pixel. The Privacy Policy, linked in the footer, is the
            notice. Anyone reinstating a banner must set this back to denied. */}
        <Script id="consent-default" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            // wait_for_update held the tags back 500ms for a consent update
            // that used to come from the banner. Nothing sends one now.
            gtag('consent','default',{
              ad_storage:'granted', analytics_storage:'granted',
              ad_user_data:'granted', ad_personalization:'granted'
            });
          `}
        </Script>

        {/* Google Analytics 4 — load right after the page becomes interactive so
            page_view fires reliably on every visit (lazyOnload was too late and
            missed quick bounces / fast navigations). */}
        {GA4_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA4_ID}', { page_path: window.location.pathname });
              `}
            </Script>
          </>
        )}

        {/* Google Tag Manager — admin-configurable (Settings → SEO). Lazy-loaded. */}
        {gtmId && (
          <Script id="gtm-init" strategy="lazyOnload">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
          </Script>
        )}

        {/* Facebook Pixel — admin-configurable (Settings → SEO). Lazy-loaded. */}
        {fbPixelId && (
          <Script id="fb-pixel" strategy="lazyOnload">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${fbPixelId}');fbq('track','PageView');`}
          </Script>
        )}

        {/* LocalBusiness JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ClothingStore',
              name: 'Mahalaxmi Fashion Hub',
              url: SITE_URL,
              logo: `${SITE_URL}/icon-512.png`,
              image: `${SITE_URL}/hero-bannernew.webp`,
              description: 'Premium Indian Fashion — Sarees, Nighty, Petticoat & More. Family-run ethnic wear boutique in Balotra, Rajasthan.',
              telephone: '+919429429880',
              address: {
                '@type': 'PostalAddress',
                streetAddress: 'Ward No. 45, Near Mahadev Temple',
                addressLocality: 'Balotra',
                addressRegion: 'Rajasthan',
                postalCode: '344022',
                addressCountry: 'IN',
              },
              geo: { '@type': 'GeoCoordinates', latitude: 25.8333, longitude: 72.2333 },
              // Google looks for hasMap on a local business. Pointed at the
              // postal address rather than a Place ID, because the shop has no
              // Google Business Profile yet; swap in the real Maps link the day
              // it does, and correct the coordinates above at the same time —
              // 25.8333, 72.2333 is the centre of Balotra, not the shop.
              hasMap: 'https://www.google.com/maps/search/?api=1&query='
                + encodeURIComponent('Ward No. 45, Near Mahadev Temple, Balotra, Rajasthan 344022'),
              openingHoursSpecification: [
                {
                  '@type': 'OpeningHoursSpecification',
                  dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
                  opens: '10:00',
                  closes: '20:00',
                },
              ],
              sameAs: [
                'https://www.instagram.com/mahalaxmifashionhub.blt/',
                'https://www.facebook.com/mahalaxmifashionhub.blt/',
              ],
              priceRange: '₹₹',
              currenciesAccepted: 'INR',
              paymentAccepted: 'Cash, Credit Card, Debit Card, UPI',
            }),
          }}
        />

        {/* WebSite + SearchAction JSON-LD (Google sitelinks search box) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'Mahalaxmi Fashion Hub',
              url: SITE_URL,
              potentialAction: {
                '@type': 'SearchAction',
                target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/products?q={search_term_string}` },
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />

        {/* Organization JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Mahalaxmi Fashion Hub',
              url: SITE_URL,
              logo: `${SITE_URL}/icon-512.png`,
              sameAs: [
                'https://www.instagram.com/mahalaxmifashionhub.blt/',
                'https://www.facebook.com/mahalaxmifashionhub.blt/',
              ],
              contactPoint: {
                '@type': 'ContactPoint',
                telephone: '+919429429880',
                contactType: 'customer service',
                areaServed: 'IN',
                availableLanguage: ['Hindi', 'English'],
              },
            }),
          }}
        />
      </head>
      <body>
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
