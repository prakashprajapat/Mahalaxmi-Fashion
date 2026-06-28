import { MetadataRoute } from 'next'

const BASE = 'https://mahalaxmifashionhub.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // ── Core pages ────────────────────────────────────────────────────────────
    { url: BASE,                                   lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE}/products`,                     lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/best-sellers`,                 lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },

    // ── Category pages ────────────────────────────────────────────────────────
    { url: `${BASE}/saree`,                        lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE}/women`,                        lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE}/men`,                          lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE}/nighty`,                       lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE}/petticoat`,                    lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE}/popline`,                      lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE}/nighty-cloth`,                 lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.7 },

    // ── Info pages ────────────────────────────────────────────────────────────
    { url: `${BASE}/about-us`,                     lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/contact`,                      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },

    // ── Policy pages ──────────────────────────────────────────────────────────
    { url: `${BASE}/privacy-policy`,               lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/return-policy`,                lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/return-exchange`,              lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/cancellation-policy`,          lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/shipping-delivery-policy`,     lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/terms-conditions`,             lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${BASE}/safety-center`,                lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3 },
  ]
}
