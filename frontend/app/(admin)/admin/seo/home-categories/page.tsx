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
//
// A category is now BUILT, not typed: pick two or more real subcategories out of
// the catalogue and the link writes itself. Typing both the words and the link
// by hand is what produced the two faults this screen kept repeating — "Kurti
// Sets" pointing at a collection page nobody had created (a 404 straight off the
// homepage), and "Nightwear" counting 34 products while opening onto 14, because
// the count matched loosely and the page matched exactly. Neither is reachable
// from a list of checkboxes.

interface Row extends HomeTile { published: boolean; }

const blank = (): Row => ({ label: '', href: '', image: '', terms: [], published: true });

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

// A tile built here opens the listing narrowed to exactly the subcategories
// chosen for it. That is the whole point of choosing more than one: "Nightwear"
// is Cotton Nighty and Hosiery Nighty together, and neither one alone deserves a
// tile. One subcategory is not a category — it is a subcategory, and the tile
// would just be a slower way to reach a filter the shopper already has.
const hrefFor = (terms: string[]) =>
  `/products?subcategory=${encodeURIComponent(terms.map(t => t.trim()).filter(Boolean).join(','))}`;

// Rows saved before this screen existed point at their own curated pages
// (/collections/cotton-nighty and such). Those pages are indexed by Google and
// must keep working, so they are left alone and shown as they are; everything
// new is built from subcategories.
const usesPicker = (href: string) => !href.trim() || href.trim().startsWith('/products?subcategory=');

// Pehle yahan 2 tha: ek subcategory ko category maanna galat lagta tha.
// Lekin dukaan me aisi shreniyan hoti hain jinke neeche sach me ek hi cheez
// hai — Saree ke neeche sirf Sarees. Aise me niyam dukaan ko sudharta nahi,
// bas tile banne nahi deta. Ab ginti ka faisla maalik ka hai; shart sirf itni
// hai ki tile kuch to kholti ho.
const MIN_SUBS = 1;

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
      productsApi.getAll({ pageSize: 1000 }, getAdminToken() ?? undefined).catch(() => ({ products: [] as Product[] })),
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

  /**
   * How many products this row opens — counted the same way the listing filters,
   * so the number here and the page a shopper lands on can never disagree.
   *
   * They used to. The count matched any product whose category OR subcategory
   * merely CONTAINED the word, while the page matched the subcategory exactly:
   * "Nightwear" counted 34 and opened onto 14. Picking real subcategories from
   * the catalogue removes the guesswork on both sides.
   */
  const countFor = useMemo(() => (r: Row) => {
    const terms = (r.terms ?? []).map(t => t.trim()).filter(Boolean);
    if (terms.length === 0) return 0;
    if (usesPicker(r.href)) {
      const wanted = new Set(terms.map(norm));
      return products.filter(p => wanted.has(norm(p.subcategory ?? ''))).length;
    }
    // Legacy rows with their own page: the old loose rule, so their number does
    // not change under him without his asking.
    const low = terms.map(t => t.toLowerCase());
    return products.filter(p => {
      const hay = `${p.subcategory ?? ''} ${p.category ?? ''}`.toLowerCase();
      return low.some(w => hay.includes(w));
    }).length;
  }, [products]);

  /**
   * Every subcategory that actually exists in the catalogue, with how many
   * products sit in it. He picks from this instead of typing a word, so a tile
   * can no longer point at a group that does not exist.
   */
  const knownSubs = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>();
    products.forEach(p => {
      const name = p.subcategory?.trim();
      if (!name) return;
      const key = norm(name);
      const row = counts.get(key);
      if (row) row.n += 1;
      else counts.set(key, { name, n: 1 });
    });
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const toggleTerm = (i: number, name: string) =>
    setRows(xs => xs.map((x, k) => {
      if (k !== i) return x;
      const cur = (x.terms ?? []).filter(Boolean);
      const has = cur.some(t => norm(t) === norm(name));
      const terms = has ? cur.filter(t => norm(t) !== norm(name)) : [...cur, name];
      // The link is not typed, it is what the choice means.
      return { ...x, terms, href: usesPicker(x.href) ? hrefFor(terms) : x.href };
    }));

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
    const kept = rows
      .filter(r => r.label.trim() || r.href.trim() || (r.image ?? '').trim() || (r.terms ?? []).length > 0)
      // A picker row's link is derived, never typed, so it is rebuilt here from
      // the choice rather than trusted from state.
      .map(r => (usesPicker(r.href) ? { ...r, href: hrefFor(r.terms ?? []) } : r));

    const unnamed = kept.find(r => !r.label.trim());
    if (unnamed) {
      setMsg({ kind: 'err', text: 'Every tile needs a name.' });
      return;
    }

    // The rule he asked for: a category is a group of subcategories. One is not
    // a group, none is not a category.
    const thin = kept.find(r => usesPicker(r.href) && (r.terms ?? []).filter(Boolean).length < MIN_SUBS);
    if (thin) {
      setMsg({
        kind: 'err',
        text: `“${thin.label.trim() || 'Unnamed'}” has no subcategory picked. `
            + 'Pick at least one, otherwise the tile opens a page with nothing on it.',
      });
      return;
    }

    const brokenLink = kept.find(r => !r.href.trim().startsWith('/'));
    if (brokenLink) {
      setMsg({ kind: 'err', text: 'An older tile has a link that does not start with "/" — please fix it.' });
      return;
    }
    setSaving(true);
    setMsg(null);

    // Tile ka pata sach me khulta hai ya nahi — save se PEHLE.
    //
    // "Kurti Sets" wali tile /collections/kurti-set par bhejti thi, jo banaya hi
    // nahi gaya tha. Gintii ("9 pieces") sahi dikhti thi kyunki wo alag hisaab
    // se banti hai, isliye galti pakdi nahi gayi — aur grahak ko homepage se
    // seedha 404 milta raha. Gintii aur link do alag cheezein hain.
    try {
      const broken: string[] = [];
      for (const r of kept) {
        const href = r.href.trim();
        // eslint-disable-next-line no-await-in-loop
        const ok = await fetch(href, { method: 'GET', redirect: 'follow' })
          .then(res => res.status !== 404)
          // Network hi na chale to rokna galat hoga — save hone dete hain.
          .catch(() => true);
        if (!ok) broken.push(`${r.label.trim() || '(no label)'} → ${href}`);
      }
      if (broken.length > 0) {
        setMsg({
          kind: 'err',
          text: `These links open a 404, so nothing was saved: ${broken.join(', ')}. `
              + 'Create that page first (SEO → Collection Pages), or point the tile at a page that works.',
        });
        setSaving(false);
        return;
      }
    } catch { /* jaanch hi na ho paye to save rokna nahi hai */ }

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
    return <div className="admin-page"><div style={{ padding: '3rem', textAlign: 'center', color: '#a49a94' }}>Loading…</div></div>;
  }

  const visible = rows.filter(r => r.published).length;

  return (
    <div className="admin-page">
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Home Categories</h1>
          <p className="admin-page-sub">
            The “Shop by category” row on the homepage. Give a tile a name, pick one or more
            subcategories, add a photo. The link writes itself, so it cannot point at a page that
            does not exist. Photo: 900 × 1200 px (3:4, portrait) — it is cropped from the centre,
            so keep the garment in the middle.
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
          const picker = usesPicker(r.href);
          const chosen = (r.terms ?? []).filter(Boolean);
          const short = picker && chosen.length < MIN_SUBS;
          return (
            <div key={i} style={{
              background: '#fff', border: `1px solid ${short ? '#f5c6c2' : '#eae3e4'}`, borderRadius: 13, padding: '1rem',
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
                    : <span style={{ fontSize: '.72rem', color: '#a49a94', textAlign: 'center', padding: '.5rem' }}>
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
                <div>
                  <div style={lbl}>Name on the tile</div>
                  <input value={r.label} maxLength={40} placeholder="Nightwear"
                    onChange={e => patch(i, { label: e.target.value })} style={{ ...inp, maxWidth: 320 }} />
                </div>

                {picker ? (
                  <div>
                    <div style={lbl}>
                      Which subcategories go in it — pick one or more
                    </div>
                    {knownSubs.length === 0 ? (
                      <div style={{ fontSize: '.8rem', color: '#9a908a' }}>
                        There are no subcategories in the catalogue yet.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
                        {knownSubs.map(k => {
                          const on = chosen.some(t => norm(t) === norm(k.name));
                          return (
                            <button key={k.name} type="button" onClick={() => toggleTerm(i, k.name)}
                              style={{
                                border: `1px solid ${on ? '#722f37' : '#e5dcdd'}`,
                                background: on ? '#722f37' : '#fff',
                                color: on ? '#fff' : '#555',
                                borderRadius: 20, padding: '.28rem .7rem',
                                fontSize: '.78rem', fontWeight: on ? 700 : 500, cursor: 'pointer',
                              }}>
                              {on ? '✓ ' : ''}{k.name} <span style={{ opacity: .65 }}>({k.n})</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ fontSize: '.73rem', color: short ? '#c0392b' : '#9a908a', marginTop: '.4rem', fontWeight: short ? 700 : 400 }}>
                      {short
                        ? 'Nothing picked yet — pick at least one subcategory, or this tile opens an empty page.'
                        : `${chosen.length} picked.`}
                    </div>
                    <div style={{ fontSize: '.73rem', color: '#9a908a', marginTop: '.3rem', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
                      Opens: {chosen.length > 0 ? hrefFor(chosen) : '—'}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={lbl}>This one has its own page</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
                      <code style={{ background: '#f6f3f0', borderRadius: 6, padding: '.3rem .6rem', fontSize: '.8rem' }}>{r.href}</code>
                      <button type="button" onClick={() => patch(i, { href: '', terms: [] })}
                        style={{ ...btn('ghost'), padding: '.3rem .7rem', fontSize: '.76rem' }}>
                        Build it from subcategories
                      </button>
                    </div>
                    <div style={{ fontSize: '.73rem', color: '#9a908a', marginTop: '.3rem' }}>
                      This tile already points at its own collection page, which Google has indexed,
                      so it was left alone. Use the button above to rebuild it from subcategories.
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{
                    background: n === 0 ? '#fdecea' : '#eaf6ec',
                    color: n === 0 ? '#c0392b' : '#2e7d32',
                    borderRadius: 20, padding: '2px 10px', fontSize: '.74rem', fontWeight: 700,
                  }}>{n} product{n === 1 ? '' : 's'} will open</span>
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
        + New category
      </button>

    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: '.75rem', fontWeight: 700, color: '#555', marginBottom: '.25rem' };
const inp: React.CSSProperties = { width: '100%', border: '1px solid #e5dcdd', borderRadius: 8, padding: '.5rem .65rem', fontSize: '.86rem' };
