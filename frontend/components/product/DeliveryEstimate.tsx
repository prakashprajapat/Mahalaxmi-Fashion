'use client';
import { useState } from 'react';

// "Delivery by <date>" estimate from a PIN code. Uses a simple, honest heuristic:
// local Balotra (344xxx) 1–2 days, elsewhere 3–6 days. No external API needed.
function fmt(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function DeliveryEstimate() {
  const [pin, setPin] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const check = () => {
    const p = pin.replace(/\D/g, '');
    if (p.length !== 6) { setResult({ ok: false, text: 'Please enter a valid 6-digit PIN code.' }); return; }
    const isLocal = p.startsWith('344');   // Balotra & nearby
    const min = isLocal ? 1 : 3;
    const max = isLocal ? 2 : 6;
    setResult({ ok: true, text: `Delivery by ${fmt(min)} – ${fmt(max)}${isLocal ? ' (local — fast)' : ''}` });
  };

  return (
    <div style={{ border: '1px solid #f0e6ea', borderRadius: '10px', padding: '.8rem .9rem', background: '#fff' }}>
      <p style={{ fontSize: '.82rem', fontWeight: 700, color: '#5c1a28', margin: '0 0 .5rem' }}>🚚 Check delivery date</p>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <input
          type="text" inputMode="numeric" maxLength={6} value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setResult(null); }}
          placeholder="Enter 6-digit PIN"
          style={{ flex: 1, minWidth: '140px', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .7rem', fontSize: '.88rem', boxSizing: 'border-box' }}
        />
        <button onClick={check}
          style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1rem', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer' }}>
          Check
        </button>
      </div>
      {result && (
        <p style={{ margin: '.55rem 0 0', fontSize: '.83rem', fontWeight: 600, color: result.ok ? '#2e7d32' : '#c0392b' }}>
          {result.ok ? '✓ ' : ''}{result.text}
        </p>
      )}
    </div>
  );
}
