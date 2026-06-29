'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const WA_NUMBER = '919429429880';

function buildMessage(pathname: string, sp: URLSearchParams): string {
  // Product detail page
  if (/^\/products\/\d+/.test(pathname)) {
    const title = typeof document !== 'undefined'
      ? document.title.replace(' | Mahalaxmi Fashion Hub', '').trim()
      : 'a product';
    return `Hello! I'm interested in "${title}". Could you please share more information about it? 🙏`;
  }

  const category = sp.get('category');
  const q = sp.get('q');
  const bestSeller = sp.get('bestSeller');

  if (q) return `Hello! I'm looking for "${q}" on your website. Is this available? 🙏`;
  if (bestSeller === 'true') return `Hello! I'd like to see your Best Seller products. Please recommend some! 🙏`;
  if (category) {
    const cat = category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `Hello! I'm browsing your ${cat} collection. Is there any special offer? 🙏`;
  }
  if (pathname === '/') return `Hello! I'm on the Mahalaxmi Fashion Hub website. I'd like to know more about your collections. 🙏`;
  if (pathname === '/cart') return `Hello! I have a few items in my cart. I need help placing the order. 🙏`;
  if (pathname.startsWith('/orders')) return `Hello! I wanted to ask something about my order. Please help. 🙏`;
  if (pathname === '/tracking') return `Hello! I'd like to track my order. Can you help me? 🙏`;
  if (pathname === '/wishlist') return `Hello! I'm looking at my wishlist. Is there any offer available on these? 🙏`;
  if (pathname.startsWith('/account')) return `Hello! I need some help related to my account. 🙏`;
  if (pathname === '/contact') return `Hello! I'd like to get in touch with Mahalaxmi Fashion Hub. 🙏`;

  // Category shortcut pages like /saree, /women etc.
  const page = pathname.replace('/', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (page) return `Hello! I'm interested in your ${page} collection. Please share the details. 🙏`;

  return `Hello! I'm on the Mahalaxmi Fashion Hub website. Please help. 🙏`;
}

function FloatButton() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const msg = buildMessage(pathname, sp);
  const href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;

  return (
    <a
      href={href}
      className="whatsapp-float"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '.75rem' }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    </a>
  );
}

export default function WhatsAppFloat() {
  return (
    <Suspense fallback={
      <a href={`https://wa.me/${WA_NUMBER}`} className="whatsapp-float" target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '.75rem' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      </a>
    }>
      <FloatButton />
    </Suspense>
  );
}
