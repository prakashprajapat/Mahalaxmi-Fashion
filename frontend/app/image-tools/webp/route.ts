import { NextResponse, type NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { createRequire } from 'module';
import path from 'path';

// Photo ko sach me WebP banane ki ek hi jagah — server.
//
// Browser me yeh har jagah nahi ho pata: Safari canvas se WebP likh hi nahi
// sakta, isliye phone se chadhi photo JPEG hi rehti thi. Server par sharp
// pehle se maujood hai (frontend ki apni dependency, deploy bhi har baar
// "sharp already present" kehta hai), aur wahan browser ka koi sawal nahi.
//
// Yeh raasta /api ke neeche NAHI hai: /api/* ka poora traffic next.config se
// .NET backend ko chala jata hai, to wahan rakhi hui koi bhi Next route kabhi
// chalti hi nahi.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// sharp ko upar se import nahi karte. Jis machine par ye code likha gaya hai
// wahan wo install nahi hai, aur TypeScript build wahin ruk jata. Server par wo
// maujood hai (frontend ki apni dependency), isliye chalte waqt maangte hain.
// Jo hissa yahan kaam aata hai utna hi neeche likha hai — poora type nahi.
interface SharpPipeline {
  rotate(): SharpPipeline;
  resize(opts: Record<string, unknown>): SharpPipeline;
  webp(opts: Record<string, unknown>): SharpPipeline;
  toBuffer(opts: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>;
}
type SharpFactory = (input: Buffer, opts?: Record<string, unknown>) => SharpPipeline;

const DIR      = path.resolve(process.cwd(), 'public/product-images');
const API      = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
const MAX_EDGE = 1200;
const QUALITY  = 80;

// Yeh raasta disk par file likhta hai, isliye khula nahi chhoda ja sakta.
// Token ki jaanch wahin hoti hai jahan hoti aayi hai — backend par; yahan sirf
// uska jawab padha jata hai.
async function isAdmin(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization');
  if (!auth) return false;
  try {
    const r = await fetch(`${API}/auth/me`, { headers: { Authorization: auth }, cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json() as { role?: string };
    return j?.role === 'admin' || j?.role === 'staff';
  } catch { return false; }
}

/** /product-images/x.webp → "x.webp", aur kuch bhi ho to null. */
function safeName(value: string): string | null {
  const marker = '/product-images/';
  const i = value.indexOf(marker);
  if (i < 0) return null;
  let name = value.slice(i + marker.length);
  const q = name.indexOf('?');
  if (q >= 0) name = name.slice(0, q);
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) return null;
  return name;
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req)))
    return NextResponse.json({ success: false, message: 'Admin login required.' }, { status: 401 });

  let sharp: SharpFactory;
  try {
    const nodeRequire = createRequire(path.join(process.cwd(), 'package.json'));
    const mod = nodeRequire('sharp') as SharpFactory & { default?: SharpFactory };
    sharp = mod.default ?? mod;
  } catch {
    return NextResponse.json({ success: false, message: 'Image tools are not installed on this server.' }, { status: 501 });
  }

  const body = await req.json().catch(() => null) as { image?: string } | null;
  const raw = (body?.image ?? '').trim();
  if (!raw) return NextResponse.json({ success: false, message: 'No image given.' }, { status: 400 });

  let input: Buffer;
  const dataUrl = /^data:image\/[\w+.-]+;base64,(.+)$/i.exec(raw);
  try {
    if (dataUrl) {
      input = Buffer.from(dataUrl[1], 'base64');
    } else {
      const name = safeName(raw);
      if (!name)
        return NextResponse.json({ success: false, message: 'Only photos already uploaded here can be compressed.' }, { status: 400 });
      input = await fs.readFile(path.join(DIR, name));
    }
  } catch {
    return NextResponse.json({ success: false, message: 'Could not read that photo.' }, { status: 400 });
  }

  if (input.length > 25 * 1024 * 1024)
    return NextResponse.json({ success: false, message: 'That photo is too large.' }, { status: 413 });

  try {
    // rotate() bina kisi tark ke: phone ki photo me ghumav EXIF me likha hota
    // hai aur WebP use nahi rakhta, to woh yahin laga dena padta hai — warna
    // seedhi khadi photo site par leti hui dikhti.
    const { data, info } = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer({ resolveWithObject: true });

    await fs.mkdir(DIR, { recursive: true });
    const fileName = `webp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    await fs.writeFile(path.join(DIR, fileName), data);

    // Purani file jaan-boojh kar nahi mitai jati: wahi pata kisi aur product,
    // kisi purane order ya Google ke feed me bhi ho sakta hai.
    return NextResponse.json({
      success: true,
      path: `/product-images/${fileName}`,
      origKB: Math.round(input.length / 1024),
      outKB: Math.round(data.length / 1024),
      width: info.width,
      height: info.height,
    });
  } catch {
    return NextResponse.json({ success: false, message: 'Could not convert that photo.' }, { status: 500 });
  }
}
