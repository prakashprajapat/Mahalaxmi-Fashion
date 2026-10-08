// ── Product QC gate ──────────────────────────────────────────────────────────
// Catalogue upload se PEHLE quality checks. Koi bhi FAIL ho to product save nahi
// hoga — sirf saaf catalogue hi live jayega. Warnings block nahi karti (sirf
// aagah karti hain).

import { hashDataUrl, hashUrl, hashUrls, hammingDistance, DUP_THRESHOLD } from './imageHash';

export interface QcInput {
  name: string;
  description: string;
  price: number;
  sku?: string;
  photos: string[];        // saari gallery/pack photos (data URLs ya server URLs)
  category?: string;
}

export interface QcIssue {
  level: 'fail' | 'warn';
  message: string;
}

// Existing products (name + photo signature) — duplicate detection ke liye.
export interface ExistingProduct {
  id?: number;
  name: string;
  image?: string;
  extraJson?: string;
}

// Ek existing product ke SAARE image URLs/dataURLs nikaalo (main image +
// extraJson me gallery/pack photos) — deep duplicate check ke liye.
function existingImages(e: ExistingProduct): string[] {
  const out: string[] = [];
  if (e.image) out.push(e.image);
  try {
    const ex = e.extraJson ? JSON.parse(e.extraJson) : null;
    (ex?.images ?? []).forEach((im: string) => { if (im) out.push(im); });
    if (ex?.productPhotos && typeof ex.productPhotos === 'object')
      Object.values(ex.productPhotos).forEach((im: unknown) => { if (typeof im === 'string' && im) out.push(im); });
    (ex?.packImages ?? []).forEach((pk: Record<string, string>) =>
      ['front', 'side', 'back', 'zoomed'].forEach(k => { if (pk?.[k]) out.push(pk[k]); }));
  } catch { /* malformed extraJson — ignore */ }
  return out;
}

export function runProductQC(input: QcInput, existing: ExistingProduct[] = []): QcIssue[] {
  const issues: QcIssue[] = [];
  const name = (input.name || '').trim();
  const desc = (input.description || '').trim();
  const photos = (input.photos || []).map(p => (p || '').trim()).filter(Boolean);

  // 1. Name
  if (!name) issues.push({ level: 'fail', message: 'Product name is required.' });
  else if (name.length < 10) issues.push({ level: 'fail', message: `Product name too short (${name.length} chars) — use a descriptive name of at least 10 characters for good SEO.` });

  // 2. Duplicate name (vs other saved products, case-insensitive)
  const dupName = existing.find(e => (e.name || '').trim().toLowerCase() === name.toLowerCase());
  if (name && dupName) issues.push({ level: 'fail', message: `Duplicate name — a product called "${dupName.name}" already exists. Give this one a unique name.` });

  // 3. Description
  if (!desc) issues.push({ level: 'fail', message: 'Product description is missing. Add a clear description (helps SEO and customers).' });
  else if (desc.length < 30) issues.push({ level: 'fail', message: `Description too short (${desc.length} chars) — write at least 30 characters.` });

  // 4. Price
  if (!input.price || input.price <= 0) issues.push({ level: 'fail', message: 'Price must be greater than 0.' });

  // 5. At least one photo
  if (photos.length === 0) issues.push({ level: 'fail', message: 'At least one product photo is required.' });

  // NOTE: Duplicate-photo detection ab yahan filename se NAHI hoti — vo unreliable
  // thi (har upload pe naya AVIF filename banta hai). Asli PIXEL-level deep check
  // deepImageDuplicateCheck() me hai (neeche), jise handleSave await karta hai.

  return issues;
}

// ── Deep image duplicate check (PIXEL-level, async) ──────────────────────────
// Har photo ka perceptual hash (aHash) nikaalta hai aur:
//   (a) is product ki apni photos aapas me same to nahi,
//   (b) kisi bhi PEHLE se uploaded product ki photo se same to nahi —
// filename badalne / dobara-encode hone par bhi duplicate pakda jaata hai.
export async function deepImageDuplicateCheck(
  candidatePhotos: string[],
  existing: ExistingProduct[] = [],
): Promise<QcIssue[]> {
  const issues: QcIssue[] = [];
  const photos = (candidatePhotos || []).map(p => (p || '').trim()).filter(Boolean);
  if (photos.length === 0) return issues;

  const hashOf = (src: string) => (src.startsWith('data:') ? hashDataUrl(src) : hashUrl(src));

  // Candidate photos ke hashes.
  const candHashes: string[] = [];
  for (const p of photos) {
    const h = await hashOf(p);
    if (h) candHashes.push(h);
  }

  // (a) Within-product duplicates.
  let internalDup = false;
  for (let i = 0; i < candHashes.length && !internalDup; i++)
    for (let j = i + 1; j < candHashes.length; j++)
      if (hammingDistance(candHashes[i], candHashes[j]) <= DUP_THRESHOLD) { internalDup = true; break; }
  if (internalDup)
    issues.push({ level: 'warn', message: 'This photo appears to be repeated — the same image may be used in two slots of this product. Please verify they are different (this is only a warning — you can override if needed).' });

  // (b) Kisi aur product ki photo se match.
  //
  // Pehle yeh har product ki har photo ko ek-ek karke utarta aur hash karta tha.
  // 140 product yani chaar sau se zyada photo, ek ke baad ek — aur jab photo
  // nayi hoti hai (yani hamesha, kyunki duplicate virla hota hai) to poori
  // soochi aakhir tak chalti thi. Phone par save dabane ke baad minton tak
  // "Adding…" khada rehta tha.
  //
  // Ab saare pate ek saath bhejte hain: jo pehle se cache me hain turant milte
  // hain, baaki saath-saath utarte hain.
  const owner = new Map<string, string>();
  for (const e of existing)
    for (const url of existingImages(e))
      if (url && !owner.has(url)) owner.set(url, e.name || 'another product');

  let matchedName = '';
  const existingHashes = await hashUrls([...owner.keys()]);
  outer:
  for (const [url, eh] of existingHashes) {
    for (const ch of candHashes) {
      if (hammingDistance(ch, eh) <= DUP_THRESHOLD) {
        matchedName = owner.get(url) || 'another product';
        break outer;
      }
    }
  }
  if (matchedName)
    issues.push({ level: 'warn', message: `This photo looks similar to "${matchedName}" — if this is a different product, ignore this and override (this is only a warning, not a block).` });

  return issues;
}

// ── Draft me kyun ruka — soochi me dikhane ke liye ───────────────────────────
//
// Products ki soochi me ab tak sirf "open it to see what Google is missing"
// likha tha. Jawab product ke panne par hai, panne ke sabse upar, aur Save ka
// batan sabse neeche - to kholne par bhi wo parde se bahar rehta tha.
//
// Yahi jaanch wahi hai jo save ke waqt chalti hai, isliye dono jagah ek hi
// jawab aata hai. Duplicate-name wali jaanch yahan bhi nahi chalti, bilkul
// edit screen ki tarah: wo saare products scan karti hai aur soochi me har
// row par chalana bhaari pad jata.
import { colourProblem } from './googleColours';
import { allSlotPhotos } from './photoExtras';

interface Draftish {
  name?: string; description?: string; price?: number;
  image?: string; extraJson?: string;
}

function photosOfProduct(p: Draftish): string[] {
  const out: string[] = [];
  if (p.image) out.push(p.image);
  try {
    const ex = p.extraJson ? JSON.parse(p.extraJson) : null;
    if (!ex) return out;
    (ex.images ?? []).forEach((im: unknown) => { if (typeof im === 'string' && im) out.push(im); });
    allSlotPhotos(ex.productPhotos).forEach(im => out.push(im));
    (ex.packImages ?? ex.packColumnPhotos ?? ex.variantColumns ?? []).forEach((col: unknown) => {
      if (typeof col === 'string') out.push(col);
      else allSlotPhotos(col as Record<string, unknown>).forEach(im => out.push(im));
    });
    (ex.customColors ?? []).forEach((c: { photo?: string }) => { if (c?.photo) out.push(c.photo); });
  } catch { /* malformed extraJson — ignore */ }
  return out;
}

function coloursOfProduct(extraJson?: string): string[] {
  try {
    const ex = extraJson ? JSON.parse(extraJson) : null;
    if (!ex) return [];
    return [...new Set([
      ...((ex.colors ?? []) as string[]),
      ...((ex.customColors ?? []) as { name?: string }[]).map(c => c?.name ?? ''),
    ])].filter(Boolean);
  } catch { return []; }
}

/** Product Draft me kyun roka gaya — wahi wajahen jo save ke waqt nikalti hain. */
export function draftHoldReasons(p: Draftish): string[] {
  const reasons = runProductQC({
    name: p.name ?? '',
    description: p.description ?? '',
    price: Number(p.price) || 0,
    photos: photosOfProduct(p),
  }, []).filter(i => i.level === 'fail').map(i => i.message);

  for (const c of coloursOfProduct(p.extraJson)) {
    const problem = colourProblem(c);
    if (problem) reasons.push(`Colour "${c}" — ${problem}`);
  }
  return reasons;
}
