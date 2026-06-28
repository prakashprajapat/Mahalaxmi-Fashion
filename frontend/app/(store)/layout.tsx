import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FloatingCart from '@/components/layout/FloatingCart';
import WelcomePopup from '@/components/layout/WelcomePopup';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
      <FloatingCart />
      <WelcomePopup />
      <WhatsAppFloat />
    </>
  );
}
