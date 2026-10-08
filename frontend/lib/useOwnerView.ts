'use client';
import { useEffect, useState } from 'react';
import { isOwnerAdmin } from '@/lib/auth';

/**
 * Is the person at this screen the shop owner, rather than a staff member?
 *
 * Read in an effect rather than during render, and that is not fussiness. The
 * answer comes out of a token in localStorage, which does not exist while Next
 * renders the first HTML on the server - so reading it during render gives one
 * answer there and a different one in the browser, and React throws the whole
 * tree away and redraws it. Starting at false and correcting on mount means the
 * first paint is the cautious one: a staff member never sees an owner-only box
 * flash up before it is taken away.
 *
 * For what it is worth and no more: this decides what a screen DRAWS. Every
 * owner-only action is checked again on the server, where the answer does not
 * come from the browser.
 */
export function useOwnerView(): boolean {
  const [owner, setOwner] = useState(false);
  useEffect(() => { setOwner(isOwnerAdmin()); }, []);
  return owner;
}
