'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { productQualityApi, productsApi, type QualityRow } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Stat, StatGrid, Empty } from '@/components/admin/Ui';

// The products that are saved but not on the website.
//
// Holding a half-finished product back only helps if it can be found again.
// In the main Products list a draft is one greyed row among ninety-eight, so
// this is the list that is only drafts — what each one is still missing, and a
// way to put it live the moment it stops missing anything.

export default function DraftsPage() {
  const [rows, setRows] = useState<QualityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const token = getAdminToken();
      if (!token) throw new Error('Sign in again — your session has expired.');
      const r = await productQualityApi.report(token);
      setRows(r.products.filter(p => p.status === 'Draft'));
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not load the drafts.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  /** For a draft that now passes: put it on the website. The server checks again before agreeing. */
  async function publish(p: QualityRow) {
    setBusy(p.id);
    setMsg(null);
    try {
      const token = getAdminToken();
      if (!token) throw new Error('Sign in again — your session has expired.');
      await productsApi.updateStock(p.id, 'In Stock', token);
      setMsg({ kind: 'ok', text: `"${p.name}" is on the website now.` });
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not publish it.' });
    } finally {
      setBusy(null);
    }
  }

  const ready = rows.filter(r => r.passed);
  const notReady = rows.filter(r => !r.passed);

  // The same fault on thirty products is one thing to fix, not thirty.
  const commonest = (() => {
    const m = new Map<string, number>();
    notReady.forEach(p => p.errors.forEach(e => m.set(e.message, (m.get(e.message) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  })();

  async function publishAllReady() {
    if (!ready.length) return;
    if (!confirm(`Put all ${ready.length} finished drafts on the website?`)) return;
    for (const p of ready) await publish(p);
  }

  return (
    <div className="admin-page">
      <PageHeader
        title="Drafts"
        sub="Saved, but not on the website. Nothing here is lost — each one is waiting on something."
        right={
          <>
            {ready.length > 1 && (
              <button className="adm-btn adm-btn-primary" onClick={publishAllReady} disabled={busy !== null}>
                Publish all {ready.length} finished
              </button>
            )}
            <button className="adm-btn" onClick={load}>Refresh</button>
          </>
        }
      />

      {msg && (
        <div className="adm-card" style={{
          background: msg.kind === 'ok' ? '#f2faf3' : '#fdf3f2',
          borderColor: msg.kind === 'ok' ? '#cbe6cf' : '#f0cdc9',
          color: msg.kind === 'ok' ? '#2e7d32' : '#c0392b', fontSize: '.86rem', fontWeight: 600,
        }}>{msg.text}</div>
      )}

      <StatGrid cols={3}>
        <Stat label="Drafts in total" value={rows.length} />
        <Stat label="Ready to go live" value={ready.length} tone={ready.length > 0 ? 'green' : undefined} />
        <Stat label="Still missing something" value={notReady.length}
              tone={notReady.length > 0 ? 'red' : undefined} />
      </StatGrid>

      {loading ? (
        <Card><Empty>Checking every draft…</Empty></Card>
      ) : rows.length === 0 ? (
        <Card><Empty>No drafts. Every product in the catalogue is on the website.</Empty></Card>
      ) : (
        <>
          {ready.length > 0 && (
            <Card title={`${ready.length} ready to go live`}>
              <p style={{ fontSize: '.84rem', color: '#7d736d', margin: '0 0 .6rem', lineHeight: 1.55 }}>
                Nothing is missing on {ready.length === 1 ? 'this one' : 'these'} any more — they are just still
                switched off.
              </p>
              {ready.map(p => (
                <div key={p.id} className="adm-row">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="adm-row-t" style={{ display: 'block' }}>{p.name || '(no name yet)'}</span>
                    <span className="adm-row-s" style={{ display: 'block' }}>{p.sku || 'no SKU'}</span>
                  </span>
                  <button className="adm-btn adm-btn-primary" onClick={() => publish(p)} disabled={busy === p.id}>
                    {busy === p.id ? 'Publishing…' : 'Put on website'}
                  </button>
                </div>
              ))}
            </Card>
          )}

          {commonest.length > 0 && (
            <Card title="The faults that hold most of them back">
              {commonest.map(([message, n]) => (
                <div key={message} className="adm-row">
                  <span className="adm-row-t" style={{ flex: 1 }}>{message}</span>
                  <span className="adm-pill adm-pill-amber">{n} product{n === 1 ? '' : 's'}</span>
                </div>
              ))}
            </Card>
          )}

          <Card title={`${notReady.length} still waiting on something`}>
            {notReady.length === 0 ? (
              <Empty>Every draft is finished — publish them above.</Empty>
            ) : notReady.map(p => (
              <div key={p.id} style={{ borderBottom: '1px solid #f4efec', padding: '.75rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="adm-row-t">{p.name || <span style={{ color: '#c4bab4' }}>(no name yet)</span>}</div>
                    <div className="adm-row-s">
                      {p.sku ? `${p.sku} · ` : ''}{p.subcategory || p.category || 'no category'}
                    </div>
                  </div>
                  <Link className="adm-btn adm-btn-primary" href={`/admin/products/${p.id}`}
                        style={{ flexShrink: 0 }}>Fix</Link>
                </div>
                <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
                  {p.errors.map((e, i) => (
                    <li key={i} style={{ fontSize: '.82rem', color: '#b26b00', lineHeight: 1.55, marginBottom: '.1rem' }}>
                      {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Card>

          <p style={{ fontSize: '.78rem', color: '#9a908a', marginTop: '.85rem', lineHeight: 1.6 }}>
            A draft goes live on its own the next time you open it, fix what is listed, and save. This page is for
            catching the ones that were fixed elsewhere, or that you want to work through in one sitting.
          </p>
        </>
      )}
    </div>
  );
}
