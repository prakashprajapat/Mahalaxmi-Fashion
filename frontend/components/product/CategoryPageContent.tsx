'use client';
import ProductsClient from '@/components/products/ProductsClient';
import type { Product } from '@/types';

interface Props {
  products: Product[];
  category: string;
  icon: string;
  desc: string;
  allHref: string;
}

// Delegate to the unified ProductsClient (handles desktop sidebar + mobile drawer)
export default function CategoryPageContent({ products, category, desc }: Props) {
  // `desc` was in the props and then dropped on the floor - the sentence it held
  // was being printed by the page's own hero band instead. The band is gone; the
  // sentence now sits under the title where it costs one line.
  return <ProductsClient products={products as any[]} title={category} subtitle={desc} />;
}
