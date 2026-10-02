import type { Metadata } from 'next';

// /contact apna koi metadata nahi likhta tha (panna 'use client' hai aur yahan
// koi layout nahi tha), isliye root ka title aur description utar aate the -
// yaani mukhya panna, /contact aur /app, teenon ka naam aur byora akshar-dar-
// akshar ek jaisa. Google do panno ko ek hi naam se alag nahi gin pata.
export const metadata: Metadata = {
  title: 'Contact Us',
  description:
    'Call, WhatsApp or email Mahalaxmi Fashion Hub for order help, returns, sizes and bulk enquiries. Shop address in Balotra, Rajasthan, with reply times.',
  alternates: { canonical: '/contact' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
