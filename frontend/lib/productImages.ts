export function productImageSrc(src?: string | null): string {
  const value = src?.trim();
  if (!value) return '';
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  return value.startsWith('/') ? value : `/${value.replace(/^\.?\//, '')}`;
}
