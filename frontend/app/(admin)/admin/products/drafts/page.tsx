'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { productQualityApi, productsApi, type QualityRow } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';

// The products that are saved but not on the website.
//
// Holding a half-finished product back only helps if it can be found again.
// In the main Products list a draft is one greyed row among eighty-four, so
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

  return (
    <div className="admin-page">
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Drafts</h1>
          <p className="admin-page-sub">
            Saved, but not on the website. Nothing here is lost — each one is waiting on something.
          </p>
        </div>
        <button onClick={load} style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: '.55rem 1.1rem', fontSize: '.85rem', fontWeight: 700, color: '#555', cursor: 'pointer' }}>
          Refresh
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

      {loading ? (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#aaa' }}>
          Checking every draft…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#2e7d32' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>✅</div>
          <p style={{ margin: 0, fontWeight: 600 }}>No drafts. Every product is on the website.</p>
        </div>
      ) : (
        <>
          {ready.length > 0 && (
            <div style={{ background: '#f2faf3', border: '1px solid #c3e3c8', borderRadius: 12, padding: '1rem 1.15rem', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: '0 0 .3rem', fontSize: '1rem', fontWeight: 800, color: '#2e7d32' }}>
                {ready.length} draft{ready.length === 1 ? ' is' : 's are'} ready to go live
              </h3>
              <p style={{ margin: '0 0 .8rem', fontSize: '.86rem', color: '#3c6b40' }}>
                Nothing is missing on {ready.length === 1 ? 'this one' : 'these'} any more — they are just still switched off.
              </p>
              {ready.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '.5rem 0', borderTop: '1px solid #dcefdd' }}>
                  <div style={{ fontSize: '.9rem', fontWeight: 600 }}>
                    {p.name}
                    <span style={{ color: '#888', fontWeight: 400, fontSize: '.78rem' }}>  {p.sku}</span>
                  </div>
                  <button onClick={() => publish(p)} disabled={busy === p.id}
                    style={{ background: busy === p.id ? '#bbb' : '#2e7d32', color: '#fff', border: 'none', borderRadius: 8, padding: '.4rem 1rem', fontSize: '.82rem', fontWeight: 700, cursor: busy === p.id ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                    {busy === p.id ? 'Publishing…' : 'Put on website'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ fontSize: '.8rem', fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 .6rem' }}>
            {notReady.length} still waiting on something
          </h3>

          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
            {notReady.map(p => (
              <div key={p.id} style={{ padding: '.9rem 1.1rem', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '.92rem' }}>
                      {p.name || <span style={{ color: '#ccc' }}>(no name yet)</span>}
                    </div>
                    <div style={{ fontSize: '.74rem', color: '#999', marginTop: '.15rem' }}>
                      {p.sku ? `${p.sku} · ` : ''}{p.subcategory || p.category || 'no category'}
                    </div>
                  </div>
                  <Link href={`/admin/products/${p.id}`}
                    style={{ background: '#a7354d', color: '#fff', borderRadius: 8, padding: '.35rem .95rem', fontSize: '.8rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Fix →
                  </Link>
                </div>
                <ul style={{ margin: '.55rem 0 0', paddingLeft: '1.1rem' }}>
                  {p.errors.map((e, i) => (
                    <li key={i} style={{ fontSize: '.83rem', color: '#c26a12', lineHeight: 1.5, marginBottom: '.15rem' }}>{e.message}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p style={{ fontSize: '.78rem', color: '#999', marginTop: '1rem' }}>
            A draft goes live on its own the next time you open it, fix what is listed, and save — this page is for
            catching the ones that were fixed elsewhere, or that you want to work through in one sitting.
          </p>
        </>
      )}
    </div>
  );
}
