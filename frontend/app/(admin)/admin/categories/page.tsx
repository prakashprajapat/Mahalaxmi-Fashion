'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { productsApi } from '@/lib/api';
import type { Product } from '@/types';
import { PageHeader, Card, Stat, StatGrid, Row, Pill, Empty } from '@/components/admin/Ui';

// What this page used to be, and why it is not that any more.
//
// It offered Add, Edit and Delete for a list of seven categories held in
// useState — Saree, Nighty, Petticoat, Popline, Nighty Cloth. None of it was
// saved anywhere: every change vanished on reload. The seven names did not
// match the six the catalogue actually uses, and the "Products" column was the
// literal number 0 for every row. Nothing linked to the page, which is
// probably the only reason nobody was ever caught out by it.
//
// Categories are not a thing you can add here, because they are not stored
// anywhere to add to: a product's category is one of six fixed words, and its
// subcategory is free text typed on the product itself. So this page now shows
// what is really there, counted from the catalogue, and points at the two
// places where category text can actually be changed.

const CATEGORIES = ['Women', 'Men', 'Kids', 'Beauty', 'Fabrics', 'More'];

export default function AdminCategoriesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string>('');

  useEffect(() => {
    productsApi.getAll({ pageSize: 1000 })
      .then(r => setProducts((r.products ?? []) as Product[]))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const live = (p: Product) => p.stock !== 'Draft' && p.stock !== 'Inactive';

  const byCategory = useMemo(() => {
    const m = new Map<string, Product[]>();
    CATEGORIES.forEach(c => m.set(c, []));
    products.forEach(p => {
      const key = CATEGORIES.find(c => c.toLowerCase() === (p.category ?? '').trim().toLowerCase());
      if (key) m.get(key)!.push(p);
      else {
        // A category nobody chose from the list. Worth seeing rather than hiding.
        const other = (p.category ?? '').trim() || 'No category';
        if (!m.has(other)) m.set(other, []);
        m.get(other)!.push(p);
      }
    });
    return m;
  }, [products]);

  const subsOf = (list: Product[]) => {
    const m = new Map<string, number>();
    list.forEach(p => {
      const s = ((p as any).subcategory ?? '').trim();
      if (s) m.set(s, (m.get(s) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const uncategorised = products.filter(p =>
    !CATEGORIES.some(c => c.toLowerCase() === (p.category ?? '').trim().toLowerCase()));
  const allSubs = new Set<string>();
  products.forEach(p => { const s = ((p as any).subcategory ?? '').trim(); if (s) allSubs.add(s); });

  return (
    <div className="admin-page">
      <PageHeader
        title="Categories"
        sub="What the catalogue is actually sorted into, counted from the products themselves."
        right={
          <>
            <Link className="adm-btn" href="/admin/seo/categories">Edit category text</Link>
            <Link className="adm-btn" href="/admin/seo/home-categories">Homepage tiles</Link>
          </>
        }
      />

      <StatGrid>
        <Stat label="Categories in use" value={CATEGORIES.filter(c => (byCategory.get(c) ?? []).length > 0).length} />
        <Stat label="Subcategories" value={allSubs.size} />
        <Stat label="Products" value={products.length} href="/admin/products" />
        <Stat label="Without a category" value={uncategorised.length}
              tone={uncategorised.length > 0 ? 'red' : undefined}
              action={uncategorised.length > 0 ? 'Fix these' : undefined}
              href={uncategorised.length > 0 ? '/admin/products' : undefined} />
      </StatGrid>

      <Card>
        <p style={{ fontSize: '.83rem', color: '#7d736d', margin: 0, lineHeight: 1.6 }}>
          The six categories are fixed — they are what the main menu is built from, so they cannot be added to
          here. A <strong>subcategory</strong> is free text you type on the product itself, so a new one appears
          the moment you use it. To change the words a customer reads on a category page, use{' '}
          <Link href="/admin/seo/categories" style={{ color: '#722f37', fontWeight: 700 }}>Category Copy</Link>;
          to change the tiles on the homepage, use{' '}
          <Link href="/admin/seo/home-categories" style={{ color: '#722f37', fontWeight: 700 }}>Home Categories</Link>.
        </p>
      </Card>

      <Card title="Every category, with what is inside it">
        {loading ? (
          <Empty>Counting the catalogue…</Empty>
        ) : products.length === 0 ? (
          <Empty>No products yet, so there is nothing to sort. Add a product and it will appear here.</Empty>
        ) : [...byCategory.entries()].map(([name, list]) => {
          const subs = subsOf(list);
          const onSite = list.filter(live).length;
          const isOpen = open === name;
          return (
            <div key={name}>
              <Row
                title={name}
                sub={list.length === 0
                  ? 'Nothing in it yet'
                  : `${list.length} product${list.length === 1 ? '' : 's'} · ${onSite} on the website${subs.length ? ` · ${subs.length} subcategor${subs.length === 1 ? 'y' : 'ies'}` : ''}`}
                right={
                  <span style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                    {list.length > 0 && <Pill tone={onSite > 0 ? 'green' : 'amber'}>{onSite} live</Pill>}
                    {subs.length > 0 && (
                      <button className="adm-btn" style={{ padding: '.3rem .6rem', fontSize: '.74rem' }}
                              onClick={() => setOpen(isOpen ? '' : name)}>
                        {isOpen ? 'Hide' : 'Show'} subcategories
                      </button>
                    )}
                  </span>
                }
              />
              {isOpen && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', padding: '0 0 .7rem .2rem' }}>
                  {subs.map(([s, n]) => (
                    <span key={s} className="adm-pill adm-pill-grey">{s} {n}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
