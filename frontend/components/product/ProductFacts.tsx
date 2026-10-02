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
      // Seedha "nahi". Ye wahi sawal hai jiska galat jawab baad me jhagda banta
      // hai, aur jiska jawab schema galat de raha tha.
      a: `No. Size and fitting issues are not covered, unless the wrong size was delivered. `
        + `Returns are accepted within ${RETURNS.windowDays} days only when ${RETURNS.acceptedReasons.join(', ')}. `
        + `An original, unedited parcel-opening video is required for every claim, so please record one while opening the parcel. `
        + `Please check the size chart on this page before ordering.`,
    },
    {
      q: `What sizes does this come in?`,
      a: `Readymade clothing at Mahalaxmi Fashion Hub is stocked from ${SIZES.range}. ${SIZES.note} `
        + `The chart on this page gives bust, waist and hip measurements in inches for each size.`,
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
          {/* ── Naap ── */}
          <div className="pf-card">
            <h3 className="pf-h3">Size chart</h3>
            <p className="pf-note">
              Measurements in inches. Readymade clothing is stocked from {SIZES.range}. {SIZES.note}
            </p>
            <table className="pf-table">
              <caption className="pf-caption">Women&apos;s clothing size chart, in inches</caption>
              <thead>
                <tr><th scope="col">Size</th><th scope="col">Bust</th><th scope="col">Waist</th><th scope="col">Hip</th></tr>
              </thead>
              <tbody>
                <tr><th scope="row">S</th><td>32–34</td><td>26–28</td><td>35–37</td></tr>
                <tr><th scope="row">M</th><td>34–36</td><td>28–30</td><td>37–39</td></tr>
                <tr><th scope="row">L</th><td>36–38</td><td>30–32</td><td>39–41</td></tr>
                <tr><th scope="row">XL</th><td>38–40</td><td>32–34</td><td>41–43</td></tr>
                <tr><th scope="row">XXL</th><td>40–42</td><td>34–36</td><td>43–45</td></tr>
              </tbody>
            </table>
          </div>

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
              A {RETURNS.windowDays}-day window from delivery, for these reasons only:
            </p>
            <ul className="pf-list">
              {RETURNS.acceptedReasons.map(r => <li key={r}>Where {r}.</li>)}
            </ul>
            <p className="pf-warn">
              <strong>Record a parcel-opening video.</strong> An original, unedited video of the sealed parcel
              being opened is required for every claim — without it a return cannot be processed. Report damage,
              defects, wrong or missing items within {RETURNS.reportDamageWithinHours} hours of delivery.
            </p>
            <p className="pf-note">
              Not covered: {RETURNS.excludedReasons.join('; ')}. Approved returns go back by{' '}
              {RETURNS.returnCourier} and postage is reimbursed up to Rs. {RETURNS.returnShippingReimbursedUpTo};
              refunds take {RETURNS.refundDaysMin}–{RETURNS.refundDaysMax} business days after the item is
              received and checked.{' '}
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
