'use client';
import type { Product } from '@/types';
import { finalUnitPrice, unitBase } from '@/lib/price';
import { storage } from '@/lib/safeStorage';

// localStorage-backed "compare products" store. Emits COMPARE_EVENT so any mounted
// component (compare bar, product cards) re-renders when the list changes.
export interface CompareItem {
  dbId: number; name: string; image?: string; sku?: string;
  category?: string; subcategory?: string;
  price: number; mrp?: number; rating?: number; reviewCount?: number; stock?: string;
}

const KEY = 'mfh_compare';
export const COMPARE_MAX = 4;
export const COMPARE_EVENT = 'mfh-compare-changed';

function read(): CompareItem[] {
  if (typeof window === 'undefined') return [];
  const v = storage.json<any[]>(KEY, []);
  return Array.isArray(v) ? v : [];
}
function write(list: CompareItem[]) {
  storage.set(KEY, JSON.stringify(list));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(COMPARE_EVENT));
}

export function getCompare(): CompareItem[] { return read(); }
export function isInCompare(dbId: number): boolean { return read().some(i => i.dbId === dbId); }

export function toggleCompare(p: Product): { added: boolean; full: boolean } {
  const list = read();
  const idx = list.findIndex(x => x.dbId === p.dbId);
  if (idx >= 0) { list.splice(idx, 1); write(list); return { added: false, full: false }; }
  if (list.length >= COMPARE_MAX) return { added: false, full: true };
  const mrp = (p.maxPrice && p.maxPrice > unitBase(p))
    ? p.maxPrice
    : (p.discountPrice != null && p.discountPrice > 0 && p.price > p.discountPrice ? p.price : undefined);
  list.push({
    dbId: p.dbId, name: p.name, image: p.image, sku: p.sku,
    category: p.category, subcategory: p.subcategory,
    price: finalUnitPrice(p), mrp,
    rating: p.avgRating, reviewCount: p.reviewCount, stock: p.stock,
  });
  write(list);
  return { added: true, full: false };
}
export function removeCompare(dbId: number) { write(read().filter(i => i.dbId !== dbId)); }
export function clearCompare() { write([]); }
