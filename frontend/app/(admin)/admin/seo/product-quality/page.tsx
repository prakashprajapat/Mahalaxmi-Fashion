'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { productQualityApi, type QualityReport } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { btn } from '@/components/admin/SeoFields';
import { PageHeader, Stat, StatGrid } from '@/components/admin/Ui';

// The catalogue seen through the quality gate.
//
// The gate is not advice any more, and this screen no longer asks anyone to
// press anything to apply it. A product is checked when it is saved, and every
// product is checked again every hour: fail and it comes off the website, pass
// and it goes back on. So this page's job is to explain what the sweep has been
// doing and what is standing in the way of the products it is holding back.

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
      const r = await productQualityApi.enforce(token);
      const parts: string[] = [];
      if (r.movedToDraft) parts.push(`${r.movedToDraft} taken off the website`);
      if (r.putBackOnWebsite) parts.push(`${r.putBackOnWebsite} put back on`);
      setMsg({
        kind: 'ok',
        text: parts.length
          ? `${parts.join(', ')}. ${r.checkedCount} products checked.`
          : `Nothing to change — all ${r.checkedCount} products are already on the right side of the line.`,
      });
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

  return (
    <div className="admin-page">
      <PageHeader
        title="Product quality"
        sub="Every product checked against what Google and Meta require. Nothing goes on the website until it passes, and nothing stays on it once it stops."
        right={
          <>
            <button className="adm-btn" onClick={load}>Refresh</button>
            <button className="adm-btn adm-btn-primary" onClick={enforce} disabled={busy}>
              {busy ? 'Checking…' : 'Run the check now'}
            </button>
          </>
        }
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
        <Stat label="Still failing" value={report.failing} tone={report.failing ? 'red' : undefined}
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

      {/* What the sweep is doing, rather than a button asking permission to
          do it. It runs hourly either way, so the honest thing to show is the
          state it has left the catalogue in. */}
      <div className="adm-card" style={{ marginBottom: '.85rem' }}>
        <h3 className="adm-card-h">The check runs by itself</h3>
        <p style={{ margin: '0 0 .6rem', fontSize: '.86rem', color: '#463d38', lineHeight: 1.65 }}>
          Every hour, and again whenever you save a product. A product that fails goes back to
          <strong> draft</strong> — off the website and out of the Google and Meta feeds, because all three read the
          same status. A draft that passes goes back on the website by itself, at the stock level its own quantity
          says. Nothing is ever deleted, and a product you have switched off stays off: that is your decision, not
          the check&apos;s.
        </p>

        {report.wouldGoToDraft > 0 && (
          <p style={{ margin: '0 0 .5rem', fontSize: '.86rem', fontWeight: 700, color: '#c0392b' }}>
            {report.wouldGoToDraft} {report.wouldGoToDraft === 1 ? 'product is' : 'products are'} on the website
            right now and would be refused. {report.wouldGoToDraft === 1 ? 'It comes' : 'They come'} off at the next
            check — fix what is listed below and {report.wouldGoToDraft === 1 ? 'it' : 'they'} never will.
          </p>
        )}
        {report.wouldGoLive > 0 && (
          <p style={{ margin: '0 0 .5rem', fontSize: '.86rem', fontWeight: 700, color: '#2e7d32' }}>
            {report.wouldGoLive} draft{report.wouldGoLive === 1 ? '' : 's'} {report.wouldGoLive === 1 ? 'has' : 'have'} been
            fixed and will go back on the website at the next check.
          </p>
        )}
        {report.wouldGoToDraft === 0 && report.wouldGoLive === 0 && (
          <p style={{ margin: '0 0 .5rem', fontSize: '.86rem', fontWeight: 700, color: '#2e7d32' }}>
            Nothing waiting either way — every product is on the side of the line it belongs on.
          </p>
        )}

        {report.lastSweep ? (
          <p style={{ margin: 0, fontSize: '.79rem', color: '#9a908a', lineHeight: 1.6 }}>
            Last run {new Date(report.lastSweep.ranAt).toLocaleString('en-IN', {
              day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
            })} — {report.lastSweep.checkedCount} products checked
            {report.lastSweep.takenDown > 0 || report.lastSweep.putBack > 0
              ? `, ${report.lastSweep.takenDown} taken off, ${report.lastSweep.putBack} put back on.`
              : ', nothing needed changing.'}
            {report.lastSweep.takenDownNames.length > 0 && (
              <> Taken off: {report.lastSweep.takenDownNames.join('; ')}
                {report.lastSweep.takenDown > report.lastSweep.takenDownNames.length ? ' …' : ''}.</>
            )}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: '.79rem', color: '#9a908a' }}>
            The check has not run yet on this server — it starts a couple of minutes after the site does.
          </p>
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
