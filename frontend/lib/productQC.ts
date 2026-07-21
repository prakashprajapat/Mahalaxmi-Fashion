// ── Product QC gate ──────────────────────────────────────────────────────────
// Catalogue upload se PEHLE quality checks. Koi bhi FAIL ho to product save nahi
// hoga — sirf saaf catalogue hi live jayega. Warnings block nahi karti (sirf
// aagah karti hain).

import { hashDataUrl, hashUrl, hammingDistance, DUP_THRESHOLD } from './imageHash';

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
    issues.push({ level: 'warn', message: 'Photo repeat lag rahi hai — is product me do slots me same image ho sakti hai. Alag na ho to check kar lo (warning — chaho to override kar sakte ho).' });

  // (b) Kisi aur product ki photo se match.
  let matchedName = '';
  outer:
  for (const e of existing) {
    for (const url of existingImages(e)) {
      const eh = await hashOf(url);
      if (!eh) continue;
      for (const ch of candHashes) {
        if (hammingDistance(ch, eh) <= DUP_THRESHOLD) { matchedName = e.name || 'another product'; break outer; }
      }
    }
  }
  if (matchedName)
    issues.push({ level: 'warn', message: `Ye photo "${matchedName}" jaisi dikh rahi hai — agar ye alag product hai to ignore karo aur override kar do (ye sirf warning hai, block nahi).` });

  return issues;
}
