import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Return, Refund & Cancellation Policy | Mahalaxmi Fashion Hub',
  description: '7-day return window, parcel opening video required, fraud prevention policy.',
  alternates: { canonical: '/return-policy' },
};

export default function ReturnPolicyPage() {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Policy</p>
        <h1>Return, Refund &amp; Cancellation Policy</h1>
        <p>Effective Date: 19 June 2026. Every product is checked before dispatch. Returns are accepted only for damaged, defective, or incorrect products — parcel opening video is mandatory.</p>
      </section>

      <main className="policy-page">
        <article className="policy-card">
          <h2>1. Return Eligibility</h2>
          <p>We offer a <strong>7-day return window</strong> from the date of delivery. To qualify for a return, all of the following conditions must be met:</p>
          <ul>
            <li>An original, unedited parcel opening video is mandatory.</li>
            <li>The video must clearly show: the sealed package before opening, the shipping label, and the complete unboxing process in one continuous recording.</li>
            <li>The product must be unused, unwashed, unworn, and in its original condition.</li>
            <li>All original tags, labels, packaging, invoices, and accessories must be intact.</li>
            <li>Return requests must be submitted within 7 days of delivery.</li>
            <li>Issues related to damaged, defective, incorrect, or missing items must be reported within <strong>48 hours of delivery</strong>.</li>
          </ul>
          <p>Failure to meet any of the above requirements may result in rejection of the return request.</p>
        </article>

        <article className="policy-card">
          <h2>2. Valid Reasons for Return</h2>
          <p>Returns will only be accepted under the following circumstances:</p>
          <ul>
            <li>Product received in a damaged condition.</li>
            <li>Product received with manufacturing defects.</li>
            <li>Incorrect product delivered.</li>
            <li>Missing item(s) in the package.</li>
            <li>Product significantly differs from the description displayed at the time of purchase.</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>3. Non-Returnable Cases</h2>
          <p>Returns, exchanges, or refunds will <strong>not</strong> be accepted for:</p>
          <ul>
            <li>Change of mind.</li>
            <li>Personal preference regarding color, design, fabric feel, or appearance.</li>
            <li>Minor color variations caused by photography, lighting, screen resolution, or display settings.</li>
            <li>Size or fitting issues unless an incorrect size was delivered.</li>
            <li>Products that have been used, washed, altered, ironed, or damaged after delivery.</li>
            <li>Products returned without original tags, packaging, labels, invoices, or accessories.</li>
            <li>Claims submitted without a valid parcel opening video.</li>
            <li>Customized, personalized, altered, clearance-sale, or special-order products unless received damaged or defective.</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>4. How to Raise a Return Request</h2>
          <ol>
            <li><strong>Step 1:</strong> Contact us on WhatsApp within 7 days of delivery.</li>
            <li><strong>Step 2:</strong> Share your Order ID, parcel opening video, product images, and reason for return.</li>
            <li><strong>Step 3:</strong> Our team will review within 2–3 business days and confirm if the return is approved.</li>
            <li><strong>Step 4:</strong> If approved, ship the item back via Speed Post. We reimburse up to ₹100 in return shipping costs.</li>
          </ol>
        </article>

        <article className="policy-card">
          <h2>5. Refund Process</h2>
          <ul>
            <li>Approved refunds are processed within <strong>5–7 business days</strong> after we receive and inspect the returned product.</li>
            <li>Refunds are issued to the original payment method.</li>
            <li>COD refunds will be processed via bank transfer. Please provide your bank account details.</li>
            <li>Shipping charges are non-refundable unless the return is due to our error.</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>6. Contact for Returns</h2>
          <p>WhatsApp: <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer">+91 9429429880</a> — Monday to Saturday, 10:00 AM to 8:00 PM</p>
          <p>Ward No. 45, Near Mahadev Temple, Balotra, Rajasthan — 344022</p>
        </article>
      </main>
    </>
  );
}
