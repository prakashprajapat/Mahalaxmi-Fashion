'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { seoContentApi, productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { CATEGORY_SEO, type CategorySeo } from '@/lib/categorySeo';
import type { Product } from '@/types';
import { Field, Faqs, Paragraphs, GooglePreview, btn, TITLE_LIMIT, DESC_LIMIT } from '@/components/admin/SeoFields';

// The copy on the five category pages — women, men, kids, beauty, fabrics.
//
// These are the pages the main menu points at, so they get more visitors than
// anything except the homepage, and their text was the hardest to change:
// buried in a TypeScript file, four paragraphs deep. Now it is five text boxes.

export default function CategoryCopyPage() {
  const [cats, setCats] = useState<Record<string, CategorySeo>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [active, setActive] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      seoContentApi.get().catch(() => ({ categories: {} as Record<string, CategorySeo> })),
      productsApi.getAll({ pageSize: 1000 }).catch(() => ({ products: [] as Product[] })),
    ]).then(([content, prods]) => {
      // The code copy is the starting point; whatever has been saved wins.
      const merged: Record<string, CategorySeo> = { ...CATEGORY_SEO, ...((content as any).categories ?? {}) };
      setCats(merged);
      setActive(Object.keys(merged)[0] ?? '');
      setProducts(((prods as any).products ?? []) as Product[]);
      setLoading(false);
    });
  }, []);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      const k = (p.category ?? '').trim().toLowerCase();
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [products]);

  const patch = (p: Partial<CategorySeo>) =>
    setCats(cs => ({ ...cs, [active]: { ...cs[active], ...p } }));

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const token = getAdminToken();
      if (!token) throw new Error('Sign in again — your session has expired.');
      await seoContentApi.saveCategories(cats, token);
      await seoContentApi.publish(token);
      setMsg({ kind: 'ok', text: 'Saved and live on the website.' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="admin-page"><div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>Loading category pages…</div></div>;
  }

  const c = cats[active];
  const n = counts.get(active.toLowerCase()) ?? 0;

  return (
    <div className="admin-page">
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Category Page Copy</h1>
          <p className="admin-page-sub">The title, description and text on the pages your main menu links to.</p>
        </div>
        <button onClick={save} disabled={saving} style={{ ...btn('primary'), opacity: saving ? .6 : 1 }}>
          {saving ? 'Saving…' : 'Save & publish'}
        </button>
      </div>

      {msg && (
        <div style={{
          background: msg.kind === 'ok' ? '#eaf6ec' : '#fdecea',
          border: `1px solid ${msg.kind === 'ok' ? '#c3e3c8' : '#f5c6c2'}`,
          color: msg.kind === 'ok' ? '#2e7d32' : '#c0392b',
          borderRadius: 10, padding: '.8rem 1rem', marginBottom: '1rem', fontSize: '.88rem',
        }}>{msg.text}</div>
      )}

      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {Object.keys(cats).map(k => {
          const kn = counts.get(k.toLowerCase()) ?? 0;
          return (
            <button key={k} onClick={() => setActive(k)}
              style={{
                background: k === active ? '#a7354d' : '#fff',
                color: k === active ? '#fff' : '#555',
                border: k === active ? 'none' : '1px solid #ddd',
                borderRadius: 20, padding: '.45rem 1rem', fontSize: '.84rem', fontWeight: 700,
                textTransform: 'capitalize', cursor: 'pointer',
              }}>
              {k}
              <span style={{ opacity: .7, fontWeight: 400, marginLeft: '.4rem', fontSize: '.78rem' }}>
                {kn}
              </span>
            </button>
          );
        })}
      </div>

      {c && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: '1.25rem', alignItems: 'start' }}>
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1.25rem' }}>
            {n === 0 && (
              <div style={{ background: '#fff5e6', border: '1px solid #f0d8b0', color: '#c26a12', borderRadius: 8, padding: '.7rem .9rem', fontSize: '.84rem', marginBottom: '1rem' }}>
                This page has no products in it right now. However good the writing is, a shopper who arrives
                finds an empty shelf — stock it, or take it out of the menu.
              </div>
            )}

            <Field label="Google title" value={c.title} limit={TITLE_LIMIT}
              onChange={v => patch({ title: v })} />
            <Field label="Google description" value={c.description} limit={DESC_LIMIT} rows={2}
              onChange={v => patch({ description: v })} />
            <Field label="Heading above the text on the page" value={c.heading} limit={80}
              onChange={v => patch({ heading: v })} />
            <Paragraphs value={c.intro} onChange={v => patch({ intro: v })} />
            <Faqs value={c.faqs} onChange={v => patch({ faqs: v })} />

            <Link href={`/${active}`} target="_blank" style={{ ...btn('ghost'), textDecoration: 'none', display: 'inline-block' }}>
              View this page →
            </Link>
          </div>

          <div style={{ position: 'sticky', top: '1rem' }}>
            <GooglePreview title={c.title} description={c.description} path={active} />
          </div>
        </div>
      )}
    </div>
  );
}
