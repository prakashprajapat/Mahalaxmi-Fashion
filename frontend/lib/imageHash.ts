// ── Perceptual image hashing (average-hash) ──────────────────────────────────
// Detects duplicate product photos by their ACTUAL PIXELS, not filenames — so a
// re-uploaded / re-encoded copy of the same image is still caught. An 8×8
// grayscale "average hash" is computed; two images with a small Hamming distance
// are considered the same photo.
//
// Existing product image hashes are cached in localStorage keyed by URL, so the
// expensive image-load happens only once per image across QC runs.

const CACHE_KEY = 'mfh_img_ahash_v1';

function loadCache(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
}
function saveCache(c: Record<string, string>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota — ignore */ }
}

// Draw an image element to an 8×8 canvas and return a 64-char binary aHash.
function hashFromImage(img: HTMLImageElement): string {
  const size = 8;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, size, size).data; } catch { return ''; } // tainted canvas
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
  return gray.map(g => (g >= avg ? '1' : '0')).join('');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load failed'));
    img.src = src;
  });
}

/** aHash for a base64 data URL (a freshly-selected image in the form). */
export async function hashDataUrl(dataUrl: string): Promise<string> {
  try { return hashFromImage(await loadImage(dataUrl)); } catch { return ''; }
}

/** aHash for a stored image URL, cached in localStorage. */
export async function hashUrl(url: string): Promise<string> {
  if (!url) return '';
  const cache = loadCache();
  if (cache[url]) return cache[url];
  try {
    const h = hashFromImage(await loadImage(url));
    if (h) { cache[url] = h; saveCache(cache); }
    return h;
  } catch { return ''; }
}

/** Number of differing bits between two equal-length binary hashes. */
export function hammingDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 999;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

// ≤ this many differing bits (out of 64) → treated as the same photo.
export const DUP_THRESHOLD = 5;
