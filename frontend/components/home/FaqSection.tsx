// Server-rendered FAQ — visible accordion + matching FAQPage JSON-LD.
// Google's FAQ rich-result policy requires the Q&A to be visible on the page,
// so ONE array drives both the <details> UI and the structured data (they always match).
// Server component (no 'use client') → the schema lands in the initial HTML, fully crawlable.

import { SHIPPING, RETURNS, SIZES, DELIVERY_TOTAL_MIN, DELIVERY_TOTAL_MAX } from '@/lib/shopFacts';

// Jawab ankdon se bante hain, haath se likhe nahi. Pehle yahan "4 to 8
// business days" likha tha jab policy ke panne par 3-7 aur schema me 2-7 tha —
// teen jagah teen jawab. Ab teenon ek hi file se aate hain.
const FAQS: { q: string; a: string }[] = [
  {
    q: 'Do you offer Cash on Delivery (COD)?',
    a: 'Yes. Mahalaxmi Fashion Hub offers Cash on Delivery across India, along with secure online payment via UPI, debit/credit cards, and net banking.',
  },
  {
    q: 'What are the delivery charges and delivery time?',
    a: `Shipping is free on orders above Rs. ${SHIPPING.freeAbove}; below that it is a flat Rs. ${SHIPPING.chargeBelow} anywhere in India. `
      + `Orders are dispatched in ${SHIPPING.processingDaysMin}–${SHIPPING.processingDaysMax} business days and most arrive within `
      + `${DELIVERY_TOTAL_MIN} to ${DELIVERY_TOTAL_MAX} business days of being placed, depending on your location.`,
  },
  {
    q: 'Can I return or exchange a product?',
    a: `Yes. You have ${RETURNS.windowDays} days from delivery to return anything, for any reason — including `
      + `size and simply changing your mind — as long as the product is unused, unwashed and still has its tags `
      + `and packaging. If the mistake was ours (damaged, defective, wrong item or wrong size sent), tell us `
      + `within ${RETURNS.reportDamageWithinHours} hours with a parcel-opening video and we reimburse the return `
      + `postage up to Rs. ${RETURNS.faultReturnShippingReimbursedUpTo}. If you changed your mind, the return `
      + `postage is yours.`,
  },
  {
    q: 'What sizes do you stock?',
    a: `Readymade clothing is stocked from ${SIZES.range}. ${SIZES.note} `
      + 'Every product page carries a size chart with bust, waist and hip measurements in inches.',
  },
  {
    q: 'How do I track my order?',
    a: 'After your order ships, you can track it anytime from the Track Order page using your order ID, or from your account under Orders.',
  },
  {
    q: 'Are the nighties, sarees and ethnic wear original and good quality?',
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
          color: '#722f37',
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
