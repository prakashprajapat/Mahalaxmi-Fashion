'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getCart, saveCart, removeFromCart, updateQuantity, cartTotal, finalUnitPrice } from '@/lib/cart';
import { productsApi } from '@/lib/api';
import type { CartItem } from '@/types';

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    setCart(getCart());
    const onUpdate = () => setCart(getCart());
    window.addEventListener('cart-updated', onUpdate);
    return () => window.removeEventListener('cart-updated', onUpdate);
  }, []);

  // Re-check every cart line against the product's CURRENT stock and cap the quantity.
  // This fixes older cart items (added before per-variant stock was tracked) and keeps
  // the cart honest even if stock dropped since the item was added.
  useEffect(() => {
    const current = getCart();
    if (current.length === 0) return;
    let cancelled = false;
    (async () => {
      const ids = [...new Set(current.map(i => i.dbId))];
      const byId: Record<number, any> = {};
      await Promise.all(ids.map(async id => {
        try { byId[id] = (await productsApi.getById(id)).product; } catch { /* ignore */ }
      }));
      if (cancelled) return;
      let changed = false;
      const next = current.map(item => {
        const p = byId[item.dbId];
        if (!p) return item;
        let extra: any = {};
        try { extra = JSON.parse((p as any).extraJson ?? '{}'); } catch { return item; }
        const vm = extra.variantMatrix;
        if (!vm || typeof vm !== 'object') return item;
        const size = item.selectedSize ?? '';
        const color = item.selectedColor ?? '';
        let stock: any = color ? vm[`${size}|${color}`] : vm[size];
        if (stock === undefined && size) stock = vm[size];
        if (typeof stock !== 'number') return item;
        const cappedQ = Math.max(1, Math.min(item.quantity, stock));
        if (cappedQ !== item.quantity || item.maxStock !== stock) {
          changed = true;
          return { ...item, quantity: cappedQ, maxStock: stock };
        }
        return item;
      });
      if (changed) { saveCart(next); setCart(next); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (cart.length === 0) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-5xl mb-4">🛒</p>
      <h2 className="text-2xl font-bold mb-2 text-gray-700">Your cart is empty</h2>
      <Link href="/products" className="btn-primary inline-block mt-4">Start Shopping</Link>
    </div>
  );

  const total = cartTotal(cart);   // shipping already folded into each item's price

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6 text-[#8B1A1A]">Shopping Cart</h1>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Items */}
        <div className="flex-1 space-y-4">
          {cart.map(item => {
            const price = finalUnitPrice(item);
            return (
              <div key={`${item.dbId}-${item.selectedSize}-${item.selectedColor}`} className="card p-4 flex gap-4">
                <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-50 shrink-0">
                  {item.image
                    ? <Image src={item.image} alt={item.name} fill className="object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-2xl">👗</div>}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{item.name}</p>
                  {item.selectedSize && <p className="text-sm text-gray-500">Size: {item.selectedSize}</p>}
                  {item.selectedColor && <p className="text-sm text-gray-500">Colour / Design: {item.selectedColor}</p>}
                  <p className="font-bold text-[#8B1A1A]">₹{price.toLocaleString('en-IN')}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => { updateQuantity(item.dbId, item.quantity - 1, item.selectedSize, item.selectedColor); setCart(getCart()); }}
                      className="w-7 h-7 rounded border text-sm">−</button>
                    <span className="w-6 text-center text-sm">{item.quantity}</span>
                    <button
                      onClick={() => { updateQuantity(item.dbId, item.quantity + 1, item.selectedSize, item.selectedColor); setCart(getCart()); }}
                      disabled={typeof item.maxStock === 'number' && item.quantity >= item.maxStock}
                      style={typeof item.maxStock === 'number' && item.quantity >= item.maxStock ? { opacity: .4, cursor: 'not-allowed' } : undefined}
                      className="w-7 h-7 rounded border text-sm">+</button>
                    {typeof item.maxStock === 'number' && item.quantity >= item.maxStock && (
                      <span className="text-xs text-red-500">Only {item.maxStock} left</span>
                    )}
                    <button
                      onClick={() => { removeFromCart(item.dbId, item.selectedSize, item.selectedColor); setCart(getCart()); }}
                      className="ml-auto text-sm text-red-500 hover:underline">Remove</button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold">₹{(price * item.quantity).toLocaleString('en-IN')}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="card p-5 sticky top-4">
            <h2 className="font-bold text-lg mb-4">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₹{total.toLocaleString('en-IN')}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold text-base">
                <span>Total</span>
                <span className="text-[#8B1A1A]">₹{total.toLocaleString('en-IN')}</span>
              </div>
              <p className="text-xs text-gray-400">Inclusive of all charges</p>
            </div>
            <Link href="/checkout" className="btn-primary w-full text-center block mt-4">
              Proceed to Checkout
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
