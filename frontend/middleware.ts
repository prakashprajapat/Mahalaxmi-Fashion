import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase();
  const isMainDomain =
    host === 'mahalaxmifashionhub.com' || host === 'www.mahalaxmifashionhub.com';

  const { pathname } = request.nextUrl;

  // ── Affiliate portal: only on the affiliate.* subdomain ─────────────────────
  // If someone opens /influencer on the main domain, send them to the subdomain.
  if (isMainDomain && pathname.startsWith('/influencer')) {
    return NextResponse.redirect('https://affiliate.mahalaxmifashionhub.com/', 307);
  }

  // ── Direct product-image opens get a branded page with a Home button ────────
  // When a person opens a raw product image URL in the browser (e.g. from Google
  // Images or a shared link), show /image-view (image + Home/Shop buttons) so they
  // can reach the store. We ONLY do this for real top-level navigations
  // (sec-fetch-dest=document). Loads inside <img>, the product feed, OG crawlers
  // and Googlebot send a different (or no) sec-fetch-dest, so the RAW image is
  // served untouched — nothing on the site breaks.
  if (pathname.startsWith('/product-images/')) {
    const dest = request.headers.get('sec-fetch-dest');
    const mode = request.headers.get('sec-fetch-mode');
    if (dest === 'document' && mode === 'navigate') {
      const url = request.nextUrl.clone();
      url.pathname = '/image-view';
      url.search = `?src=${encodeURIComponent(pathname)}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/influencer', '/influencer/:path*', '/product-images/:path*'],
};
