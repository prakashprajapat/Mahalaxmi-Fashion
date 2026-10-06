import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

// Bringing a supplier's photo onto your own server.
//
// The import screen cannot download the photos itself. The site's Content
// Security Policy only lets the page talk to a short list of hosts, and a
// supplier's CDN is not on it — which is deliberate and worth keeping. So the
// browser asks this route, the server fetches the photo, and the photo comes
// back as a data URL. From there the existing product save already knows what
// to do: it writes any data URL to /product-images and stores the path.
//
// Why bother, when the feed already has a perfectly good URL? Because a photo
// that lives on somebody else's CDN stops being yours the day they tidy up,
// change their theme or notice the traffic. Your product page then shows a
// broken square, and you find out from a customer. The photos that sell your
// goods belong on your disk.
//
// A route that fetches a URL on command is also a way into a private network —
// ask it for 169.254.169.254 and it reads the server's own cloud credentials.
// Hence the checks below: an admin token, https only, no private addresses, an
// image content type, and a size cap. None of them is optional.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

/** Loopback, link-local, and the three private ranges — anything not on the open internet. */
function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;                 // cloud metadata lives here
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;       // carrier-grade NAT
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true;
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true;   // unique local
  if (v6.startsWith('fe80')) return true;                        // link local
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return false;
}

/** The caller must be able to do what an import does: add products. */
async function callerMayImport(token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const r = await fetch(`${API}/products/next-sku`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;
  if (!(await callerMayImport(token)))
    return NextResponse.json({ success: false, message: 'Not allowed.' }, { status: 401 });

  let target = '';
  try {
    const body = await req.json();
    target = String(body?.url ?? '').trim();
  } catch {
    return NextResponse.json({ success: false, message: 'Send { url }.' }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return NextResponse.json({ success: false, message: 'That is not a web address.' }, { status: 400 });
  }
  if (url.protocol !== 'https:')
    return NextResponse.json({ success: false, message: 'Only https photo links can be brought across.' }, { status: 400 });

  try {
    const { address } = await lookup(url.hostname);
    if (isPrivateAddress(address))
      return NextResponse.json({ success: false, message: 'That address is not on the public internet.' }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: 'That address could not be found.' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      // A redirect is how an open fetch ends up somewhere private after the
      // address check has already passed.
      redirect: 'follow',
      headers: { 'User-Agent': 'MahalaxmiFashionHub-Import/1.0' },
      cache: 'no-store',
    });
    clearTimeout(timer);

    if (!res.ok)
      return NextResponse.json({ success: false, message: `The supplier's server answered ${res.status}.` }, { status: 502 });

    const finalHost = new URL(res.url || url.toString()).hostname;
    if (finalHost !== url.hostname) {
      const { address } = await lookup(finalHost);
      if (isPrivateAddress(address))
        return NextResponse.json({ success: false, message: 'That link redirects somewhere private.' }, { status: 400 });
    }

    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/'))
      return NextResponse.json({ success: false, message: `That link is not a photo (${type || 'unknown type'}).` }, { status: 400 });

    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_BYTES)
      return NextResponse.json({ success: false, message: 'That photo is larger than 8 MB.' }, { status: 413 });

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES)
      return NextResponse.json({ success: false, message: 'That photo is larger than 8 MB.' }, { status: 413 });

    return NextResponse.json({
      success: true,
      dataUrl: `data:${type};base64,${buf.toString('base64')}`,
      bytes: buf.byteLength,
    });
  } catch {
    return NextResponse.json({ success: false, message: 'The photo could not be fetched.' }, { status: 502 });
  }
}
