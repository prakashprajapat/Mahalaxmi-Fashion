import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms & Conditions | Mahalaxmi Fashion Hub',
  description: 'By using our website or placing an order, you agree to these terms.',
  alternates: { canonical: '/terms-conditions' },
};

export default function TermsConditionsPage() {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Legal</p>
        <h1>Terms &amp; Conditions</h1>
        <p>By accessing our website or placing an order with Mahalaxmi Fashion Hub, you agree to the following terms and conditions.</p>
      </section>

      <main className="policy-page">
        <article className="policy-card">
          <h2>1. General</h2>
          <ol>
            <li>These terms apply to all users of the website mahalaxmifashionhub.com and to all orders placed through the website or via WhatsApp.</li>
            <li>Mahalaxmi Fashion Hub reserves the right to update these terms at any time. Continued use of the website after changes constitutes acceptance of the revised terms.</li>
            <li>All content on this website — including product images, descriptions, logos, and text — is the property of Mahalaxmi Fashion Hub and may not be reproduced without permission.</li>
          </ol>

          <h2>2. Orders &amp; Pricing</h2>
          <ol>
            <li>All prices listed on the website are in Indian Rupees (INR) and are inclusive of applicable taxes unless stated otherwise.</li>
            <li>We reserve the right to change product prices at any time without prior notice. Orders already confirmed will be fulfilled at the price applicable at the time of placing the order.</li>
            <li>Mahalaxmi Fashion Hub reserves the right to cancel any order due to stock unavailability, pricing errors, or fraud suspicion. In such cases, a full refund will be issued.</li>
            <li>Order confirmation is subject to successful payment and product availability.</li>
          </ol>

          <h2>3. Payments</h2>
          <ol>
            <li>We accept online payment via UPI, debit/credit cards, and net banking through our payment gateway.</li>
            <li>Cash on Delivery (COD) may be available for select pin codes.</li>
            <li>All transactions are processed securely. Mahalaxmi Fashion Hub does not store card or payment credentials.</li>
          </ol>

          <h2>4. Shipping</h2>
          <ol>
            <li>We ship across India via Delhivery and other courier partners.</li>
            <li>Estimated delivery timelines are 3–7 business days depending on your location. Remote areas may take longer.</li>
            <li>Mahalaxmi Fashion Hub is not responsible for delays caused by courier partners, natural events, or incorrect addresses provided by the customer.</li>
            <li>Please refer to our <Link href="/shipping-delivery-policy">Shipping &amp; Delivery Policy</Link> for full details.</li>
          </ol>

          <h2>5. Returns &amp; Exchanges</h2>
          <ol>
            <li>Returns and exchanges are accepted within the window specified in our <Link href="/return-exchange">Refund &amp; Exchange Policy</Link>.</li>
            <li>Products must be unused, unwashed, and returned in original packaging with tags intact.</li>
            <li>Items damaged due to customer misuse are not eligible for return or exchange.</li>
          </ol>

          <h2>6. Limitation of Liability</h2>
          <ol>
            <li>Mahalaxmi Fashion Hub is not liable for any indirect, incidental, or consequential damages arising from the use of our products or website.</li>
            <li>Our maximum liability in any dispute is limited to the value of the order in question.</li>
          </ol>

          <h2>7. Governing Law</h2>
          <p>These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Balotra, Rajasthan.</p>

          <h2>8. Contact</h2>
          <p>For any queries related to these terms, contact us at:</p>
          <p>Ward No. 45, Near Mahadev Temple, Balotra, Rajasthan — 344022 | WhatsApp: <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer">+91 9429429880</a></p>
          <p>Last updated: June 2026</p>
        </article>
      </main>
    </>
  );
}
