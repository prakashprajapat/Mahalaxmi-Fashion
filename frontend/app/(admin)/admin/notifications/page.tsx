'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Stat, StatGrid } from '@/components/admin/Ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

// Push notifications reach a phone's lock screen whether or not the site is
// open, and cannot be taken back once sent. So the point of this page is the
// preview: see the thing as the customer will, then send it.
export default function PushNotificationsPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('https://www.mahalaxmifashionhub.com/products');
  const [image, setImage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;
    fetch(`${API_BASE}/push/count`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && typeof d.count === 'number') setCount(d.count); })
      .catch(() => {});
  }, []);

  const send = async () => {
    const token = getAdminToken();
    if (!token) { setResult({ kind: 'err', text: 'Sign in again — your session has expired.' }); return; }
    if (!title.trim() || !body.trim()) { setResult({ kind: 'err', text: 'A title and a message are both needed.' }); return; }
    if (!window.confirm(`Send this to ${count ?? 'every'} subscribed device now? A notification cannot be taken back.`)) return;
    setSending(true); setResult(null);
    try {
      const res = await fetch(`${API_BASE}/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), url: url.trim(), image: image.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        setResult({ kind: 'ok', text: `Sent to ${d.sent} device${d.sent === 1 ? '' : 's'}${d.failed ? `. ${d.failed} could not be reached — usually a phone that has since turned notifications off.` : '.'}` });
      } else {
        setResult({ kind: 'err', text: d.message || `Failed (${res.status})` });
      }
    } catch (e) {
      setResult({ kind: 'err', text: (e as Error).message });
    } finally { setSending(false); }
  };

  const ready = Boolean(title.trim() && body.trim());

  return (
    <div className="admin-page">
      <PageHeader
        title="Push notifications"
        sub="Goes to the phone of everyone who allowed notifications on the website, even when the site is closed. It cannot be taken back."
      />

      <StatGrid cols={3}>
        <Stat label="Subscribed devices" value={count === null ? '—' : count} />
        <Stat label="Characters in the title" value={`${title.length} / 80`}
              tone={title.length > 65 ? 'red' : undefined} />
        <Stat label="Characters in the message" value={`${body.length} / 300`}
              tone={body.length > 240 ? 'red' : undefined} />
      </StatGrid>

      <div className="adm-grid-3" style={{ alignItems: 'start' }}>
        <Card title="What to send" style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', marginBottom: '.65rem' }}>
            <span className="adm-stat-l">Title</span>
            <input className="adm-input" style={{ width: '100%', marginTop: '.2rem' }} maxLength={80}
                   value={title} onChange={e => setTitle(e.target.value)}
                   placeholder="Festive sale is live" />
          </label>
          <label style={{ display: 'block', marginBottom: '.65rem' }}>
            <span className="adm-stat-l">Message</span>
            <textarea className="adm-input" style={{ width: '100%', marginTop: '.2rem', minHeight: 88, resize: 'vertical' }}
                      maxLength={300} value={body} onChange={e => setBody(e.target.value)}
                      placeholder="Flat 30% off on all sarees and nighties. Shop before the stock runs out." />
          </label>
          <label style={{ display: 'block', marginBottom: '.65rem' }}>
            <span className="adm-stat-l">Where it opens when tapped</span>
            <input className="adm-input" style={{ width: '100%', marginTop: '.2rem' }}
                   value={url} onChange={e => setUrl(e.target.value)}
                   placeholder="https://www.mahalaxmifashionhub.com/products" />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Picture (optional)</span>
            <input className="adm-input" style={{ width: '100%', marginTop: '.2rem' }}
                   value={image} onChange={e => setImage(e.target.value)}
                   placeholder="https://www.mahalaxmifashionhub.com/og-image.jpg" />
          </label>

          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.9rem' }}>
            <button className="adm-btn adm-btn-primary" onClick={send} disabled={sending || !ready}>
              {sending ? 'Sending…' : count === null ? 'Send notification' : `Send to ${count} device${count === 1 ? '' : 's'}`}
            </button>
            {!ready && <span style={{ fontSize: '.78rem', color: '#9a908a' }}>A title and a message are needed first.</span>}
          </div>

          {result && (
            <p style={{ marginTop: '.75rem', fontSize: '.85rem', fontWeight: 700,
                        color: result.kind === 'ok' ? '#2e7d32' : '#c0392b' }}>{result.text}</p>
          )}
        </Card>

        <Card title="How it will look">
          <div style={{ background: '#2a2522', borderRadius: 16, padding: '.85rem', color: '#fff' }}>
            <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 12, padding: '.7rem .8rem', backdropFilter: 'blur(2px)' }}>
              <div style={{ fontSize: '.66rem', opacity: .7, marginBottom: '.25rem', letterSpacing: '.03em' }}>
                MAHALAXMI FASHION HUB · now
              </div>
              <div style={{ fontWeight: 800, fontSize: '.86rem', lineHeight: 1.3, wordBreak: 'break-word' }}>
                {title.trim() || 'Your title goes here'}
              </div>
              <div style={{ fontSize: '.78rem', opacity: .85, lineHeight: 1.45, marginTop: '.2rem', wordBreak: 'break-word' }}>
                {body.trim() || 'And the message underneath it.'}
              </div>
              {image.trim() && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.trim()} alt="" style={{ width: '100%', borderRadius: 8, marginTop: '.5rem', display: 'block' }}
                     onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
            </div>
          </div>
          <p style={{ fontSize: '.76rem', color: '#9a908a', margin: '.6rem 0 0', lineHeight: 1.55 }}>
            A phone may cut a long title to one line, so put what matters first. If the picture does not appear
            above, the link is wrong or the image is not reachable — it will not appear on the phone either.
          </p>
        </Card>
      </div>
    </div>
  );
}
