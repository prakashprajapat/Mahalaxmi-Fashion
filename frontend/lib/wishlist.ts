import type { Product } from '@/types';
import { productImageSrc } from '@/lib/productImages';

const KEY = 'mfh_wishlist';

export function getWishlist(): Product[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch { return []; }
}

export function addToWishlist(product: Product): void {
  const list = getWishlist();
  if (!list.find(p => p.dbId === product.dbId)) {
    list.push({ ...product, image: productImageSrc(product.image) || product.image });
    localStorage.setItem(KEY, JSON.stringify(list));
  }
}

export function removeFromWishlist(id: number): void {
  const list = getWishlist().filter(p => p.dbId !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function isInWishlist(id: number): boolean {
  return getWishlist().some(p => p.dbId === id);
}
