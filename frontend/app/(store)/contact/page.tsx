'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { settingsApi } from '@/lib/api';
import { trackEvent } from '@/lib/analytics';

const DEFAULT_WA = '919429429880';
const DEFAULT_ADDRESS_LINE1 = 'Ward No. 45, Near Mahadev Temple,';
const DEFAULT_ADDRESS_LINE2 = 'Balotra, Rajasthan — 344022, India.';
const normalizeWa = (raw?: string) => {
  const d = (raw || '').replace(/\D/g, '');
  return !d ? DEFAULT_WA : d.length === 10 ? '91' + d : d;
};

export default function ContactPage() {
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [phone, setPhone]     = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent]       = useState(false);
  const [info, setInfo]       = useState<Record<string, string>>({});

  useEffect(() => {
    settingsApi.getAll().then(r => setInfo(r.settings ?? {})).catch(() => {});
  }, []);

  const wa = normalizeWa(info.whatsapp || info.phone);
  const waDisplay = '+' + wa.replace(/^(\d{2})(\d+)/, '$1 $2');
  const address = info.address?.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) return;
    // Build a WhatsApp message with all the form details
    const text = `*New Enquiry from Website*\n\n*Name:* ${name}\n*Email:* ${email}\n*Phone:* ${phone}\n\n*Message:*\n${message}`;
    const url  = `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
    trackEvent('contact_form_submit', { method: 'whatsapp' });         // GA4
    trackEvent('generate_lead', { source: 'contact_form' });           // GA4 (contact = a lead)
    window.open(url, '_blank');
    setSent(true);
    setName(''); setEmail(''); setPhone(''); setMessage('');
    setTimeout(() => setSent(false), 5000);
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%', border: '1.5px solid #ddd', borderRadius: '8px',
    padding: '.65rem .85rem', fontSize: '.92rem', boxSizing: 'border-box',
    fontFamily: 'inherit', outline: 'none', transition: 'border-color .2s',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem', color: '#444',
  };

  return (
    <>
      <style>{`
        .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
        @media (max-width: 700px) { .contact-grid { grid-template-columns: 1fr !important; } }
        .contact-input:focus { border-color: #a7354d !important; }
      `}</style>

      <section className="page-hero">
        <p className="eyebrow">Get in Touch</p>
        <h1>Contact Us</h1>
        <p>We are here to help — for orders, product queries, returns, or any support. Reach us on WhatsApp for the fastest response.</p>
      </section>

      <main className="policy-page">
        <div className="contact-grid">

          {/* ── Left: Contact Info ─────────────────────────────────────────── */}
          <article className="policy-card">
            <h2>WhatsApp &amp; Phone</h2>
            <p>For the fastest support, message or call us directly on WhatsApp:</p>
            <p><strong>{waDisplay}</strong></p>
            <p><a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" style={{ color: '#a7354d', fontWeight: 600 }}>Chat on WhatsApp →</a></p>

            <h2 style={{ marginTop: '1.5rem' }}>Store Address</h2>
            <p>{address ? address : (<>{DEFAULT_ADDRESS_LINE1}<br />{DEFAULT_ADDRESS_LINE2}</>)}</p>
            <p>Store hours: Monday to Saturday, 10:00 AM – 8:00 PM.</p>

            <h2 style={{ marginTop: '1.5rem' }}>Social Media</h2>
            <ol>
              <li><a href="https://www.instagram.com/mahalaxmifashionhub.blt/" target="_blank" rel="noopener noreferrer">Instagram — @mahalaxmifashionhub.blt</a></li>
              <li><a href="https://www.facebook.com/mahalaxmifashionhub.blt/" target="_blank" rel="noopener noreferrer">Facebook — Mahalaxmi Fashion Hub</a></li>
            </ol>

            <h2 style={{ marginTop: '1.5rem' }}>Common Queries</h2>
            <ol>
              <li><strong>Order status:</strong> Use the <Link href="/tracking">Track Order</Link> page or WhatsApp us your order ID.</li>
              <li><strong>Returns &amp; exchange:</strong> See our <Link href="/return-exchange">Refund &amp; Exchange Policy</Link> or WhatsApp us within the return window.</li>
              <li><strong>Product availability:</strong> Send us a WhatsApp message with the product name or image for real-time stock updates.</li>
              <li><strong>Custom orders:</strong> Contact us on WhatsApp to discuss bulk orders, custom saree selection, or gifting queries.</li>
            </ol>

            <p style={{ marginTop: '1rem', color: '#888', fontSize: '.88rem' }}>We typically respond within 1–2 hours on WhatsApp during store hours (Mon–Sat, 10 AM – 8 PM).</p>
          </article>

          {/* ── Right: Contact Form ────────────────────────────────────────── */}
          <article className="policy-card">
            <h2>Send Us a Message</h2>
            <p style={{ color: '#777', fontSize: '.88rem', marginBottom: '1.25rem' }}>Fill in the form below and we will open WhatsApp with your message ready to send.</p>

            {sent && (
              <div style={{ background: '#e8f5e9', color: '#2e7d32', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '.75rem 1rem', marginBottom: '1rem', fontWeight: 600, fontSize: '.9rem' }}>
                ✅ WhatsApp opened with your message! We will respond shortly.
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Your Name *</label>
                <input
                  type="text" required value={name} onChange={e => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="contact-input" style={fieldStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Email Address</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="contact-input" style={fieldStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Phone / WhatsApp Number</label>
                <input
                  type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+91 XXXXXXXXXX"
                  className="contact-input" style={fieldStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Your Message *</label>
                <textarea
                  required value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Tell us about your query, order, or product you are looking for..."
                  rows={5}
                  className="contact-input"
                  style={{ ...fieldStyle, resize: 'vertical' }}
                />
              </div>

              <button
                type="submit"
                style={{
                  background: '#25D366', color: '#fff', border: 'none', borderRadius: '10px',
                  padding: '.75rem 1.5rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '.5rem', justifyContent: 'center',
                  transition: 'background .2s',
                }}>
                💬 Send via WhatsApp
              </button>

              <p style={{ color: '#aaa', fontSize: '.78rem', textAlign: 'center' }}>
                Clicking the button opens WhatsApp with your message pre-filled.
              </p>
            </form>
          </article>

        </div>
      </main>
    </>
  );
}
