import type { Metadata } from 'next';

// Password reset ka form.
//
// Yeh panna kisi ki khoj ka jawab nahi hai. Pehle iska koi layout nahi tha aur
// panna khud 'use client' hai, isliye yahan se koi robots nirdesh nikalta hi
// nahi tha - panna poori tarah indexable pada tha. noindex, follow: panne ko
// bahar rakho, uske link phir bhi chalo.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
