import Link from 'next/link';
import {
  SHIPPING, RETURNS, SIZES, CARE,
  DELIVERY_TOTAL_MIN, DELIVERY_TOTAL_MAX,
} from '@/lib/shopFacts';

// Product ke panne par wo baatein jo grahak kharidne se pehle poochta hai —
// aur jo ab tak kahin likhi hi nahi thin.
//
// Teen alag kami ek saath bhar jati hain:
//
// 1. Naap ka chart ek modal me band tha ('use client' + {open && ...}), yani
//    panne ke pehle HTML me kabhi aata hi nahi tha. Na Google use padh sakta
//    tha, na koi AI "is dukaan me kaun si size milti hai" ka jawab de sakta
//    tha - aur grahak ko bhi ek click karna padta tha. Ab seedha panne par.
//
// 2. Kapde ki dekhbhal ka ek shabd poori site par nahi tha, sirf do vaakya
//    collection ke FAQ me dabe the. "Cotton nighty kaise dhoyein" jaise sawal
//    ka jawab dukaan ke paas tha hi nahi.
//
// 3. Wapsi ki asli shart - video zaroori hai, pasand badalne par wapsi nahi -
//    kahin product ke panne par nahi likhi thi, jabki schema "7 din free
//    return" ka vaada kar raha tha. Grahak ko ye baat tab pata chalti thi jab
//    der ho chuki hoti thi.
//
// Sab server par banta hai, isliye pehle HTML me hi chala jata hai. Sawal-jawab
// aur unka FAQPage schema EK HI soochi se bante hain, to wo kabhi alag nahi ho
// sakte - Google ka niyam yahi maangta hai.

function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** Kaun si dekhbhal ki salah - category aur naam dekh kar. */
function careFor(category: string, name: string): { label: string; text: string } | null {
  const hay = `${category} ${name}`.toLowerCase();
  if (/shoe|footwear|sandal|slipper|sneaker/.test(hay)) return { label: 'Footwear care', text: CARE.footwear };
  if (/saree|sari/.test(hay)) return { label: 'Saree care', text: CARE.saree };
  if (/bra|panty|innerwear|lingerie|camisole/.test(hay)) return { label: 'Innerwear care', text: CARE.innerwear };
  if (/perfume|fragrance|deo|beauty/.test(hay)) return null;
  return { label: 'Fabric care', text: CARE.cotton };
}

export default function ProductFacts({
  name, category, price,
}: { name: string; category: string; price?: number }) {
  const care = careFor(category ?? '', name ?? '');
  const freeShip = typeof price === 'number' && price >= SHIPPING.freeAbove;

  // Ek hi soochi: dikhne wale sawal bhi isi se, schema bhi isi se.
  const faqs: { q: string; a: string }[] = [
    {
      q: `Is Cash on Delivery available for ${name}?`,
      a: `Yes. Cash on Delivery is available on this product everywhere in India, along with UPI, debit card, credit card and net banking.`,
    },
    {
      q: `How long does delivery take?`,
      a: `This order is dispatched in ${SHIPPING.processingDaysMin}–${SHIPPING.processingDaysMax} business days via ${SHIPPING.courier}. `
        + `${SHIPPING.byRegion.map(r => `${r.label} take ${r.min}–${r.max} business days after dispatch`).join(', ')}. `
        + `Door to door, most orders arrive within ${DELIVERY_TOTAL_MIN} to ${DELIVERY_TOTAL_MAX} business days.`,
    },
    {
      q: `What are the delivery charges?`,
      a: freeShip
        ? `Shipping is free on this product, because it is priced above Rs. ${SHIPPING.freeAbove}.`
        : `Shipping is a flat Rs. ${SHIPPING.chargeBelow} anywhere in India, and free on any order above Rs. ${SHIPPING.freeAbove}.`,
    },
    {
      q: `Can I return this if it does not fit?`,
      a: `Yes. Returns are accepted within ${RETURNS.windowDays} days of delivery for any reason, including size and change of mind, `
        + `as long as the product is unused, unwashed and still has its tags and packaging. `
        + `If the fault is ours \u2014 damaged, defective, wrong item or wrong size sent \u2014 we reimburse the return postage up to `
        + `Rs. ${RETURNS.faultReturnShippingReimbursedUpTo} and you should report it within ${RETURNS.reportDamageWithinHours} hours with a parcel-opening video. `
        + `If you simply changed your mind or picked the wrong size yourself, the return postage is yours.`,
    },
    {
      q: `What sizes does this come in?`,
      a: `Readymade clothing at Mahalaxmi Fashion Hub is stocked from ${SIZES.range}. ${SIZES.note} `
        + `The sizes this particular product comes in are the ones shown on this page; `
        + `if you are unsure which to pick, message us on WhatsApp and we will tell you.`,
    },
    ...(care ? [{
      q: `How should I wash and care for this?`,
      a: care.text,
    }] : []),
  ];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <section className="pf-wrap" aria-labelledby="pf-heading">
      <div className="pf-inner">
        <h2 id="pf-heading" className="pf-h2">Sizes, delivery and returns</h2>

        <div className="pf-grid">
          {/* The size chart was here. It was a women's bust, waist and hip table,
              printed on EVERY product page - on men's boxer shorts, on shoes, on
              perfume. One chart cannot describe a catalogue that sells sarees by
              the metre and footwear by the number, and a chart that does not apply
              is worse than none: it is a measurement somebody may actually order
              against. Sizes stay where they belong, on the product's own variants. */}
          {/* ── Delivery ── */}
          <div className="pf-card">
            <h3 className="pf-h3">Delivery</h3>
            <ul className="pf-list">
              <li><strong>Cash on Delivery</strong> is available everywhere in India.</li>
              <li>
                {freeShip
                  ? <>Shipping on this product is <strong>free</strong>.</>
                  : <>Shipping is a flat <strong>Rs. {SHIPPING.chargeBelow}</strong>, and free above Rs. {SHIPPING.freeAbove}.</>}
              </li>
              <li>Dispatched in {SHIPPING.processingDaysMin}–{SHIPPING.processingDaysMax} business days via {SHIPPING.courier}.</li>
              {SHIPPING.byRegion.map(r => (
                <li key={r.label}>{r.label}: {r.min}–{r.max} business days after dispatch.</li>
              ))}
              <li>Most orders arrive within {DELIVERY_TOTAL_MIN}–{DELIVERY_TOTAL_MAX} business days of being placed.</li>
            </ul>
          </div>

          {/* ── Wapsi ── */}
          <div className="pf-card">
            <h3 className="pf-h3">Returns</h3>
            <p className="pf-note">
              <strong>{RETURNS.windowDays} days from delivery, for any reason</strong> — including size and
              change of mind. The product has to come back unused, unwashed and with its tags and packaging
              intact.
            </p>
            <p className="pf-warn">
              <strong>If the fault is ours, so is the postage.</strong> Damaged, defective, wrong item or wrong
              size sent: tell us within {RETURNS.reportDamageWithinHours} hours with a parcel-opening video and
              we reimburse the return postage up to Rs. {RETURNS.faultReturnShippingReimbursedUpTo}. Changed
              your mind or ordered the wrong size yourself? Send it back within {RETURNS.windowDays} days and
              the postage is yours.
            </p>
            <p className="pf-note">
              Not accepted: {RETURNS.excludedReasons.join('; ')}. Returns travel by {RETURNS.returnCourier};
              refunds are made {RETURNS.refundDaysMin}–{RETURNS.refundDaysMax} business days after the item
              reaches us and is checked.{' '}
              <Link href={RETURNS.policyPath} className="pf-link">Full return policy</Link>
            </p>
          </div>

          {/* ── Dekhbhal ── */}
          {care && (
            <div className="pf-card">
              <h3 className="pf-h3">{care.label}</h3>
              <p className="pf-note">{care.text}</p>
            </div>
          )}
        </div>

        {/* ── Sawal-jawab ── */}
        <h3 className="pf-h3 pf-faq-h">Questions people ask about this product</h3>
        <div className="pf-faqs">
          {faqs.map(f => (
            <details key={f.q} className="pf-faq">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }} />
    </section>
  );
}
