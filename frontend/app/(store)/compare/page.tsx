import type { Metadata } from 'next';
import CompareView from '@/components/product/CompareView';

// User-specific utility page (reads local compare list) — keep it out of the index.
export const metadata: Metadata = {
  title: 'Compare Products',
  robots: { index: false, follow: true },
  alternates: { canonical: '/compare' },
};

export default function ComparePage() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.25rem' }}>
      <CompareView />
    </div>
  );
}
