/**
 * The product page's own shape while it is being fetched.
 *
 * The listing skeleton one level up would show a grid of cards here, which is
 * the wrong promise: she tapped one saree and would be shown eight grey ones.
 * A skeleton that lies about what is coming is worse than a plain spinner,
 * because the layout then jumps when the real page replaces it.
 *
 * So: one big picture on the left, a title, a price and a button on the right,
 * stacking under 900px exactly as the real page does.
 */
export default function Loading() {
  return (
    <div className="section-wrap" style={{ padding: '1.25rem 0 2rem' }} aria-busy="true">
      <span style={{
        position: 'absolute', width: 1, height: 1, overflow: 'hidden',
        clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
      }}>Loading</span>

      <div className="pdp-skeleton">
        <div className="sk" style={{ aspectRatio: '3 / 4', borderRadius: 10 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
          <div className="sk sk-line" style={{ width: '35%', height: 10 }} />
          <div className="sk sk-line" style={{ width: '95%', height: 20 }} />
          <div className="sk sk-line" style={{ width: '70%', height: 20 }} />
          <div className="sk sk-line" style={{ width: '30%', height: 24, marginTop: '.3rem' }} />
          <div className="sk sk-line" style={{ width: '55%', height: 13 }} />
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.4rem' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="sk" style={{ width: 46, height: 34, borderRadius: 7 }} />
            ))}
          </div>
          <div className="sk sk-line" style={{ width: '100%', height: 44, marginTop: '.6rem', borderRadius: 9 }} />
          <div className="sk sk-line" style={{ width: '100%', height: 44, borderRadius: 9 }} />
        </div>
      </div>
    </div>
  );
}
