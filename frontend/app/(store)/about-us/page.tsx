import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us | Mahalaxmi Fashion Hub',
  description: 'A boutique saree and ethnic wear store in Balotra, Rajasthan, serving customers across India.',
  alternates: { canonical: '/about-us' },
};

export default function AboutUsPage() {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Our Story</p>
        <h1>About Us</h1>
        <p>Mahalaxmi Fashion Hub — a boutique ethnic wear destination rooted in Balotra, Rajasthan, serving customers across India with curated sarees, nightwear, and fabric essentials.</p>
      </section>

      <main className="policy-page">
        <article className="policy-card">
          <h2>Who We Are</h2>
          <p>Mahalaxmi Fashion Hub is a family-run ethnic wear boutique based in Balotra, Rajasthan. We specialise in designer sarees, daily nightwear, petticoats, popline fabric, and nighty cloth — handpicked with care for women who value quality, comfort, and style.</p>
          <p>Every product in our collection is personally curated to ensure it meets the everyday needs and festive aspirations of our customers, whether they are buying for themselves or gifting someone special.</p>

          <h2>Our Mission</h2>
          <p>To make quality ethnic wear accessible to every Indian household — with honest pricing, fast WhatsApp-based support, and a seamless online shopping experience that feels as personal as walking into our store.</p>

          <h2>What We Offer</h2>
          <ol>
            <li>Designer and everyday sarees in silk, cotton, georgette, and more.</li>
            <li>Comfortable daily nightwear and nighty cloth for women.</li>
            <li>Petticoats and inner essentials in a range of sizes and colours.</li>
            <li>Popline fabric and raw cloth for tailoring and home use.</li>
            <li>Curated festive and occasion wear for weddings, pujas, and celebrations.</li>
          </ol>

          <h2>Why Customers Trust Us</h2>
          <ol>
            <li>Transparent pricing — no hidden charges or surprise fees.</li>
            <li>WhatsApp ordering and support at +91 9429429880 for personal assistance.</li>
            <li>Hassle-free returns and exchange within the policy period.</li>
            <li>Fast dispatch with Delhivery courier tracking.</li>
            <li>Genuine customer reviews and product photos.</li>
          </ol>

          <h2>Our Store</h2>
          <p>Ward No. 45, Near Mahadev Temple, Balotra, Rajasthan — 344022, India.</p>
          <p>Store hours: Monday to Saturday, 10:00 AM – 8:00 PM.</p>
          <p>Phone / WhatsApp: <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer">+91 9429429880</a></p>
        </article>
      </main>
    </>
  );
}
