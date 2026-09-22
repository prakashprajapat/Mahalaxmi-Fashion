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

  // Only what should never be fetched at all. The transactional pages are NOT
  // listed: each carries robots noindex in its own layout, and a Disallow here
  // would stop Google fetching the page and so stop it ever seeing that
  // noindex — the page stays in the index, just without a description. A
  // stale public/robots.txt used to shadow this file entirely, which is why
  // the live rules said "/cart/" with a trailing slash the routes never had,
  // matched nothing, and why the Settings robots box never did anything.
  const disallow = Array.from(new Set([
    '/admin', '/api/',
    ...extra,
  ]));

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
    ],
    sitemap: 'https://www.mahalaxmifashionhub.com/sitemap.xml',
  };
}
