import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#a7354d',
};

const SITE_URL = 'https://mahalaxmifashionhub.com';
const GA4_ID   = process.env.NEXT_PUBLIC_GA4_ID ?? 'G-SFMFYD4NE6';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Mahalaxmi Fashion Hub',
    template: '%s | Mahalaxmi Fashion Hub',
  },
  description: 'Premium Indian Fashion — Sarees, Nighty, Petticoat & More. Shop ethnic wear online from Balotra, Rajasthan.',
  keywords: 'saree, nighty, petticoat, indian fashion, women clothing, ethnic wear, balotra, rajasthan',
  authors: [{ name: 'Mahalaxmi Fashion Hub' }],
  creator: 'Mahalaxmi Fashion Hub',
  publisher: 'Mahalaxmi Fashion Hub',

  // ── Canonical ──────────────────────────────────────────────────────────────
  alternates: {
    canonical: '/',
  },

  // ── Open Graph ─────────────────────────────────────────────────────────────
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: SITE_URL,
    siteName: 'Mahalaxmi Fashion Hub',
    title: 'Mahalaxmi Fashion Hub — Every Look, A New Experience',
    description: 'Premium Indian Fashion — Sarees, Nighty, Petticoat & More. Shop ethnic wear online from Balotra, Rajasthan.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Mahalaxmi Fashion Hub — Ethnic Wear for the Entire Family',
      },
    ],
  },

  // ── Twitter / X Card ───────────────────────────────────────────────────────
  twitter: {
    card: 'summary_large_image',
    title: 'Mahalaxmi Fashion Hub — Every Look, A New Experience',
    description: 'Premium Indian Fashion — Sarees, Nighty, Petticoat & More.',
    images: ['/og-image.jpg'],
  },

  // ── PWA / Install to Home Screen ─────────────────────────────────────────────
  applicationName: 'Mahalaxmi Fashion Hub',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mahalaxmi',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },

  // ── Favicon / Icons ──────────────────────────────────────────────────────────
  icons: {
    icon: [
      { url: '/favicon.ico?v=7', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
      { url: '/favicon-32.png?v=7', type: 'image/png', sizes: '32x32' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon.ico?v=7',
  },

  // ── Robots ─────────────────────────────────────────────────────────────────
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to external image/asset hosts for faster product images */}
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />

        {/* Google Analytics 4 — set NEXT_PUBLIC_GA4_ID=G-XXXXXXXXXX in your .env */}
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
              image: `${SITE_URL}/hero-banner.webp`,
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
              geo: {
                '@type': 'GeoCoordinates',
                latitude: 25.8333,
                longitude: 72.2333,
              },
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
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
