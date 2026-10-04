'use client';
import { useEffect, useRef } from 'react';
import { getCart } from '@/lib/cart';
import { finalUnitPrice } from '@/lib/price';
import { getToken } from '@/lib/auth';

// Keeps the shop's copy of a signed-in shopper's basket in step with theirs.
//
// The cart itself does not change: it still lives in the browser and still
// works before anyone signs in. This only sends a copy, so a basket left
// overnight exists somewhere the shop can see it. Signed out, it does nothing
// at all — a basket with no name on it cannot be reminded about, and following
// anonymous visitors around to attach one is a different thing entirely.
export default function CartSync() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef('');

  useEffect(() => {
    const send = () => {
      const token = getToken();
      if (!token) return;

      const cart = getCart();
      const items = cart.map(i => ({
        dbId: i.dbId,
        name: i.name,
        quantity: i.quantity,
        price: finalUnitPrice(i),
        image: i.image,
      }));
      const value = items.reduce((s, i) => s + i.price * i.quantity, 0);

      // Adding three things one after another fires three events. Sending the
      // same basket three times would be noise on the shop's server and on the
      // shopper's phone data for nothing.
      const shape = JSON.stringify(items);
      if (shape === last.current) return;
      last.current = shape;

      fetch('/api/cart/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items, value }),
        keepalive: true,
      }).catch(() => { /* the basket is safe in the browser either way */ });
    };

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      // Two seconds after they stop fiddling. Sending on every keystroke of
      // the quantity box would be a request per digit.
      timer.current = setTimeout(send, 2000);
    };

    // On arrival too: someone who signed in on another day already has a
    // basket, and nothing would have told the shop about it.
    send();

    window.addEventListener('cart-updated', schedule);
    return () => {
      window.removeEventListener('cart-updated', schedule);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return null;
}
