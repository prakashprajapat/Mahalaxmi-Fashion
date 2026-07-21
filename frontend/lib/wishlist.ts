'use client';
import type { Product } from '@/types';
import { productImageSrc } from '@/lib/productImages';
import { wishlistApi } from '@/lib/api';
import { getToken, getCustomer } from '@/lib/auth';

// Wishlist storage. Guests use localStorage; logged-in customers additionally sync to the
// server (WishlistController) so saved items follow them across devices. The synchronous
// getters/setters keep working exactly as before — server calls are fire-and-forget.

const KEY = 'mfh_wishlist';

function activeToken(): string | null {
  const t = getToken();
  return t && getCustomer() ? t : null;
}

export function getWishlist(): Product[] {
  if (typeof window === 'undefined') return [];
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function saveLocal(list: Product[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('wishlist-updated'));
}

export function addToWishlist(product: Product): void {
  const list = getWishlist();
  if (!list.find(p => p.dbId === product.dbId)) {
    list.push({ ...product, image: productImageSrc(product.image) || product.image });
    saveLocal(list);
  }
  const token = activeToken();
  if (token) wishlistApi.add(product.dbId, token).catch(() => {});
}

export function removeFromWishlist(id: number): void {
  saveLocal(getWishlist().filter(p => p.dbId !== id));
  const token = activeToken();
  if (token) wishlistApi.remove(id, token).catch(() => {});
}

export function isInWishlist(id: number): boolean {
  return getWishlist().some(p => p.dbId === id);
}

// Fetch the server copy and replace the local cache (used by the wishlist page when logged in).
export async function loadServerWishlist(): Promise<Product[]> {
  const token = activeToken();
  if (!token) return getWishlist();
  try {
    const r = await wishlistApi.list(token);
    const products = (r.products ?? []).map(p => ({ ...p, image: productImageSrc(p.image) || p.image }));
    saveLocal(products);
    return products;
  } catch { return getWishlist(); }
}

// On login: union guest ids into the account, then hydrate the merged list back locally.
export async function syncWishlistOnLogin(): Promise<void> {
  const token = activeToken();
  if (!token) return;
  const localIds = getWishlist().map(p => p.dbId).filter(Boolean);
  try {
    const r = await wishlistApi.merge(localIds, token);
    const products = (r.products ?? []).map(p => ({ ...p, image: productImageSrc(p.image) || p.image }));
    saveLocal(products);
  } catch { /* merge failed — keep the local copy */ }
}

// On logout: clear the personal cache so the next user doesn't inherit it.
export function clearLocalWishlist(): void {
  saveLocal([]);
}
