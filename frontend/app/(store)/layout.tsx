import StoreChrome from '@/components/layout/StoreChrome';
import SiteTags from '@/components/analytics/SiteTags';

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StoreChrome>{children}</StoreChrome>
      <SiteTags />
    </>
  );
}
