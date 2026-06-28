'use client';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getCart, cartCount, cartTotal } from '@/lib/cart';

// Hide on these pages (user is already in cart/checkout flow)
const HIDE_PATHS = ['/cart', '/checkout'];

export default function FloatingCart() {
  const pathname  = usePathname();
  const router    = useRouter();
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [prevCount, setPrevCount] = useState(0);

  useEffect(() => {
    const update = () => {
      const cart = getCart();
      const newCount = cartCount(cart);
      setTotal(cartTotal(cart));

      // Pulse animation when item added
      if (newCount > prevCount) {
        setPulse(true);
        setDismissed(false);          // re-show bar when new item added
        setTimeout(() => setPulse(false), 700);
      }
      setPrevCount(newCount);
      setCount(newCount);
    };
    update();
    window.addEventListener('cart-updated', update);
    return () => window.removeEventListener('cart-updated', update);
  }, [prevCount]);

  // Don't show on cart/checkout pages, or when cart is empty, or dismissed
  const hide = HIDE_PATHS.some(p => pathname.startsWith(p)) || count === 0 || dismissed;
  if (hide) return null;

  return (
    <>
      <style>{`
        @keyframes floatUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes cartPulse {
          0%,100% { transform: scale(1); }
          35%      { transform: scale(1.08); }
          70%      { transform: scale(.96); }
        }
        .floating-cart-bar {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 400;
          background: #1a1a2e;
          animation: floatUp .35s ease;
          box-shadow: 0 -4px 24px rgba(0,0,0,.25);
        }
        .floating-cart-bar.pulse {
          animation: floatUp .35s ease, cartPulse .6s ease;
        }
      `}</style>

      <div className={`floating-cart-bar${pulse ? ' pulse' : ''}`}>
        <div style={{
          maxWidth: '960px', margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '.75rem 1.25rem', gap: '1rem', flexWrap: 'wrap',
        }}>
          {/* Left: cart info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <span style={{ fontSize: '1.4rem' }} aria-hidden="true">🛒</span>
            <div>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: '.95rem' }}>
                {count} item{count !== 1 ? 's' : ''} in cart
              </span>
              <span style={{ color: '#aaa', fontSize: '.85rem', marginLeft: '.6rem' }}>
                ₹{total.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Right: actions */}
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
            <button
              onClick={() => router.push('/cart')}
              style={{
                background: 'rgba(255,255,255,.1)', color: '#ddd',
                border: '1px solid rgba(255,255,255,.2)', borderRadius: '8px',
                padding: '.5rem 1rem', fontSize: '.85rem', fontWeight: 600, cursor: 'pointer',
              }}>
              View Cart
            </button>
            <button
              onClick={() => router.push('/checkout')}
              style={{
                background: '#a7354d', color: '#fff',
                border: 'none', borderRadius: '8px',
                padding: '.5rem 1.25rem', fontSize: '.88rem', fontWeight: 700, cursor: 'pointer',
              }}>
              Checkout →
            </button>
            <button
              onClick={() => setDismissed(true)}
              aria-label="Close cart bar"
              style={{
                background: 'none', border: 'none', color: '#888',
                fontSize: '1.1rem', cursor: 'pointer', padding: '.25rem', lineHeight: 1,
              }}>
              ✕
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
