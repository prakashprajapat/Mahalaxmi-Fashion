import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Feedback — Mahalaxmi Fashion Hub',
  description:
    'Tell us what worked and what did not. Your feedback goes straight to the shop in Balotra — about the website, a product, delivery or payment.',
  alternates: { canonical: 'https://www.mahalaxmifashionhub.com/feedback' },
  // A feedback form is for the person in front of it, not for search results.
  robots: { index: false, follow: true },
};

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
