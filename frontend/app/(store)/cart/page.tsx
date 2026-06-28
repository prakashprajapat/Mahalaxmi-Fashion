'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getCart, removeFromCart, updateQuantity, cartTotal } from '@/lib/cart';
import type { CartItem } from '@/types';

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    setCart(getCart());
    const onUpdate = () => setCart(getCart());
    window.addEventListener('cart-updated', onUpdate);
    return () => window.removeEventListener('cart-updated', onUpdate);
  }, []);

  if (cart.length === 0) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-5xl mb-4">🛒</p>
      <h2 className="text-2xl font-bold mb-2 text-gray-700">Your cart is empty</h2>
      <Link href="/products" className="btn-primary inline-block mt-4">Start Shopping</Link>
    </div>
  );

  const total = cartTotal(cart);
  const shipping = total >= 999 ? 0 : 60;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6 text-[#8B1A1A]">Shopping Cart</h1>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Items */}
        <div className="flex-1 space-y-4">
          {cart.map(item => {
            const price = item.discountPrice ?? item.price;
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
                      className="w-7 h-7 rounded border text-sm">+</button>
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
              <div className="flex justify-between">
                <span>Shipping</span>
                <span className={shipping === 0 ? 'text-green-600' : ''}>
                  {shipping === 0 ? 'FREE' : `₹${shipping}`}
                </span>
              </div>
              {shipping > 0 && (
                <p className="text-xs text-gray-400">Free shipping above ₹999</p>
              )}
              <div className="border-t pt-2 flex justify-between font-bold text-base">
                <span>Total</span>
                <span className="text-[#8B1A1A]">₹{(total + shipping).toLocaleString('en-IN')}</span>
              </div>
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
