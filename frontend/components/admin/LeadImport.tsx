'use client';

/**
 * Popup Leads -> Import from Excel.
 *
 * The sheet is read here in the browser (SheetJS, already used for exports),
 * the columns are found by their headings, and only name / phone / email go
 * to the server. The server skips anyone already on the list, so importing
 * the same sheet twice adds nobody the second time.
 */

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { getAdminToken } from '@/lib/auth';
import { Card } from '@/components/admin/Ui';

type Row = { name: string; phone: string; email: string };
type Result = { total: number; added: number; duplicates: number; invalid: number; welcomed: number };

// Headings are matched loosely: "Mobile No.", "WhatsApp Number", "Customer Name", "E-mail"...
const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');
const PHONE_KEYS = ['phone', 'mobile', 'mobileno', 'mobilenumber', 'phoneno', 'phonenumber', 'number', 'contact', 'contactno', 'contactnumber', 'whatsapp', 'whatsappnumber', 'whatsappno', 'cell'];
const EMAIL_KEYS = ['email', 'emailid', 'emailaddress', 'mail', 'mailid'];
const NAME_KEYS = ['name', 'fullname', 'customername', 'customer', 'leadname', 'firstname', 'naam'];

function pick(headers: string[], keys: string[]): number {
  const n = headers.map(norm);
  let i = n.findIndex(h => keys.includes(h));
  if (i < 0) i = n.findIndex(h => keys.some(k => k.length > 3 && h.includes(k)));
  return i;
}

const digits10 = (s: string) => { const d = s.replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export default function LeadImport({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [source, setSource] = useState('excel_import');
  const [sendWelcome, setSendWelcome] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  const reset = () => { setRows([]); setCols(null); setFileName(''); setErr(''); setResult(null); if (fileRef.current) fileRef.current.value = ''; };

  const readFile = async (f: File) => {
    reset(); setFileName(f.name);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' }) as unknown[][];
      // The heading row is the first row that names a phone or email column.
      let hi = grid.findIndex(r => {
        const h = (r ?? []).map(c => String(c ?? ''));
        return pick(h, PHONE_KEYS) >= 0 || pick(h, EMAIL_KEYS) >= 0;
      });
      let headers: string[];
      let body: unknown[][];
      if (hi >= 0 && hi < 10) {
        headers = grid[hi].map(c => String(c ?? ''));
        body = grid.slice(hi + 1);
      } else {
        // No headings: guess from the cells themselves.
        hi = -1;
        headers = (grid[0] ?? []).map((_, i) => `Column ${i + 1}`);
        body = grid;
      }
      let pi = pick(headers, PHONE_KEYS), ei = pick(headers, EMAIL_KEYS), ni = pick(headers, NAME_KEYS);
      if (hi < 0) {
        const sample = body.slice(0, 20);
        const width = Math.max(0, ...sample.map(r => r.length));
        for (let c = 0; c < width; c++) {
          const vals = sample.map(r => String(r[c] ?? ''));
          if (pi < 0 && vals.filter(v => digits10(v)).length >= sample.length / 2) pi = c;
          else if (ei < 0 && vals.filter(isEmail).length >= sample.length / 2) ei = c;
          else if (ni < 0 && vals.filter(v => /[a-z]/i.test(v) && !isEmail(v)).length >= sample.length / 2) ni = c;
        }
      }
      if (pi < 0 && ei < 0) {
        setErr('No phone or email column found. Put a heading row with "Name", "Phone" and/or "Email" at the top of the sheet.');
        return;
      }
      setCols({
        name: ni >= 0 ? headers[ni] : '(none)',
        phone: pi >= 0 ? headers[pi] : '(none)',
        email: ei >= 0 ? headers[ei] : '(none)',
      });
      const out: Row[] = [];
      for (const r of body) {
        const row = {
          name: ni >= 0 ? String(r[ni] ?? '').trim() : '',
          phone: pi >= 0 ? String(r[pi] ?? '').trim() : '',
          email: ei >= 0 ? String(r[ei] ?? '').trim() : '',
        };
        if (row.name || row.phone || row.email) out.push(row);
      }
      if (!out.length) { setErr('The sheet has no rows under the headings.'); return; }
      if (out.length > 5000) { setErr(`The sheet has ${out.length.toLocaleString('en-IN')} rows. Import at most 5,000 at a time.`); return; }
      setRows(out);
    } catch {
      setErr('Could not read that file. Use an .xlsx, .xls or .csv file.');
    }
  };

  const usable = rows.filter(r => digits10(r.phone) || isEmail(r.email)).length;

  const doImport = async () => {
    setBusy(true); setErr(''); setResult(null);
    try {
      const res = await fetch('/api/popup-leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken() ?? ''}` },
        body: JSON.stringify({ rows, source: source.trim() || 'excel_import', sendWelcome }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok || !b.success) throw new Error(b.message || `Import failed (${res.status})`);
      setResult(b as Result);
      setRows([]);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  const downloadSample = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Name', 'Phone', 'Email'], ['Asha Sharma', '9876543210', 'asha@example.com'], ['Ravi Kumar', '9123456780', '']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, 'popup-leads-sample.xlsx');
  };

  if (!open) {
    return <button className="adm-btn" onClick={() => setOpen(true)}>Import Excel</button>;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 12px', overflowY: 'auto' }}
         onClick={() => { if (!busy) { setOpen(false); reset(); } }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560 }}>
        <Card title="Import leads from Excel" right={<button className="adm-btn" disabled={busy} onClick={() => { setOpen(false); reset(); }}>Close</button>}>
          <p style={{ fontSize: '.85rem', color: '#555', margin: '0 0 .8rem', lineHeight: 1.55 }}>
            Sheet with columns <strong>Name</strong>, <strong>Phone</strong>, <strong>Email</strong> (.xlsx, .xls or .csv).
            Each row needs a 10-digit mobile or an email. People already on the list are skipped, so the same sheet can be imported twice safely.{' '}
            <button type="button" onClick={downloadSample} style={{ background: 'none', border: 0, padding: 0, color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}>
              Download sample sheet
            </button>
          </p>

          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
                 onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); }}
                 style={{ display: 'block', marginBottom: '.8rem', maxWidth: '100%' }} />

          {cols && rows.length > 0 && (
            <>
              <div style={{ fontSize: '.82rem', color: '#444', background: '#f6f6f7', borderRadius: 8, padding: '.6rem .75rem', marginBottom: '.7rem', lineHeight: 1.6 }}>
                <div><strong>{fileName}</strong>: {rows.length.toLocaleString('en-IN')} rows, <strong>{usable.toLocaleString('en-IN')}</strong> with a usable phone or email.</div>
                <div>Columns read: Name = <em>{cols.name}</em>, Phone = <em>{cols.phone}</em>, Email = <em>{cols.email}</em></div>
              </div>
              <div style={{ overflowX: 'auto', marginBottom: '.7rem' }}>
                <table style={{ width: '100%', fontSize: '.8rem', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}><th style={{ padding: 4 }}>Name</th><th style={{ padding: 4 }}>Phone</th><th style={{ padding: 4 }}>Email</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f3f3' }}>
                        <td style={{ padding: 4 }}>{r.name || '-'}</td>
                        <td style={{ padding: 4, color: r.phone && !digits10(r.phone) ? '#c0392b' : undefined }}>{r.phone || '-'}</td>
                        <td style={{ padding: 4, color: r.email && !isEmail(r.email) ? '#c0392b' : undefined }}>{r.email || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 5 && <div style={{ fontSize: '.75rem', color: '#888', marginTop: 4 }}>…and {(rows.length - 5).toLocaleString('en-IN')} more</div>}
              </div>

              <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.25rem' }}>Source (shows in the Source column)</label>
              <input className="adm-input" value={source} onChange={e => setSource(e.target.value)} maxLength={50}
                     style={{ width: '100%', marginBottom: '.7rem' }} />

              <label style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontSize: '.83rem', marginBottom: '.9rem', lineHeight: 1.5 }}>
                <input type="checkbox" checked={sendWelcome} onChange={e => setSendWelcome(e.target.checked)} style={{ marginTop: 3 }} />
                <span>Also send the welcome SMS / email to the new leads.
                  <span style={{ color: '#a3122b' }}> Leave this off unless these people asked to hear from you; messaging a list that did not opt in can get the SMS sender blocked.</span></span>
              </label>

              <button className="adm-btn adm-btn-primary" disabled={busy || usable === 0} onClick={doImport}>
                {busy ? 'Importing…' : `Import ${usable.toLocaleString('en-IN')} leads`}
              </button>
            </>
          )}

          {err && <p style={{ color: '#a3122b', fontSize: '.85rem', marginTop: '.7rem' }}>{err}</p>}
          {result && (
            <div style={{ marginTop: '.7rem', background: '#eaf7f0', color: '#1a7f4b', borderRadius: 8, padding: '.6rem .75rem', fontSize: '.85rem', fontWeight: 600, lineHeight: 1.6 }}>
              Done. {result.added.toLocaleString('en-IN')} new leads added.
              {result.duplicates > 0 && <> {result.duplicates.toLocaleString('en-IN')} were already on the list (skipped).</>}
              {result.invalid > 0 && <> {result.invalid.toLocaleString('en-IN')} had no valid phone or email (skipped).</>}
              {result.welcomed > 0 && <> Welcome message queued for {result.welcomed.toLocaleString('en-IN')}.</>}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
