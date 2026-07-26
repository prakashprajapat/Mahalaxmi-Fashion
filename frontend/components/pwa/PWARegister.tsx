'use client';

import { useEffect } from 'react';

// PWA bootstrap (client-only), intentionally SILENT:
//  1. Registers the service worker (/sw.js) so the site stays installable, works offline,
//     and is push-ready. This is also required for the future Play Store (TWA) app.
//  2. Suppresses the browser's automatic "install app" prompt (beforeinstallprompt), so
//     customers are NOT nagged on the web — the app will be distributed via the Play Store.
//
// No custom install banner is shown. Note: on desktop Chrome an install icon may still
// appear in the address bar — that is the browser's own affordance for any valid PWA and
// cannot be removed from the website without deleting the manifest (which would also break
// the Play Store TWA build), so we keep it.
export default function PWARegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const onPrompt = (e: Event) => {
      // Stop Chrome's automatic install mini-infobar / prompt from popping up.
      e.preventDefault();
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  return null;
}
