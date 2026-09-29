// Shrink a photo in the browser before it is uploaded.
//
// A phone camera writes 4-6 MB per shot, and that file was going to the server
// whole: slow to upload on the shop's own connection, slow to hand back out,
// and stored forever at a size no screen will ever use. Resizing here means the
// big file never leaves the phone.
//
// This lives at the ONE place every upload passes through — the four upload
// calls in lib/api.ts — rather than on each screen that has a file box. A
// screen added next year gets it without anyone remembering to add it.
//
// What it will not touch:
//   • anything that is not an image (a return video keeps every frame);
//   • a GIF, because redrawing one to a canvas keeps a single frame and throws
//     the animation away;
//   • an SVG, which has no pixels to resize and only gets bigger this way;
//   • a file that is already small enough to be pointless to redraw.
// And if the result somehow comes out larger, the original is sent instead —
// compression that makes a file bigger is a bug, not a saving.

export interface CompressOptions {
  /** Longest edge, in pixels. Bigger than any place we show a photo. */
  maxEdge?: number;
  /** WebP quality, 0-1. */
  quality?: number;
  /** Below this, leave the file alone. */
  skipBelowBytes?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxEdge: 1600,
  quality: 0.82,
  skipBelowBytes: 220 * 1024,
};

const UNTOUCHED = /^image\/(gif|svg\+xml|avif)$/i;

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxEdge, quality, skipBelowBytes } = { ...DEFAULTS, ...opts };

  if (typeof document === 'undefined') return file;                 // server: nothing to draw on
  if (!file.type.startsWith('image/')) return file;                 // video, pdf, anything else
  if (UNTOUCHED.test(file.type)) return file;
  if (file.size <= skipBelowBytes) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    // Already small enough AND already WebP — redrawing would only lose a
    // little more detail for nothing.
    if (scale === 1 && file.type === 'image/webp') { bitmap.close?.(); return file; }

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close?.(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/webp', quality));
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    // A format this browser cannot decode, a canvas that would be tainted, no
    // memory for the bitmap — upload what we were given rather than failing.
    return file;
  }
}
