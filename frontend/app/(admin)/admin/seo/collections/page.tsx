'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { seoContentApi, productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { COLLECTIONS, matchesCollection, type CollectionDef } from '@/lib/collections';
import type { Product } from '@/types';
import { Field, Faqs, Paragraphs, GooglePreview, btn, TITLE_LIMIT, DESC_LIMIT } from '@/components/admin/SeoFields';

// Keyword landing pages, without a developer.
//
// A collection is a page built for one search — "cotton nighty for women",
// "formal shoes for men" — that fills itself from the catalogue. Adding one
// used to mean editing lib/collections.ts and deploying, which in practice
// meant they were added twice a year instead of whenever a keyword was worth
// chasing.
//
// The live product count next to the filter is the part that matters most.
// Five of these pages have been sitting empty for months because nothing in
// the catalogue matched them, and there was no way to know that without
// opening the page. Now the number is on screen before anything is saved.

interface Coll extends Omit<CollectionDef, 'terms' | 'maxPrice'> {
  terms?: string[];
  maxPrice?: number;
  published: boolean;
  fromCode?: boolean;
}

const blank = (): Coll => ({
  slug: '', label: '', title: '', description: '', eyebrow: 'Collection',
  h1: '', sub: '', intro: [], faqs: [], subcategory: '', published: true,
});

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);

export default function CollectionsEditorPage() {
  const [items, setItems] = useState<Coll[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      seoContentApi.get().catch(() => ({ collections: [] as any[] })),
      productsApi.getAll({ pageSize: 1000 }).catch(() => ({ products: [] as Product[] })),
    ]).then(([content, prods]) => {
      const stored = new Map<string, any>(((content as any).collections ?? []).map((c: any) => [c.slug, c]));
      const merged: Coll[] = Object.values(COLLECTIONS).map(c => {
        const s = stored.get(c.slug);
        stored.delete(c.slug);
        return { ...c, published: s?.published !== false, ...(s ?? {}), fromCode: true } as Coll;
      });
      for (const s of stored.values()) merged.push({ ...s, published: s.published !== false });
      setItems(merged);
      setProducts(((prods as any).products ?? []) as Product[]);
      setLoading(false);
    });
  }, []);

  /** How many products each filter would actually show, right now. */
  const countFor = useMemo(() => (c: Coll) => {
    if (!c.subcategory) return 0;
    const sub = c.subcategory.trim().toLowerCase();
    return products
      .filter(p => (p.subcategory ?? '').trim().toLowerCase() === sub)
      .filter(p => matchesCollection(p, c as CollectionDef))
      .length;
  }, [products]);

  const subcategories = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => { if (p.subcategory?.trim()) s.add(p.subcategory.trim()); });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const patch = (i: number, p: Partial<Coll>) =>
    setItems(xs => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const token = getAdminToken();
      if (!token) throw new Error('Sign in again — your session has expired.');
      const payload = items.map(({ fromCode: _drop, ...c }) => c);
      await seoContentApi.saveCollections(payload, token);
      await seoContentApi.publish(token);
      setMsg({ kind: 'ok', text: 'Saved and live on the website.' });
      setEditing(null);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  function remove(i: number) {
    const c = items[i];
    if (c.fromCode) patch(i, { published: false });
    else setItems(xs => xs.filter((_, k) => k !== i));
    setEditing(null);
  }

  if (loading) {
    return <div className="admin-page"><div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>Loading collections and products…</div></div>;
  }

  const c = editing === null ? null : items[editing];
  const count = c ? countFor(c) : 0;

  return (
    <div className="admin-page">
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Collection Pages</h1>
          <p className="admin-page-sub">
            One page per keyword, filled automatically from your catalogue. New products join the right pages on their own.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          {editing !== null && <button onClick={() => setEditing(null)} style={btn('ghost')}>← Back to list</button>}
          <button onClick={save} disabled={saving} style={{ ...btn('primary'), opacity: saving ? .6 : 1 }}>
            {saving ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{
          background: msg.kind === 'ok' ? '#eaf6ec' : '#fdecea',
          border: `1px solid ${msg.kind === 'ok' ? '#c3e3c8' : '#f5c6c2'}`,
          color: msg.kind === 'ok' ? '#2e7d32' : '#c0392b',
          borderRadius: 10, padding: '.8rem 1rem', marginBottom: '1rem', fontSize: '.88rem',
        }}>{msg.text}</div>
      )}

      {c === null ? (
        <>
          <button onClick={() => { setItems(xs => [blank(), ...xs]); setEditing(0); }} style={{ ...btn('primary'), marginBottom: '1rem' }}>
            + New collection page
          </button>

          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
            {items.map((it, i) => {
              const n = countFor(it);
              return (
                <div key={it.slug || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '.85rem 1.1rem', borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '.92rem', color: it.published ? '#222' : '#aaa' }}>
                      {it.label || it.title || <span style={{ color: '#ccc' }}>Untitled</span>}
                      {!it.published && <span style={{ marginLeft: '.5rem', fontSize: '.7rem', color: '#c26a12', fontWeight: 700 }}>HIDDEN</span>}
                    </div>
                    <div style={{ fontSize: '.74rem', color: '#999', marginTop: '.15rem' }}>
                      /collections/{it.slug || '…'} · {it.subcategory || 'no subcategory'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{
                      background: n === 0 ? '#fdecea' : '#eaf6ec',
                      color: n === 0 ? '#c0392b' : '#2e7d32',
                      borderRadius: 20, padding: '2px 10px', fontSize: '.74rem', fontWeight: 700, whiteSpace: 'nowrap',
                    }}>{n} product{n === 1 ? '' : 's'}</span>
                    {it.published && it.slug && (
                      <Link href={`/collections/${it.slug}`} target="_blank" style={{ ...btn('ghost'), padding: '.35rem .8rem', fontSize: '.78rem', textDecoration: 'none' }}>View</Link>
                    )}
                    <button onClick={() => setEditing(i)} style={{ ...btn('primary'), padding: '.35rem .9rem', fontSize: '.78rem' }}>Edit</button>
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: '.78rem', color: '#999', marginTop: '1rem' }}>
            A page showing <strong>0 products</strong> hides itself from Google automatically, so it does no harm —
            but it does no work either. Either stock it or hide it.
          </p>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: '1.25rem', alignItems: 'start' }}>
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 .9rem', fontSize: '.8rem', fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Which products appear
            </h3>

            <div style={{ marginBottom: '.9rem' }}>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#555', marginBottom: '.3rem' }}>Subcategory</div>
              <select
                value={c.subcategory}
                onChange={e => patch(editing!, { subcategory: e.target.value })}
                style={{ width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '.55rem .7rem', fontSize: '.88rem', background: '#fff' }}
              >
                <option value="">— choose one —</option>
                {subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                {c.subcategory && !subcategories.includes(c.subcategory) && (
                  <option value={c.subcategory}>{c.subcategory} (nothing in stock)</option>
                )}
              </select>
            </div>

            <Field
              label="Only products whose name or description contains one of these words"
              value={(c.terms ?? []).join(', ')}
              placeholder="cotton, pure cotton"
              hint="Comma separated. Leave empty to include every product in the subcategory. Two collections with the same words end up as two pages fighting over one search."
              onChange={v => patch(editing!, { terms: v.split(',').map(s => s.trim()).filter(Boolean) })}
            />

            <div style={{ marginBottom: '.9rem' }}>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#555', marginBottom: '.3rem' }}>Maximum price (optional)</div>
              <input
                type="number" min={0} value={c.maxPrice ?? ''}
                placeholder="e.g. 500 for an 'under ₹500' page"
                onChange={e => patch(editing!, { maxPrice: e.target.value === '' ? undefined : Number(e.target.value) })}
                style={{ width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '.55rem .7rem', fontSize: '.88rem' }}
              />
            </div>

            <div style={{
              background: count === 0 ? '#fdecea' : '#eaf6ec',
              border: `1px solid ${count === 0 ? '#f5c6c2' : '#c3e3c8'}`,
              color: count === 0 ? '#c0392b' : '#2e7d32',
              borderRadius: 8, padding: '.7rem .9rem', fontSize: '.86rem', marginBottom: '1.5rem', fontWeight: 600,
            }}>
              {count === 0
                ? 'This filter matches no products, so the page would be empty and would hide itself from Google.'
                : `This filter matches ${count} product${count === 1 ? '' : 's'} right now.`}
            </div>

            <h3 style={{ margin: '0 0 .9rem', fontSize: '.8rem', fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              What the page says
            </h3>

            <Field label="Google title" value={c.title} limit={TITLE_LIMIT}
              placeholder="Cotton Nighty for Women Online — Soft & Breathable"
              onChange={v => patch(editing!, { title: v, slug: c.slug || slugify(v), label: c.label || v })} />
            <Field label="Web address (slug)" value={c.slug} mono placeholder="cotton-nighty"
              hint="Appears as /collections/your-slug."
              onChange={v => patch(editing!, { slug: slugify(v) })} />
            <Field label="Google description" value={c.description} limit={DESC_LIMIT} rows={2}
              onChange={v => patch(editing!, { description: v })} />
            <Field label="Menu label" value={c.label} limit={40}
              hint="The short name used in the footer links."
              onChange={v => patch(editing!, { label: v })} />
            <Field label="Heading on the page (H1)" value={c.h1} limit={70}
              onChange={v => patch(editing!, { h1: v })} />
            <Field label="Line under the heading" value={c.sub} limit={120}
              onChange={v => patch(editing!, { sub: v })} />

            <Paragraphs value={c.intro} onChange={v => patch(editing!, { intro: v })} />
            <Faqs value={c.faqs} onChange={v => patch(editing!, { faqs: v })} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f2f2f2' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.86rem', fontWeight: 600, color: '#444', cursor: 'pointer' }}>
                <input type="checkbox" checked={c.published} onChange={e => patch(editing!, { published: e.target.checked })} />
                Show on the website
              </label>
              <button onClick={() => remove(editing!)} style={btn('danger')}>
                {c.fromCode ? 'Hide this page' : 'Delete'}
              </button>
            </div>
          </div>

          <div style={{ position: 'sticky', top: '1rem' }}>
            <GooglePreview title={c.title} description={c.description} path={`collections/${c.slug}`} />
          </div>
        </div>
      )}
    </div>
  );
}
