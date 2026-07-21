// ── Perceptual image hashing (difference-hash / dHash) ───────────────────────
// Detects duplicate product photos by their ACTUAL PIXELS, not filenames — so a
// re-uploaded / re-encoded copy of the same image is still caught.
//
// We use a 16×16 dHash (256-bit) instead of a coarse 8×8 average-hash. dHash
// compares each pixel to its right neighbour (a horizontal gradient), which
// captures edges & structure — so two DIFFERENT products that merely share the
// same brand banner / layout no longer collide (the old 8×8 aHash false-flagged
// them as duplicates). Two images with a small Hamming distance = the same photo.
//
// Existing image hashes are cached in localStorage keyed by URL (cache key bumped
// to v2 because the algorithm changed — old 64-bit hashes must not be reused).

const CACHE_KEY = 'mfh_img_dhash_v2';

function loadCache(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
}
function saveCache(c: Record<string, string>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota — ignore */ }
}

// Draw an image to a (size+1)×size canvas and return a size*size-bit dHash string.
function hashFromImage(img: HTMLImageElement): string {
  const size = 16;            // 16×16 → 256-bit hash (4× the detail of the old 8×8)
  const w = size + 1;         // dHash needs one extra column for the right-neighbour compare
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';
  ctx.drawImage(img, 0, 0, w, size);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, w, size).data; } catch { return ''; } // tainted canvas
  // Grayscale grid.
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  // Difference hash: each pixel vs the one to its right.
  let bits = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left  = gray[y * w + x];
      const right = gray[y * w + x + 1];
      bits += left > right ? '1' : '0';
    }
  }
  return bits; // 256 chars
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

/** dHash for a base64 data URL (a freshly-selected image in the form). */
export async function hashDataUrl(dataUrl: string): Promise<string> {
  try { return hashFromImage(await loadImage(dataUrl)); } catch { return ''; }
}

/** dHash for a stored image URL, cached in localStorage. */
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

// ≤ this many differing bits (out of 256) → treated as the SAME photo.
// A re-encoded copy of the same image scores ~0-8; two genuinely different
// products (even same brand/layout) score well above 25, so 12 is a safe cut-off
// that catches real re-uploads without false-flagging different products.
export const DUP_THRESHOLD = 12;
