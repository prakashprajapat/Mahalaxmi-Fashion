const path = require('path');
/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
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
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
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
    ];
  },
};

module.exports = nextConfig;
