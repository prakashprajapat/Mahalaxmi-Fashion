import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Cancellation Policy | Mahalaxmi Fashion Hub',
  description: 'Orders can be cancelled before dispatch. Once dispatched, cancellation is not accepted.',
  alternates: { canonical: '/cancellation-policy' },
};

export default function CancellationPolicyPage() {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Policy</p>
        <h1>Cancellation Policy</h1>
        <p>Effective Date: 19 June 2026. Orders can be cancelled before dispatch. Once dispatched, cancellation is not accepted.</p>
      </section>

      <main className="policy-page">
        <article className="policy-card">
          <h2>1. Order Cancellation</h2>
          <ul>
            <li>Orders may be cancelled <strong>before dispatch</strong> only.</li>
            <li>Once an order has been dispatched, cancellation requests will not be accepted.</li>
            <li>Customized, stitched, altered, made-to-order, or bulk order products are not eligible for cancellation at any stage.</li>
            <li>Refusal of delivery without a valid reason may affect eligibility for future purchases.</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>2. How to Cancel</h2>
          <ol>
            <li><strong>Step 1:</strong> Contact us on WhatsApp within the cancellation window (before dispatch).</li>
            <li><strong>Step 2:</strong> Provide your Order ID and registered mobile number.</li>
            <li><strong>Step 3:</strong> Our team will confirm if the order is eligible for cancellation.</li>
            <li><strong>Step 4:</strong> If approved, refund (for prepaid orders) will be processed within 5–7 business days to the original payment method.</li>
          </ol>
        </article>

        <article className="policy-card">
          <h2>3. Refund on Cancellation</h2>
          <ul>
            <li>Approved cancellation refunds are processed within <strong>5–7 business days</strong>.</li>
            <li>Refunds are issued to the original payment method wherever possible.</li>
            <li>For COD orders, no amount is charged — no refund is needed.</li>
            <li>Shipping charges, platform fees, and convenience charges (if any) are non-refundable.</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>4. Non-Cancellable Orders</h2>
          <ul>
            <li>Orders already packed or dispatched.</li>
            <li>Customized, personalized, stitched, or altered products.</li>
            <li>Clearance-sale or special-order products.</li>
            <li>Bulk orders after production has begun.</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>5. Fraud Prevention</h2>
          <p>Mahalaxmi Fashion Hub reserves the right to reject cancellation requests that involve false, misleading, or fraudulent information. Repeated or suspicious cancellation patterns may result in restricted access to future purchases.</p>
        </article>

        <article className="policy-card">
          <h2>6. Limitation of Liability</h2>
          <p>Mahalaxmi Fashion Hub reserves the right to make the final decision regarding any cancellation or related claim. Our decision shall be final and binding after reviewing all submitted information.</p>
        </article>

        <article className="policy-card">
          <h2>7. Contact Us</h2>
          <p>For cancellation assistance, contact our support team with your Order ID and registered mobile number.</p>
          <p><a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer">WhatsApp: +91 9429429880</a> — Monday to Saturday, 10:00 AM to 8:00 PM.</p>
        </article>

        <article className="policy-card">
          <h2>Acceptance of Policy</h2>
          <p>By placing an order with Mahalaxmi Fashion Hub, you acknowledge that you have read, understood, and agreed to this Cancellation Policy.</p>
        </article>
      </main>
    </>
  );
}
