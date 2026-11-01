/**
 * What the shopper sees the instant she taps, instead of nothing.
 *
 * There was no loading.tsx anywhere in this app - not one. In the App Router
 * that has a very specific consequence: tapping a link to a server-rendered
 * page leaves her on the PAGE SHE IS ALREADY ON, unchanged, with no spinner
 * and no flicker, until the server has finished rendering the next one. The
 * header and footer are shared, so even when it arrives, little visibly
 * happens.
 *
 * That is the two or three seconds. Some of it is real work - the server
 * fetching and rendering - but all of it was invisible, which is what makes it
 * feel broken rather than slow. A tap that produces nothing reads as a tap
 * that missed.
 *
 * One file at the top of (store) covers every shop route that does not have
 * its own: the categories, the collections, the listings. It renders on the
 * server with the page it is waiting for, so it costs no JavaScript.
 *
 * It is a LISTING skeleton because that is what nearly every route under here
 * is. The product page has its own next door, where the shape is different.
 */
export default function Loading() {
  return (
    <div className="section-wrap" style={{ padding: '1.25rem 0 2rem' }} aria-busy="true">
      {/* Said out loud for a screen reader, which cannot see a grey rectangle
          pulsing. Visually hidden rather than absent. */}
      <span style={{
        position: 'absolute', width: 1, height: 1, overflow: 'hidden',
        clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
      }}>Loading</span>

      <div className="sk sk-line" style={{ width: 190, height: 26, marginBottom: '.6rem' }} />
      <div className="sk sk-line" style={{ width: 280, height: 14, marginBottom: '1.4rem' }} />

      <div className="products-grid">
        {/* Eight is about a phone screen and a half: enough that the grid
            reads as a grid, few enough that it is not a page of grey when the
            real thing lands a moment later. */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="product-card" style={{ border: '1px solid #f2ece9' }}>
            <div className="product-card-img sk" />
            <div style={{ padding: '.85rem', display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
              <div className="sk sk-line" style={{ width: '40%', height: 9 }} />
              <div className="sk sk-line" style={{ width: '92%', height: 13 }} />
              <div className="sk sk-line" style={{ width: '60%', height: 13 }} />
              <div className="sk sk-line" style={{ width: '45%', height: 15, marginTop: '.2rem' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
