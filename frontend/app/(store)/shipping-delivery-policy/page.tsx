import type { Metadata } from 'next';
import Link from 'next/link';
import { SHIPPING, DELIVERY_TOTAL_MIN, DELIVERY_TOTAL_MAX } from '@/lib/shopFacts';

export const metadata: Metadata = {
  title: 'Shipping & Delivery Policy',
  description: `Orders are dispatched in ${SHIPPING.processingDaysMin}–${SHIPPING.processingDaysMax} business days via ${SHIPPING.courier} and arrive in ${DELIVERY_TOTAL_MIN}–${DELIVERY_TOTAL_MAX} business days across India. Free shipping above ₹${SHIPPING.freeAbove}, flat ₹${SHIPPING.chargeBelow} below, Cash on Delivery available.`,
  alternates: { canonical: '/shipping-delivery-policy' },
};

export default function ShippingPolicyPage() {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Policy</p>
        <h1>Shipping &amp; Delivery Policy</h1>
        <p>
          We ship across India via {SHIPPING.courier}. Orders are dispatched in{' '}
          {SHIPPING.processingDaysMin}–{SHIPPING.processingDaysMax} business days and reach you in another{' '}
          {SHIPPING.transitDaysMin}–{SHIPPING.transitDaysMax}, so most orders arrive within{' '}
          {DELIVERY_TOTAL_MIN}–{DELIVERY_TOTAL_MAX} business days of being placed. Shipping is free on orders
          above ₹{SHIPPING.freeAbove}; below that it is ₹{SHIPPING.chargeBelow}. Cash on Delivery is available
          across India.
        </p>
      </section>

      <main className="policy-page">
        <article className="policy-card">
          <h2>Order Processing</h2>
          <ol>
            <li>Orders are processed within 1–2 business days of successful payment confirmation.</li>
            <li>Orders placed on Sunday or public holidays are processed on the next working day.</li>
            <li>You will receive a WhatsApp message or SMS with your tracking details once your order is dispatched.</li>
          </ol>

          <h2>Shipping Partner</h2>
          <ol>
            <li>We ship all orders via <strong>Delhivery</strong> courier services across India.</li>
            <li>For select orders, we may use alternative courier partners depending on your pin code and product type.</li>
            <li>Track your order anytime at our <Link href="/tracking">Track Order</Link> page using your order ID or AWB number.</li>
          </ol>

          <h2>Delivery Timeline</h2>
          <p>Counted from dispatch, not from the day the order is placed. Add{' '}
            {SHIPPING.processingDaysMin}–{SHIPPING.processingDaysMax} business days of processing for the full
            door-to-door time.</p>
          <ol>
            {SHIPPING.byRegion.map(r => (
              <li key={r.label}><strong>{r.label}</strong>: {r.min}–{r.max} business days.</li>
            ))}
            <li>Timelines are estimates and may vary due to courier delays, local holidays, or weather conditions.</li>
          </ol>

          <h2>Shipping Charges</h2>
          {/* Ye panna hi wo jagah hai jahan koi shipping ke baare me padhne aata
              hai — grahak bhi, Google bhi. Yahan tak sirf "checkout par dikh
              jayega" likha tha, yani ek bhi ankda nahi, jabki ₹999 ki seema
              site par char jagah likhi hai aur schema me bhi hai. */}
          <ol>
            <li><strong>Free shipping on every order above ₹{SHIPPING.freeAbove}.</strong></li>
            <li>Below ₹{SHIPPING.freeAbove}, shipping is a flat ₹{SHIPPING.chargeBelow} anywhere in India.</li>
            <li>The exact amount is shown at checkout before you pay.</li>
            <li>Cash on Delivery is available across India.</li>
          </ol>

          <h2>Incorrect or Incomplete Address</h2>
          <ol>
            <li>Please ensure your delivery address, pin code, and contact number are correct at the time of placing the order.</li>
            <li>Mahalaxmi Fashion Hub is not responsible for delivery failures or delays caused by incorrect or incomplete addresses.</li>
            <li>If a package is returned due to an incorrect address, re-shipping charges will be borne by the customer.</li>
          </ol>

          <h2>Damaged or Missing Items</h2>
          <ol>
            <li>If your order arrives damaged, please photograph the package and product immediately and contact us on WhatsApp at +91 9429429880 within <strong>48 hours of delivery</strong>.</li>
            <li>Claims reported after 48 hours of delivery may not be accepted.</li>
            <li>Missing items from a confirmed order must be reported within 48 hours. We will investigate and resolve as quickly as possible.</li>
          </ol>

          <h2>Contact for Shipping Queries</h2>
          <p>WhatsApp: <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer">+91 9429429880</a> | Store: Ward No. 45, Near Mahadev Temple, Balotra, Rajasthan — 344022</p>
          <p>Last updated: June 2026</p>
        </article>
      </main>
    </>
  );
}
