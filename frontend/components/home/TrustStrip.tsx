// The four things a first-time shopper wants to know before they risk an order.
//
// These were emoji. Emoji render as a different picture on every phone, sit at
// a different baseline in every font, and read as a chat message rather than a
// shop — which is most of what separates a page that looks trustworthy from one
// that does not. They are thin stroke icons now, in the brand colour, at one
// weight.

const ICON = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: '#722f37', strokeWidth: 1.3 } as const;

const ITEMS = [
  {
    title: 'Secure payment',
    sub: 'UPI · Card · Net banking',
    path: <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M4 10h16" /></>,
  },
  {
    title: 'Easy 7-day returns',
    sub: 'Hassle-free exchange',
    path: <><path d="M4 12a8 8 0 0 1 13.7-5.6" /><path d="M18 4v4h-4" /><path d="M20 12a8 8 0 0 1-13.7 5.6" /><path d="M6 20v-4h4" /></>,
  },
  {
    title: 'Checked by hand',
    sub: 'Before it is packed',
    path: <><path d="M12 3l7 3v5.5c0 4.2-3 7.6-7 8.5-4-.9-7-4.3-7-8.5V6l7-3z" /><path d="M9 12l2 2 4-4" /></>,
  },
  {
    title: 'Pan-India delivery',
    sub: 'Tracked · Free over ₹999',
    path: <><path d="M4 8h11v8H4z" /><path d="M15 11h3.2l1.8 2.4V16H15z" /><circle cx="7.5" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></>,
  },
];

export default function TrustStrip() {
  return (
    <section style={{ background: '#fff', borderTop: '1px solid #efe7e8', borderBottom: '1px solid #efe7e8', padding: '1.15rem 1.25rem' }}>
      <div className="trust-grid" style={{
        maxWidth: 'var(--shell)', margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem',
      }}>
        {ITEMS.map(it => (
          <div key={it.title} style={{ display: 'flex', alignItems: 'flex-start', gap: '.7rem', justifyContent: 'center' }}>
            <svg {...ICON} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} strokeLinecap="round" strokeLinejoin="round">
              {it.path}
            </svg>
            <span>
              <span style={{ display: 'block', fontWeight: 600, fontSize: '.84rem', color: '#1e1b19', letterSpacing: '.04em' }}>{it.title}</span>
              <span className="trust-sub" style={{ display: 'block', fontSize: '.76rem', color: '#6b625c', marginTop: '.15rem' }}>{it.sub}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
