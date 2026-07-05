import StoreChrome from '@/components/layout/StoreChrome';
import PwaInstaller from '@/components/PwaInstaller';

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StoreChrome>{children}</StoreChrome>
      <PwaInstaller />
    </>
  );
}
