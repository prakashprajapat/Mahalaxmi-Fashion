import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  SHOP, SHIPPING, RETURNS, SIZES,
  DELIVERY_TOTAL_MIN, DELIVERY_TOTAL_MAX,
} from '@/lib/shopFacts';
import { OWNER, FOUNDED_YEAR } from '@/lib/owner';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    `Mahalaxmi Fashion Hub has sold cotton nighties, sarees, petticoats and daily wear from Balotra, Rajasthan since ${FOUNDED_YEAR}, `
    + 'run by Prakash Prajapat, shipping across India with Cash on Delivery.',
  alternates: { canonical: '/about-us' },
};

// Is panne par ek bhi insaan ka naam nahi tha, na koi saal.
//
// Google isi ko E-E-A-T kehta hai aur AI jawab dene se pehle yahi dekhte hain:
// peechhe koi asli dukaan hai ya sirf ek website. "Family-run" likh dena kaafi
// nahi — kaun chalata hai, kab se, aur kahan se, ye teen baatein chahiye.
export default function AboutUsPage() {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Our story</p>
        <h1>About Mahalaxmi Fashion Hub</h1>
        <p>
          A family-run shop in Balotra, Rajasthan, selling cotton nighties, sarees, petticoats and daily wear
          across India since {FOUNDED_YEAR}.
        </p>
      </section>

      <main className="policy-page">
        <article className="policy-card">
          <div className="about-owner">
            <Image
              src={OWNER.photo}
              alt={`${OWNER.name}, who runs Mahalaxmi Fashion Hub in Balotra`}
              width={160}
              height={160}
              className="about-owner-img"
            />
            <div>
              <h2 style={{ marginTop: 0 }}>Who runs this shop</h2>
              <p>
                <strong>{OWNER.name}</strong> runs Mahalaxmi Fashion Hub from {SHOP.city}, {SHOP.state}. The shop
                opened in {FOUNDED_YEAR} and has been selling online across India since. When you message the
                WhatsApp number on this site during shop hours, you are talking to the shop itself, not a call
                centre.
              </p>
              <p>
                {SHOP.city} is a textile town in western Rajasthan, known for cotton printing and dyeing. That is
                why cotton is what we know best and what most of the catalogue is made of.
              </p>
            </div>
          </div>

          <h2>What we sell</h2>
          <p>
            Cotton nighties are the largest part of the shop, and have been from the start. Alongside them we
            stock sarees and petticoats, women&apos;s innerwear, kurtis, men&apos;s formal shoes and perfume.
            Readymade clothing runs from {SIZES.range}, with some pieces in Free Size.
          </p>
          <p>
            We are a retail shop, not a manufacturer. We buy, check and pack what we sell, which is why the
            catalogue stays small enough for us to know what is in it.
          </p>

          <h2>How buying from us works</h2>
          <ol>
            <li>
              <strong>Cash on Delivery everywhere in India</strong>, alongside UPI, debit and credit cards and net
              banking.
            </li>
            <li>
              <strong>Shipping is free above Rs. {SHIPPING.freeAbove}</strong> and a flat Rs. {SHIPPING.chargeBelow}{' '}
              below that. No other charges appear at checkout.
            </li>
            <li>
              Orders are dispatched in {SHIPPING.processingDaysMin}&ndash;{SHIPPING.processingDaysMax} business days
              by {SHIPPING.courier}, and most reach you within {DELIVERY_TOTAL_MIN}&ndash;{DELIVERY_TOTAL_MAX}{' '}
              business days of being placed. Every order is trackable.
            </li>
            <li>
              <strong>{RETURNS.windowDays} days to return anything</strong>, for any reason, including size and
              change of mind, as long as it is unused and the tags are intact. If the mistake was ours, we pay the
              return postage. <Link href={RETURNS.policyPath}>Full return policy</Link>.
            </li>
          </ol>

          <h2>What we will not do</h2>
          <p>
            We do not write our own reviews. Every review and photo on this site was left by a customer after a
            delivery, and the rating you see on a product is the real average of those, or nothing at all if
            nobody has reviewed it yet.
          </p>
          <p>
            We also try not to promise what we cannot keep. If a fabric is a blend, the product page says so. If a
            colour in a photograph looks brighter than the cloth, ask us before ordering and we will tell you
            honestly. We would rather lose one order than send something you send back.
          </p>

          <h2>The shop</h2>
          <p>{SHOP.street}, {SHOP.city}, {SHOP.state} &mdash; {SHOP.pincode}, India.</p>
          <p>Open {SHOP.hoursText}.</p>
          <p>
            Phone and WhatsApp:{' '}
            <a href={SHOP.whatsapp} target="_blank" rel="noopener noreferrer">{SHOP.phoneDisplay}</a>.
            We speak Hindi and English.
          </p>
        </article>
      </main>
    </>
  );
}
