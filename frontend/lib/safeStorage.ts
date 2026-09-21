'use client';

// Safari does not merely fail to save when the visitor has "Block All Cookies"
// switched on, or in some private-window and tracking-prevention states: it
// throws a SecurityError the moment localStorage is *touched*, reads included.
//
// Most call sites in this app wrapped their reads in try/catch. A few did not —
// getToken() among them, which runs while the page is rendering. One throw
// there and React never finishes hydrating, so the page paints normally and
// then nothing on it responds: no product opens, no Add to Cart, no login.
// That is what iPhone and Mac visitors were hitting.
//
// So nothing calls localStorage directly any more. When the browser refuses it,
// this falls back to memory: the cart, the wishlist and the login still work
// for the length of the visit, and are simply forgotten on reload. A shopper
// who can buy is worth more than one whose cart would have survived a refresh.

const memory = new Map<string, string>();

// null until the first probe. Probing costs a try/catch, so it happens once.
let nativeWorks: boolean | null = null;

function usable(): boolean {
  if (nativeWorks !== null) return nativeWorks;
  if (typeof window === 'undefined') return (nativeWorks = false);
  try {
    const probe = '__mfh_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    nativeWorks = true;
  } catch {
    nativeWorks = false;
  }
  return nativeWorks;
}

/** True when the browser is refusing storage and we are running on memory. */
export function storageIsMemoryOnly(): boolean {
  return typeof window !== 'undefined' && !usable();
}

export const storage = {
  get(key: string): string | null {
    if (typeof window === 'undefined') return null;
    if (!usable()) return memory.get(key) ?? null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Permission can be withdrawn mid-session; do not ask again.
      nativeWorks = false;
      return memory.get(key) ?? null;
    }
  },

  set(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    memory.set(key, value);
    if (!usable()) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Out of quota, or storage revoked. The memory copy above still stands.
      nativeWorks = false;
    }
  },

  remove(key: string): void {
    if (typeof window === 'undefined') return;
    memory.delete(key);
    if (!usable()) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      nativeWorks = false;
    }
  },

  /** Read and JSON.parse in one go, with a fallback for anything unreadable. */
  json<T>(key: string, fallback: T): T {
    const raw = storage.get(key);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return (parsed ?? fallback) as T;
    } catch {
      return fallback;
    }
  },
};
