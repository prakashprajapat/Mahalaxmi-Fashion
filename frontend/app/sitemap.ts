import { MetadataRoute } from 'next';
import { productsApi } from '@/lib/api';
import { getPosts, getCollections } from '@/lib/seoContent';
import { matchesCollection } from '@/lib/collections';
import { productSlug } from '@/lib/productSlug';
import { productImageSrc } from '@/lib/productImages';

const BASE = 'https://www.mahalaxmifashionhub.com';

// Build the sitemap fresh on every request (server-side) instead of baking it at
// build time. This guarantees the FULL live product catalogue is always included —
// even if the backend API happened to be unreachable during the deploy build.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Collections and articles the owner adds from the admin panel belong in here
  // the same day, not after the next deploy — a page Google has not been told
  // about is a page that does not exist yet.
  const [collections, posts] = await Promise.all([getCollections(), getPosts()]);

  // The live catalogue, read once and used twice: for the product URLs further
  // down, and right here to decide which collection pages are worth sending.
  let allProducts: any[] = [];
  try {
    const { products } = await productsApi.getAll({ pageSize: 1000 });
    allProducts = products ?? [];
  } catch {
    // If the API is unreachable, allProducts stays empty and the guard below
    // keeps every collection in the sitemap rather than dropping the lot.
  }

  // Only the collections that have something on them.
  //
  // /collections/<slug> sets noindex when nothing in the catalogue matches it
  // (collections/[slug]/page.tsx:65) - and rightly so. But every collection
  // the owner has ever added was listed here regardless, so an empty one was
  // submitted to Google as a page carrying noindex. That is the "Submitted URL
  // marked noindex" error in Search Console, which is exactly why
  // /become-supplier was taken out of this list. Collections are added from
  // the admin panel as keyword landing pages, often before the stock arrives,
  // so an empty one is normal rather than rare.
  //
  // The test here is deliberately LOOSER than the page's own: the page asks the
  // API for one subcategory and then applies matchesCollection, while this uses
  // a substring on the product's own subcategory. Looser can only keep a page
  // in, never drop one the page would have indexed - and dropping a good page
  // from the sitemap would cost more than the notice this fixes. When the API
  // could not be read at all, nothing is dropped.
  const hasStock = (slug: string) => {
    const def = collections[slug];
    if (!def) return false;
    if (allProducts.length === 0) return true;
    const want = (def.subcategory ?? '').toLowerCase().trim();
    return allProducts.some(p =>
      (want.length === 0 || (p.subcategory ?? '').toLowerCase().includes(want))
      && matchesCollection(p, def));
  };

  const collectionSlugs = Object.keys(collections).filter(hasStock);

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
    { url: `${BASE}/more`,                               lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    // ?category=saree / nighty / petticoat yahan se hata diye. Wo apne aap ko
    // /saree, /nighty, /petticoat batate the - aise koi panne hain hi nahi, to
    // Google teenon ko gira deta tha. Ab canonical sudhar gaya hai, par in
    // chhante hue panno ki asli jagah /products?subcategory=... hai, jiske apne
    // andar ke link Google khud chal kar dhoond leta hai.
    //
    // /become-supplier bhi hata diya: uske apne layout me noindex likha hai,
    // aur noindex panna sitemap me dene se Search Console me "Submitted URL
    // marked noindex" ki galti aati hai.

    // ── SEO collection landing pages (Koskii-style keyword pages) ─────────────
    ...collectionSlugs.map(slug => ({
      url: `${BASE}/collections/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),

    // ── Info pages ────────────────────────────────────────────────────────────
    { url: `${BASE}/about-us`,                     lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/contact`,                      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/blog`,                         lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.6 },
    { url: `${BASE}/customer-reviews`,             lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.6 },

    // ── Blog articles ─────────────────────────────────────────────────────────
    ...posts.map(p => ({
      url: `${BASE}/blog/${p.slug}`,
      lastModified: new Date(p.date),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),

    // ── Policy pages ──────────────────────────────────────────────────────────
    { url: `${BASE}/privacy-policy`,               lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    // /return-policy ab /return-exchange par 301 hai — sitemap me redirect dena
    // Search Console me galti ginta hai.
    { url: `${BASE}/return-exchange`,              lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/cancellation-policy`,          lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/shipping-delivery-policy`,     lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/terms-conditions`,             lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/safety-center`,                lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3 },
  ];

  // ── Product pages (auto — every product from the API) ───────────────────────
  // Same list fetched above - one call, not two.
  let productEntries: MetadataRoute.Sitemap = [];
  try {
    productEntries = allProducts.map(p => {
      // Image sitemap — helps product photos get indexed in Google Images (big for fashion).
      const img = productImageSrc(p.image);
      const imageUrl = img ? (/^https?:/i.test(img) ? img : `${BASE}${img}`) : undefined;
      return {
        url: `${BASE}/products/${productSlug(p.name, p.dbId)}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
        ...(imageUrl ? { images: [imageUrl] } : {}),
      };
    });
  } catch {
    // If the API is unreachable at build time, still return the static sitemap.
  }

  return [...staticEntries, ...productEntries];
}
