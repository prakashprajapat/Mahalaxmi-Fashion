import type { Metadata } from 'next';
import { RETURNS, SHOP } from '@/lib/shopFacts';

export const metadata: Metadata = {
  title: 'Return & Exchange Policy',
  description: `${RETURNS.windowDays}-day returns on every order at Mahalaxmi Fashion Hub, for any reason including size and change of mind, as long as the product is unused with its tags intact. If the mistake is ours we pay the return postage.`,
  alternates: { canonical: '/return-exchange' },
};

export default function ReturnExchangePage() {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Policy</p>
        <h1>Return &amp; Exchange Policy</h1>
        <p>
          Updated 2 October 2026. {RETURNS.windowDays} days to return anything, for any reason, including size
          and change of mind. If the mistake is ours, we pay the return postage.
        </p>
      </section>

      <main className="policy-page">
        <article className="policy-card">
          <h2>1. The short version</h2>
          <p>
            You have <strong>{RETURNS.windowDays} days from delivery</strong> to send a product back. You do not
            have to justify it &mdash; the size being wrong, or simply not liking it once you see it, is reason
            enough.
          </p>
          <p>
            Two things we do ask: the product comes back <strong>unused, unwashed and unworn</strong>, with its{' '}
            <strong>tags, packaging and accessories intact</strong>. Once a garment has been worn or washed we
            cannot sell it to anyone else, and that is the whole of it.
          </p>
          <p>
            This replaces our earlier policy, which only accepted returns for damaged or defective items. If you
            were told otherwise on an earlier order, this is the policy that applies now.
          </p>
        </article>

        <article className="policy-card">
          <h2>2. Who pays the return postage</h2>
          <h3>Our mistake &mdash; we pay</h3>
          <p>If any of these happened, the postage is on us, reimbursed up to <strong>Rs. {RETURNS.faultReturnShippingReimbursedUpTo}</strong>:</p>
          <ul>
            {RETURNS.faultReasons.map(r => <li key={r}>Where {r}.</li>)}
          </ul>
          <p>
            For these, please tell us within <strong>{RETURNS.reportDamageWithinHours} hours of delivery</strong>{' '}
            and send an <strong>unedited parcel-opening video</strong> &mdash; the sealed parcel, the shipping
            label, and the unboxing in one continuous recording. That video is how we claim against the courier
            or the supplier, which is why we have to insist on it for damage claims. Please get into the habit of
            recording while you open a parcel; it takes a few seconds and it protects you.
          </p>

          <h3>Your change of mind &mdash; you pay</h3>
          <p>
            If the product is fine and you simply want to send it back &mdash; wrong size ordered, colour not
            what you imagined, changed your mind &mdash; the return postage is yours. No video is needed. Send it
            back within {RETURNS.windowDays} days and we will refund the product in full.
          </p>
        </article>

        <article className="policy-card">
          <h2>3. What we cannot take back</h2>
          <ul>
            {RETURNS.excludedReasons.map(r => <li key={r}>Anything {r.replace(/^anything /, '')}.</li>)}
          </ul>
          <p>
            Minor colour differences between the photograph and the product are normal &mdash; screens and
            lighting vary &mdash; but if the difference is real and not a trick of the screen, that counts as our
            mistake, not your change of mind.
          </p>
        </article>

        <article className="policy-card">
          <h2>4. How to start a return</h2>
          <ol>
            <li><strong>Step 1:</strong> WhatsApp us on {SHOP.phoneDisplay} within {RETURNS.windowDays} days of delivery.</li>
            <li><strong>Step 2:</strong> Send your order number, a photo of the product, and the reason. If it
              arrived damaged, defective, wrong or incomplete, send the parcel-opening video too.</li>
            <li><strong>Step 3:</strong> We reply within 2 business days with the return address and confirm who
              is paying the postage.</li>
            <li><strong>Step 4:</strong> Post it back by {RETURNS.returnCourier} and send us the receipt. Keep
              the receipt &mdash; we need the tracking number, and for our-mistake returns we need it to
              reimburse you.</li>
          </ol>
        </article>

        <article className="policy-card">
          <h2>5. Return shipping</h2>
          <ul>
            <li>Use <strong>{RETURNS.returnCourier}</strong>. We cannot accept COD or
              courier-collected returns &mdash; they arrive with a bill attached.</li>
            <li>Where the mistake was ours, we reimburse the postage up to <strong>Rs. {RETURNS.faultReturnShippingReimbursedUpTo}</strong> against the receipt.</li>
            <li>Where you changed your mind or ordered the wrong size yourself, the postage is yours.</li>
            <li>Keep the receipt either way &mdash; without the tracking number we cannot trace a parcel that
              goes missing on the way back.</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>6. Refund timeline</h2>
          <ul>
            <li>Once the returned item is received and inspected, refund is processed within <strong>5–7 business days</strong>.</li>
            <li>Prepaid orders: refund to original payment method.</li>
            <li>COD orders: bank transfer (please share account details on WhatsApp).</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>7. Exchanges</h2>
          <p>
            We handle an exchange as a return plus a fresh order, because it is faster than holding your money
            while a parcel travels both ways. Place the new order whenever you like; we refund the first one as
            soon as it reaches us. If we sent the wrong size, tell us and we will post the right one without
            waiting for the first to come back.
          </p>
        </article>

        <article className="policy-card">
          <h2>Contact for Returns &amp; Exchange</h2>
          <p>WhatsApp: <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer">+91 9429429880</a> — Monday to Saturday, 10 AM – 8 PM</p>
          <p>Store Address: Ward No. 45, Near Mahadev Temple, Balotra, Rajasthan — 344022</p>
        </article>
      </main>
    </>
  );
}
