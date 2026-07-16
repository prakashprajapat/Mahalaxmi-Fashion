// ── Product QC gate ──────────────────────────────────────────────────────────
// Catalogue upload se PEHLE quality checks. Koi bhi FAIL ho to product save nahi
// hoga — sirf saaf catalogue hi live jayega. Warnings block nahi karti (sirf
// aagah karti hain).

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

// Photo ka "signature" — base64 data URL me content ka pehla+aakhri hissa
// (poora string bahut lamba hota hai). Server URL ho to file ka basename.
function photoSig(src: string): string {
  const s = (src || '').trim();
  if (!s) return '';
  if (s.startsWith('data:')) {
    const body = s.slice(s.indexOf(',') + 1);
    return body.length > 120 ? body.slice(0, 60) + body.slice(-60) : body;
  }
  return s.split('/').pop()!.split('?')[0].toLowerCase();
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

  // 6. Duplicate photos WITHIN this product
  const sigs = photos.map(photoSig);
  const seen = new Set<string>();
  let internalDup = false;
  for (const sig of sigs) {
    if (sig && seen.has(sig)) internalDup = true;
    seen.add(sig);
  }
  if (internalDup) issues.push({ level: 'fail', message: 'Duplicate photos — the same image is used more than once in this product. Remove the repeats.' });

  // 7. Photo already used by ANOTHER product (reused catalogue image)
  const existingSigs = new Set<string>();
  for (const e of existing) {
    if (e.image) existingSigs.add(photoSig(e.image));
    try {
      const ex = e.extraJson ? JSON.parse(e.extraJson) : null;
      (ex?.images ?? []).forEach((im: string) => existingSigs.add(photoSig(im)));
    } catch { /* ignore malformed */ }
  }
  const reused = sigs.find(s => s && existingSigs.has(s));
  if (reused) issues.push({ level: 'warn', message: 'A photo here looks identical to one already used on another product. Make sure this is intentional.' });

  return issues;
}
