'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { productQualityApi, type QualityReport } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { btn } from '@/components/admin/SeoFields';
import { PageHeader, Stat, StatGrid } from '@/components/admin/Ui';

// The catalogue seen through the quality gate.
//
// From here the owner can see which products Google would refuse and why,
// and apply that judgement to the whole catalogue at once. That second part
// can take most of a shop offline in one press, so the number is shown first
// and typed back before anything moves.

const FIELD_LABEL: Record<string, string> = {
  name: 'Product name',
  description: 'Description',
  image: 'Photo',
  price: 'Price',
  category: 'Category',
  subcategory: 'Subcategory',
  sizes: 'Sizes',
  colours: 'Colour',
  sku: 'SKU',
  hsn: 'HSN code',
  extra: 'Extra details',
};

export default function ProductQualityPage() {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showOnly, setShowOnly] = useState<'failing' | 'all'>('failing');

  async function load() {
    setLoading(true);
    try {
      const token = getAdminToken();
      if (!token) throw new Error('Sign in again — your session has expired.');
      setReport(await productQualityApi.report(token));
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not load the report.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function enforce() {
    if (!report) return;
    setBusy(true);
    setMsg(null);
    try {
      const token = getAdminToken();
      if (!token) throw new Error('Sign in again — your session has expired.');
      const r = await productQualityApi.enforce(report.wouldGoToDraft, token);
      setMsg({ kind: 'ok', text: `${r.movedToDraft} products moved to draft. ${r.stillLive} are still on the website.` });
      setConfirmText('');
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'The sweep did not run.' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="admin-page"><div style={{ padding: '3rem', textAlign: 'center', color: '#a49a94' }}>Checking every product…</div></div>;
  }
  if (!report) {
    return <div className="admin-page"><div style={{ padding: '3rem', textAlign: 'center', color: '#c0392b' }}>{msg?.text ?? 'No report.'}</div></div>;
  }

  const rows = report.products.filter(p => (showOnly === 'failing' ? !p.passed : true));
  const armed = confirmText.trim() === String(report.wouldGoToDraft);

  return (
    <div className="admin-page">
      <PageHeader
        title="Product quality"
        sub="Every product checked against what Google Merchant Center requires. New and edited products are held back on their own — this screen is for the ones already live."
        right={<button className="adm-btn" onClick={load}>Check again</button>}
      />

      {msg && (
        <div className="adm-card" style={{
          background: msg.kind === 'ok' ? '#f2faf3' : '#fdf3f2',
          borderColor: msg.kind === 'ok' ? '#cbe6cf' : '#f0cdc9',
          color: msg.kind === 'ok' ? '#2e7d32' : '#c0392b',
          marginBottom: '.85rem', fontSize: '.86rem', fontWeight: 600,
        }}>{msg.text}</div>
      )}

      <StatGrid>
        <Stat label="Products" value={report.total} />
        <Stat label="On the website" value={report.live} />
        <Stat label="Google would approve" value={report.passing} tone={report.passing ? 'green' : undefined} />
        <Stat label="Google would refuse" value={report.failing} tone={report.failing ? 'red' : undefined}
              action={report.failing && showOnly !== 'failing' ? 'Show only these' : undefined}
              onClick={report.failing ? () => setShowOnly('failing') : undefined} />
      </StatGrid>

      {report.byReason.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #eae3e4', borderRadius: 13, padding: '1rem 1.15rem', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#9a908a', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.6rem' }}>
            What is holding products back
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
            {report.byReason.map(r => (
              <span key={r.field} style={{ background: '#fdf0f3', color: '#722f37', borderRadius: 20, padding: '4px 12px', fontSize: '.82rem', fontWeight: 700 }}>
                {FIELD_LABEL[r.field] ?? r.field}: {r.count}
              </span>
            ))}
          </div>
          <p style={{ margin: '.7rem 0 0', fontSize: '.8rem', color: '#777' }}>
            Fix the biggest one first — it is usually the same missing field across dozens of products.
          </p>
        </div>
      )}

      {/* The sweep. */}
      <div style={{
        background: report.wouldGoToDraft > 0 ? '#fff5e6' : '#eaf6ec',
        border: `1px solid ${report.wouldGoToDraft > 0 ? '#f0d8b0' : '#c3e3c8'}`,
        borderRadius: 13, padding: '1.15rem 1.25rem', marginBottom: '1.5rem',
      }}>
        <h3 style={{ margin: '0 0 .5rem', fontSize: '1rem', fontWeight: 800, color: report.wouldGoToDraft > 0 ? '#c26a12' : '#2e7d32' }}>
          Apply the rules to products already on the website
        </h3>

        {report.wouldGoToDraft === 0 ? (
          <p style={{ margin: 0, fontSize: '.88rem', color: '#2e7d32' }}>
            Nothing to do — every product currently on the website passes.
          </p>
        ) : (
          <>
            <p style={{ margin: '0 0 .8rem', fontSize: '.9rem', color: '#6b4a1e', lineHeight: 1.6 }}>
              <strong>{report.wouldGoToDraft} of your {report.live} live products would be taken off the website</strong> and
              kept as drafts until they are fixed. Customers would not be able to find or buy them. Nothing is deleted,
              and putting one back is a matter of fixing what it is missing and saving it.
            </p>
            <p style={{ margin: '0 0 .8rem', fontSize: '.86rem', color: '#6b4a1e' }}>
              Type <strong>{report.wouldGoToDraft}</strong> below to confirm you have read that number.
            </p>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Type the number"
                style={{ width: 150, border: '1px solid #e5dcdd', borderRadius: 8, padding: '.55rem .7rem', fontSize: '.9rem' }}
              />
              <button
                onClick={enforce}
                disabled={!armed || busy}
                style={{
                  ...btn('primary'),
                  background: armed && !busy ? '#c0392b' : '#ddd',
                  cursor: armed && !busy ? 'pointer' : 'not-allowed',
                }}
              >
                {busy ? 'Applying…' : `Take ${report.wouldGoToDraft} products off the website`}
              </button>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.8rem' }}>
        {(['failing', 'all'] as const).map(v => (
          <button key={v} onClick={() => setShowOnly(v)}
            style={{
              background: showOnly === v ? '#a7354d' : '#fff',
              color: showOnly === v ? '#fff' : '#555',
              border: showOnly === v ? 'none' : '1px solid #ddd',
              borderRadius: 20, padding: '.4rem 1rem', fontSize: '.82rem', fontWeight: 700, cursor: 'pointer',
            }}>
            {v === 'failing' ? `Needs fixing (${report.failing})` : `All products (${report.total})`}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #eae3e4', borderRadius: 13, overflow: 'hidden' }}>
        {rows.map(p => (
          <div key={p.id} style={{ padding: '.9rem 1.1rem', borderBottom: '1px solid #f5f5f5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '.92rem' }}>
                  {p.name || <span style={{ color: '#ccc' }}>(no name)</span>}
                </div>
                <div style={{ fontSize: '.74rem', color: '#9a908a', marginTop: '.15rem' }}>
                  {p.sku ? `${p.sku} · ` : ''}{p.subcategory || p.category || '—'} · {p.status}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexShrink: 0 }}>
                {p.wouldGoToDraft && (
                  <span style={{ background: '#fff5e6', color: '#c26a12', borderRadius: 20, padding: '2px 10px', fontSize: '.7rem', fontWeight: 800 }}>
                    LIVE BUT FAILING
                  </span>
                )}
                <Link href={`/admin/products/${p.id}`} style={{ ...btn('primary'), padding: '.32rem .85rem', fontSize: '.78rem', textDecoration: 'none' }}>Fix</Link>
              </div>
            </div>

            {p.errors.length > 0 && (
              <ul style={{ margin: '.6rem 0 0', paddingLeft: '1.1rem' }}>
                {p.errors.map((e, i) => (
                  <li key={i} style={{ fontSize: '.83rem', color: '#c0392b', lineHeight: 1.5, marginBottom: '.2rem' }}>{e.message}</li>
                ))}
              </ul>
            )}
            {p.warnings.length > 0 && (
              <ul style={{ margin: '.35rem 0 0', paddingLeft: '1.1rem' }}>
                {p.warnings.map((w, i) => (
                  <li key={i} style={{ fontSize: '.8rem', color: '#9a908a', lineHeight: 1.5 }}>{w.message}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#2e7d32' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>✅</div>
            <p style={{ margin: 0 }}>Every product passes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
