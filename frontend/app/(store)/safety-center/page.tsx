import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Safety Center | Mahalaxmi Fashion Hub',
  description: 'Customer safety center — account, payment, delivery, return and complaint guidance.',
};

export default function SafetyCenterPage() {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Trust &amp; Safety</p>
        <h1>Customer Safety Center</h1>
        <p>Here you can review clear store practices related to account, payment, delivery, return, complaint, and support safety.</p>
      </section>

      <main className="policy-page safety-page">
        <section className="safety-grid">
          <article className="policy-card safety-card">
            <p className="eyebrow">Account Safety</p>
            <h2>Safe login and profile use</h2>
            <ul className="safety-list">
              <li>Do not share your login password with any seller, courier, or support person.</li>
              <li>If you sign in on a shared cyber cafe or public device, close the browser and log out after use.</li>
              <li>Only essential profile, address, and order-contact details are stored.</li>
            </ul>
          </article>

          <article className="policy-card safety-card">
            <p className="eyebrow">Payment Safety</p>
            <h2>Secure payment expectation</h2>
            <ul className="safety-list">
              <li>Never share OTP, CVV, UPI PIN, or your full card number in any chat.</li>
              <li>Mahalaxmi Fashion Hub never asks for banking credentials over WhatsApp or call.</li>
              <li>All payments are processed via Razorpay — a PCI-DSS compliant gateway.</li>
              <li>If you receive a suspicious payment link, do not click it. Report to us immediately.</li>
            </ul>
          </article>

          <article className="policy-card safety-card">
            <p className="eyebrow">Delivery Safety</p>
            <h2>Safe parcel receiving</h2>
            <ul className="safety-list">
              <li>Verify the Order ID on the package label before accepting delivery.</li>
              <li>Record an unboxing video before opening the parcel — this is required for any damage claims.</li>
              <li>Do not accept a tampered, torn, or damaged package without recording it on video first.</li>
              <li>If a delivery person asks for OTP without delivering the parcel, refuse and report to us.</li>
            </ul>
          </article>

          <article className="policy-card safety-card">
            <p className="eyebrow">Return Safety</p>
            <h2>Return process protection</h2>
            <ul className="safety-list">
              <li>All return requests must be raised via WhatsApp or the account portal within 7 days of delivery.</li>
              <li>Parcel opening video is mandatory — claims without video cannot be processed.</li>
              <li>Only use India Post Speed Post for return shipments. Keep the receipt.</li>
              <li>We reimburse up to ₹100 return shipping on approved cases.</li>
            </ul>
          </article>

          <article className="policy-card safety-card">
            <p className="eyebrow">Complaint &amp; Fraud</p>
            <h2>Reporting issues</h2>
            <ul className="safety-list">
              <li>For any fraud, suspicious activity, or safety concern, contact us immediately on WhatsApp: +91 9429429880.</li>
              <li>We do not contact customers via unknown numbers for payment collection.</li>
              <li>Report any fake websites or social media accounts impersonating Mahalaxmi Fashion Hub to us directly.</li>
            </ul>
          </article>

          <article className="policy-card safety-card">
            <p className="eyebrow">Support Hours</p>
            <h2>When to reach us</h2>
            <ul className="safety-list">
              <li>WhatsApp support: Monday to Saturday, 10:00 AM – 8:00 PM.</li>
              <li>Orders placed on Sunday are processed on Monday.</li>
              <li>Response time: typically within 1–2 hours during support hours.</li>
            </ul>
          </article>
        </section>
      </main>
    </>
  );
}
