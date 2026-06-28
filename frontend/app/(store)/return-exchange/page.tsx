import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund & Exchange Policy | Mahalaxmi Fashion Hub',
  description: '7-day return window for damaged or defective products. Parcel opening video is mandatory for all claims.',
  alternates: { canonical: '/return-exchange' },
};

export default function ReturnExchangePage() {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Policy</p>
        <h1>Refund &amp; Exchange Policy</h1>
        <p>Effective Date: 19 June 2026. 7-day return window for damaged or defective products. Parcel opening video is mandatory for all claims.</p>
      </section>

      <main className="policy-page">
        <article className="policy-card">
          <h2>1. Return &amp; Exchange Eligibility</h2>
          <p>We offer a <strong>7-day return window</strong> from the date of delivery. All of the following conditions must be met:</p>
          <ul>
            <li>An original, unedited parcel opening video is mandatory.</li>
            <li>The video must show: the sealed package before opening, the shipping label, and the complete unboxing in one continuous recording.</li>
            <li>The product must be unused, unwashed, unworn, and in original condition.</li>
            <li>All original tags, labels, packaging, invoices, and accessories must be intact.</li>
            <li>Return requests must be submitted within 7 days of delivery.</li>
            <li>Damaged, defective, incorrect, or missing item issues must be reported within <strong>48 hours of delivery</strong>.</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>2. Valid Reasons for Refund / Exchange</h2>
          <ul>
            <li>Product received in a damaged condition.</li>
            <li>Product received with manufacturing defects.</li>
            <li>Incorrect product delivered.</li>
            <li>Missing item(s) in the package.</li>
            <li>Product significantly differs from the description at the time of purchase.</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>3. Non-Refundable / Non-Exchangeable Cases</h2>
          <ul>
            <li>Change of mind or personal preference.</li>
            <li>Minor color variations due to photography, lighting, or screen settings.</li>
            <li>Size or fitting issues unless an incorrect size was delivered.</li>
            <li>Products used, washed, altered, ironed, or damaged after delivery.</li>
            <li>Products returned without original tags, packaging, or accessories.</li>
            <li>Claims submitted without a valid parcel opening video.</li>
            <li>Customized, personalized, clearance-sale, or special-order products (unless received damaged or defective).</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>4. How to Raise a Request</h2>
          <ol>
            <li><strong>Step 1:</strong> Contact our support team within the 7-day return period.</li>
            <li><strong>Step 2:</strong> Share — Order Number, Parcel Opening Video, Product Images, Reason for Return.</li>
            <li><strong>Step 3:</strong> Our team will review within 2–3 business days and confirm eligibility.</li>
            <li><strong>Step 4:</strong> If approved, send the item back via Speed Post to our Balotra address.</li>
          </ol>
        </article>

        <article className="policy-card">
          <h2>5. Return Shipping</h2>
          <ul>
            <li>Use <strong>India Post Speed Post</strong> for return shipments.</li>
            <li>We reimburse return shipping up to <strong>₹100</strong> for approved return cases.</li>
            <li>Keep your Speed Post receipt — we need the tracking number to process the reimbursement.</li>
            <li>COD or courier-partner-collected returns are not accepted.</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>6. Refund Timeline</h2>
          <ul>
            <li>Once the returned item is received and inspected, refund is processed within <strong>5–7 business days</strong>.</li>
            <li>Prepaid orders: refund to original payment method.</li>
            <li>COD orders: bank transfer (please share account details on WhatsApp).</li>
          </ul>
        </article>

        <article className="policy-card">
          <h2>7. Exchange Process</h2>
          <p>We currently process exchanges as a return + new order. Once your return is approved, place a fresh order for the item you want and we will process your refund simultaneously.</p>
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
