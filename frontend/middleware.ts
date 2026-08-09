import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// The creator/affiliate portal should be reachable ONLY via the
// affiliate.mahalaxmifashionhub.com subdomain. If someone opens it through the
// main domain at /influencer, send them to the subdomain instead.
//
// Fail-safe: we only redirect when the Host header is *exactly* the main domain.
// On the affiliate subdomain (or any other/internal host) we never redirect, so
// the portal — which nginx serves internally as /influencer — keeps working.
export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase();
  const isMainDomain =
    host === 'mahalaxmifashionhub.com' || host === 'www.mahalaxmifashionhub.com';

  if (isMainDomain && request.nextUrl.pathname.startsWith('/influencer')) {
    return NextResponse.redirect('https://affiliate.mahalaxmifashionhub.com/', 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/influencer', '/influencer/:path*'],
};
