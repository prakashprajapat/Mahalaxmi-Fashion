import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Mahalaxmi Fashion Hub collects, uses, shares and protects your personal data, and how to reach our Grievance Officer.',
  alternates: { canonical: '/privacy-policy' },
};

// Written for the Digital Personal Data Protection Act, 2023 and the DPDP
// Rules, 2025. Keep it true to what the website actually does: if a new
// courier, payment gateway or messaging service is added, add it under
// "Who We Share It With" the same day.
export default function PrivacyPolicyPage() {
  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Policy</p>
        <h1>Privacy Policy</h1>
        <p>Mahalaxmi Fashion Hub respects your privacy. This page explains what personal data we collect, why, who we share it with, how long we keep it, and the rights you have under the Digital Personal Data Protection Act, 2023.</p>
      </section>

      <main className="policy-page">
        <article className="policy-card">
          <h2>Who We Are</h2>
          <p>Mahalaxmi Fashion Hub (www.mahalaxmifashionhub.com and our mobile app), Ward No. 45, Near Mahadev Temple, Balotra, Rajasthan, India, decides how your personal data is used and is responsible for it (the &quot;Data Fiduciary&quot;).</p>

          <h2>Information We Collect</h2>
          <ol>
            <li>Name, mobile number, email address, shipping address, state and pincode.</li>
            <li>Orders, payments status (we never see or store your card, UPI PIN or bank password), returns, exchanges and refunds.</li>
            <li>Messages you send us: support chats, feedback, reviews and photos you upload with them.</li>
            <li>Login records: date and time, device, browser and IP address, used to keep your account safe.</li>
            <li>Optional details you choose to give: birthday, anniversary and marketing preferences.</li>
            <li>We do not ask for Aadhaar, PAN or document uploads to create a customer account.</li>
          </ol>

          <h2>Why We Use It</h2>
          <ol>
            <li>To take, pack, ship and deliver your order, and to handle cancellations, returns, exchanges and refunds.</li>
            <li>To send order, payment, shipping and delivery messages and login OTPs by SMS, WhatsApp and email. These are needed to serve your order.</li>
            <li>To remind you once if a payment did not complete, and to help you sign in if a login fails.</li>
            <li>To ask for a review after delivery, and to answer your questions and complaints.</li>
            <li>To send offers and new arrivals by SMS, WhatsApp and email <strong>only if you have agreed</strong>.</li>
            <li>To prevent fraud and misuse, keep accounts secure, and meet tax (GST) and other legal requirements.</li>
          </ol>
          <p>Your consent is voluntary. Saying no to offers does not affect your orders.</p>

          <h2>Who We Share It With</h2>
          <p>We share only the data each service needs to do its job, and we do not sell your data to anyone.</p>
          <ol>
            <li><strong>Delhivery, Shiprocket and Amazon Shipping</strong> (couriers): name, phone number and delivery address, to deliver and track your parcel.</li>
            <li><strong>Cashfree and Razorpay</strong> (payment gateways): order amount, name, phone and email, to take your payment safely. Card and UPI details are handled only by them.</li>
            <li><strong>MSG91</strong> (SMS service): your mobile number and the message, to send OTPs and order updates.</li>
            <li><strong>Email service provider</strong>: your email address and the message, to send order emails.</li>
            <li><strong>Meta</strong> (WhatsApp, Facebook, Instagram): WhatsApp messages, and website visit data through the Meta Pixel to measure our ads.</li>
            <li><strong>Google</strong> (Analytics, Ads, Merchant Center): website visit data to understand how the site is used and to measure our ads.</li>
            <li>Government authorities, when the law requires it.</li>
          </ol>

          <h2>Cookies &amp; Tracking</h2>
          <ol>
            <li><strong>Essential cookies</strong> keep you signed in and remember your cart. The site does not work without them.</li>
            <li><strong>Analytics cookies</strong> (Google Analytics) show us which pages are visited, so we can improve the store.</li>
            <li><strong>Advertising cookies</strong> (Meta Pixel, Google Ads) measure how our ads perform.</li>
          </ol>
          <p>You can block or delete cookies at any time in your browser settings. Blocking analytics and advertising cookies does not stop you from shopping.</p>

          <h2>Stopping Promotional Messages</h2>
          <ol>
            <li>Sign in and open <strong>My Account &rarr; Marketing Preferences</strong>, untick the offers box and save. All promotional SMS, WhatsApp and email messages stop.</li>
            <li>Or message us on WhatsApp at <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer">+91 9429429880</a> or email our Grievance Officer (below), and we will switch them off for you.</li>
            <li>Order, payment, delivery and OTP messages still come, because they are needed to serve your orders.</li>
          </ol>

          <h2>How Long We Keep It</h2>
          <ol>
            <li>Account details: while your account is open. When you delete your account (My Account &rarr; Delete Account) we erase your profile, except what the law requires us to keep.</li>
            <li>Orders and invoices: as long as GST and tax laws require (about 6 to 8 years).</li>
            <li>Login, payment and message records: at least 1 year, as the DPDP Rules require, and then deleted when no longer needed.</li>
            <li>Data collected for a purpose that has ended (for example, a payment that was never completed) is deleted once it is no longer needed.</li>
          </ol>

          <h2>How We Protect It</h2>
          <ol>
            <li>Passwords and OTPs are stored only as a slow one-way hash (bcrypt) with a unique salt. Nobody, including our staff, can read your password.</li>
            <li>The website uses HTTPS encryption, and the admin panel is limited to authorised staff, each with only the access they need.</li>
            <li>Sign-ins are logged and repeated failed attempts are blocked.</li>
          </ol>

          <h2>If There Is a Data Breach</h2>
          <p>If your personal data is ever exposed through unauthorised access, loss or leak:</p>
          <ol>
            <li>We will tell you without delay by email, SMS or WhatsApp: what happened, when, which of your data was involved, the likely effect on you, what we are doing about it, and what you can do to protect yourself (for example, change your password).</li>
            <li>We will inform the Data Protection Board of India without delay, and send it a full report within 72 hours, as the DPDP Rules require.</li>
            <li>We will fix the cause, and you can contact our Grievance Officer with any question about it.</li>
          </ol>

          <h2>Children&apos;s Privacy</h2>
          <ol>
            <li>Our store is meant for adults. You must be 18 or older to create an account or place an order.</li>
            <li>A person under 18 may use the store only through a parent or legal guardian, who creates the account and places the order.</li>
            <li>We do not knowingly collect data from children, and we do not track children or show them targeted advertising.</li>
            <li>If you believe a child has given us personal data, contact our Grievance Officer and we will delete it.</li>
          </ol>

          <h2>Your Rights</h2>
          <ol>
            <li><strong>Access</strong>: ask what personal data we hold about you and how it is used.</li>
            <li><strong>Correction and updating</strong>: change your details in My Account, or ask us to.</li>
            <li><strong>Erasure</strong>: delete your account yourself, or ask us to erase your data (except what the law requires us to keep).</li>
            <li><strong>Withdraw consent</strong>: as easily as you gave it, from Marketing Preferences or by contacting us.</li>
            <li><strong>Nominate</strong> a person to use these rights for you in case of death or incapacity.</li>
            <li><strong>Grievance</strong>: complain to our Grievance Officer, and if you are not satisfied, to the Data Protection Board of India.</li>
          </ol>

          <h2>Grievance Officer</h2>
          <p>
            <strong>Prakash Prajapat</strong><br />
            Email: <a href="mailto:prakashprajapat683@gmail.com">prakashprajapat683@gmail.com</a><br />
            WhatsApp: <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer">+91 9429429880</a><br />
            Address: Ward No. 45, Near Mahadev Temple, Balotra, Rajasthan, India
          </p>
          <p>We acknowledge every request and resolve it within 90 days at the latest, as the DPDP Rules require. Please include your registered mobile number or email so we can find your account.</p>

          <h2>Changes to This Policy</h2>
          <p>We will update this page when what we do with your data changes, and tell you about important changes.</p>

          <p>Last updated: 5 November 2026</p>
        </article>
      </main>
    </>
  );
}
