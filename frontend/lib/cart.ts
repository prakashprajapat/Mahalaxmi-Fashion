'use client';
import type { CartItem, Product } from '@/types';
import { productImageSrc } from '@/lib/productImages';
import { unitBase, finalUnitPrice } from '@/lib/price';

export { unitBase, finalUnitPrice };

const CART_KEY = 'mfh_cart';

export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveCart(cart: CartItem[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event('cart-updated'));
}

export function addToCart(product: Product & { selectedColor?: string }, quantity = 1, size?: string, color?: string): void {
  const cart = getCart();
  const normalizedProduct = { ...product, image: productImageSrc(product.image) || product.image };
  const selectedColor = color ?? product.selectedColor;
  const key = `${product.dbId}-${size ?? ''}-${selectedColor ?? ''}`;
  const idx = cart.findIndex(i => `${i.dbId}-${i.selectedSize ?? ''}-${i.selectedColor ?? ''}` === key);
  if (idx >= 0) {
    cart[idx].quantity += quantity;
  } else {
    cart.push({ ...normalizedProduct, quantity, selectedSize: size, selectedColor });
  }
  saveCart(cart);
}

export function removeFromCart(dbId: number, size?: string, color?: string): void {
  const cart = getCart().filter(i => `${i.dbId}-${i.selectedSize ?? ''}-${i.selectedColor ?? ''}` !== `${dbId}-${size ?? ''}-${color ?? ''}`);
  saveCart(cart);
}

export function updateQuantity(dbId: number, quantity: number, size?: string, color?: string): void {
  const cart = getCart();
  const idx = cart.findIndex(i => `${i.dbId}-${i.selectedSize ?? ''}-${i.selectedColor ?? ''}` === `${dbId}-${size ?? ''}-${color ?? ''}`);
  if (idx >= 0) {
    if (quantity <= 0) cart.splice(idx, 1);
    else cart[idx].quantity = quantity;
  }
  saveCart(cart);
}

export function clearCart(): void {
  saveCart([]);
}

// Total per-order shipping baked into the cart (used to waive shipping for local Balotra delivery).
export function cartShipping(cart: CartItem[]): number {
  return cart.reduce((sum, i) => sum + (i.shippingCharge ?? 0) * i.quantity, 0);
}

export function cartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, i) => sum + finalUnitPrice(i) * i.quantity, 0);
}

export function cartCount(cart: CartItem[]): number {
  return cart.reduce((sum, i) => sum + i.quantity, 0);
}
