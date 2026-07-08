'use client';
import { useState } from 'react';

// A "Size Guide" link that opens a simple size chart modal. Static, generic women's apparel
// sizing in inches — helps reduce wrong-size orders and returns.
const ROWS = [
  { size: 'S', bust: '32–34', waist: '26–28', hip: '35–37' },
  { size: 'M', bust: '34–36', waist: '28–30', hip: '37–39' },
  { size: 'L', bust: '36–38', waist: '30–32', hip: '39–41' },
  { size: 'XL', bust: '38–40', waist: '32–34', hip: '41–43' },
  { size: 'XXL', bust: '40–42', waist: '34–36', hip: '43–45' },
];

export default function SizeGuideButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ background: 'none', border: 'none', color: '#a7354d', fontWeight: 600, fontSize: '.82rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
        📏 Size Guide
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
            style={{ background: '#fff', borderRadius: '14px', maxWidth: '460px', width: '100%', padding: '1.5rem', position: 'relative' }}>
            <button onClick={() => setOpen(false)} aria-label="Close"
              style={{ position: 'absolute', top: '10px', right: '12px', background: 'rgba(0,0,0,.06)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1rem' }}>✕</button>

            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#5c1a28', margin: '0 0 .3rem' }}>Size Guide</h2>
            <p style={{ fontSize: '.82rem', color: '#888', margin: '0 0 1rem' }}>All measurements in inches. If you are between sizes, we suggest choosing the larger one.</p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
              <thead>
                <tr style={{ background: '#faf6f2' }}>
                  {['Size', 'Bust', 'Waist', 'Hip'].map(h => (
                    <th key={h} style={{ padding: '.55rem', textAlign: 'left', color: '#5c1a28', fontWeight: 700, borderBottom: '1px solid #f0e6ea' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(r => (
                  <tr key={r.size} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '.55rem', fontWeight: 700, color: '#1a1a1a' }}>{r.size}</td>
                    <td style={{ padding: '.55rem', color: '#555' }}>{r.bust}</td>
                    <td style={{ padding: '.55rem', color: '#555' }}>{r.waist}</td>
                    <td style={{ padding: '.55rem', color: '#555' }}>{r.hip}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ fontSize: '.78rem', color: '#aaa', margin: '1rem 0 0' }}>
              Need help? WhatsApp us your measurements and we&apos;ll recommend the best fit.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
