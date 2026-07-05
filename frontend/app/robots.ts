import { MetadataRoute } from 'next';
import { settingsApi } from '@/lib/api';

// Refresh hourly so admin-edited robots rules take effect without a rebuild.
export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Admin can add extra Disallow paths from Settings → "SEO — Verification, Analytics & Robots".
  let extra: string[] = [];
  try {
    const { settings } = await settingsApi.getAll();
    const raw = settings?.robotsDisallow ?? '';
    extra = raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  } catch {
    // ignore — fall back to defaults
  }

  const disallow = Array.from(new Set([
    '/admin', '/checkout', '/account', '/api/', '/cart', '/orders', '/wishlist',
    ...extra,
  ]));

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
    ],
    sitemap: 'https://mahalaxmifashionhub.com/sitemap.xml',
  };
}
