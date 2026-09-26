'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { PageHeader } from '@/components/admin/Ui';

interface Sources {
  customers: number;
  consented: number;
  metaLeads: number;
  googleLeads: number;
  popupLeads: number;
  metaReady: boolean;
  googleReady: boolean;
}

interface Preview {
  raw: number;
  usable: number;
  removed: number;
  withPhone: number;
  withEmail: number;
}

interface PushResult {
  success: boolean;
  people: number;
  meta?: { audienceId: string | null; added: number; error: string | null } | null;
  google?: { userListId: string | null; added: number; error: string | null } | null;
}

type Source = 'customers' | 'metaleads' | 'googleleads' | 'popupleads' | 'csv';
type Filter = 'all' | 'consent' | 'buyers' | 'lapsed';

// The page's own shapes, now drawn from the shared admin look rather than
// their own greys, so this screen matches the rest of the panel.
const box: React.CSSProperties = {
  background: '#fff', border: '1px solid #eae3e4', borderRadius: 13, padding: '.85rem .9rem',
};
const label: React.CSSProperties = {
  fontSize: '.74rem', fontWeight: 800, letterSpacing: '.05em',
  textTransform: 'uppercase', color: '#8a7f76', margin: '0 0 .5rem',
};

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`adm-chip${on ? ' on' : ''}`}>
      {children}
    </button>
  );
}

export default function AudiencesPage() {
  const [src, setSrc] = useState<Sources | null>(null);
  const [source, setSource] = useState<Source>('customers');
  const [filter, setFilter] = useState<Filter>('consent');
  const [days, setDays] = useState(60);
  const [csv, setCsv] = useState('');
  const [csvName, setCsvName] = useState('');
  const [name, setName] = useState('');
  const [toMeta, setToMeta] = useState(true);
  const [toGoogle, setToGoogle] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<PushResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/audiences/sources', { headers: { Authorization: `Bearer ${getAdminToken()}` } })
      .then(r => r.json())
      .then(d => { if (d.success) { setSrc(d); setToMeta(!!d.metaReady); } })
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const runPreview = useCallback(async () => {
    setBusy('preview'); setError(''); setPreview(null); setResult(null);
    try {
      const res = await fetch('/api/audiences/preview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, filter, days, csv: source === 'csv' ? csv : null }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.message || 'Could not read that list.'); return; }
      setPreview(d);
    } catch { setError('Could not reach the server.'); }
    finally { setBusy(''); }
  }, [source, filter, days, csv]);

  const download = () => {
    const q = new URLSearchParams({ source, filter, days: String(days) });
    // The export is a signed-in call, so it is fetched and saved rather than
    // opened as a plain link (a link carries no Authorization header).
    setBusy('download'); setError('');
    fetch(`/api/audiences/export?${q}`, { headers: { Authorization: `Bearer ${getAdminToken()}` } })
      .then(async r => {
        if (!r.ok) throw new Error('export failed');
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${source}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setError('Could not download that list.'))
      .finally(() => setBusy(''));
  };

  const readFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ''));
      setCsvName(file.name);
      setSource('csv');
      setPreview(null);
      setResult(null);
    };
    reader.readAsText(file);
  };

  const push = async () => {
    setBusy('push'); setError(''); setResult(null); setConfirming(false);
    try {
      const res = await fetch('/api/audiences/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source, filter, days,
          csv: source === 'csv' ? csv : null,
          name, meta: toMeta, google: toGoogle,
        }),
      });
      const d = await res.json();
      if (!res.ok && !d.people) { setError(d.message || 'The upload did not go through.'); return; }
      setResult(d);
    } catch { setError('Could not reach the server.'); }
    finally { setBusy(''); }
  };

  const count = (s: Source): string => {
    if (!src) return '';
    if (s === 'customers') return `${filter === 'consent' ? src.consented : src.customers}`;
    if (s === 'metaleads') return `${src.metaLeads}`;
    if (s === 'googleleads') return `${src.googleLeads}`;
    if (s === 'popupleads') return `${src.popupLeads}`;
    return csvName ? '1 file' : '';
  };

  return (
    <div className="admin-page" style={{ maxWidth: 900 }}>
      <PageHeader
        title="Audiences"
        sub="Hand a list of people you already know to Meta and Google, so the ads go to them instead of strangers. Or download the same list as a CSV, or upload one from elsewhere."
      />

      {error && (
        <div className="adm-card" style={{ background: '#fdf3f2', borderColor: '#f0cdc9', color: '#c0392b', marginBottom: '.85rem', fontSize: '.86rem', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* 1 — who */}
      <div style={{ ...box, marginBottom: '1rem' }}>
        <p style={label}>1 · Which people</p>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.8rem' }}>
          <Choice on={source === 'customers'} onClick={() => { setSource('customers'); setPreview(null); setResult(null); }}>
            Store customers {src && <span style={{ opacity: .75 }}>({count('customers')})</span>}
          </Choice>
          <Choice on={source === 'metaleads'} onClick={() => { setSource('metaleads'); setPreview(null); setResult(null); }}>
            Meta Ad Leads {src && <span style={{ opacity: .75 }}>({count('metaleads')})</span>}
          </Choice>
          <Choice on={source === 'googleleads'} onClick={() => { setSource('googleleads'); setPreview(null); setResult(null); }}>
            Google Ad Leads {src && <span style={{ opacity: .75 }}>({count('googleleads')})</span>}
          </Choice>
          <Choice on={source === 'popupleads'} onClick={() => { setSource('popupleads'); setPreview(null); setResult(null); }}>
            Popup Leads {src && <span style={{ opacity: .75 }}>({count('popupleads')})</span>}
          </Choice>
          <Choice on={source === 'csv'} onClick={() => fileRef.current?.click()}>
            {csvName ? `CSV · ${csvName}` : 'Upload a CSV'}
          </Choice>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden
            onChange={e => readFile(e.target.files?.[0])} />
        </div>

        {source === 'customers' && (
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <Choice on={filter === 'consent'} onClick={() => { setFilter('consent'); setPreview(null); }}>Agreed to marketing</Choice>
            <Choice on={filter === 'all'} onClick={() => { setFilter('all'); setPreview(null); }}>Everyone</Choice>
            <Choice on={filter === 'buyers'} onClick={() => { setFilter('buyers'); setPreview(null); }}>Has ordered</Choice>
            <Choice on={filter === 'lapsed'} onClick={() => { setFilter('lapsed'); setPreview(null); }}>Not ordered lately</Choice>
            {filter === 'lapsed' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontSize: '.85rem', color: '#555' }}>
                older than
                <input className="adm-input" type="number" min={7} max={730} value={days}
                  onChange={e => { setDays(Number(e.target.value)); setPreview(null); }}
                  style={{ width: 76, padding: '.3rem .45rem' }} />
                days
              </span>
            )}
          </div>
        )}

        {source === 'customers' && filter === 'all' && (
          <p style={{ margin: '.7rem 0 0', fontSize: '.8rem', color: '#8a6d3b', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '.55rem .8rem', lineHeight: 1.6 }}>
            &ldquo;Everyone&rdquo; includes customers who never agreed to marketing. Uploading them is
            your call to make, not a technical one — India&apos;s DPDP Act expects consent for this.
            &ldquo;Agreed to marketing&rdquo; is the safe choice.
          </p>
        )}

        {source === 'csv' && (
          <p style={{ margin: '.7rem 0 0', fontSize: '.8rem', color: '#777', lineHeight: 1.6 }}>
            Any CSV with a header row works. It needs a Phone or an Email column — Name, City,
            Campaign, Status and Date are used when they are there. &ldquo;Mobile&rdquo; counts as Phone.
          </p>
        )}

        <div style={{ marginTop: '.9rem', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="adm-btn" onClick={runPreview} disabled={busy !== ''}>
            {busy === 'preview' ? 'Counting…' : 'Count them'}
          </button>
          {source !== 'csv' && (
            <button className="adm-btn" onClick={download} disabled={busy !== ''}>
              {busy === 'download' ? 'Preparing…' : 'Download CSV'}
            </button>
          )}
        </div>

        {preview && (
          <div style={{ marginTop: '.9rem', background: '#f7f7f9', borderRadius: 8, padding: '.7rem .9rem', fontSize: '.86rem', color: '#444', lineHeight: 1.7 }}>
            <b>{preview.usable.toLocaleString('en-IN')}</b> people will be sent.
            {preview.removed > 0 && <> {preview.removed.toLocaleString('en-IN')} of the {preview.raw.toLocaleString('en-IN')} rows were dropped — the same person twice, or a row with neither phone nor email.</>}
            <br />
            {preview.withPhone.toLocaleString('en-IN')} have a phone number, {preview.withEmail.toLocaleString('en-IN')} have an email.
          </div>
        )}
      </div>

      {/* 2 — where */}
      <div style={{ ...box, marginBottom: '1rem' }}>
        <p style={label}>2 · Where it goes</p>

        <label style={{ display: 'flex', gap: '.55rem', alignItems: 'flex-start', marginBottom: '.7rem', cursor: src?.metaReady ? 'pointer' : 'default', opacity: src?.metaReady ? 1 : .55 }}>
          <input type="checkbox" checked={toMeta} disabled={!src?.metaReady}
            onChange={e => setToMeta(e.target.checked)} style={{ marginTop: '.2rem' }} />
          <span>
            <b style={{ fontSize: '.92rem' }}>Meta — Facebook &amp; Instagram</b>
            <span style={{ display: 'block', fontSize: '.8rem', color: '#777', lineHeight: 1.6 }}>
              {src?.metaReady
                ? 'Makes a Custom Audience you can pick in Ads Manager. Accept the Custom Audience terms once in Business Settings or Meta will refuse it.'
                : 'Not connected — paste a System User token in Settings → Meta Ads first.'}
            </span>
          </span>
        </label>

        <label style={{ display: 'flex', gap: '.55rem', alignItems: 'flex-start', cursor: src?.googleReady ? 'pointer' : 'default', opacity: src?.googleReady ? 1 : .55 }}>
          <input type="checkbox" checked={toGoogle} disabled={!src?.googleReady}
            onChange={e => setToGoogle(e.target.checked)} style={{ marginTop: '.2rem' }} />
          <span>
            <b style={{ fontSize: '.92rem' }}>Google — Customer Match</b>
            <span style={{ display: 'block', fontSize: '.8rem', color: '#777', lineHeight: 1.6 }}>
              {src?.googleReady
                ? 'Goes through Google’s Data Manager API. Enable that API in your Cloud project, reconnect Google Ads once so the new permission is granted, and make sure the account is eligible for Customer Match.'
                : 'Not connected — add the Customer ID in Settings → Google Ads and press Connect.'}
            </span>
          </span>
        </label>

        <div style={{ marginTop: '1rem' }}>
          <p style={{ ...label, margin: '0 0 .35rem' }}>Name for the list</p>
          <input className="adm-input" value={name} onChange={e => setName(e.target.value)}
            placeholder="Mahalaxmi customers — Sep 2026"
            style={{ width: '100%', maxWidth: 420, minWidth: 0 }} />
        </div>
      </div>

      {/* 3 — send */}
      {!confirming ? (
        <button className="adm-btn adm-btn-primary"
          onClick={() => { setError(''); setConfirming(true); }}
          disabled={busy !== '' || (!toMeta && !toGoogle)}>
          Send the list
        </button>
      ) : (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 10, padding: '.95rem 1.15rem' }}>
          <p style={{ margin: '0 0 .3rem', fontWeight: 700, fontSize: '.93rem' }}>Send this list?</p>
          <p style={{ margin: '0 0 .85rem', fontSize: '.87rem', color: '#5d4037', lineHeight: 1.65 }}>
            {preview
              ? <><b>{preview.usable.toLocaleString('en-IN')}</b> people</>
              : <>The chosen list</>}{' '}
            goes to {[toMeta && 'Meta', toGoogle && 'Google'].filter(Boolean).join(' and ')}.
            Phone numbers and emails are hashed here first — neither of them sees the real ones.
          </p>
          <button className="adm-btn adm-btn-primary" onClick={push} disabled={busy !== ''} style={{ marginRight: '.5rem' }}>
            {busy === 'push' ? 'Sending…' : 'Yes, send it'}
          </button>
          <button className="adm-btn" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}

      {result && (
        <div style={{ ...box, marginTop: '1.1rem' }}>
          <p style={{ margin: '0 0 .6rem', fontWeight: 700, fontSize: '.95rem' }}>
            {result.success ? '✅ Sent' : '⚠️ Partly sent'}
          </p>
          {result.meta && (
            <p style={{ margin: '0 0 .4rem', fontSize: '.87rem', lineHeight: 1.65 }}>
              <b>Meta:</b>{' '}
              {result.meta.error
                ? <span style={{ color: '#8a1c13' }}>{result.meta.error}</span>
                : <>{result.meta.added.toLocaleString('en-IN')} people sent to audience <code>{result.meta.audienceId}</code>. It shows up in Ads Manager → Audiences; Meta takes a few hours to finish matching.</>}
            </p>
          )}
          {result.google && (
            <p style={{ margin: 0, fontSize: '.87rem', lineHeight: 1.65 }}>
              <b>Google:</b>{' '}
              {result.google.error
                ? <span style={{ color: '#8a1c13' }}>{result.google.error}</span>
                : <>{result.google.added.toLocaleString('en-IN')} people sent to list <code>{result.google.userListId}</code>. Google needs at least 100 matched people before a list can be targeted.</>}
            </p>
          )}
        </div>
      )}

      <p style={{ margin: '1.4rem 0 0', fontSize: '.78rem', color: '#999', lineHeight: 1.75 }}>
        Phone numbers and emails never leave this server in readable form — they are SHA-256 hashed
        before being sent, which is what both platforms require. The CSV download is the one place
        the real details appear, so treat that file the way you would treat your customer register.
      </p>
    </div>
  );
}
