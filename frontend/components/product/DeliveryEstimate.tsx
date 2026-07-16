'use client';
import { useState } from 'react';
import { ordersApi } from '@/lib/api';

// "Delivery by <date>" estimate from a PIN code — checks live Delhivery
// serviceability + COD + ETA. If Delhivery can't be reached, falls back to a
// simple honest heuristic so the customer always sees an estimate.
function fmt(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

type Result =
  | { kind: 'ok'; text: string; cod: boolean; place?: string }
  | { kind: 'no'; text: string }
  | { kind: 'err'; text: string };

export default function DeliveryEstimate() {
  const [pin, setPin] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    const p = pin.replace(/\D/g, '');
    if (p.length !== 6) { setResult({ kind: 'err', text: 'Please enter a valid 6-digit PIN code.' }); return; }
    setLoading(true); setResult(null);
    try {
      const r = await ordersApi.checkPincode(p);

      // Verified NOT serviceable.
      if (r.known && !r.serviceable) {
        setResult({ kind: 'no', text: 'Sorry, delivery is not available at this pincode. Message us on WhatsApp — we may still arrange it.' });
        return;
      }

      // Serviceable (or couldn't verify → still show an estimate).
      const place = [r.city, r.state].filter(Boolean).join(', ');
      const text = `Delivery by ${fmt(r.etaMinDays)} – ${fmt(r.etaMaxDays)}`;
      setResult({ kind: 'ok', text, cod: r.cod, place: place || undefined });
    } catch {
      // Network/API issue — heuristic fallback so the customer isn't blocked.
      const isLocal = p.startsWith('344');
      setResult({ kind: 'ok', text: `Delivery by ${fmt(isLocal ? 1 : 3)} – ${fmt(isLocal ? 2 : 6)}`, cod: true });
    } finally { setLoading(false); }
  };

  return (
    <div style={{ border: '1px solid #f0e6ea', borderRadius: '10px', padding: '.8rem .9rem', background: '#fff' }}>
      <p style={{ fontSize: '.82rem', fontWeight: 700, color: '#5c1a28', margin: '0 0 .5rem' }}>🚚 Check delivery date</p>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <input
          type="text" inputMode="numeric" maxLength={6} value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setResult(null); }}
          onKeyDown={e => { if (e.key === 'Enter') check(); }}
          placeholder="Enter 6-digit PIN"
          style={{ flex: 1, minWidth: '140px', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .7rem', fontSize: '.88rem', boxSizing: 'border-box' }}
        />
        <button onClick={check} disabled={loading}
          style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer', opacity: loading ? .6 : 1 }}>
          {loading ? 'Checking…' : 'Check'}
        </button>
      </div>
      {result && (
        <div style={{ margin: '.55rem 0 0' }}>
          {result.kind === 'ok' && (
            <>
              <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 700, color: '#2e7d32' }}>✓ {result.text}</p>
              <p style={{ margin: '.15rem 0 0', fontSize: '.78rem', color: '#777' }}>
                {result.place ? `${result.place} · ` : ''}{result.cod ? 'COD available' : 'Prepaid only at this pincode'}
              </p>
            </>
          )}
          {result.kind === 'no' && <p style={{ margin: 0, fontSize: '.83rem', fontWeight: 600, color: '#c0392b' }}>✗ {result.text}</p>}
          {result.kind === 'err' && <p style={{ margin: 0, fontSize: '.83rem', fontWeight: 600, color: '#c0392b' }}>{result.text}</p>}
        </div>
      )}
    </div>
  );
}
