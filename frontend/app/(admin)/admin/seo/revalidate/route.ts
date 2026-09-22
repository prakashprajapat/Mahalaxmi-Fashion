import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';

// Saving an article should put it on the website, not queue it for up to a
// minute. The admin screens call this straight after a successful save.
//
// It only drops caches, so the worst a misuse can do is make the next few page
// renders fetch fresh data. It still checks the caller is an admin, because
// there is no reason for it to be an open switch.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const check = await fetch(`${API_BASE}/settings/admin`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!check.ok) return NextResponse.json({ success: false }, { status: 403 });
  } catch {
    return NextResponse.json({ success: false, message: 'The API did not answer.' }, { status: 502 });
  }

  revalidateTag('seo-content');
  for (const p of ['/', '/blog', '/collections', '/sitemap.xml', '/women', '/men', '/kids', '/beauty', '/fabrics']) {
    revalidatePath(p);
  }
  // Every article and every collection page, whatever their slugs.
  revalidatePath('/blog/[slug]', 'page');
  revalidatePath('/collections/[slug]', 'page');

  return NextResponse.json({ success: true });
}
