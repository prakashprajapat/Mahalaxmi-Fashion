// Is this page running inside one of our own apps rather than a plain browser tab?
//
//  • The Android app (a coded WebView shell, see /android) appends
//    "MahalaxmiApp/<version>" to its User-Agent.
//  • An installed PWA / the old TWA runs in standalone display-mode.
//
// Inside the app we suppress everything that belongs to a browser: the cookie
// banner, the "Join Our Family" popup, the browser push prompt and the
// "Get the App" nudge.
export const APP_UA_TAG = 'MahalaxmiApp';

/** True only inside our native Android app. */
export function isNativeApp(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator.userAgent || '').includes(APP_UA_TAG);
}

/** True inside the native app, an installed PWA, or the old TWA. */
export function isInApp(): boolean {
  if (typeof window === 'undefined') return false;
  if (isNativeApp()) return true;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {}
  if ((navigator as any).standalone === true) return true;
  if (typeof document !== 'undefined' && document.referrer.startsWith('android-app://')) return true;
  return false;
}
