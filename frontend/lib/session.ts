import { storage } from '@/lib/safeStorage';

// Where a signed-in session lives in this browser. One place, because both
// lib/auth.ts (which reads it while components render) and lib/api.ts (which
// renews it behind a request) need the same four names, and two copies of a
// storage key is how a logout starts leaving half a session behind.
export const TOKEN_KEY         = 'mfh_token';
export const REFRESH_KEY       = 'mfh_refresh';
export const ADMIN_KEY         = 'mfh_admin_token';
export const ADMIN_REFRESH_KEY = 'mfh_admin_refresh';

export type Side = 'customer' | 'admin';

const KEYS: Record<Side, { access: string; refresh: string }> = {
  customer: { access: TOKEN_KEY, refresh: REFRESH_KEY },
  admin:    { access: ADMIN_KEY, refresh: ADMIN_REFRESH_KEY },
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export function accessToken(side: Side): string | null {
  return storage.get(KEYS[side].access);
}

export function refreshToken(side: Side): string | null {
  return storage.get(KEYS[side].refresh);
}

export function saveSession(side: Side, access: string, refresh?: string | null): void {
  storage.set(KEYS[side].access, access);
  if (refresh) storage.set(KEYS[side].refresh, refresh);
}

export function clearSession(side: Side): void {
  storage.remove(KEYS[side].access);
  storage.remove(KEYS[side].refresh);
}

/**
 * Which half of the app a token belongs to, read out of the token itself.
 *
 * The first version of this compared the token with what was in storage, and
 * that was wrong in the one case it most needed to be right: the moment another
 * tab has already renewed, the stored token has moved on, so the token this
 * request is holding matches nothing and the session looks like a stranger's.
 * The renewal was then skipped and the request failed with the 401 it came in
 * with - precisely when a working token was sitting in storage waiting.
 *
 * A JWT is encoded, not encrypted: anybody can read the payload, which is why
 * nothing secret goes in one. The role claim is right there, it does not change
 * when the token is renewed, and reading it needs no stored state at all.
 */
export function sideOf(token: string | null | undefined): Side | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as Record<string, unknown>;
    const role = String(
      payload['role']
      ?? payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']
      ?? ''
    );
    if (role === 'customer') return 'customer';
    // admin, staff, manager - whatever roles the panel grows, they are all the
    // panel. An empty role is nothing we issued.
    return role.length > 0 ? 'admin' : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// One renewal at a time per side.
//
// An admin screen can fire eight requests when it opens. If the access token
// has just run out, all eight come back 401 together, and eight renewals would
// race: each spends the refresh token, each writes a different new one, and the
// seven that lose look - to the server - exactly like somebody replaying a
// stolen token. The first of them would end the session for all.
//
// So the first 401 starts the renewal and the rest wait on the same promise.
const inFlight: Record<Side, Promise<string | null> | null> = { customer: null, admin: null };

/**
 * Get a working access token to replace one the server has just refused, or
 * null if the person really does have to sign in again.
 *
 * Returns null without touching anything when there is nothing to renew with -
 * on the server, or for a session that predates refresh tokens - so the caller
 * surfaces the original 401 rather than inventing a logout.
 */
export async function renewAccess(stale: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const side = sideOf(stale);
  if (!side) return null;

  // Somebody already renewed while this request was in the air. Common, and
  // the whole reason the stale token is passed in: the answer is simply the
  // token now in storage.
  const current = accessToken(side);
  if (current && current !== stale) return current;

  if (!refreshToken(side)) return null;

  const existing = inFlight[side];
  if (existing) return existing;

  const run = renew(side, stale).finally(() => { inFlight[side] = null; });
  inFlight[side] = run;
  return run;
}

async function renew(side: Side, stale: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const refresh = refreshToken(side);
    if (!refresh) return null;

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
        cache: 'no-store',
      });
    } catch {
      // The network dropped. That is not the server refusing, so the session
      // is left exactly as it is - signing somebody out of the panel because a
      // train went into a tunnel would be a fault of our own making.
      return null;
    }

    // 409: another tab got there first and has stored the new pair. Wait for
    // its write and use that, rather than treating it as a refusal.
    if (res.status === 409) {
      await sleep(250);
      const moved = accessToken(side);
      if (moved && moved !== stale) return moved;
      continue;
    }

    if (!res.ok) {
      // A real refusal: expired, revoked, or a token that turned up twice.
      // This is the only path that signs anybody out.
      endSession(side);
      return null;
    }

    const json = await res.json().catch(() => null) as
      { token?: string; refreshToken?: string } | null;

    if (!json?.token) { endSession(side); return null; }

    saveSession(side, json.token, json.refreshToken);
    return json.token;
  }

  // Two 409s running. Whatever is stored now is the best answer available, and
  // if it is still the stale one the caller surfaces the original 401.
  const settled = accessToken(side);
  return settled && settled !== stale ? settled : null;
}

function endSession(side: Side): void {
  clearSession(side);
  if (side === 'customer') {
    storage.remove('mfh_customer');
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth-changed'));
  }
}

/** Tell the server to forget this session, then forget it here. */
export async function endSessionEverywhere(side: Side): Promise<void> {
  const refresh = refreshToken(side);
  clearSession(side);
  if (!refresh) return;
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
      cache: 'no-store',
      keepalive: true,
    });
  } catch {
    // The local half is already done. A revoke that did not get through means
    // the session lapses on its own instead of ending now, which is the old
    // behaviour and not worth holding up a logout for.
  }
}
