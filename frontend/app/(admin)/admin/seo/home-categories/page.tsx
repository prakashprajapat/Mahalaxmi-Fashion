'use client';
import { useEffect, useMemo, useState } from 'react';
import { seoContentApi, productsApi, settingsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { DEFAULT_HOME_TILES, type HomeTile } from '@/lib/seoContent';
import type { Product } from '@/types';
import { btn } from '@/components/admin/SeoFields';

// The "Shop by category" row on the homepage, owned by the owner.
//
// Until now those five tiles lived in the code, so adding a sixth category
// meant a developer and a deploy. Worse, the photograph was chosen by the
// code — "first product in the group" — which is how footwear ended up
// represented by a shoe still lying in its delivery box and innerwear by a
// supplier's advertising sheet. Both are fixed here: rows are added on this
// screen, and the photo is uploaded, not guessed.
//
// The live count beside each row is the honest part. A tile pointing at a
// filter that matches nothing is a door into an empty room, and the number
// says so before it is saved rather than after a shopper finds it.

interface Row extends HomeTile { published: boolean; }

const blank = (): Row => ({ label: '', href: '', image: '', terms: [], published: true });

export default function HomeCategoriesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      seoContentApi.get().catch(() => ({ homeTiles: [] as any[] })),
      productsApi.getAll({ pageSize: 1000 }).catch(() => ({ products: [] as Product[] })),
    ]).then(([content, prods]) => {
      const stored = ((content as any).homeTiles ?? []) as HomeTile[];
      const source = stored.length > 0 ? stored : DEFAULT_HOME_TILES;
      setRows(source.map(t => ({
        label: t.label ?? '', href: t.href ?? '', image: t.image ?? '',
        terms: Array.isArray(t.terms) ? t.terms : [],
        published: t.published !== false,
      })));
      setProducts(((prods as any).products ?? []) as Product[]);
      setLoading(false);
    });
  }, []);

  /** How many products this row's words match right now — the same rule the homepage uses. */
  const countFor = useMemo(() => (r: Row) => {
    const terms = (r.terms ?? []).map(t => t.trim().toLowerCase()).filter(Boolean);
    if (terms.length === 0) return 0;
    return products.filter(p => {
      const hay = `${p.subcategory ?? ''} ${p.category ?? ''}`.toLowerCase();
      return terms.some(w => hay.includes(w));
    }).length;
  }, [products]);

  /** Every word already in the catalogue, so he picks from what exists instead of guessing. */
  const known = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => {
      if (p.subcategory?.trim()) s.add(p.subcategory.trim());
      if (p.category?.trim()) s.add(p.category.trim());
    });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const patch = (i: number, p: Partial<Row>) =>
    setRows(xs => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));

  const move = (i: number, by: number) =>
    setRows(xs => {
      const j = i + by;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function upload(i: number, file: File | undefined) {
    if (!file) return;
    setUploading(i);
    setMsg(null);
    try {
      const token = getAdminToken();
      if (!token) throw new Error('Sign in again — your session has expired.');
      const url = await settingsApi.uploadImage(file, token);
      patch(i, { image: url });
    } catch (e) {
      setMsg({ kind: 'err', text: 'Upload failed: ' + (e instanceof Error ? e.message : 'unknown error') });
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    // A row the server would reject: it validates every row, hidden ones too,
    // so an empty row left behind after a delete would block the whole save.
    const kept = rows.filter(r => r.label.trim() || r.href.trim() || (r.image ?? '').trim());
    const bad = kept.find(r => !r.label.trim() || !r.href.trim().startsWith('/'));
    if (bad) {
      setMsg({ kind: 'err', text: 'Every row needs a name and a link that starts with "/" — for example /men.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const token = getAdminToken();
      if (!token) throw new Error('Sign in again — your session has expired.');
      await seoContentApi.saveHomeTiles(kept.map(r => ({
        label: r.label.trim(),
        href: r.href.trim(),
        image: (r.image ?? '').trim(),
        terms: (r.terms ?? []).map(t => t.trim()).filter(Boolean),
        published: r.published,
      })), token);
      await seoContentApi.publish(token);
      setMsg({ kind: 'ok', text: 'Saved — the homepage is showing this now.' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="admin-page"><div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>Loading…</div></div>;
  }

  const visible = rows.filter(r => r.published).length;

  return (
    <div className="admin-page">
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Home Categories</h1>
          <p className="admin-page-sub">
            The “Shop by category” row on the homepage. Add a category here and it appears on the site — no code, no deploy.
          </p>
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

      {visible > 5 && (
        <div style={{ background: '#fff8e6', border: '1px solid #f2dfa8', color: '#8a6300', borderRadius: 10, padding: '.8rem 1rem', marginBottom: '1rem', fontSize: '.85rem' }}>
          {visible} categories are visible. Five fit on one line on a computer — beyond that they wrap onto a second row, which reads as a list rather than a shop front.
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {rows.map((r, i) => {
          const n = countFor(r);
          return (
            <div key={i} style={{
              background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1rem',
              display: 'grid', gridTemplateColumns: '132px minmax(0,1fr) auto', gap: '1rem', alignItems: 'start',
              opacity: r.published ? 1 : .55,
            }}>
              {/* Photo */}
              <div>
                <div style={{
                  position: 'relative', aspectRatio: '3 / 4', borderRadius: 8, overflow: 'hidden',
                  background: '#f3efea', border: '1px dashed #ddd',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {r.image
                    // Plain <img>: these are admin previews, not page images, and the
                    // URL can be anything the owner pastes.
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={r.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '.72rem', color: '#aaa', textAlign: 'center', padding: '.5rem' }}>
                        No photo — the newest product’s photo will be used
                      </span>}
                </div>
                <label style={{ ...btn('ghost'), display: 'block', textAlign: 'center', marginTop: '.5rem', padding: '.4rem', fontSize: '.76rem' }}>
                  {uploading === i ? 'Uploading…' : r.image ? 'Change photo' : 'Upload photo'}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => upload(i, e.target.files?.[0])} />
                </label>
                {r.image && (
                  <button onClick={() => patch(i, { image: '' })}
                    style={{ ...btn('ghost'), width: '100%', marginTop: '.35rem', padding: '.35rem', fontSize: '.74rem', color: '#c0392b' }}>
                    Remove photo
                  </button>
                )}
              </div>

              {/* Fields */}
              <div style={{ display: 'grid', gap: '.6rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '.6rem' }}>
                  <div>
                    <div style={lbl}>Name shown on the tile</div>
                    <input value={r.label} maxLength={40} placeholder="Kurti Sets"
                      onChange={e => patch(i, { label: e.target.value })} style={inp} />
                  </div>
                  <div>
                    <div style={lbl}>Where it goes when tapped</div>
                    <input value={r.href} placeholder="/collections/kurti-set"
                      onChange={e => patch(i, { href: e.target.value })} style={{ ...inp, fontFamily: 'ui-monospace, monospace', fontSize: '.82rem' }} />
                  </div>
                </div>

                <div>
                  <div style={lbl}>Words that decide which products it counts</div>
                  <input
                    value={(r.terms ?? []).join(', ')}
                    placeholder="kurti, kurta set"
                    onChange={e => patch(i, { terms: e.target.value.split(',').map(s => s.trim()) })}
                    style={inp}
                  />
                  <div style={{ fontSize: '.73rem', color: '#999', marginTop: '.25rem' }}>
                    Comma separated. Matched against each product’s category and subcategory. This only sets the
                    “12 pieces” line under the tile — the link above is what the tile actually opens.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{
                    background: n === 0 ? '#fdecea' : '#eaf6ec',
                    color: n === 0 ? '#c0392b' : '#2e7d32',
                    borderRadius: 20, padding: '2px 10px', fontSize: '.74rem', fontWeight: 700,
                  }}>{n} product{n === 1 ? '' : 's'} match</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.84rem', fontWeight: 600, color: '#444', cursor: 'pointer' }}>
                    <input type="checkbox" checked={r.published} onChange={e => patch(i, { published: e.target.checked })} />
                    Show on the homepage
                  </label>
                </div>
              </div>

              {/* Order / delete */}
              <div style={{ display: 'grid', gap: '.35rem', justifyItems: 'stretch' }}>
                <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...btn('ghost'), padding: '.3rem .7rem', fontSize: '.8rem', opacity: i === 0 ? .4 : 1 }}>↑</button>
                <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} style={{ ...btn('ghost'), padding: '.3rem .7rem', fontSize: '.8rem', opacity: i === rows.length - 1 ? .4 : 1 }}>↓</button>
                <button onClick={() => setRows(xs => xs.filter((_, k) => k !== i))} style={{ ...btn('danger'), padding: '.3rem .7rem', fontSize: '.78rem' }}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => setRows(xs => [...xs, blank()])} style={{ ...btn('primary'), marginTop: '1rem' }}>
        + Add a category
      </button>

      {known.length > 0 && (
        <div style={{ marginTop: '1.5rem', background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.6rem' }}>
            Words already in your catalogue
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
            {known.map(k => (
              <span key={k} style={{ background: '#f6f3f0', borderRadius: 6, padding: '.2rem .55rem', fontSize: '.76rem', color: '#555' }}>{k}</span>
            ))}
          </div>
          <p style={{ fontSize: '.75rem', color: '#999', margin: '.7rem 0 0' }}>
            A word here counts a product only if it appears in that product’s category or subcategory, so copy from this list rather than inventing one.
          </p>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: '.75rem', fontWeight: 700, color: '#555', marginBottom: '.25rem' };
const inp: React.CSSProperties = { width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '.5rem .65rem', fontSize: '.86rem' };
