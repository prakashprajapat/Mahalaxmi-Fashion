import type { Metadata } from 'next';
import Link from 'next/link';
import { POSTS } from '@/lib/blog';

export const metadata: Metadata = {
  title: { absolute: 'Fashion Blog — Saree, Nighty & Petticoat Guides | Mahalaxmi Fashion Hub' },
  description:
    'Style tips and buying guides for sarees, nighties, petticoats and fabrics from Mahalaxmi Fashion Hub, Balotra. Choose the right fabric, size and colour.',
  alternates: { canonical: '/blog' },
};

export default function BlogIndexPage() {
  const posts = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Style Guides</p>
        <h1>Fashion Blog</h1>
        <p>Practical tips and buying guides for sarees, nighties, petticoats and fabrics.</p>
      </section>

      <main className="policy-page">
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'grid', gap: '1rem' }}>
          {posts.map(p => (
            <Link key={p.slug} href={`/blog/${p.slug}`}
              style={{ display: 'block', background: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '1.25rem 1.4rem', textDecoration: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#5c1a28', margin: '0 0 .35rem' }}>{p.title}</h2>
              <p style={{ color: '#666', fontSize: '.9rem', lineHeight: 1.6, margin: '0 0 .5rem' }}>{p.excerpt}</p>
              <span style={{ color: '#a7354d', fontSize: '.82rem', fontWeight: 600 }}>
                Read more → <span style={{ color: '#aaa', fontWeight: 400 }}>· {p.readMinutes} min read</span>
              </span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
