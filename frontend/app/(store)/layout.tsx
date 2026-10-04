import StoreChrome from '@/components/layout/StoreChrome';
import SiteTags from '@/components/analytics/SiteTags';
import CartSync from '@/components/layout/CartSync';

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StoreChrome>{children}</StoreChrome>
      <SiteTags />
      <CartSync />
    </>
  );
}
