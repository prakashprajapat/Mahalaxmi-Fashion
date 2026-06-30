'use client';
import { useEffect } from 'react';

// Captures a creator/affiliate referral code from the URL (?ref=CODE) and stores
// it in localStorage. It is auto-applied at checkout so orders coming through a
// creator's shared link get credited to that creator (matched by coupon code).
export default function RefCapture() {
  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get('ref');
      if (code && code.trim()) {
        localStorage.setItem(
          'mfh_ref',
          JSON.stringify({ code: code.trim().toUpperCase(), ts: Date.now() })
        );
      }
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
