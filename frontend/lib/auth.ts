'use client';
import type { Customer } from '@/types';
import { storage } from '@/lib/safeStorage';
import {
  accessToken, refreshToken, saveSession, endSessionEverywhere,
} from '@/lib/session';

const CUSTOMER_KEY = 'mfh_customer';

// The name of whoever last signed in on this device. Deliberately NOT cleared
// by logout: it is what lets the app greet a returning customer by name instead
// of asking a stranger to log in. It is a first name and nothing else - no
// token, no email, no number - so it is no use to anybody who finds it.
const KNOWN_NAME_KEY = 'mfh_known_name';

/** The first name of the last person to sign in here, if anyone ever has. */
export function getKnownName(): string {
  return (storage.get(KNOWN_NAME_KEY) ?? '').trim();
}

// Every read and write goes through safeStorage. getToken() in particular is
// called while components render, and a bare localStorage.getItem there throws
// in Safari when the visitor has blocked cookies — which stopped React
// hydrating and left the whole site painted but dead to every click.

// ── Customer Auth ─────────────────────────────────────────────────────────────
export function getToken(): string | null {
  return accessToken('customer');
}

/**
 * Store a sign-in. The access token now lasts half an hour rather than thirty
 * days, so the refresh token is the part that keeps the shopper signed in -
 * pass it, or she is signed out at the end of the first half hour.
 */
export function setToken(token: string, refresh?: string | null): void {
  saveSession('customer', token, refresh);
}

export function getCustomer(): Customer | null {
  return storage.json<Customer | null>(CUSTOMER_KEY, null);
}

export function setCustomer(customer: Customer): void {
  storage.set(CUSTOMER_KEY, JSON.stringify(customer));
  const first = (customer.firstName ?? '').trim();
  if (first) storage.set(KNOWN_NAME_KEY, first);
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
  // Local first, so the screen changes at once; the server is told in the
  // background. Not awaited on purpose - a logout must not sit there spinning
  // on a slow network - and sent with keepalive so it still goes if the tab is
  // closing. Until refresh tokens existed this told the server nothing at all,
  // and the token stayed valid for up to a month after the button was pressed.
  void endSessionEverywhere('customer');
  storage.remove(CUSTOMER_KEY);
  window.dispatchEvent(new Event('auth-changed'));
}

// ── Admin Auth ────────────────────────────────────────────────────────────────
export function getAdminToken(): string | null {
  return accessToken('admin');
}

export function setAdminToken(token: string, refresh?: string | null): void {
  saveSession('admin', token, refresh);
}

export function adminLogout(): void {
  void endSessionEverywhere('admin');
}

/** The refresh token for this panel session, when a call needs to name it. */
export function getAdminRefreshToken(): string | null {
  return refreshToken('admin');
}

// CQ-4: check the role claim AND the expiry, not just that a token exists.
//
// An expired access token is no longer a sign-out. It lasts fifteen minutes, so
// any tab left open for a coffee has one, and the refresh token beside it is
// what decides whether the session is alive - the next request will use it and
// get a new access token without anyone noticing. This used to DELETE the token
// on sight of an expiry, which, with a fifteen-minute token, would have thrown
// the owner out of the panel every quarter of an hour.
export function isAdmin(): boolean {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const role: string =
      payload['role'] ||
      payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
      '';
    if (role !== 'admin' && role !== 'staff') return false;

    const exp: number | undefined = payload['exp'];
    if (exp && Date.now() / 1000 > exp) return !!refreshToken('admin');
    return true;
  } catch {
    return false;
  }
}

/**
 * The shop OWNER, as opposed to a staff member who is also signed into the panel.
 *
 * Only ever used to decide what a screen bothers to DRAW - the platform fee box,
 * another shop's takings, the Mark paid button. Every one of those is enforced
 * again on the server, which is the half that counts: this reads a token the
 * browser is holding, and a browser will say whatever it is asked to.
 */
export function isOwnerAdmin(): boolean {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const role: string =
      payload['role'] ||
      payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
      '';
    if (role !== 'admin') return false;

    const exp: number | undefined = payload['exp'];
    if (exp && Date.now() / 1000 > exp) return !!refreshToken('admin');
    return true;
  } catch {
    return false;
  }
}
