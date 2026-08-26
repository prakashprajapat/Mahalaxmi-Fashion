import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Mahalaxmi Fashion Hub',
  description: 'Customer data is used only for order processing and consented updates.',
  alternates: { canonical: '/privacy-policy' },
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Policy</p>
        <h1>Privacy Policy</h1>
        <p>Mahalaxmi Fashion Hub respects customer privacy and uses information only to process orders, improve service, and share relevant updates.</p>
      </section>

      <main className="policy-page">
        <article className="policy-card">
          <h2>Information We Collect</h2>
          <ol>
            <li>Name, contact number, email address, shipping address, and delivery-related notes.</li>
            <li>Order history, product preferences, size/customization notes, and customer support messages.</li>
            <li>Optional birthday, anniversary, and marketing preferences only when shared by the customer.</li>
          </ol>

          <h2>How We Use It</h2>
          <ol>
            <li>To process orders, deliveries, cancellations, refunds, and exchanges.</li>
            <li>To share the customer name, phone number, and delivery address with Delhivery or another courier partner only for shipping, delivery updates, and order tracking.</li>
            <li>To improve products, services, website experience, and customer support.</li>
            <li>To send promotional messages only where permitted by the customer.</li>
            <li>We do not request Aadhaar, PAN, or public document-upload links for normal customer account creation on this storefront.</li>
            <li>We maintain suitable safeguards to protect customer information from unauthorized access.</li>
          </ol>

          <h2>Cookies &amp; Tracking</h2>
          <p>Our website uses cookies and similar technologies to keep the site working and, with your consent, to understand how visitors use the site and to show relevant offers.</p>
          <ol>
            <li><strong>Essential cookies</strong> — required for basic functions such as keeping you signed in and remembering the items in your cart. These are always active and cannot be switched off.</li>
            <li><strong>Analytics cookies</strong> — Google Analytics helps us understand page visits and improve the store. These are set only after you accept.</li>
            <li><strong>Advertising cookies</strong> — the Meta (Facebook) Pixel helps us measure and improve our ads. These are set only after you accept.</li>
          </ol>
          <p>When you first visit, a cookie banner lets you <strong>Accept</strong> or <strong>Decline</strong> non-essential cookies. Analytics and advertising cookies stay switched off unless you choose Accept. You can change your choice at any time by clearing the saved site data for this website in your browser, which will show the banner again.</p>

          <h2>Data Retention</h2>
          <p>We retain your data for as long as your account is active or as needed to provide services. You may request deletion of your personal data by contacting us on WhatsApp.</p>

          <h2>Third Parties</h2>
          <p>We share data only with Delhivery (courier) and Razorpay (payment gateway) as required to process your orders. We do not sell customer data to any third party.</p>

          <h2>Your Rights</h2>
          <ol>
            <li>Right to access your personal data.</li>
            <li>Right to request correction of inaccurate data.</li>
            <li>Right to request deletion of your data (subject to legal obligations).</li>
            <li>Right to opt out of marketing communications at any time.</li>
          </ol>

          <p>Store contact: Ward No. 45, Near Mahadev Temple, Balotra, Rajasthan, India | <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer">+91 9429429880</a></p>
          <p>Last updated: August 2026</p>
        </article>
      </main>
    </>
  );
}
