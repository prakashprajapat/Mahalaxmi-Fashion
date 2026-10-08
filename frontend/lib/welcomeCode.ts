'use client';

// The welcome code a brand-new customer is given at the moment they sign in.
//
// It exists because of where that moment falls. Signing in with a one-time code
// CREATES the account if there is not one, and the server hands back a welcome
// coupon with the token. But the commonest time anyone signs in is halfway
// through a checkout - they are sent to the account page, they come straight
// back, and any message shown on the way past is gone before it is read. Email
// does not save it either: a mobile signup has no email yet, which is exactly
// the case the server's own comment says will "see the code on screen instead".
//
// So it is put down here for one hop and picked up by the checkout page, which
// fills it into the coupon box. sessionStorage rather than localStorage: it
// belongs to this one visit, and a code still sitting there next week would be
// offered to somebody who has long since used it.

const KEY = 'mfh_welcome_code';

export function stashWelcomeCode(code?: string | null) {
  const c = (code ?? '').trim();
  if (!c) return;
  try { sessionStorage.setItem(KEY, c); } catch { /* private window, or storage blocked */ }
}

/** Read it and clear it — it is only ever offered once. */
export function takeWelcomeCode(): string {
  try {
    const c = sessionStorage.getItem(KEY) ?? '';
    if (c) sessionStorage.removeItem(KEY);
    return c.trim();
  } catch { return ''; }
}
