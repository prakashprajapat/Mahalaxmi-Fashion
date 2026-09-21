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
