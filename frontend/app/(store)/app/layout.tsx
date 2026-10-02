import type { Metadata } from 'next';

// Wahi wajah jo /contact par likhi hai: metadata ke bina root ka title aur
// description utar aate the.
export const metadata: Metadata = {
  title: 'Download the Mahalaxmi Fashion Hub App',
  description:
    'Get the Mahalaxmi Fashion Hub app for Android — faster browsing, order tracking, delivery updates and offers on cotton nighties, sarees and petticoats.',
  alternates: { canonical: '/app' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
