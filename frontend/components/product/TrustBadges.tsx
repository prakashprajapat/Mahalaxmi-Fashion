// Trust & secure-payment badge strip shown on the product page. Boosts buyer
// confidence (conversion + E-E-A-T trust signal). Pure presentational — no deps,
// no hooks — so it can render on the server for SEO.
export default function TrustBadges() {
  const items = [
    { icon: '🔒', title: 'Secure Payments', sub: '256-bit encrypted checkout' },
    { icon: '🚚', title: 'Cash on Delivery', sub: 'Pay when it arrives' },
    { icon: '↩️', title: 'Easy 7-Day Returns', sub: 'Hassle-free exchange' },
    { icon: '✅', title: 'Quality Checked', sub: 'Every order inspected' },
  ];
  const methods = ['UPI', 'VISA', 'RuPay', 'Mastercard', 'Net Banking', 'COD'];
  return (
    <div style={{ border: '1px solid #eadfe2', background: 'linear-gradient(180deg,#fffdf9,#fbf6ee)', borderRadius: 12, padding: '.9rem 1rem', marginTop: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '.75rem' }}>
        {items.map(it => (
          <div key={it.title} style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <span aria-hidden="true" style={{ fontSize: '1.35rem', lineHeight: 1 }}>{it.icon}</span>
            <span>
              <span style={{ display: 'block', fontWeight: 800, fontSize: '.82rem', color: '#5c1a28' }}>{it.title}</span>
              <span style={{ display: 'block', fontSize: '.72rem', color: '#8a7a70' }}>{it.sub}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '.8rem', paddingTop: '.7rem', borderTop: '1px dashed #eadfe2', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.4rem', justifyContent: 'center' }}>
        <span style={{ fontSize: '.7rem', fontWeight: 700, color: '#8a7a70', letterSpacing: '.04em', textTransform: 'uppercase' }}>We accept</span>
        {methods.map(m => (
          <span key={m} style={{ fontSize: '.68rem', fontWeight: 800, color: '#5c1a28', background: '#fff', border: '1px solid #eadfe2', borderRadius: 6, padding: '.18rem .5rem' }}>{m}</span>
        ))}
      </div>
    </div>
  );
}
