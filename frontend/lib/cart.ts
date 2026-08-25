'use client';
import type { CartItem, Product } from '@/types';
import { productImageSrc } from '@/lib/productImages';
import { unitBase, finalUnitPrice } from '@/lib/price';
import { trackEvent } from '@/lib/analytics';

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

// Cap a requested quantity to the available stock (when known). Always at least 1.
function capQty(q: number, max?: number): number {
  const capped = (typeof max === 'number' && max >= 0) ? Math.min(q, max) : q;
  return Math.max(1, capped);
}

export function addToCart(product: Product & { selectedColor?: string }, quantity = 1, size?: string, color?: string, maxStock?: number): void {
  const cart = getCart();
  const normalizedProduct = { ...product, image: productImageSrc(product.image) || product.image };
  const selectedColor = color ?? product.selectedColor;
  const key = `${product.dbId}-${size ?? ''}-${selectedColor ?? ''}`;
  const idx = cart.findIndex(i => `${i.dbId}-${i.selectedSize ?? ''}-${i.selectedColor ?? ''}` === key);
  if (idx >= 0) {
    // Never let the combined quantity exceed the known stock for this variant.
    const cap = maxStock ?? cart[idx].maxStock;
    cart[idx].quantity = capQty(cart[idx].quantity + quantity, cap);
    if (maxStock !== undefined) cart[idx].maxStock = maxStock;
  } else {
    cart.push({ ...normalizedProduct, quantity: capQty(quantity, maxStock), selectedSize: size, selectedColor, maxStock });
  }
  saveCart(cart);

  // GA4 ecommerce event
  trackEvent('add_to_cart', {
    currency: 'INR',
    value: finalUnitPrice(product) * quantity,
    items: [{
      item_id: (product as any).sku || String(product.dbId ?? ''),
      item_name: product.name ?? '',
      item_category: (product as any).category ?? '',
      price: finalUnitPrice(product),
      quantity,
    }],
  });
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
    else cart[idx].quantity = capQty(quantity, cart[idx].maxStock);   // never exceed available stock
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
