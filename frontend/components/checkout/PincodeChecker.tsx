'use client';
import { useState } from 'react';
import { ordersApi } from '@/lib/api';

// Delivery-time / serviceability check. Moved here from the header — appears on
// the checkout page, below the delivery address section.
export default function PincodeChecker() {
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const check = async () => {
    const p = pin.replace(/\D/g, '');
    if (p.length !== 6) { setResult({ ok: false, text: 'Enter a valid 6-digit pincode.' }); return; }
    setChecking(true); setResult(null);
    try {
      const r = await ordersApi.checkPincode(p);
      if (r.known && !r.serviceable) {
        setResult({ ok: false, text: 'Delivery not available at this pincode. WhatsApp us — we may still arrange it.' });
      } else {
        const d1 = new Date(); d1.setDate(d1.getDate() + r.etaMinDays);
        const d2 = new Date(); d2.setDate(d2.getDate() + r.etaMaxDays);
        const f = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        setResult({ ok: true, text: `Delivery by ${f(d1)} - ${f(d2)}${r.cod ? ' - COD available' : ' - Prepaid only'}` });
      }
    } catch {
      setResult({ ok: false, text: 'Could not check right now. Please try again.' });
    } finally { setChecking(false); }
  };

  return (
    <div style={{ marginTop: '1rem', padding: '1rem 1.1rem', border: '1px solid #eadfe2', borderRadius: 12, background: '#faf7f4' }}>
      <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 700, color: '#5c1a28', marginBottom: '.5rem' }}>
        📍 Check delivery time for your pincode
      </label>
      <div style={{ display: 'flex', gap: '.5rem', maxWidth: 360 }}>
        <input type="text" inputMode="numeric" maxLength={6} value={pin}
          aria-label="Delivery pincode"
          onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setResult(null); }}
          onKeyDown={e => { if (e.key === 'Enter') check(); }}
          placeholder="6-digit pincode"
          style={{ flex: 1, border: '1.5px solid #e5d5d5', borderRadius: 8, padding: '.6rem .8rem', fontSize: '.9rem', outline: 'none' }} />
        <button type="button" onClick={check} disabled={checking}
          style={{ background: '#7a0a22', color: '#fff', border: '1px solid rgba(201,162,75,.5)', borderRadius: 8, padding: '0 1.2rem', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', opacity: checking ? .6 : 1 }}>
          {checking ? '…' : 'Check'}
        </button>
      </div>
      {result && (
        <p style={{ margin: '.6rem 0 0', fontSize: '.85rem', fontWeight: 600, color: result.ok ? '#2e7d32' : '#c0392b' }}>
          {result.ok ? '✓ ' : '✗ '}{result.text}
        </p>
      )}
    </div>
  );
}
