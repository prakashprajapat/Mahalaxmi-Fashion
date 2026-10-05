'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCustomer } from '@/lib/auth';
import { trackEvent } from '@/lib/analytics';

// The shop has a contact page and a WhatsApp number, and both ask the visitor to
// start a conversation. Most people will not. They will think "the size chart is
// wrong" or "I could not find the pay button" and then simply leave, and the shop
// never learns a thing.
//
// This page asks for one box of text and nothing else. Name, number and email are
// there only so a reply is possible - none of them are required, because a
// complaint with no name is still true.

const TOPICS = [
  { key: 'website',  label: 'The website or app', hint: 'Something confusing, slow or broken' },
  { key: 'product',  label: 'A product',          hint: 'Size, colour, fabric, photo' },
  { key: 'delivery', label: 'Delivery',           hint: 'Late, damaged, wrong parcel' },
  { key: 'payment',  label: 'Payment',            hint: 'Trouble paying, refund, COD' },
  { key: 'idea',     label: 'An idea',            hint: 'Something we should stock or do' },
  { key: 'other',    label: 'Something else',     hint: '' },
];

export default function FeedbackPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', topic: '', message: '' });
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [honeypot, setHoneypot] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Signed in? Then their details are already known - do not make them type what
  // the shop can see for itself.
  useEffect(() => {
    const c = getCustomer();
    if (!c) return;
    setForm(f => ({
      ...f,
      name: f.name || [c.firstName, c.lastName].filter(Boolean).join(' ').trim(),
      email: f.email || (c.email ?? ''),
      phone: f.phone || (c.phone ?? ''),
    }));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.message.trim().length < 4) { setError('Please write a little more.'); return; }
    setSending(true); setError('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          topic: form.topic || 'other',
          rating,
          pageUrl: typeof window !== 'undefined' ? window.location.href : '',
          website: honeypot,
        }),
      });
      if (!res.ok) throw new Error('Could not send. Please try again.');
      trackEvent('feedback_submitted', { topic: form.topic || 'other', rating });
      setSent(true);
    } catch (err) {
      setError((err as Error).message || 'Could not send. Please try again.');
    } finally { setSending(false); }
  };

  if (sent) {
    return (
      <main style={{ maxWidth: 620, margin: '0 auto', padding: '3rem 1rem 4rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3.25rem', marginBottom: '.75rem' }}>🙏</div>
        <h1 style={{ color: '#722f37', fontSize: '1.6rem', fontWeight: 800, margin: '0 0 .5rem' }}>
          Thank you — this is read
        </h1>
        <p style={{ color: '#6b615c', fontSize: '.95rem', lineHeight: 1.7, margin: '0 0 1.75rem' }}>
          Every message lands in our inbox the moment it is sent. If you left a number or an email,
          we will get back to you.
        </p>
        <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" style={{ background: '#722f37', color: '#fff', textDecoration: 'none',
                                  padding: '.75rem 1.5rem', borderRadius: 9, fontWeight: 700, fontSize: '.9rem' }}>
            Back to shopping
          </Link>
          <button onClick={() => { setSent(false); setForm(f => ({ ...f, message: '' })); setRating(0); }}
            style={{ background: '#fff', color: '#722f37', border: '1.5px solid #e8d9dd',
                     padding: '.75rem 1.5rem', borderRadius: 9, fontWeight: 700, fontSize: '.9rem', cursor: 'pointer' }}>
            Say something else
          </button>
        </div>
      </main>
    );
  }

  const field: React.CSSProperties = {
    width: '100%', height: 48, border: '1.5px solid #e4dcd8', borderRadius: 9,
    padding: '0 .9rem', fontSize: '.95rem', background: '#fff',
    boxSizing: 'border-box', outline: 'none',
  };

  return (
    <main style={{ maxWidth: 620, margin: '0 auto', padding: '2.25rem 1rem 4rem' }}>
      <h1 style={{ color: '#722f37', fontSize: '1.7rem', fontWeight: 800, margin: '0 0 .4rem' }}>
        Tell us what you think
      </h1>
      <p style={{ color: '#6b615c', fontSize: '.95rem', lineHeight: 1.7, margin: '0 0 1.75rem' }}>
        Something confusing, something missing, something we got wrong — we would rather hear it than
        not. It goes straight to the shop, not to a call centre.
      </p>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
        {/* Hidden from people, filled in by bots. */}
        <input type="text" name="website" value={honeypot} onChange={e => setHoneypot(e.target.value)}
          style={{ display: 'none' }} tabIndex={-1} autoComplete="off" aria-hidden="true" />

        <div>
          <p style={{ margin: '0 0 .55rem', fontWeight: 700, fontSize: '.9rem', color: '#2d2724' }}>
            How was your experience?
          </p>
          <div style={{ display: 'flex', gap: '.3rem' }} onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button"
                onClick={() => setRating(r => (r === n ? 0 : n))}
                onMouseEnter={() => setHover(n)}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '.1rem',
                         fontSize: '1.9rem', lineHeight: 1,
                         color: n <= (hover || rating) ? '#f5a623' : '#ddd5d1' }}>
                ★
              </button>
            ))}
          </div>
          <p style={{ margin: '.3rem 0 0', fontSize: '.78rem', color: '#9a908a' }}>Optional</p>
        </div>

        <div>
          <p style={{ margin: '0 0 .55rem', fontWeight: 700, fontSize: '.9rem', color: '#2d2724' }}>
            What is it about?
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.45rem' }}>
            {TOPICS.map(t => {
              const on = form.topic === t.key;
              return (
                <button key={t.key} type="button" title={t.hint}
                  onClick={() => setForm(f => ({ ...f, topic: on ? '' : t.key }))}
                  style={{ padding: '.5rem .9rem', borderRadius: 999, cursor: 'pointer',
                           fontSize: '.84rem', fontWeight: 650,
                           border: on ? '1.5px solid #722f37' : '1.5px solid #e4dcd8',
                           background: on ? '#faf0f3' : '#fff',
                           color: on ? '#722f37' : '#6b615c' }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <label style={{ display: 'block' }}>
          <span style={{ fontWeight: 700, fontSize: '.9rem', color: '#2d2724' }}>
            In your words <span style={{ color: '#c0392b' }}>*</span>
          </span>
          <textarea
            required
            value={form.message}
            onChange={e => { setForm(f => ({ ...f, message: e.target.value })); if (error) setError(''); }}
            rows={6}
            maxLength={4000}
            placeholder="Write in Hindi or English — whatever is easier."
            style={{ ...field, height: 'auto', padding: '.8rem .9rem', marginTop: '.45rem',
                     lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit' }} />
          <span style={{ fontSize: '.76rem', color: '#9a908a' }}>{form.message.length}/4000</span>
        </label>

        <div>
          <p style={{ margin: '0 0 .55rem', fontWeight: 700, fontSize: '.9rem', color: '#2d2724' }}>
            If you would like a reply
          </p>
          <div style={{ display: 'grid', gap: '.6rem' }}>
            <input style={field} placeholder="Your name (optional)" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoComplete="name" />
            <input style={field} type="tel" inputMode="numeric" maxLength={10}
              placeholder="WhatsApp number (optional)" value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} />
            <input style={field} type="email" placeholder="Email (optional)" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} autoComplete="email" />
          </div>
          <p style={{ margin: '.5rem 0 0', fontSize: '.78rem', color: '#9a908a', lineHeight: 1.6 }}>
            Leave all three blank if you prefer. We would still rather know.
          </p>
        </div>

        {error && (
          <p style={{ margin: 0, color: '#c0392b', fontWeight: 650, fontSize: '.88rem' }}>{error}</p>
        )}

        <button type="submit" disabled={sending}
          style={{ height: 52, border: 'none', borderRadius: 10, background: '#a01836', color: '#fff',
                   fontWeight: 800, fontSize: '1rem', cursor: sending ? 'not-allowed' : 'pointer',
                   opacity: sending ? .7 : 1 }}>
          {sending ? 'Sending…' : 'Send feedback'}
        </button>
      </form>
    </main>
  );
}
