import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { POSTS, getPost } from '@/lib/blog';

const BASE = 'https://www.mahalaxmifashionhub.com';

export function generateStaticParams() {
  return POSTS.map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = getPost(params.slug);
  if (!post) return {};
  const url = `${BASE}/blog/${post.slug}`;
  return {
    title: { absolute: `${post.title} | Mahalaxmi Fashion Hub` },
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      url,
      title: post.title,
      description: post.description,
      publishedTime: post.date,
    },
  };
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) notFound();

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Organization', name: 'Mahalaxmi Fashion Hub' },
    publisher: {
      '@type': 'Organization',
      name: 'Mahalaxmi Fashion Hub',
      logo: { '@type': 'ImageObject', url: `${BASE}/logo-color.webp` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE}/blog/${post.slug}` },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${BASE}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title },
    ],
  };

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Style Guide</p>
        <h1>{post.title}</h1>
        <p>{post.readMinutes} min read</p>
      </section>

      <main className="policy-page">
        <article
          className="blog-article"
          style={{ maxWidth: '820px', margin: '0 auto', color: '#333', fontSize: '.98rem', lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        <div style={{ maxWidth: '820px', margin: '2rem auto 0', display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <Link href="/products?bestSeller=true" className="button primary">🛍️ Shop Best Sellers</Link>
          <Link href="/blog" className="button secondary">← All Articles</Link>
        </div>
      </main>

      <style>{`
        .blog-article h2 { font-size: 1.2rem; font-weight: 700; color: #5c1a28; margin: 1.6rem 0 .6rem; }
        .blog-article p { margin: 0 0 .9rem; }
        .blog-article ul { margin: 0 0 1rem 1.25rem; }
        .blog-article li { margin: 0 0 .35rem; }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
    </>
  );
}
