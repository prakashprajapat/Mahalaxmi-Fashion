'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';

interface Log {
  id: number; sentAt: string; phone: string; templateId: string; kind: string;
  status: 'sent' | 'failed'; detail?: string | null; requestId?: string | null;
  templateName?: string | null; vars?: string | null; message?: string | null;
}
interface Tpl { id: string; name?: string | null; text?: string | null; sent: number }

const PAGE = 100;
const auth = () => ({ Authorization: `Bearer ${getAdminToken() ?? ''}` });

function when(raw: string) {
  return new Date(raw).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function varsText(v?: string | null) {
  if (!v) return '';
  try {
    const o = JSON.parse(v) as Record<string, string>;
    // var1..N first, then named ones that are not copies of them
    const vals = Object.entries(o).filter(([k]) => /^var\d+$/i.test(k)).map(([, x]) => x);
    const named = Object.entries(o).filter(([k, x]) => !/^var\d+$/i.test(k) && !vals.includes(x)).map(([k, x]) => `${k}: ${x}`);
    return [...vals, ...named].join(' | ');
  } catch { return v; }
}
const KIND: Record<string, string> = { otp: 'OTP', order: 'Order', template: 'Auto', campaign: 'Campaign', alert: 'Alert' };

export default function SmsLogsPage() {
  const [tab, setTab] = useState<'logs' | 'templates'>('logs');

  // ── logs ──
  const [rows, setRows] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [sentN, setSentN] = useState(0);
  const [failedN, setFailedN] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<Log | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [olderThan, setOlderThan] = useState('');

  // ── templates ──
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [tplEdit, setTplEdit] = useState<Record<string, { name: string; text: string }>>({});
  const [tplSaving, setTplSaving] = useState<string | null>(null);
  const [tplMsg, setTplMsg] = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const u = new URLSearchParams({ page: String(page), limit: String(PAGE) });
      if (status) u.set('status', status);
      if (templateId) u.set('templateId', templateId);
      if (qApplied) u.set('q', qApplied);
      let f = from, t = to;
      if (f && t && f > t) [f, t] = [t, f];
      if (f) u.set('from', f);
      if (t) u.set('to', t);
      const res = await fetch(`/api/sms-logs?${u}`, { headers: auth() });
      if (!res.ok) throw new Error(`Could not load (${res.status})`);
      const b = await res.json();
      setRows(b.logs ?? []); setTotal(b.total ?? 0); setSentN(b.sent ?? 0); setFailedN(b.failed ?? 0);
      setPicked(new Set());
    } catch (e) { setErr((e as Error).message); setRows([]); }
    finally { setLoading(false); }
  };

  const loadTpls = async () => {
    try {
      const res = await fetch('/api/sms-logs/templates', { headers: auth() });
      const b = await res.json();
      const list: Tpl[] = b.templates ?? [];
      setTpls(list);
      setTplEdit(Object.fromEntries(list.map(t => [t.id, { name: t.name ?? '', text: t.text ?? '' }])));
    } catch { setTpls([]); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [status, templateId, qApplied, from, to, page]);
  useEffect(() => { loadTpls(); }, []);

  const del = async (body: object, confirmText: string) => {
    if (!confirm(confirmText)) return;
    const res = await fetch('/api/sms-logs/delete', { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const b = await res.json().catch(() => ({}));
    if (!res.ok || !b.success) { alert(b.message || 'Could not delete.'); return; }
    await load(); loadTpls();
  };

  // The full message when the template text is saved; until then, the values that went (better than nothing).
  const textOf = (l: Log) => l.message || varsText(l.vars);
  const copy = async (l: Log) => {
    const t = textOf(l);
    if (!t) return;
    try { await navigator.clipboard.writeText(t); } catch {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setCopied(l.id); setTimeout(() => setCopied(c => (c === l.id ? null : c)), 1500);
  };
  const waHref = (l: Log) => `https://wa.me/91${l.phone}?text=${encodeURIComponent(textOf(l))}`;

  const saveTpl = async (id: string) => {
    setTplSaving(id); setTplMsg('');
    try {
      const v = tplEdit[id] ?? { name: '', text: '' };
      const res = await fetch('/api/sms-logs/templates', { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: v.name, text: v.text }) });
      if (!res.ok) throw new Error(`Could not save (${res.status})`);
      setTplMsg(`Saved ${v.name || id}.`);
      await loadTpls(); load();
    } catch (e) { setTplMsg((e as Error).message); }
    finally { setTplSaving(null); }
  };

  const allPicked = rows.length > 0 && rows.every(r => picked.has(r.id));
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const missingText = tpls.filter(t => !t.text && t.sent > 0).length;

  return (
    <div className="admin-page">
      <PageHeader
        title="SMS Logs"
        sub="Every SMS the website sent, with the full text. Copy it or send the same message on WhatsApp. Delete what you do not need."
        right={<button className="adm-btn" onClick={() => { load(); loadTpls(); }}>Refresh</button>}
      />

      <Chips value={tab} onChange={k => setTab(k as 'logs' | 'templates')}
             items={[{ key: 'logs', label: 'Logs', count: total }, { key: 'templates', label: missingText ? `Template texts (${missingText} missing)` : 'Template texts' }]} />

      {tab === 'logs' ? (
        <>
          <StatGrid cols={3}>
            <Stat label="Messages" value={total.toLocaleString('en-IN')} onClick={() => { setStatus(''); setPage(1); }} />
            <Stat label="Sent" value={sentN.toLocaleString('en-IN')} tone="green" onClick={() => { setStatus('sent'); setPage(1); }} />
            <Stat label="Failed" value={failedN.toLocaleString('en-IN')} tone={failedN ? 'red' : undefined} onClick={() => { setStatus('failed'); setPage(1); }} />
          </StatGrid>

          <Card>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              <Chips value={status} onChange={k => { setStatus(k); setPage(1); }}
                     items={[{ key: '', label: 'All' }, { key: 'sent', label: 'Sent' }, { key: 'failed', label: 'Failed' }]} />
              <select className="adm-input" value={templateId} onChange={e => { setTemplateId(e.target.value); setPage(1); }} style={{ maxWidth: 260 }}>
                <option value="">All templates</option>
                {tpls.map(t => <option key={t.id} value={t.id}>{t.name || t.id}{t.sent ? ` (${t.sent})` : ''}</option>)}
              </select>
              <form onSubmit={e => { e.preventDefault(); setQApplied(q.trim()); setPage(1); }} style={{ display: 'flex', gap: 6, flex: '1 1 240px' }}>
                <input className="adm-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Mobile, order id or any word" style={{ flex: 1, minWidth: 0 }} />
                <button className="adm-btn" type="submit">Search</button>
              </form>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: '#6b6b6b' }}>From
                <input type="date" className="adm-input" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: '#6b6b6b' }}>To
                <input type="date" className="adm-input" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} />
              </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
              <button className="adm-btn" style={{ color: '#c0392b' }} disabled={picked.size === 0}
                      onClick={() => del({ ids: Array.from(picked) }, `Delete ${picked.size} selected log(s)? The messages themselves are not affected.`)}>
                Delete selected ({picked.size})
              </button>
              <span style={{ flex: 1 }} />
              <label style={{ fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
                Delete everything before
                <input type="date" className="adm-input" value={olderThan} onChange={e => setOlderThan(e.target.value)} />
              </label>
              <button className="adm-btn" style={{ color: '#c0392b' }} disabled={!olderThan}
                      onClick={() => del({ olderThan }, `Delete every log before ${olderThan}?`)}>Delete old</button>
            </div>
          </Card>

          <Card title={`${total.toLocaleString('en-IN')} messages`}>
            {err ? <Empty>{err}</Empty> : loading ? <Empty>Loading…</Empty> : rows.length === 0 ? (
              <Empty>No messages yet. Every SMS sent from now on appears here.</Empty>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                      <th style={{ padding: '8px 6px', width: 28 }}>
                        <input type="checkbox" checked={allPicked}
                               onChange={e => setPicked(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} />
                      </th>
                      <th style={{ padding: '8px 6px' }}>Date & time</th>
                      <th style={{ padding: '8px 6px' }}>Mobile</th>
                      <th style={{ padding: '8px 6px' }}>Template</th>
                      <th style={{ padding: '8px 6px' }}>Message</th>
                      <th style={{ padding: '8px 6px' }}>Result</th>
                      <th style={{ padding: '8px 6px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(l => (
                      <tr key={l.id} style={{ borderBottom: '1px solid #f3f3f3', verticalAlign: 'top' }}>
                        <td style={{ padding: '8px 6px' }}>
                          <input type="checkbox" checked={picked.has(l.id)}
                                 onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })} />
                        </td>
                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{when(l.sentAt)}</td>
                        <td style={{ padding: '8px 6px', fontFamily: 'monospace' }}>{l.phone || '-'}</td>
                        <td style={{ padding: '8px 6px' }}>
                          <div style={{ fontWeight: 600 }}>{l.templateName || l.templateId || '-'}</div>
                          <div style={{ color: '#888', fontSize: 11 }}>{KIND[l.kind] ?? l.kind}</div>
                        </td>
                        <td style={{ padding: '8px 6px', maxWidth: 420 }}>
                          {l.message ? (
                            <button onClick={() => setOpen(l)} title="Show full message"
                                    style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', color: '#333',
                                             display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {l.message}
                            </button>
                          ) : (
                            <span style={{ color: '#999' }}>
                              {varsText(l.vars) || '-'}
                              <button onClick={() => setTab('templates')} style={{ display: 'block', background: 'none', border: 0, padding: 0, color: '#2563eb', cursor: 'pointer', fontSize: 11 }}>
                                Add this template&apos;s text to see the full message
                              </button>
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          {l.status === 'sent' ? <Pill tone="green">Sent</Pill> : <Pill tone="red">Failed</Pill>}
                          {l.status === 'failed' && l.detail && <div style={{ color: '#c0392b', fontSize: 11, marginTop: 2, maxWidth: 200 }}>{l.detail}</div>}
                        </td>
                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                          <button className="adm-btn" style={{ padding: '.25rem .55rem', fontSize: 12 }} disabled={!textOf(l)} onClick={() => copy(l)}>
                            {copied === l.id ? 'Copied' : 'Copy'}
                          </button>{' '}
                          <a className="adm-btn" style={{ padding: '.25rem .55rem', fontSize: 12, color: '#128C7E', pointerEvents: l.phone ? undefined : 'none', opacity: l.phone ? 1 : .5 }}
                             title={l.message ? 'Open WhatsApp with this message' : 'Template text not saved yet: WhatsApp opens with the values only'}
                             href={l.phone ? waHref(l) : undefined} target="_blank" rel="noopener noreferrer">WhatsApp</a>{' '}
                          <button className="adm-btn" style={{ padding: '.25rem .55rem', fontSize: 12, color: '#c0392b' }}
                                  onClick={() => del({ ids: [l.id] }, 'Delete this log?')}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pages > 1 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 12 }}>
                <button className="adm-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                <span style={{ fontSize: 13 }}>Page {page} of {pages}</span>
                <button className="adm-btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card title="Template texts">
          <p style={{ fontSize: 13, color: '#555', margin: '0 0 1rem', lineHeight: 1.6 }}>
            MSG91 only receives the template id and the values, so the website does not know the wording of a message until you paste it here once.
            Copy the exact DLT text from MSG91 → Templates, with <code>{'{#var#}'}</code> where each value goes (or <code>##order_id##</code> style names).
            Older logs show their full message as soon as the text is saved.
          </p>
          {tplMsg && <p style={{ color: '#1a7f4b', fontWeight: 600, fontSize: 13 }}>{tplMsg}</p>}
          {tpls.length === 0 ? <Empty>No templates yet.</Empty> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {tpls.map(t => {
                const v = tplEdit[t.id] ?? { name: '', text: '' };
                return (
                  <div key={t.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: '10px 12px', background: t.text ? '#fff' : '#fffaf0' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <input className="adm-input" value={v.name} placeholder="Name"
                             onChange={e => setTplEdit(m => ({ ...m, [t.id]: { ...v, name: e.target.value } }))} style={{ width: 220 }} />
                      <code style={{ fontSize: 12, color: '#777' }}>{t.id}</code>
                      <span style={{ fontSize: 12, color: '#777' }}>{t.sent} sent</span>
                      {!t.text && <Pill tone="amber">Text missing</Pill>}
                    </div>
                    <textarea className="adm-input" rows={3} value={v.text} placeholder="Dear Customer, Your payment for the following order at Mahalaxmi Fashion Hub was not completed. Order ID: {#var#} ..."
                              onChange={e => setTplEdit(m => ({ ...m, [t.id]: { ...v, text: e.target.value } }))}
                              style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }} />
                    <button className="adm-btn adm-btn-primary" style={{ marginTop: 6 }} disabled={tplSaving === t.id} onClick={() => saveTpl(t.id)}>
                      {tplSaving === t.id ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {open && (
        <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, maxWidth: 560, width: '100%', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong>{open.templateName || open.templateId} · {open.phone} · {when(open.sentAt)}</strong>
              <button onClick={() => setOpen(null)} style={{ background: 'none', border: 0, fontSize: 22, cursor: 'pointer' }} aria-label="Close">×</button>
            </div>
            <div style={{ background: '#f6f6f7', borderRadius: 8, padding: '12px 14px', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14 }}>{open.message}</div>
            {open.requestId && <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>MSG91 request id: {open.requestId}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="adm-btn" onClick={() => copy(open)}>{copied === open.id ? 'Copied' : 'Copy'}</button>
              {open.phone && <a className="adm-btn adm-btn-primary" href={waHref(open)} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
