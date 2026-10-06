'use client';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getAdminToken } from '@/lib/auth';
import { productsApi } from '@/lib/api';
import { compressImage } from '@/lib/imageCompress';
import { checkProduct } from '@/lib/productGate';
import { PageHeader, Card, Stat, StatGrid, Pill, Empty } from '@/components/admin/Ui';
import {
  parseFeed, guessMap, buildProducts, applyMargin, toApiProduct,
  FEED_FIELDS, type FeedField, type ParsedFeed, type BuiltProduct, type PricingRule,
} from '@/lib/productFeed';

// Loading a supplier's catalogue in one go.
//
// Adding a product by hand is seven fields, two photos and a saved click. Fine
// for the ten things you photographed yourself; impossible for the four hundred
// a supplier has just agreed to let you sell. This page takes their file and
// does the four hundred.
//
// It is built around one rule: nothing is written until the owner has seen what
// will be written. A supplier's file is somebody else's spreadsheet, made for
// their own purposes, and the usual way these go wrong is quiet — a cost price
// imported as a selling price, a size column read as a colour, four hundred
// products created a second time because the SKU column was not where it was
// expected. So the file is read, the columns are guessed, the guesses are shown
// with real values beside them, and the whole result is costed and checked
// against the same quality rules the website applies — all before a single row
// is saved.

const CATEGORIES = ['women', 'men', 'kids', 'beauty', 'fabrics', 'more'];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '.5rem .6rem', border: '1.5px solid #e3dad6',
  borderRadius: 8, fontSize: '.88rem', background: '#fff', color: '#2d2724',
};

interface Progress {
  total: number;
  done: number;
  created: number;
  updated: number;
  drafts: number;
  failed: number;
  photosMissed: number;
  current: string;
  problems: string[];
}

export default function ImportProductsPage() {
  const [step, setStep] = useState<'file' | 'map' | 'running' | 'done'>('file');
  const [feed, setFeed] = useState<ParsedFeed | null>(null);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState<Partial<Record<FeedField, string>>>({});
  const [rule, setRule] = useState<PricingRule>({ marginPercent: 40, roundTo: 9, shipping: 0 });
  const [defCategory, setDefCategory] = useState('women');
  const [defSubcategory, setDefSubcategory] = useState('');
  const [maxGallery, setMaxGallery] = useState(5);
  const [existing, setExisting] = useState<{ id: number; sku?: string; name: string }[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const stopped = useRef(false);

  // ── reading the file ───────────────────────────────────────────────────────

  const onFile = async (file: File) => {
    setError('');
    try {
      const text = await file.text();
      const parsed = parseFeed(text, file.name);
      if (parsed.rows.length === 0) {
        setError('No products were found in that file. If the supplier sent an Excel file, ask them to save it as CSV first.');
        return;
      }
      setFeed(parsed);
      setFileName(file.name);
      setMap(guessMap(parsed.columns));
      setStep('map');

      // The catalogue is read now, not at import time, so the preview can say
      // which of these the shop already has.
      setLoadingExisting(true);
      try {
        const token = getAdminToken() ?? '';
        const r = await productsApi.getAll({ pageSize: 5000 }, token);
        setExisting((r.products ?? []).map(p => ({ id: p.dbId, sku: p.sku, name: p.name })));
      } catch {
        setExisting([]);
      } finally {
        setLoadingExisting(false);
      }
    } catch {
      setError('That file could not be read.');
    }
  };

  // ── what would happen ──────────────────────────────────────────────────────

  const built: BuiltProduct[] = useMemo(() => {
    if (!feed) return [];
    return buildProducts(feed.rows, map, rule, { category: defCategory, subcategory: defSubcategory }, existing);
  }, [feed, map, rule, defCategory, defSubcategory, existing]);

  const checked = useMemo(() => built.map(p => ({
    p,
    gate: checkProduct({
      name: p.name,
      description: p.description,
      price: p.price,
      maxPrice: p.maxPrice ?? undefined,
      image: p.image,
      category: p.category,
      subcategory: p.subcategory,
      sizes: p.sizes,
      colours: p.colours,
      sku: p.sku,
    }),
  })), [built]);

  const counts = useMemo(() => ({
    total: built.length,
    fresh: built.filter(p => !p.existingId).length,
    updates: built.filter(p => p.existingId).length,
    live: checked.filter(c => c.gate.passed).length,
    drafts: checked.filter(c => !c.gate.passed).length,
    noPhoto: built.filter(p => !p.image).length,
    noPrice: built.filter(p => p.supplierPrice <= 0).length,
  }), [built, checked]);

  // The five problems that hold back the most products, so the owner fixes the
  // column mapping rather than reading four hundred identical complaints.
  const topProblems = useMemo(() => {
    const tally = new Map<string, number>();
    checked.forEach(c => c.gate.blocking.forEach(b => tally.set(b.message, (tally.get(b.message) ?? 0) + 1)));
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [checked]);

  const ready = Boolean(map.name && map.price);

  // ── bringing a photo across ────────────────────────────────────────────────

  const fetchPhoto = async (url: string, token: string): Promise<string | null> => {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    try {
      const r = await fetch('/tools/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url }),
      });
      const body = await r.json();
      if (!body?.success || !body.dataUrl) return null;

      // Shrink it here rather than on the server: a supplier's photo is often
      // 3000px wide, and nothing on the site shows more than 1080.
      const blob = await (await fetch(body.dataUrl)).blob();
      const file = new File([blob], 'photo', { type: blob.type || 'image/jpeg' });
      const small = await compressImage(file);
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(small);
      });
    } catch {
      return null;
    }
  };

  // ── the import itself ──────────────────────────────────────────────────────

  const run = async () => {
    const token = getAdminToken();
    if (!token) { setError('Your session has expired. Sign in again.'); return; }

    stopped.current = false;
    setStep('running');
    const p: Progress = {
      total: built.length, done: 0, created: 0, updated: 0,
      drafts: 0, failed: 0, photosMissed: 0, current: '', problems: [],
    };
    setProgress({ ...p });

    // One product per request, on purpose. A batch carrying twenty products and
    // their photos is a very large upload that fails as one; this way a photo
    // the supplier has deleted costs that one product and nothing else, and the
    // number on screen is the number actually saved.
    for (const item of built) {
      if (stopped.current) break;
      p.current = item.name || item.sku || 'Unnamed product';
      setProgress({ ...p });

      try {
        const main = await fetchPhoto(item.image, token);
        if (item.image && !main) p.photosMissed++;

        const gallery: string[] = [];
        for (const url of item.images.slice(1, Math.max(1, maxGallery))) {
          if (stopped.current) break;
          const got = await fetchPhoto(url, token);
          if (got) gallery.push(got);
        }

        const payload = toApiProduct(item, main ?? '', gallery);
        const res: any = await productsApi.bulkSave([payload], token);

        if (res?.success) {
          p.created += res.created ?? 0;
          p.updated += res.updated ?? 0;
          p.drafts += res.heldAsDraft ?? 0;
        } else {
          p.failed++;
          p.problems.push(`${p.current}: ${res?.message ?? 'could not be saved'}`);
        }
      } catch (e: any) {
        p.failed++;
        const why = String(e?.message ?? e ?? 'unknown error').slice(0, 160);
        p.problems.push(`${p.current}: ${why}`);
      }

      p.done++;
      setProgress({ ...p });
    }

    p.current = '';
    setProgress({ ...p });
    setStep('done');
  };

  // ── a file the supplier can fill in ────────────────────────────────────────

  const downloadTemplate = () => {
    const rows = [
      ['SKU', 'Name', 'Description', 'Category', 'Subcategory', 'Price', 'MRP', 'Image', 'More Images', 'Sizes', 'Colours', 'Fabric', 'Availability'],
      ['ANG-1001', 'Cotton Printed Nighty for Women', 'Soft cotton nighty with full-length sleeves and a button placket. Breathable for daily wear and comfortable through the night.', 'women', 'Nighty', '420', '899', 'https://example.com/photo1.jpg', 'https://example.com/photo2.jpg | https://example.com/photo3.jpg', 'M | L | XL | XXL', 'Maroon | Navy Blue', 'Cotton', 'in stock'],
    ];
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'supplier-product-list-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── screens ────────────────────────────────────────────────────────────────

  return (
    <div className="admin-page">
      <PageHeader
        title="Import Products"
        sub="Load a supplier's product list in one go, with your margin already added."
        right={
          <button onClick={downloadTemplate} className="btn-ghost"
            style={{ padding: '.5rem .9rem', border: '1.5px solid #e3dad6', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 650, fontSize: '.85rem' }}>
            Sample file for the supplier
          </button>
        }
      />

      {error && (
        <Card style={{ borderColor: '#f0c9c9', background: '#fdf6f6' }}>
          <p style={{ margin: 0, color: '#a01836', fontSize: '.9rem' }}>{error}</p>
        </Card>
      )}

      {step === 'file' && (
        <Card title="1. The supplier's file">
          <p style={{ color: '#6b615c', fontSize: '.88rem', lineHeight: 1.65, margin: '0 0 1rem' }}>
            CSV, XML or JSON. A Shopify export and a Google Merchant feed are both understood as they
            come — there is nothing to rearrange first. Ask the supplier for their product feed; most
            already have one, because that is what they send to Google.
          </p>
          <input
            type="file"
            accept=".csv,.tsv,.xml,.json,.txt,text/csv,text/xml,application/xml,application/json"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            style={{ ...inputStyle, padding: '.75rem' }}
          />
          <p style={{ color: '#8a7f76', fontSize: '.82rem', lineHeight: 1.6, margin: '1rem 0 0' }}>
            Before you import somebody else&apos;s catalogue, have their permission in writing to use
            their photos and descriptions. Buying the goods does not come with it, and it is the one
            part of this that cannot be undone from here.
          </p>
        </Card>
      )}

      {step === 'map' && feed && (
        <>
          <StatGrid>
            <Stat label="Products in the file" value={counts.total} />
            <Stat label="New to your shop" value={counts.fresh} />
            <Stat label="Already have, will update" value={counts.updates} />
            <Stat label="Will go live straight away" value={counts.live} tone={counts.live > 0 ? 'green' : undefined} />
          </StatGrid>

          <Card title={`2. What each column means — ${feed.format}`}>
            <p style={{ color: '#6b615c', fontSize: '.86rem', lineHeight: 1.6, margin: '0 0 .4rem' }}>
              {fileName} · {feed.rows.length} products · {feed.columns.length} columns
              {loadingExisting && ' · reading your catalogue…'}
            </p>
            {feed.notes.map((n, i) => (
              <p key={i} style={{ color: '#8a7f76', fontSize: '.82rem', margin: '0 0 .4rem' }}>{n}</p>
            ))}

            <div style={{ display: 'grid', gap: '.75rem', marginTop: '1rem' }}>
              {FEED_FIELDS.map(f => {
                const sample = map[f.key] ? (feed.rows.find(r => (r[map[f.key]!] ?? '').trim())?.[map[f.key]!] ?? '') : '';
                return (
                  <div key={f.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1fr) minmax(140px,1fr) 1.4fr', gap: '.6rem', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '.86rem', color: '#2d2724' }}>
                        {f.label}{f.required && <span style={{ color: '#a01836' }}> *</span>}
                      </div>
                      <div style={{ fontSize: '.76rem', color: '#8a7f76', lineHeight: 1.45 }}>{f.help}</div>
                    </div>
                    <select
                      value={map[f.key] ?? ''}
                      onChange={e => setMap(m => ({ ...m, [f.key]: e.target.value || undefined }))}
                      style={inputStyle}
                    >
                      <option value="">— not in this file —</option>
                      {feed.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div style={{ fontSize: '.8rem', color: sample ? '#6b615c' : '#c4bab4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sample ? String(sample).slice(0, 90) : 'nothing to show'}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="3. Your price">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '.85rem' }}>
              <label style={{ fontSize: '.84rem', fontWeight: 650, color: '#2d2724' }}>
                Margin on top
                <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginTop: '.3rem' }}>
                  <input type="number" min={0} max={500} value={rule.marginPercent}
                    onChange={e => setRule(r => ({ ...r, marginPercent: Number(e.target.value) || 0 }))}
                    style={inputStyle} />
                  <span style={{ color: '#8a7f76' }}>%</span>
                </div>
              </label>
              <label style={{ fontSize: '.84rem', fontWeight: 650, color: '#2d2724' }}>
                Round the price
                <select value={rule.roundTo} onChange={e => setRule(r => ({ ...r, roundTo: Number(e.target.value) as 0 | 9 | 99 }))}
                  style={{ ...inputStyle, marginTop: '.3rem' }}>
                  <option value={0}>Leave it as it comes</option>
                  <option value={9}>End on 9 (499, 1299)</option>
                  <option value={99}>End on 99 (499, 1299)</option>
                </select>
              </label>
              <label style={{ fontSize: '.84rem', fontWeight: 650, color: '#2d2724' }}>
                Shipping per product
                <input type="number" min={0} value={rule.shipping}
                  onChange={e => setRule(r => ({ ...r, shipping: Number(e.target.value) || 0 }))}
                  style={{ ...inputStyle, marginTop: '.3rem' }} />
              </label>
              <label style={{ fontSize: '.84rem', fontWeight: 650, color: '#2d2724' }}>
                Photos per product
                <input type="number" min={1} max={10} value={maxGallery}
                  onChange={e => setMaxGallery(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  style={{ ...inputStyle, marginTop: '.3rem' }} />
              </label>
            </div>

            <p style={{ margin: '.9rem 0 0', fontSize: '.86rem', color: '#6b615c' }}>
              A product the supplier charges ₹500 for sells at{' '}
              <strong style={{ color: '#2d2724' }}>₹{applyMargin(500, rule)}</strong>
              {rule.shipping > 0 && <> plus ₹{rule.shipping} shipping</>}.
            </p>
          </Card>

          <Card title="4. If the file does not say">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '.85rem' }}>
              <label style={{ fontSize: '.84rem', fontWeight: 650, color: '#2d2724' }}>
                Category
                <select value={defCategory} onChange={e => setDefCategory(e.target.value)} style={{ ...inputStyle, marginTop: '.3rem' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '.84rem', fontWeight: 650, color: '#2d2724' }}>
                Subcategory
                <input value={defSubcategory} onChange={e => setDefSubcategory(e.target.value)}
                  placeholder="Nighty, Saree, Kurti…" style={{ ...inputStyle, marginTop: '.3rem' }} />
                <span style={{ display: 'block', fontSize: '.76rem', color: '#8a7f76', marginTop: '.25rem' }}>
                  Without one, every product is held as a draft — a product with no subcategory appears on no collection page.
                </span>
              </label>
            </div>
          </Card>

          <Card title="5. What will happen">
            {counts.drafts > 0 && (
              <div style={{ background: '#fffaf2', border: '1px solid #f0e2cc', borderRadius: 10, padding: '.9rem 1rem', marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 .5rem', fontWeight: 700, color: '#8a5a1a', fontSize: '.9rem' }}>
                  {counts.drafts} of {counts.total} will be saved as drafts, not put on the website.
                </p>
                <p style={{ margin: '0 0 .6rem', color: '#6b615c', fontSize: '.84rem', lineHeight: 1.6 }}>
                  Nothing is lost — they sit in Drafts until the missing part is filled in. Most of the time
                  the cause is one column mapped to the wrong place, so it is worth fixing above first.
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#6b615c', fontSize: '.83rem', lineHeight: 1.6 }}>
                  {topProblems.map(([msg, n]) => <li key={msg}><strong>{n}×</strong> {msg}</li>)}
                </ul>
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#8a7f76' }}>
                    <th style={{ padding: '.45rem .5rem' }}>Product</th>
                    <th style={{ padding: '.45rem .5rem' }}>Supplier</th>
                    <th style={{ padding: '.45rem .5rem' }}>You sell at</th>
                    <th style={{ padding: '.45rem .5rem' }}>Sizes</th>
                    <th style={{ padding: '.45rem .5rem' }}>Photo</th>
                    <th style={{ padding: '.45rem .5rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {checked.slice(0, 40).map((c, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f2ece9' }}>
                      <td style={{ padding: '.5rem', maxWidth: 260 }}>
                        <div style={{ fontWeight: 650, color: '#2d2724', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.p.name || <span style={{ color: '#c4bab4' }}>no name</span>}
                        </div>
                        <div style={{ color: '#8a7f76', fontSize: '.76rem' }}>
                          {c.p.sku || 'no SKU'} · {c.p.category}/{c.p.subcategory || '—'}
                        </div>
                      </td>
                      <td style={{ padding: '.5rem', color: '#8a7f76' }}>₹{c.p.supplierPrice || '—'}</td>
                      <td style={{ padding: '.5rem', fontWeight: 700, color: '#2d2724' }}>₹{c.p.price || '—'}</td>
                      <td style={{ padding: '.5rem', color: '#6b615c' }}>{c.p.sizes.join(', ') || '—'}</td>
                      <td style={{ padding: '.5rem' }}>{c.p.image ? `${c.p.images.length}` : <Pill tone="red">none</Pill>}</td>
                      <td style={{ padding: '.5rem' }}>
                        {c.p.existingId
                          ? <Pill tone="amber">update</Pill>
                          : <Pill tone="green">new</Pill>}
                        {!c.gate.passed && <> <Pill tone="red">draft</Pill></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {built.length > 40 && (
              <Empty>Showing the first 40 of {built.length}.</Empty>
            )}

            <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '1.1rem' }}>
              <button
                onClick={run}
                disabled={!ready || built.length === 0}
                style={{
                  padding: '.7rem 1.4rem', borderRadius: 9, border: 'none',
                  background: ready ? '#722f37' : '#d8cfca', color: '#fff',
                  fontWeight: 700, fontSize: '.9rem', cursor: ready ? 'pointer' : 'not-allowed',
                }}
              >
                Import {built.length} products
              </button>
              <button
                onClick={() => { setStep('file'); setFeed(null); setMap({}); }}
                style={{ padding: '.7rem 1.2rem', borderRadius: 9, border: '1.5px solid #e3dad6', background: '#fff', color: '#722f37', fontWeight: 650, fontSize: '.88rem', cursor: 'pointer' }}
              >
                Start over
              </button>
            </div>
            {!ready && (
              <p style={{ margin: '.7rem 0 0', color: '#a01836', fontSize: '.84rem' }}>
                A product name and a price are the two things this cannot guess. Pick both above.
              </p>
            )}
            <p style={{ margin: '.7rem 0 0', color: '#8a7f76', fontSize: '.82rem', lineHeight: 1.6 }}>
              Photos are copied onto your own server as each product is saved, so they keep working if the
              supplier changes their website. That is the slow part — around a second or two per photo —
              so a large catalogue takes a while. Leave this page open while it runs.
            </p>
          </Card>
        </>
      )}

      {(step === 'running' || step === 'done') && progress && (
        <>
          <StatGrid>
            <Stat label="Done" value={`${progress.done} / ${progress.total}`} />
            <Stat label="Added" value={progress.created} tone="green" />
            <Stat label="Updated" value={progress.updated} />
            <Stat label="Held as draft" value={progress.drafts} />
          </StatGrid>

          <Card title={step === 'running' ? 'Importing…' : 'Finished'}>
            <div style={{ height: 10, background: '#f2ece9', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999, background: '#722f37',
                width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                transition: 'width .2s ease',
              }} />
            </div>

            {step === 'running' && (
              <>
                <p style={{ margin: '.8rem 0 0', color: '#6b615c', fontSize: '.86rem' }}>
                  {progress.current || 'starting…'}
                </p>
                <button
                  onClick={() => { stopped.current = true; }}
                  style={{ marginTop: '.9rem', padding: '.55rem 1.1rem', borderRadius: 8, border: '1.5px solid #e3dad6', background: '#fff', color: '#a01836', fontWeight: 650, fontSize: '.85rem', cursor: 'pointer' }}
                >
                  Stop after this one
                </button>
              </>
            )}

            {step === 'done' && (
              <>
                <p style={{ margin: '.9rem 0 .2rem', color: '#2d2724', fontSize: '.95rem', fontWeight: 700 }}>
                  {progress.created} added, {progress.updated} updated.
                </p>
                <p style={{ margin: 0, color: '#6b615c', fontSize: '.87rem', lineHeight: 1.65 }}>
                  {progress.drafts > 0 && <>{progress.drafts} are waiting in <Link href="/admin/products/drafts" style={{ color: '#722f37', fontWeight: 650 }}>Drafts</Link> until what is missing is filled in. </>}
                  {progress.photosMissed > 0 && <>{progress.photosMissed} photos could not be fetched from the supplier. </>}
                  {progress.failed > 0 && <>{progress.failed} products could not be saved at all.</>}
                </p>

                {progress.problems.length > 0 && (
                  <details style={{ marginTop: '.9rem' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: '.86rem', color: '#2d2724' }}>
                      What went wrong ({progress.problems.length})
                    </summary>
                    <ul style={{ margin: '.6rem 0 0', paddingLeft: '1.1rem', color: '#6b615c', fontSize: '.82rem', lineHeight: 1.6 }}>
                      {progress.problems.slice(0, 50).map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </details>
                )}

                <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '1.1rem' }}>
                  <Link href="/admin/products"
                    style={{ padding: '.65rem 1.3rem', borderRadius: 9, background: '#722f37', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '.88rem' }}>
                    See the products
                  </Link>
                  <button
                    onClick={() => { setStep('file'); setFeed(null); setMap({}); setProgress(null); }}
                    style={{ padding: '.65rem 1.2rem', borderRadius: 9, border: '1.5px solid #e3dad6', background: '#fff', color: '#722f37', fontWeight: 650, fontSize: '.88rem', cursor: 'pointer' }}
                  >
                    Import another file
                  </button>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
