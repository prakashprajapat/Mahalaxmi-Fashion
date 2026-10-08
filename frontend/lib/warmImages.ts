'use client';
import { productImageSrc } from '@/lib/productImages';

// Ask the server to resize a product's photos now, so the first shopper does
// not have to wait while it happens.
//
// The optimiser builds each size the first time somebody asks for it: open the
// original, resize, encode WebP. On this VPS that is a few hundred
// milliseconds per size, and the product page asks for the biggest one. Until
// it arrives the page shows the blurred 64px stand-in, which is what "photo
// blur dikh rahi hai" is.
//
// deploy.sh warms the whole catalogue, but only at deploy time - a product
// uploaded afterwards is cold until the next one. This closes that gap by
// paying the cost HERE, in the shop owner's browser, straight after he saves.
// The cache it fills is the server's, so it does not matter whose browser
// asked: by the time a customer opens the product, the sizes exist.

// The widths next.config.js allows (deviceSizes), and the quality next/image
// requests by default. These have to match what the browser will ask for
// exactly, or a different cache entry is filled and the warming does nothing.
const WIDTHS = [384, 640, 828, 1080];
const QUALITY = 75;

/** Two at a time: this runs on the live server, next to real shoppers. */
const LANES = 2;

export function warmProductImages(paths: (string | null | undefined)[]): void {
  if (typeof window === 'undefined') return;

  const seen = new Set<string>();
  const jobs: string[] = [];

  paths.forEach(p => {
    // Through the same function the storefront uses, so the URL - and
    // therefore the cache key - is the one it will later ask for.
    const src = productImageSrc((p ?? '').trim());
    if (!src || seen.has(src)) return;
    seen.add(src);
    // The file itself, first - this is the one the customer waits on.
    //
    // The product page stopped sending its main photo through the optimiser
    // (ProductDetail.tsx, `unoptimized`), so the URL it now asks for is the
    // plain .webp. Warming only the /_next/image forms left that one cold,
    // which is why the blur outlived two fixes aimed at it.
    //
    // Measured on the live site, same 50KB photo, three times over:
    //   Cloudflare MISS  1393ms
    //   Cloudflare HIT    394ms
    //   Cloudflare HIT    390ms
    // Nothing is wrong with the file or the server. The whole delay is the
    // first request for a photo the edge has not seen, and that is a thing
    // that can be spent here instead of on a customer.
    jobs.push(src);
    WIDTHS.forEach(w => jobs.push(`/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${QUALITY}`));
  });

  if (jobs.length === 0) return;

  let next = 0;
  const pump = (): void => {
    const i = next++;
    if (i >= jobs.length) return;
    // Accept matches what an <img> sends. Next negotiates the output format
    // on this header and keys its cache on the result, so a warm sent with
    // the default */* can fill an entry the browser never asks for - the
    // exact mistake the deploy-time warming made with its URL.
    fetch(jobs[i], { headers: { Accept: 'image/webp,image/avif,*/*' } })
      .catch(() => {})
      .then(pump);
  };
  for (let i = 0; i < LANES; i++) pump();
}
