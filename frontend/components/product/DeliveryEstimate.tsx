'use client';
import { useEffect, useState } from 'react';
import { storage } from '@/lib/safeStorage';

const PIN_KEY = 'mfh_pin';

interface Answer {
  known: boolean;
  serviceable: boolean;
  cod: boolean;
  city?: string | null;
  state?: string | null;
  etaMinDays: number;
  etaMaxDays: number;
}

// "By Tuesday" instead of "4–7 days".
//
// The shop knew the answer all along — the pincode check already returns a
// best and worst day count for the buyer's own address — and the page still
// said the same vague thing to everyone. A span of days is arithmetic the
// shopper has to do, in their head, about a shop they do not yet trust; a
// weekday is a promise they can hold the shop to. That difference is the whole
// point of this box.
//
// Dates are worked out in the BROWSER, from the day counts the server sends,
// because the server runs on UTC and a parcel does not: at nine at night in
// India the server's "today" is still yesterday, and every date would come out
// a day early. Promising a day too soon is worse than saying nothing.
function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    // Sunday is not a delivery day here, and the courier does not collect from
    // the shop either. Counting it would quietly move every promise a day late.
    if (d.getDay() !== 0) left--;
  }
  return d;
}

const nice = (d: Date) =>
  d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

export default function DeliveryEstimate() {
  const [pin, setPin] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Asked once, remembered for the whole visit. Typing a pincode again on every
  // product is the kind of small tax that makes people stop checking at all.
  useEffect(() => {
    const saved = storage.get(PIN_KEY);
    if (saved && saved.length === 6) { setPin(saved); void check(saved); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function check(p: string) {
    const digits = p.replace(/\D/g, '');
    if (digits.length !== 6) { setError('Enter a 6-digit pincode.'); return; }
    setLoading(true); setError(''); setAnswer(null);
    try {
      const res = await fetch(`/api/orders/pincode/${digits}`);
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.message || 'Could not check that pincode.'); return; }
      setAnswer(data as Answer);
      storage.set(PIN_KEY, digits);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Orders placed late in the evening are packed the next day, so the clock
  // starts tomorrow. Saying "by Monday" to someone ordering at eleven at night
  // is a promise the shop cannot keep.
  const start = (() => {
    const now = new Date();
    return now.getHours() >= 17 ? addWorkingDays(now, 1) : now;
  })();

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 10, padding: '.8rem 1rem', margin: '1rem 0', background: '#fff' }}>
      <label htmlFor="pin-check" style={{ display: 'block', fontSize: '.84rem', fontWeight: 700, color: '#4a1f27', marginBottom: '.5rem' }}>
        When will it reach me?
      </label>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <input
          id="pin-check"
          value={pin}
          inputMode="numeric"
          maxLength={6}
          placeholder="Your 6-digit pincode"
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void check(pin); } }}
          style={{ flex: '1 1 150px', minWidth: 0, padding: '.5rem .7rem', border: '1.5px solid #ddd', borderRadius: 8, fontSize: '.9rem' }}
        />
        <button type="button" onClick={() => void check(pin)} disabled={loading}
          style={{ background: '#722f37', color: '#fff', border: 'none', borderRadius: 8,
            padding: '.5rem 1.1rem', fontWeight: 700, fontSize: '.86rem', cursor: 'pointer' }}>
          {loading ? 'Checking…' : 'Check'}
        </button>
      </div>

      {error && <p style={{ color: '#c0392b', fontSize: '.82rem', margin: '.5rem 0 0' }}>{error}</p>}

      {answer && !answer.serviceable && (
        <p style={{ color: '#c0392b', fontSize: '.85rem', margin: '.6rem 0 0', lineHeight: 1.6 }}>
          We cannot deliver to this pincode yet. Call <strong>+91 94294 29880</strong> — we can often
          send it by India Post instead.
        </p>
      )}

      {answer && answer.serviceable && (
        <div style={{ margin: '.7rem 0 0', fontSize: '.88rem', lineHeight: 1.7 }}>
          <div style={{ color: '#1b5e20', fontWeight: 700 }}>
            Arrives by {nice(addWorkingDays(start, answer.etaMaxDays))}
          </div>
          <div style={{ color: '#666', fontSize: '.82rem' }}>
            Often sooner — around {nice(addWorkingDays(start, answer.etaMinDays))}
            {answer.city ? ` · ${answer.city}` : ''}
          </div>
          <div style={{ color: answer.cod ? '#1b5e20' : '#8a4b00', fontSize: '.82rem', marginTop: '.2rem' }}>
            {answer.cod
              ? '✓ Cash on Delivery available here — pay when it arrives'
              : 'Cash on Delivery is not available for this pincode — prepaid only'}
          </div>
        </div>
      )}
    </div>
  );
}
