import { MetadataRoute } from 'next';
import { productsApi } from '@/lib/api';
import { POSTS } from '@/lib/blog';
import { productSlug } from '@/lib/productSlug';
import { COLLECTION_SLUGS } from '@/lib/collections';

const BASE = 'https://www.mahalaxmifashionhub.com';

// Regenerate the sitemap periodically so newly-added products appear automatically.
export const revalidate = 3600; // 1 hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    // ── Core pages ────────────────────────────────────────────────────────────
    { url: BASE,                                   lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE}/products`,                     lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/best-sellers`,                 lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },

    // ── Category pages (real routes only) ─────────────────────────────────────
    { url: `${BASE}/women`,                              lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/men`,                                lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/kids`,                               lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/beauty`,                             lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/fabrics`,                            lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/products?category=saree`,            lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/products?category=nighty`,           lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/products?category=petticoat`,        lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/become-supplier`,                    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },

    // ── SEO collection landing pages (Koskii-style keyword pages) ─────────────
    ...COLLECTION_SLUGS.map(slug => ({
      url: `${BASE}/collections/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),

    // ── Info pages ────────────────────────────────────────────────────────────
    { url: `${BASE}/about-us`,                     lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/contact`,                      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/blog`,                         lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.6 },

    // ── Blog articles ─────────────────────────────────────────────────────────
    ...POSTS.map(p => ({
      url: `${BASE}/blog/${p.slug}`,
      lastModified: new Date(p.date),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),

    // ── Policy pages ──────────────────────────────────────────────────────────
    { url: `${BASE}/privacy-policy`,               lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/return-policy`,                lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/return-exchange`,              lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/cancellation-policy`,          lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/shipping-delivery-policy`,     lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/terms-conditions`,             lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/safety-center`,                lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3 },
  ];

  // ── Product pages (auto — every product from the API) ───────────────────────
  let productEntries: MetadataRoute.Sitemap = [];
  try {
    const { products } = await productsApi.getAll({ pageSize: 1000 });
    productEntries = (products ?? []).map(p => ({
      url: `${BASE}/products/${productSlug(p.name, p.dbId)}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch {
    // If the API is unreachable at build time, still return the static sitemap.
  }

  return [...staticEntries, ...productEntries];
}
