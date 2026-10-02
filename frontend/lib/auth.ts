'use client';
import type { Customer } from '@/types';
import { storage } from '@/lib/safeStorage';

const TOKEN_KEY    = 'mfh_token';
const CUSTOMER_KEY = 'mfh_customer';
const ADMIN_KEY    = 'mfh_admin_token';

// Every read and write goes through safeStorage. getToken() in particular is
// called while components render, and a bare localStorage.getItem there throws
// in Safari when the visitor has blocked cookies — which stopped React
// hydrating and left the whole site painted but dead to every click.

// ── Customer Auth ─────────────────────────────────────────────────────────────
export function getToken(): string | null {
  return storage.get(TOKEN_KEY);
}

export function setToken(token: string): void {
  storage.set(TOKEN_KEY, token);
}

export function getCustomer(): Customer | null {
  return storage.json<Customer | null>(CUSTOMER_KEY, null);
}

export function setCustomer(customer: Customer): void {
  storage.set(CUSTOMER_KEY, JSON.stringify(customer));
}

// Server se taaza grahak laakar yahan ki copy badal deta hai.
//
// Zaroorat kyun padi: login ke waqt grahak ka poora record is browser me likh
// diya jata hai aur uske baad har panna wahi padhta hai. Dukaan se admin ne
// number, janmdin ya saalgirah sudhari to database me to badal gaya, par
// grahak ke browser me purani copy padi rahti thi — use wahi purana dikhta
// raha, chaahe kitni baar panna kholta. Logout karke dobara login karne par hi
// badalta tha.
//
// Chup-chaap chalta hai: token na ho, net na chale ya server mana kar de to
// purani copy jaisi ki waisi rahti hai — grahak ko kuch dikhane ki zarurat
// nahi, aur unhe is wajah se logout to bilkul nahi karna.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export async function refreshCustomer(): Promise<Customer | null> {
  const token = getToken();
  const cached = getCustomer();
  if (!token || !cached?.id) return null;
  try {
    const res = await fetch(`${API_BASE}/customers/${cached.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json() as { customer?: Customer };
    if (!json.customer) return null;
    setCustomer(json.customer);
    // Jo panne 'auth-changed' sunte hain wo turant naya naam/number dikha dete
    // hain, bina panna dobara khole.
    window.dispatchEvent(new Event('auth-changed'));
    return json.customer;
  } catch {
    return null;
  }
}

export function logout(): void {
  storage.remove(TOKEN_KEY);
  storage.remove(CUSTOMER_KEY);
  window.dispatchEvent(new Event('auth-changed'));
}

// ── Admin Auth ────────────────────────────────────────────────────────────────
export function getAdminToken(): string | null {
  return storage.get(ADMIN_KEY);
}

export function setAdminToken(token: string): void {
  storage.set(ADMIN_KEY, token);
}

export function adminLogout(): void {
  storage.remove(ADMIN_KEY);
}

// CQ-4: Properly validate JWT — check role claim AND expiry, not just token existence
export function isAdmin(): boolean {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const role: string =
      payload['role'] ||
      payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
      '';
    const exp: number | undefined = payload['exp'];
    if (exp && Date.now() / 1000 > exp) {
      // Token expired — clear it
      storage.remove(ADMIN_KEY);
      return false;
    }
    return role === 'admin' || role === 'staff';
  } catch {
    return false;
  }
}
