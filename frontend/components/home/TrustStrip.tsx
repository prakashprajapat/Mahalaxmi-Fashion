// Trust signals shown across the site (homepage under the hero). Reassures shoppers about
// payment safety, returns, authenticity and delivery — a small touch that lifts trust & conversion.
const ITEMS = [
  { icon: '🔒', title: 'Secure Payment', sub: 'UPI · Card · Net Banking' },
  { icon: '🔄', title: 'Easy 7-Day Returns', sub: 'Hassle-free exchange' },
  { icon: '✅', title: '100% Genuine', sub: 'Quality-checked products' },
  { icon: '🚚', title: 'Pan-India Delivery', sub: 'Free over ₹999 · Tracked' },
];

export default function TrustStrip() {
  return (
    <section style={{ background: '#fff', borderTop: '1px solid #f0e6ea', borderBottom: '1px solid #f0e6ea', padding: '1rem 1.25rem' }}>
      <div style={{
        maxWidth: '1080px', margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem',
      }}>
        {ITEMS.map(it => (
          <div key={it.title} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', justifyContent: 'center', textAlign: 'left' }}>
            <span style={{ fontSize: '1.5rem', lineHeight: 1 }} aria-hidden="true">{it.icon}</span>
            <span>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '.86rem', color: '#5c1a28' }}>{it.title}</span>
              <span style={{ display: 'block', fontSize: '.74rem', color: '#616161' }}>{it.sub}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
