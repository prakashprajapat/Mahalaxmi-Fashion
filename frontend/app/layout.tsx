import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { settingsApi } from '@/lib/api';
import PWARegister from '@/components/pwa/PWARegister';
import { SHOP } from '@/lib/shopFacts';
import { OWNER, FOUNDED_YEAR } from '@/lib/owner';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#722f37',
};

const SITE_URL = 'https://www.mahalaxmifashionhub.com';

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
    // Owner's wording, chosen deliberately: a marketplace-style title in the
    // shape Amazon and Flipkart use, so the shop reads as a general store
    // rather than a nighty specialist. Balotra has come out of it — the town
    // still carries the local signal through the Google Business Profile, the
    // footer address and the Balotra landing page, but the shop sells
    // pan-India and the title should not read as regional.
    //
    // Two caveats worth remembering before anyone edits this again:
    //  - Saree and Kurti are in the list ahead of the stock. Until those
    //    products exist, shoppers arriving on those terms find nothing and
    //    bounce, which Google reads as a poor result for the whole site.
    //    Remove them, or fill the shelves — do not leave it half-done.
    //  - Google shows roughly the first 60 characters, so everything after
    //    "Women Clothing" is for nobody's eyes but a crawler's. That is fine
    //    as a deliberate choice; it is not a reason to keep extending it.
    || 'Online Shopping for Fashion, Footwear, Perfume, Women Clothing, Ladies Dress, Cotton Nighty, Saree Online, Cotton Saree, Kurti for Women, Women Kurti Set';
  const defaultDesc  = s.seoHomeDescription?.trim()
    // Kept in step with the title above: it leads with what is actually on
    // the shelves — nighties (34), formal shoes (23), perfume (8),
    // innerwear (7), petticoats (6) — and stops short of 160 characters,
    // past which Google cuts the snippet off mid-sentence.
    || 'Shop cotton nighties, petticoats, formal shoes, perfumes & innerwear online at Mahalaxmi Fashion Hub. COD available, free shipping over ₹999, pan-India delivery.';
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
    // YAHAN canonical NAHI.
    //
    // Pehle yahan `alternates: { canonical: '/' }` likha tha. Next har panne me
    // sirf wahi chaabi badalta hai jo us panne ne KHUD likhi ho - baaki jaisi ki
    // waisi utar aati hai. Matlab /contact, /app, /tracking, /cart, /account/...
    // sab apne aap ko mukhya panna bata rahe the. Google aise panne ko alag
    // panna manta hi nahi, use mukhya panne ki nakal maan kar gira deta hai.
    // Mukhya panna apna canonical khud likhta hai, (store)/page.tsx me.
    openGraph: {
      // Yahan sirf wo cheezein jo har panne par EK JAISI hoti hain. title,
      // description aur url pehle yahan likhe the, to har panne ka og:title
      // mukhya panne ka tha - saanjha karne par /women, /products, har policy
      // ka panna ek hi naam aur ek hi link dikhata tha. Hata diye: Next in dono
      // ko panne ke apne title/description se khud bana leta hai.
      type: 'website',
      locale: 'en_IN',
      siteName: 'Mahalaxmi Fashion Hub',
      images: [{ url: ogImage, width: 1200, height: 630, alt: 'Mahalaxmi Fashion Hub — Ethnic Wear for the Entire Family' }],
    },
    twitter: {
      card: 'summary_large_image',
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
  // Meta asks for this tag to prove the domain is yours, before a catalogue or
  // the Conversions API will attach to it. It is a setting rather than a code
  // change so the token can be pasted in Admin → Settings and be live on the
  // next page load — and it is not a secret: it ships in the page either way.
  // It belongs on every page of the domain, admin included, and makes no
  // request — unlike the tags, which moved to SiteTags.
  const fbDomainVerification = s.facebookDomainVerification?.trim();

  return (
    <html lang="en">
      <head>
        {/* Preconnect to external image/asset hosts for faster product images */}
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />

        {/* Logo ka apna preload hata diya gaya.
            Navbar ka logo next/image se aata hai aur uspar priority laga hai, to
            Next khud uske liye preload daal deta hai — par wo /_next/image?url=…
            wala pata hai, /logo.webp?v=5 nahi. Dono alag file hain. Yani hamara
            apna preload har panne par 45 KB utarta tha jo kabhi istemal hi nahi
            hota, aur console me "preloaded but not used" ki chetawni deta tha.
            Home ka hero logo sirf tab dikhta hai jab na video ho na photo — us
            halat me browser use HTML padhte hi utha lega. */}
        {/* Hero heading font (Playfair Display) — loaded NON-render-blocking:
            fetched with media="print" (so it doesn't block first paint), then a tiny
            script flips it to "all". display=swap keeps text visible meanwhile. */}
        {fbDomainVerification && (
          <meta name="facebook-domain-verification" content={fbDomainVerification} />
        )}

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

        {/* GA4, Tag Manager and the Meta Pixel used to sit right here — and
            this layout wraps the admin panel too, so every admin screen fired
            a PageView and loaded Meta's partner script, which is what filled
            the admin console with blocked-by-CSP errors. They moved to
            components/analytics/SiteTags.tsx, rendered only by the pages a
            shopper can see. The consent defaults above stay: Next requires a
            beforeInteractive script to live in the root layout, and they make
            no request of their own. */}

        {/* LocalBusiness JSON-LD */}
        {/* Ek jodi hui entity, teen alag nahi.
            Pehle yahan teen alag-alag JSON-LD the — ClothingStore, WebSite aur
            Organization — teenon ka naam ek, par unke beech koi taar nahi. Jo
            bhi padhta (Google ya koi AI) use teen cheezein dikhti thin jinke
            naam sanyog se ek jaise hain, aur use khud andaza lagana padta tha
            ki ye ek hi dukaan hai.

            Ab @id se teenon ek doosre ko pehchante hain, aur product ka schema
            bhi usi #organization ko ishara karta hai — alag se dobara likhne ke
            bajay. Isi tarah ek "entity" banti hai, jise AI apne jawab me naam
            lekar hawala de sakta hai. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': ['Organization', 'ClothingStore'],
                  '@id': `${SITE_URL}/#organization`,
                  name: 'Mahalaxmi Fashion Hub',
                  alternateName: 'Mahalaxmi Fashion Hub Balotra',
                  url: SITE_URL,
                  logo: { '@type': 'ImageObject', '@id': `${SITE_URL}/#logo`, url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 },
                  image: `${SITE_URL}/hero-bannernew.webp`,
                  description:
                    'Family-run ethnic and fashion wear shop in Balotra, Rajasthan, selling cotton nighties, '
                    + 'sarees, petticoats, innerwear, footwear and perfume online across India with Cash on Delivery.',
                  slogan: 'Every look, a new experience',
                  // Kab se, aur kaun. Ye wahi do baatein hain jinse Google aur
                  // AI ek website ko ek ASLI dukaan maante hain.
                  foundingDate: String(FOUNDED_YEAR),
                  founder: { '@type': 'Person', name: OWNER.name },
                  foundingLocation: { '@type': 'Place', name: `${SHOP.city}, ${SHOP.state}, India` },
                  telephone: SHOP.phoneE164,
                  email: 'mahalaxmifashionhub@gmail.com',
                  address: {
                    '@type': 'PostalAddress',
                    streetAddress: SHOP.street,
                    addressLocality: SHOP.city,
                    addressRegion: SHOP.state,
                    postalCode: SHOP.pincode,
                    addressCountry: SHOP.country,
                  },
                  geo: { '@type': 'GeoCoordinates', latitude: 25.8333, longitude: 72.2333 },
                  // Google looks for hasMap on a local business. Pointed at the
                  // postal address rather than a Place ID, because the shop has no
                  // Google Business Profile yet; swap in the real Maps link the day
                  // it does, and correct the coordinates above at the same time —
                  // 25.8333, 72.2333 is the centre of Balotra, not the shop.
                  hasMap: 'https://www.google.com/maps/search/?api=1&query='
                    + encodeURIComponent(`${SHOP.street}, ${SHOP.city}, ${SHOP.state} ${SHOP.pincode}`),
                  openingHoursSpecification: [
                    {
                      '@type': 'OpeningHoursSpecification',
                      dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
                      opens: '10:00',
                      closes: '20:00',
                    },
                  ],
                  // Jo bhi channel site khud link karti hai wo yahan hona chahiye —
                  // yahi wo taar hain jinse Google aur AI ek naam ko ek asli
                  // dukaan se jodte hain. YouTube footer me tha par yahan nahi.
                  sameAs: [
                    'https://www.instagram.com/mahalaxmifashionhub.blt/',
                    'https://www.facebook.com/mahalaxmifashionhub.blt/',
                    'https://www.youtube.com/@Mahalaxmifashionhub',
                  ],
                  areaServed: { '@type': 'Country', name: 'India' },
                  knowsAbout: [
                    'cotton nighty', 'nighty for women', 'saree', 'cotton saree', 'petticoat',
                    'womens innerwear', 'kurti', 'ethnic wear', 'formal shoes', 'perfume',
                  ],
                  priceRange: '₹₹',
                  currenciesAccepted: 'INR',
                  paymentAccepted: 'Cash on Delivery, UPI, Credit Card, Debit Card, Net Banking',
                  contactPoint: {
                    '@type': 'ContactPoint',
                    telephone: SHOP.phoneE164,
                    contactType: 'customer service',
                    areaServed: 'IN',
                    availableLanguage: ['Hindi', 'English'],
                    hoursAvailable: {
                      '@type': 'OpeningHoursSpecification',
                      dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
                      opens: '10:00',
                      closes: '20:00',
                    },
                  },
                },
                {
                  '@type': 'Brand',
                  '@id': `${SITE_URL}/#brand`,
                  name: 'Mahalaxmi Fashion Hub',
                  logo: `${SITE_URL}/icon-512.png`,
                },
                {
                  '@type': 'WebSite',
                  '@id': `${SITE_URL}/#website`,
                  name: 'Mahalaxmi Fashion Hub',
                  url: SITE_URL,
                  inLanguage: 'en-IN',
                  publisher: { '@id': `${SITE_URL}/#organization` },
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/products?q={search_term_string}` },
                    'query-input': 'required name=search_term_string',
                  },
                },
              ],
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
