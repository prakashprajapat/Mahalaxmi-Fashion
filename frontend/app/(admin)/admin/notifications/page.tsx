'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

// Admin composer for browser/app Push notifications (offers, launches, sale alerts).
// Sends a Web Push message to every customer who allowed notifications on the site.
export default function PushNotificationsPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('https://www.mahalaxmifashionhub.com/products');
  const [image, setImage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState('');
  const [count, setCount] = useState<number | null>(null);

  // Show how many devices are subscribed.
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
    if (!token) { setResult('❌ Admin login required.'); return; }
    if (!title.trim() || !body.trim()) { setResult('❌ Title and message are required.'); return; }
    if (!window.confirm(`Send this notification to all ${count ?? ''} subscribed customers now?`)) return;
    setSending(true); setResult('');
    try {
      const res = await fetch(`${API_BASE}/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), url: url.trim(), image: image.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        setResult(`✅ Sent to ${d.sent} device(s)${d.failed ? `, ${d.failed} failed` : ''}.`);
      } else {
        setResult('❌ ' + (d.message || `Failed (${res.status})`));
      }
    } catch (e) {
      setResult('❌ ' + (e as Error).message);
    } finally { setSending(false); }
  };

  const box: React.CSSProperties = {
    width: '100%', padding: '.65rem .8rem', border: '1px solid #ddd',
    borderRadius: 8, fontSize: '.95rem', marginTop: '.35rem',
  };
  const label: React.CSSProperties = { fontWeight: 600, fontSize: '.9rem', color: '#333', display: 'block', marginTop: '1rem' };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
        <h2 style={{ margin: '0 0 .35rem', color: '#a7354d' }}>🔔 Push Notifications</h2>
        <p style={{ color: '#666', fontSize: '.9rem', margin: 0 }}>
          Send an offer or update to every customer who allowed notifications on the website — it pops up on their phone/desktop even when the site is closed.
          {count !== null && <> Currently <strong>{count}</strong> subscribed device{count === 1 ? '' : 's'}.</>}
        </p>

        <label style={label}>Title
          <input style={box} value={title} maxLength={80}
            onChange={e => setTitle(e.target.value)} placeholder="e.g. Festive Sale is Live! 🎉" />
        </label>
        <label style={label}>Message
          <textarea style={{ ...box, minHeight: 90, resize: 'vertical' }} value={body} maxLength={300}
            onChange={e => setBody(e.target.value)} placeholder="e.g. Flat 30% off on all sarees & nighties. Shop now before stock runs out!" />
        </label>
        <label style={label}>Link (opens when tapped)
          <input style={box} value={url}
            onChange={e => setUrl(e.target.value)} placeholder="https://www.mahalaxmifashionhub.com/products" />
        </label>
        <label style={label}>Image URL (optional)
          <input style={box} value={image}
            onChange={e => setImage(e.target.value)} placeholder="https://www.mahalaxmifashionhub.com/og-image.jpg" />
        </label>

        <button onClick={send} disabled={sending}
          style={{ marginTop: '1.25rem', background: sending ? '#ccc' : '#a7354d', color: '#fff', border: 'none', borderRadius: 8, padding: '.75rem 1.5rem', fontWeight: 700, fontSize: '.95rem', cursor: sending ? 'default' : 'pointer' }}>
          {sending ? 'Sending…' : '📤 Send Notification'}
        </button>

        {result && (
          <p style={{ marginTop: '1rem', fontSize: '.9rem', color: result.startsWith('✅') ? '#2e7d32' : '#c62828' }}>
            {result}
          </p>
        )}
      </div>
    </div>
  );
}
