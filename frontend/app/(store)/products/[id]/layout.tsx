import type { Metadata } from 'next';
import { productsApi } from '@/lib/api';
import { productImageSrc } from '@/lib/productImages';

const BASE = 'https://mahalaxmifashionhub.com';

// Server-rendered SEO for each product page. The page itself is a client component,
// so this layout supplies per-product <title>/<meta>/OpenGraph that Google can read.
// Title & description come from the product's own name/description (admin-editable) —
// no code change needed when new products are added.
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const { product } = await productsApi.getById(Number(params.id));
    if (!product) return {};

    const name = product.name?.trim() || 'Product';
    const rawDesc = (product.description
      || `Buy ${name} online at Mahalaxmi Fashion Hub — premium ethnic & fashion wear with fast delivery across India.`)
      .replace(/\s+/g, ' ').trim();
    const description = rawDesc.length > 160 ? rawDesc.slice(0, 157) + '…' : rawDesc;

    const imgSrc = productImageSrc(product.image);
    const ogImage = imgSrc
      ? (/^https?:/i.test(imgSrc) ? imgSrc : `${BASE}${imgSrc}`)
      : `${BASE}/og-image.jpg`;
    const canonical = `/products/${params.id}`;
    const fullTitle = `${name} | Mahalaxmi Fashion Hub`;

    return {
      title: name,
      description,
      alternates: { canonical },
      openGraph: {
        title: fullTitle,
        description,
        url: `${BASE}${canonical}`,
        images: [{ url: ogImage }],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: fullTitle,
        description,
        images: [ogImage],
      },
    };
  } catch {
    return {};
  }
}

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
