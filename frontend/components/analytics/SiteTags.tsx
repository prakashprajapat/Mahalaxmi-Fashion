import Script from 'next/script';
import { settingsApi } from '@/lib/api';

const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? 'G-SFMFYD4NE6';

async function getSeoSettings(): Promise<Record<string, string>> {
  try {
    const { settings } = await settingsApi.getAll();
    return settings ?? {};
  } catch {
    return {};
  }
}

// GA4, Tag Manager and the Meta Pixel.
//
// These used to sit in the root layout, which wraps the admin panel as well as
// the shop. So every admin screen fired a PageView: the owner's own work
// counted as shop traffic in GA4 and in Meta, admin URLs leaked into reports
// and audiences, and the partner script Meta attaches to the pixel threw
// dozens of blocked-by-CSP errors into the admin console on every page.
//
// They live here instead, and only the pages a shopper can see render it. It
// stays a server component so the Pixel snippet is still in the HTML the
// browser parses — it must not wait for React, which is what used to leave
// fbq undefined when hydration failed on a product page.
export default async function SiteTags() {
  const s = await getSeoSettings();
  const gtmId = s.gtmId?.trim();
  const fbPixelId = s.facebookPixelId?.trim();

  // The switch that moves tracking into Tag Manager. Recreating these tags
  // inside the container while they also load here would count everything
  // twice, so turning it on stops the direct tags in the same moment.
  const tagsViaGtm = Boolean(gtmId) && ['1', 'true', 'yes', 'on'].includes((s.tagsViaGtm ?? '').trim().toLowerCase());
  const directGa4 = GA4_ID && !tagsViaGtm;
  const directPixel = fbPixelId && !tagsViaGtm;

  return (
    <>
      {/* Google Analytics 4 — load right after the page becomes interactive so
          page_view fires reliably on every visit (lazyOnload was too late and
          missed quick bounces / fast navigations). */}
      {directGa4 && (
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

      {/* Facebook Pixel — admin-configurable (Settings → SEO).
          Silent while tagsViaGtm is on: the container fires it instead.

          Do baat alag-alag hain, aur dono ki wajah naapi gayi hai.

          1. Snippet seedha HTML me likha hai, next/script se nahi. Pehle
             strategy="lazyOnload" thi — matlab React use load ke baad daalta
             hai, to wo chalti hi tab thi jab React zinda bacha ho. Product
             page par hydration girti thi aur Pixel kabhi inject hi nahi
             hota: fbq undefined, na ViewContent, na AddToCart. Ab queue page
             parse hote hi ban jati hai, React ki sehat se bilkul alag.

          2. Lekin fbevents.js ko head ke shuru me nahi thoosa jata. Meta ka
             apna snippet insertBefore(pehli script) karta hai — yani head ke
             sabse aage. App Router me React poore document ko hydrate karta
             hai, isliye head ke aage jud gaya koi bhi node uska pehla expected
             node (meta charset) hata deta hai aur hydration wahin fail ho jati
             hai: yahi #418 x3 aur #329 ki asli jagah thi, naap kar nikali gayi.
             Isliye script ab window load ke baad judti hai — hydration ke baad.
             Kuch nahi chhootta: fbq bina script ke bhi call queue karta hai,
             aur script aate hi poori queue chali jati hai. */}
      {directPixel && (
        <script
          id="fb-pixel"
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v){if(f.fbq)return;var n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];var t=b.createElement(e);t.async=!0;t.src=v;var add=function(){if(!t.parentNode)b.head.appendChild(t)};if(b.readyState==='complete')add();else f.addEventListener('load',add)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${fbPixelId}');fbq('track','PageView');`,
          }}
        />
      )}
    </>
  );
}
