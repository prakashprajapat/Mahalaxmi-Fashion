// Server component — renders keyword-relevant intro copy + an FAQ accordion for a category,
// plus FAQPage JSON-LD so Google can show FAQ rich results. No client JS needed (uses <details>).
import { CATEGORY_SEO } from '@/lib/categorySeo';

export default function CategorySeoBlock({ slug }: { slug: string }) {
  const seo = CATEGORY_SEO[slug];
  if (!seo) return null;

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: seo.faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <section style={{ background: '#fafafa', borderTop: '1px solid #eee', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#5c1a28', margin: '0 0 .9rem' }}>{seo.heading}</h2>
        {seo.intro.map((p, i) => (
          <p key={i} style={{ color: '#555', fontSize: '.92rem', lineHeight: 1.65, margin: '0 0 .8rem' }}>{p}</p>
        ))}

        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a1a1a', margin: '1.4rem 0 .6rem' }}>Frequently Asked Questions</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {seo.faqs.map((f, i) => (
            <details key={i} style={{ background: '#fff', border: '1px solid #eee', borderRadius: '10px', padding: '.75rem 1rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#1a1a1a', fontSize: '.92rem' }}>{f.q}</summary>
              <p style={{ color: '#555', fontSize: '.88rem', lineHeight: 1.6, margin: '.6rem 0 0' }}>{f.a}</p>
            </details>
          ))}
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    </section>
  );
}
