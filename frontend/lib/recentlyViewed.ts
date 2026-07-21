'use client';
import type { Product } from '@/types';
import { productImageSrc } from '@/lib/productImages';

// Privacy-friendly browsing history kept only in the visitor's own browser (no server, no
// tracking). Powers the "Recently Viewed" and history-based "Recommended For You" sections.

const KEY = 'mfh_recently_viewed';
const MAX = 20;

export function getRecentlyViewed(): Product[] {
  if (typeof window === 'undefined') return [];
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function addRecentlyViewed(product: Product): void {
  if (typeof window === 'undefined' || !product?.dbId) return;
  const slim: Product = { ...product, image: productImageSrc(product.image) || product.image };
  const list = getRecentlyViewed().filter(p => p.dbId !== product.dbId);
  list.unshift(slim);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    window.dispatchEvent(new Event('recently-viewed-updated'));
  } catch { /* storage full / disabled — ignore */ }
}
