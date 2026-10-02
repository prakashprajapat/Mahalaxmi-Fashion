import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { POSTS } from '@/lib/blog';
import { getPost } from '@/lib/seoContent';
import Image from 'next/image';
import { OWNER } from '@/lib/owner';
import { SHIPPING, RETURNS } from '@/lib/shopFacts';

const BASE = 'https://www.mahalaxmifashionhub.com';

// Only the built-in articles are pre-rendered; anything written in the admin
// renders on first visit, because the build cannot know those slugs.
// JSON.stringify leaves "<" alone, so a title holding "</script>" would close
// this tag early and the rest would run as script. Harmless while articles
// lived in a source file; not harmless now that they are typed into the admin.
function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export const revalidate = 300;

export function generateStaticParams() {
  return POSTS.map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug);
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
      // openGraph ki poori chaabi badal jati hai, deep-merge nahi hota - to
      // root ki og:image bhi chali jati thi aur har post bina tasveer ke
      // share hota tha.
      images: [post.image
        ? (/^https?:/i.test(post.image) ? post.image : `${BASE}${post.image}`)
        : `${BASE}/og-image.jpg`],
    },
  };
}

// Lekh ke vishay se judi jagahein. Jo yahan na mile uske liye aam soochi.
function nextStepsFor(slug: string, title: string): { heading: string; links: { href: string; label: string }[] } {
  const hay = `${slug} ${title}`.toLowerCase();
  if (/shoe|leather|footwear/.test(hay)) {
    return {
      heading: 'Looking for a pair?',
      links: [
        { href: '/men', label: 'Men\u2019s footwear and clothing' },
        { href: '/blog/formal-shoe-size-guide-india', label: 'Get the size right first' },
      ],
    };
  }
  if (/perfume|fragrance/.test(hay)) {
    return {
      heading: 'Shop fragrance',
      links: [
        { href: '/beauty', label: 'Perfume and personal care' },
        { href: '/best-sellers', label: 'What sells most' },
      ],
    };
  }
  if (/saree|petticoat|drap/.test(hay)) {
    return {
      heading: 'Shop sarees and petticoats',
      links: [
        { href: '/products?subcategory=Saree', label: 'Cotton and daily-wear sarees' },
        { href: '/products?subcategory=Petticoat', label: 'Petticoats, S to XXL' },
        { href: '/blog/saree-petticoat-guide', label: 'Which petticoat to pick' },
      ],
    };
  }
  if (/nighty|nightwear|sleep|cotton|fabric|size/.test(hay)) {
    return {
      heading: 'Shop cotton nighties',
      links: [
        { href: '/products?subcategory=Nighty', label: 'Cotton nighties, S to XXL' },
        { href: '/women', label: 'Everything for women' },
        { href: '/blog/nighty-size-guide-india', label: 'Measure for the right size' },
      ],
    };
  }
  return {
    heading: 'Shop the catalogue',
    links: [
      { href: '/products', label: 'All products' },
      { href: '/best-sellers', label: 'Best sellers' },
    ],
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) notFound();
  const nextUp = nextStepsFor(post.slug, post.title);

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    // Google ke Article rich result ke liye image zaroori hai; iske bina post
    // yogya hi nahi hoti. Post ki apni tasveer, warna site ki saanjhi.
    image: [post.image
      ? (/^https?:/i.test(post.image) ? post.image : `${BASE}${post.image}`)
      : `${BASE}/og-image.jpg`],
    datePublished: post.date,
    dateModified: post.date,
    // Pehle yahan lekhak ke naam par sirf dukaan likhi thi, aur panne par koi
    // byline tha hi nahi. Google aur AI dono dekhte hain ki likhne wale ke
    // peechhe koi asli insaan hai ya nahi — yahi E-E-A-T ka asli matlab hai.
    author: {
      '@type': 'Person',
      name: OWNER.name,
      jobTitle: OWNER.role,
      image: `${BASE}${OWNER.photo}`,
      worksFor: { '@id': `${BASE}/#organization` },
      url: `${BASE}/about-us`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Mahalaxmi Fashion Hub',
      logo: { '@type': 'ImageObject', url: `${BASE}/logo-color.webp` },
      '@id': `${BASE}/#organization`,
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
        {/* Byline. Pehle lekh par likhne wale ka koi naam hi nahi tha. */}
        <div className="post-byline">
          <Image src={OWNER.photo} alt={OWNER.name} width={36} height={36} />
          <span className="post-byline-t">
            <strong>{OWNER.name}</strong>
            <span>
              {OWNER.role} &middot; {post.readMinutes} min read &middot;{' '}
              {new Date(post.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </span>
        </div>
      </section>

      <main className="policy-page">
        <article
          className="blog-article"
          style={{ maxWidth: '820px', margin: '0 auto', color: '#333', fontSize: '.98rem', lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* Lekh ke baad kahan jaana hai.
            Pehle yahan sirf "Shop Best Sellers" tha — har lekh ke neeche ek hi
            jagah, chaahe lekh joote ke baare me ho ya saree ke. Ab lekh ke
            vishay se judi jagah par bhejta hai. Do fayde: padhne wale ko wahi
            milta hai jiske baare me usne abhi padha, aur Google ko dikhta hai
            ki kaun sa lekh kis panne se juda hua hai. Topical authority isi
            jodh se banti hai, akele lekhon se nahi. */}
        <div className="post-next">
          <p className="post-next-h">{nextUp.heading}</p>
          <div className="post-next-links">
            {nextUp.links.map(l => (
              <Link key={l.href} href={l.href} className="post-next-link">{l.label}</Link>
            ))}
          </div>
          <p className="post-next-sub">
            Cash on Delivery across India, free shipping above Rs. {SHIPPING.freeAbove},
            and {RETURNS.windowDays} days to return anything unused.{' '}
            <Link href="/blog">Read the other guides</Link>
          </p>
        </div>
      </main>

      <style>{`
        .blog-article h2 { font-size: 1.2rem; font-weight: 700; color: #4a1f27; margin: 1.6rem 0 .6rem; }
        .blog-article p { margin: 0 0 .9rem; }
        .blog-article ul { margin: 0 0 1rem 1.25rem; }
        .blog-article li { margin: 0 0 .35rem; }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
    </>
  );
}
