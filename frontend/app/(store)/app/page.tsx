'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { isInApp } from '@/lib/inApp';

const PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.mahalaxmifashionhub.www.twa';

// One short address the shop can put in an SMS, on a card, anywhere: it works
// whoever opens it. Someone who already has the app lands here inside it (the
// app claims links to this domain), so telling them to install it would be
// silly — they get a way on with their shopping instead. Everyone else gets
// the Play Store, and a way to carry on in the browser if they would rather.
export default function GetAppPage() {
  // Rendered the same on the server for everyone, then corrected once the
  // browser can say where it is running.
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(isInApp()); }, []);

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '2.5rem 1.25rem 4rem', textAlign: 'center' }}>
      <Image src="/logo.webp" alt="Mahalaxmi Fashion Hub" width={168} height={92}
        style={{ height: 'auto', margin: '0 auto 1.5rem' }} priority />

      {inApp ? (
        <>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 .5rem' }}>
            You already have the app
          </h1>
          <p style={{ color: '#666', fontSize: '.95rem', lineHeight: 1.7, margin: '0 0 1.75rem' }}>
            You are reading this inside it. Carry on shopping — your offer code works at checkout.
          </p>
          <Link href="/products"
            style={{ display: 'inline-block', background: '#722f37', color: '#fff', borderRadius: 10, padding: '.85rem 1.9rem', fontWeight: 700, fontSize: '1rem', textDecoration: 'none' }}>
            Start shopping
          </Link>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 .5rem' }}>
            Get the Mahalaxmi Fashion Hub app
          </h1>
          <p style={{ color: '#666', fontSize: '.95rem', lineHeight: 1.7, margin: '0 0 1.75rem' }}>
            Order faster, track every parcel, and hear about offers first.
          </p>

          <a href={PLAY_URL} rel="noopener"
            style={{ display: 'inline-block', background: '#722f37', color: '#fff', borderRadius: 10, padding: '.85rem 1.9rem', fontWeight: 700, fontSize: '1rem', textDecoration: 'none' }}>
            Get it on Google Play
          </a>

          <p style={{ margin: '1.5rem 0 0', fontSize: '.9rem' }}>
            <Link href="/products" style={{ color: '#722f37', fontWeight: 600 }}>
              Or shop on the website
            </Link>
          </p>

          <p style={{ margin: '2rem 0 0', fontSize: '.8rem', color: '#999', lineHeight: 1.7 }}>
            The app is for Android. On an iPhone, the website works the same — add it to your
            home screen from the Share menu and it opens like an app.
          </p>
        </>
      )}
    </div>
  );
}
