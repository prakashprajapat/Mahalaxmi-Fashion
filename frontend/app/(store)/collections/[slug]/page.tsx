import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { productsApi } from '@/lib/api';
import { COLLECTIONS, COLLECTION_SLUGS, matchesCollection } from '@/lib/collections';
import CategoryPageContent from '@/components/product/CategoryPageContent';

// Koskii-style SEO landing pages: /collections/cotton-nighty, /collections/nighty-under-500 ...
// Har page ka apna title/description/H1/intro/FAQ hai (lib/collections.ts me define),
// products apne aap filter hote hain — naya product sahi collection me khud aa jata hai.

export const revalidate = 300;

export function generateStaticParams() {
  return COLLECTION_SLUGS.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const def = COLLECTIONS[params.slug];
  if (!def) return {};
  return {
    title: { absolute: def.title },
    description: def.description,
    alternates: { canonical: `/collections/${def.slug}` },
    openGraph: { title: def.title, description: def.description },
  };
}

export default async function CollectionPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const def = COLLECTIONS[slug];
  if (!def) notFound();

  const { products } = await productsApi
    .getAll({ category: def.category, pageSize: 500 })
    .catch(() => ({ products: [] as any[] }));
  const matched = (products as any[]).filter(p => matchesCollection(p, def));

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: def.faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mahalaxmifashionhub.com' },
      { '@type': 'ListItem', position: 2, name: 'Collections', item: 'https://mahalaxmifashionhub.com/products' },
      { '@type': 'ListItem', position: 3, name: def.label },
    ],
  };

  // Cross-links (Koskii-style internal linking) — same category first, phir baaki
  const others = COLLECTION_SLUGS
    .filter(s => s !== slug)
    .sort((a, b) => (COLLECTIONS[b].category === def.category ? 1 : 0) - (COLLECTIONS[a].category === def.category ? 1 : 0));

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">{def.eyebrow}</p>
        <h1>{def.h1}</h1>
        <p>{def.sub}</p>
      </section>

      {matched.length > 0 ? (
        <CategoryPageContent products={matched as any} category={def.label} icon="🛍️" desc={def.sub} allHref={`/products?category=${def.category}`} />
      ) : (
        <section style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <p style={{ color: '#777' }}>New products are being added to this collection soon.</p>
          <Link href={`/products?category=${def.category}`} className="button primary" style={{ display: 'inline-block', marginTop: '1rem' }}>
            Browse all {def.category} products →
          </Link>
        </section>
      )}

      {/* SEO copy + FAQ (FAQPage rich-result eligible) */}
      <section style={{ background: '#fafafa', borderTop: '1px solid #eee', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#5c1a28', margin: '0 0 .9rem' }}>{def.h1} — Mahalaxmi Fashion Hub</h2>
          {def.intro.map((p, i) => (
            <p key={i} style={{ color: '#555', fontSize: '.92rem', lineHeight: 1.65, margin: '0 0 .8rem' }}>{p}</p>
          ))}

          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a1a1a', margin: '1.4rem 0 .6rem' }}>Frequently Asked Questions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {def.faqs.map((f, i) => (
              <details key={i} style={{ background: '#fff', border: '1px solid #eee', borderRadius: '10px', padding: '.75rem 1rem' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#1a1a1a', fontSize: '.92rem' }}>{f.q}</summary>
                <p style={{ color: '#555', fontSize: '.88rem', lineHeight: 1.6, margin: '.6rem 0 0' }}>{f.a}</p>
              </details>
            ))}
          </div>

          {/* Internal links — Koskii-style collection cross-linking */}
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a1a1a', margin: '1.6rem 0 .6rem' }}>Explore More Collections</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
            {others.map(s => (
              <Link key={s} href={`/collections/${s}`}
                style={{ background: '#fff', border: '1px solid #e5d5d5', borderRadius: '999px', padding: '.4rem .95rem', fontSize: '.85rem', fontWeight: 600, color: '#7a0a22', textDecoration: 'none' }}>
                {COLLECTIONS[s].label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
    </>
  );
}
