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

  // While the bar is visible, flag the body so the Help FAB (WhatsApp/chat) lifts
  // above it on mobile instead of covering the ✕ / Checkout buttons.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('cart-bar-open', !hide);
    return () => document.body.classList.remove('cart-bar-open');
  }, [hide]);

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
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 460;
          /* website (wine) colour */
          background: linear-gradient(180deg,#7a0a22 0%, #5c1420 100%);
          animation: floatUp .35s ease;
          box-shadow: 0 -4px 24px rgba(0,0,0,.28);
        }
        .floating-cart-bar.pulse {
          animation: floatUp .35s ease, cartPulse .6s ease;
        }
        .fcart-inner {
          max-width: 960px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between;
          padding: .7rem 1.1rem; gap: .8rem; flex-wrap: nowrap;
        }
        .fcart-info { display: flex; align-items: center; gap: .55rem; min-width: 0; }
        .fcart-emoji { font-size: 1.35rem; }
        .fcart-count { color: #fff; font-weight: 700; font-size: .92rem; white-space: nowrap; }
        .fcart-total { color: #f4d9df; font-size: .82rem; margin-left: .5rem; white-space: nowrap; }
        .fcart-actions { display: flex; gap: .5rem; align-items: center; flex-shrink: 0; }
        .fcart-view {
          background: rgba(255,255,255,.14); color: #fff;
          border: 1px solid rgba(255,255,255,.45); border-radius: 8px;
          padding: .5rem .9rem; font-size: .84rem; font-weight: 600; cursor: pointer;
          white-space: nowrap;
        }
        .fcart-checkout {
          background: #ffffff; color: #7a0a22;
          border: none; border-radius: 8px;
          padding: .5rem 1.1rem; font-size: .86rem; font-weight: 800; cursor: pointer;
          white-space: nowrap;
        }
        .fcart-close {
          background: none; border: none; color: #f0c9d1;
          font-size: 1.15rem; cursor: pointer; padding: .2rem; line-height: 1; flex-shrink: 0;
        }
        /* Mobile: sit ABOVE the fixed bottom-nav (≈62px) so the buttons are never
           hidden behind it, and keep everything on one compact row. */
        @media (max-width: 600px) {
          .floating-cart-bar { bottom: calc(60px + env(safe-area-inset-bottom, 0px)); }
          .fcart-inner { padding: .55rem .7rem; gap: .5rem; }
          .fcart-emoji { font-size: 1.15rem; }
          .fcart-count { font-size: .82rem; }
          .fcart-total { font-size: .74rem; margin-left: .35rem; }
          .fcart-view { padding: .45rem .65rem; font-size: .76rem; }
          .fcart-checkout { padding: .45rem .8rem; font-size: .78rem; }
          .fcart-actions { gap: .35rem; }
        }
        /* Very small phones: drop the "View Cart" label to guarantee Checkout + ✕ fit. */
        @media (max-width: 360px) {
          .fcart-total { display: none; }
          .fcart-view { display: none; }
        }
      `}</style>

      <div className={`floating-cart-bar${pulse ? ' pulse' : ''}`}>
        <div className="fcart-inner">
          {/* Left: cart info */}
          <div className="fcart-info">
            <span className="fcart-emoji" aria-hidden="true">🛒</span>
            <div style={{ minWidth: 0 }}>
              <span className="fcart-count">
                {count} item{count !== 1 ? 's' : ''}
              </span>
              <span className="fcart-total">
                ₹{total.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Right: actions */}
          <div className="fcart-actions">
            <button className="fcart-view" onClick={() => router.push('/cart')}>
              View Cart
            </button>
            <button className="fcart-checkout" onClick={() => router.push('/checkout')}>
              Checkout →
            </button>
            <button
              className="fcart-close"
              onClick={() => setDismissed(true)}
              aria-label="Close cart bar">
              ✕
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
