'use client';
import type { Customer } from '@/types';

const TOKEN_KEY    = 'mfh_token';
const CUSTOMER_KEY = 'mfh_customer';
const ADMIN_KEY    = 'mfh_admin_token';

// ── Customer Auth ─────────────────────────────────────────────────────────────
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getCustomer(): Customer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCustomer(customer: Customer): void {
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_KEY);
  window.dispatchEvent(new Event('auth-changed'));
}

// ── Admin Auth ────────────────────────────────────────────────────────────────
export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ADMIN_KEY);
}

export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_KEY, token);
}

export function adminLogout(): void {
  localStorage.removeItem(ADMIN_KEY);
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
      localStorage.removeItem('mfh_admin_token');
      return false;
    }
    return role === 'admin' || role === 'staff';
  } catch {
    return false;
  }
}
