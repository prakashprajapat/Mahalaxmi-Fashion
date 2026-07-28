// Server-rendered FAQ — visible accordion + matching FAQPage JSON-LD.
// Google's FAQ rich-result policy requires the Q&A to be visible on the page,
// so ONE array drives both the <details> UI and the structured data (they always match).
// Server component (no 'use client') → the schema lands in the initial HTML, fully crawlable.

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Do you offer Cash on Delivery (COD)?',
    a: 'Yes. Mahalaxmi Fashion Hub offers Cash on Delivery across India, along with secure online payment via UPI, debit/credit cards, and net banking.',
  },
  {
    q: 'What are the delivery charges and delivery time?',
    a: 'Shipping is free on all orders above Rs. 999. We deliver pan-India, and most orders reach you within 4 to 8 business days depending on your location.',
  },
  {
    q: 'Can I return or exchange a product?',
    a: 'Yes. If an item is damaged, defective, or not as described, you can request a return or exchange as per our return and exchange policy. Just contact us with your order details.',
  },
  {
    q: 'How do I track my order?',
    a: 'After your order ships, you can track it anytime from the Track Order page using your order ID, or from your account under Orders.',
  },
  {
    q: 'Are the sarees, nighties and ethnic wear original and good quality?',
    a: 'Absolutely. We source premium, comfortable fabrics and quality-check every product before dispatch, so you receive authentic, long-lasting ethnic and fashion wear.',
  },
  {
    q: 'Which cities do you deliver to?',
    a: 'We deliver across all of India, from metros to small towns, including Rajasthan, Gujarat, Maharashtra and every other state, with reliable courier partners.',
  },
];

export default function FaqSection() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <section aria-labelledby="faq-heading" style={{ maxWidth: 820, margin: '2.5rem auto', padding: '0 1.15rem' }}>
      <h2
        id="faq-heading"
        style={{
          fontFamily: 'var(--font-playfair), Georgia, serif',
          textAlign: 'center',
          color: '#7a0a22',
          fontSize: 'clamp(1.3rem,3.5vw,1.9rem)',
          fontWeight: 800,
          margin: '0 0 1.2rem',
        }}
      >
        Frequently Asked Questions
      </h2>

      <div>
        {FAQS.map((f, i) => (
          <details key={i} style={{ borderBottom: '1px solid #eadfe2', padding: '.85rem 0' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#3a1420', fontSize: '.98rem' }}>
              {f.q}
            </summary>
            <p style={{ margin: '.6rem 0 0', color: '#555', fontSize: '.92rem', lineHeight: 1.6 }}>{f.a}</p>
          </details>
        ))}
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}
