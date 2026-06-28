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
export default function CategoryPageContent({ products, category }: Props) {
  return <ProductsClient products={products as any[]} title={category} />;
}
