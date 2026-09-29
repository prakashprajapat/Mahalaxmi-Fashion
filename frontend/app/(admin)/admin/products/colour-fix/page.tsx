'use client';

// Colour Fix — sirf wo products jinka colour Google maanta hi nahi.
//
// Google apparel ke liye colour maangta hai, aur "MultiColour", "Design C",
// hex code ya akela letter jaise values reject kar deta hai — aisa product
// Shopping/free listing me disapprove ho jata hai. Ek-ek product kholne ke
// bajaye ye screen sirf kharab wale dikhati hai, photo ke saath, taaki saare
// ek hi baar me theek ho jayein.
//
// Colour badalte waqt product ka size×colour stock table bhi saath me rename
// hota hai — uske keys me colour ka naam hota hai ("Free Size|MultiColour"),
// aur wo peeche chhoot jaye to us variant ka stock gum ho jata hai.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { productImageSrc } from '@/lib/productImages';
import { colourProblem } from '@/lib/googleColours';
import GoogleColourPicker from '@/components/admin/GoogleColourPicker';
import { PageHeader, Card, Empty, Pill } from '@/components/admin/Ui';
import type { Product } from '@/types';
import { fetchAllProducts } from '@/lib/adminPaged';

type Row = {
  p: Product;
  ex: Record<string, unknown>;
  bad: string[];
  keep: string[];
  value: string;
  shades: string[];
  state: 'idle' | 'saving' | 'done' | 'error';
  msg?: string;
};

function parseExtra(p: Product): Record<string, unknown> {
  try { return p.extraJson ? JSON.parse(p.extraJson) : {}; } catch { return {}; }
}

function colourNames(ex: Record<string, unknown>): string[] {
  const list = Array.isArray(ex.colors) ? ex.colors : [];
  const custom = Array.isArray(ex.customColors) ? ex.customColors : [];
  const out = [
    ...list.filter((c): c is string => typeof c === 'string'),
    ...custom.map(c => (c && typeof c === 'object' ? (c as { name?: string }).name : null))
            .filter((c): c is string => typeof c === 'string'),
  ];
  return [...new Set(out.map(s => s.trim()).filter(Boolean))];
}

/** Purane colour naam hata kar naya lagao — stock table ke keys samet. */
function applyColour(ex: Record<string, unknown>, bad: string[], keep: string[], value: string, shades: string[]) {
  const next: Record<string, unknown> = { ...ex };
  const isBad = (n?: string | null) => !!n && bad.some(b => b.toLowerCase() === String(n).trim().toLowerCase());
  const colours = [...new Set([...keep, value].filter(Boolean))];
  next.colors = colours;

  // customColors: kharab naam wale entry ka naam badlo, baaki waise hi rahe.
  if (Array.isArray(ex.customColors)) {
    let used = false;
    next.customColors = (ex.customColors as Record<string, unknown>[]).map(c => {
      if (!isBad(c?.name as string) || used) return c;
      used = true;
      return { ...c, name: value, code: shades[0] ?? c.code };
    });
  }

  // Swatch ke rang.
  const codes: Record<string, string> = { ...((ex.colorCodes as Record<string, string>) ?? {}) };
  for (const b of bad) delete codes[b];
  if (shades[0]) codes[value] = shades[0];
  next.colorCodes = Object.keys(codes).length ? codes : undefined;

  const allShades: Record<string, string[]> = { ...((ex.colorShades as Record<string, string[]>) ?? {}) };
  for (const b of bad) delete allShades[b];
  if (shades.length > 1) allShades[value] = shades;
  next.colorShades = Object.keys(allShades).length ? allShades : undefined;

  // Stock table ke keys "Size|Colour" hote hain — colour ka hissa bhi badlo.
  if (ex.variantMatrix && typeof ex.variantMatrix === 'object') {
    const old = ex.variantMatrix as Record<string, number>;
    const renamed: Record<string, number> = {};
    for (const [k, v] of Object.entries(old)) {
      const parts = k.split('|');
      if (parts.length === 2 && isBad(parts[1])) renamed[`${parts[0]}|${value}`] = v;
      else if (parts.length === 1 && isBad(parts[0])) renamed[value] = v;
      else renamed[k] = v;
    }
    next.variantMatrix = renamed;
  }
  return next;
}

export default function ColourFixPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const all = await fetchAllProducts({}, getAdminToken() ?? undefined);
        const found: Row[] = [];
        for (const p of all) {
          const ex = parseExtra(p);
          const names = colourNames(ex);
          const bad = names.filter(n => colourProblem(n) !== null);
          if (bad.length === 0) continue;
          const keep = names.filter(n => !bad.includes(n));
          found.push({ p, ex, bad, keep, value: '', shades: [], state: 'idle' });
        }
        setRows(found);
      } catch {
        setErr('Products could not be loaded. Refresh the page and try again.');
      } finally { setLoading(false); }
    })();
  }, []);

  const pending = useMemo(() => rows.filter(r => r.state !== 'done'), [rows]);
  const ready = useMemo(
    () => rows.filter(r => r.state !== 'done' && r.value && colourProblem(r.value) === null),
    [rows],
  );

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const save = async (i: number) => {
    const row = rows[i];
    if (!row || !row.value || colourProblem(row.value)) return;
    setRow(i, { state: 'saving', msg: undefined });
    try {
      const p = row.p;
      const nextExtra = applyColour(row.ex, row.bad, row.keep, row.value, row.shades);
      await productsApi.update(p.dbId, {
        name: p.name,
        category: p.category,
        subcategory: p.subcategory || undefined,
        price: p.price,
        discountPrice: p.discountPrice,
        shippingCharge: p.shippingCharge ?? 0,
        stock: p.stock,
        sku: p.sku || undefined,
        description: p.description || undefined,
        image: p.image || undefined,
        bestSeller: p.bestSeller,
        hsnCode: p.hsnCode || '6211',
        gstRate: p.gstRate ?? 5,
        qty: p.qty,
        packOf: p.packOf,
        extraJson: JSON.stringify(nextExtra),
      }, getAdminToken() ?? '');
      setRow(i, { state: 'done' });
    } catch (e) {
      setRow(i, { state: 'error', msg: e instanceof Error ? e.message : 'Could not save.' });
    }
  };

  const saveAll = async () => {
    setBulkBusy(true);
    // Ek-ek karke — sab ek saath bhejne par server par 40+ writes ek hi waqt me
    // girti hain, aur ek fail ho to pata nahi chalta kaunsi.
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.state === 'done' || !r.value || colourProblem(r.value)) continue;
      // eslint-disable-next-line no-await-in-loop
      await save(i);
    }
    setBulkBusy(false);
  };

  return (
    <div className="admin-page">
      <PageHeader
        title="Colour Fix"
        sub="Jin products ka colour Google reject karta hai — sab ek hi jagah"
        right={<Link href="/admin/products" className="adm-btn">← Products</Link>}
      />

      <Card>
        <p style={{ fontSize: '.85rem', color: '#555', lineHeight: 1.6, margin: 0 }}>
          Google needs a colour for clothing, but it does not accept{' '}
          <strong>&quot;MultiColour&quot;</strong>, <strong>&quot;Design C&quot;</strong>, a hex code or a
          single letter — a product with one of those is <strong>disapproved</strong> in Shopping.
          <br />
          For fabric with no one fixed colour, the right answer is{' '}
          <strong>1 to 3 real colours</strong> from the print, the most visible one first:{' '}
          <code style={{ background: '#f4f4f4', padding: '0 .3rem', borderRadius: 3 }}>Navy/White/Red</code>.
          <br />
          Press <strong>📷 Fill colours from the photo</strong> on each product — it takes the colours
          from the photo itself. Change a name if it does not look right, then Save.
        </p>
      </Card>

      {loading && <Card><Empty>Products padh raha hoon… (photos ke saath, thoda waqt lagega)</Empty></Card>}
      {err && <Card><Empty>{err}</Empty></Card>}

      {!loading && !err && rows.length === 0 && (
        <Card><Empty>✓ No product has a colour Google would reject.</Empty></Card>
      )}

      {rows.length > 0 && (
        <Card
          title={`${pending.length} product bache hain`}
          right={
            <button
              className="adm-btn adm-btn-primary"
              onClick={saveAll}
              disabled={bulkBusy || ready.length === 0}
            >
              {bulkBusy ? 'Save ho raha hai…' : `Tayyar ${ready.length} save karo`}
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            {rows.map((r, i) => (
              <div
                key={r.p.dbId}
                style={{
                  display: 'flex', gap: '.85rem', padding: '.75rem', borderRadius: 10,
                  border: '1px solid #eee', background: r.state === 'done' ? '#f3faf5' : '#fff',
                  opacity: r.state === 'done' ? .65 : 1, flexWrap: 'wrap',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={productImageSrc(r.p.image) || r.p.image || ''}
                  alt={r.p.name}
                  style={{ width: 64, height: 80, objectFit: 'cover', borderRadius: 6, background: '#f5f5f5', flexShrink: 0 }}
                />
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.p.name}
                  </div>
                  <div style={{ fontSize: '.72rem', color: '#888', marginBottom: '.35rem' }}>
                    {r.p.sku ?? `#${r.p.dbId}`}
                  </div>
                  <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                    {r.bad.map(b => <Pill key={b} tone="red">{b}</Pill>)}
                    {r.keep.map(k => <Pill key={k} tone="green">{k}</Pill>)}
                  </div>
                  {r.state === 'error' && (
                    <div style={{ fontSize: '.72rem', color: '#c0392b', marginTop: '.3rem' }}>{r.msg}</div>
                  )}
                </div>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  {r.state === 'done' ? (
                    <div style={{ fontSize: '.8rem', color: '#1e7a3c', fontWeight: 700, padding: '.5rem 0' }}>
                      ✓ Ho gaya — ab {r.value}
                    </div>
                  ) : (
                    <>
                      <GoogleColourPicker
                        compact
                        value={r.value}
                        shades={r.shades}
                        photo={productImageSrc(r.p.image) || r.p.image || undefined}
                        onChange={(v, s) => setRow(i, { value: v, shades: s })}
                      />
                      <button
                        className="adm-btn adm-btn-primary"
                        style={{ marginTop: '.5rem' }}
                        disabled={r.state === 'saving' || !r.value || colourProblem(r.value) !== null}
                        onClick={() => save(i)}
                      >
                        {r.state === 'saving' ? 'Save…' : 'Save'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
