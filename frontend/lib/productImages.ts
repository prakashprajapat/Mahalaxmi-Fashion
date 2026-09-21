export function productImageSrc(src?: string | null): string {
  const value = src?.trim();
  if (!value) return '';
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  return value.startsWith('/') ? value : `/${value.replace(/^\.?\//, '')}`;
}

// The blurred backdrop behind an odd-shaped photo is blurred 18px and scaled up,
// so detail in it is invisible by construction. Asking Next's optimiser for a
// 64px copy costs about a kilobyte instead of re-downloading the full photo a
// second time — which is what a plain background-image url does.
export function productImageThumb(src: string, w = 64, q = 40): string {
  if (!src || /^(data:|blob:)/i.test(src)) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;
}
