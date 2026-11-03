'use client';

/**
 * Fraud & Risk -> Import Excel: switch Cash on Delivery off (or back on) for a
 * whole list of pincodes at once - for example the RTO-heavy pincode list a
 * courier sends. The sheet is read here; only the 6-digit pincodes go to the
 * server, which writes the same setting the one-at-a-time button does.
 */

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { getAdminToken } from '@/lib/auth';
import { ordersApi } from '@/lib/api';
import { Card } from '@/components/admin/Ui';

const isPin = (s: string) => /^[1-9]\d{5}$/.test(s);

function pincodesFrom(grid: unknown[][]): string[] {
  // A column headed "pincode"/"pin"/"zip" is used on its own; with no such
  // heading, every 6-digit number anywhere on the sheet is taken.
  const head = (grid[0] ?? []).map(c => String(c ?? '').toLowerCase().replace(/[^a-z]/g, ''));
  const col = head.findIndex(h => ['pincode', 'pin', 'pincodes', 'zip', 'zipcode', 'postalcode', 'postcode', 'pinno'].includes(h));
  const out = new Set<string>();
  const take = (v: unknown) => {
    const t = String(v ?? '');
    for (const m of t.match(/\d{6}/g) ?? []) if (isPin(m)) out.add(m);
  };
  if (col >= 0) grid.slice(1).forEach(r => take(r[col]));
  else grid.forEach(r => r.forEach(take));
  return Array.from(out);
}

export default function PincodeImport({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [pins, setPins] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const reset = () => { setPins([]); setFileName(''); setErr(''); setDone(''); if (fileRef.current) fileRef.current.value = ''; };

  const readFile = async (f: File) => {
    reset(); setFileName(f.name);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const all: string[] = [];
      for (const name of wb.SheetNames) {
        const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: '' }) as unknown[][];
        all.push(...pincodesFrom(grid));
      }
      const uniq = Array.from(new Set(all));
      if (!uniq.length) { setErr('No 6-digit pincodes found in that file.'); return; }
      if (uniq.length > 20000) { setErr(`${uniq.length.toLocaleString('en-IN')} pincodes found. Import at most 20,000 at a time.`); return; }
      setPins(uniq);
    } catch {
      setErr('Could not read that file. Use an .xlsx, .xls or .csv file.');
    }
  };

  const apply = async () => {
    const what = blocked ? 'switch Cash on Delivery OFF' : 'turn Cash on Delivery back ON';
    if (!confirm(`This will ${what} for ${pins.length.toLocaleString('en-IN')} pincodes. Continue?`)) return;
    setBusy(true); setErr(''); setDone('');
    try {
      const r = await ordersApi.setCodBlockBulk(pins, blocked, getAdminToken() ?? '');
      setDone(
        `${r.changed.toLocaleString('en-IN')} pincodes ${blocked ? 'switched to COD off' : 'turned back to COD on'}`
        + (r.unchanged ? `, ${r.unchanged.toLocaleString('en-IN')} were already ${blocked ? 'off' : 'on'}` : '')
        + `. COD is now off for ${r.totalBlocked.toLocaleString('en-IN')} pincodes in total.`);
      setPins([]);
      onDone();
    } catch (e) {
      setErr((e as Error).message || 'Could not save.');
    } finally { setBusy(false); }
  };

  const sample = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Pincode'], ['700093'], ['712408']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pincodes');
    XLSX.writeFile(wb, 'cod-pincodes-sample.xlsx');
  };

  if (!open) return <button className="adm-btn" onClick={() => setOpen(true)}>Import Excel</button>;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 12px', overflowY: 'auto' }}
         onClick={() => { if (!busy) { setOpen(false); reset(); } }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520 }}>
        <Card title="Import pincodes from Excel" right={<button className="adm-btn" disabled={busy} onClick={() => { setOpen(false); reset(); }}>Close</button>}>
          <p style={{ fontSize: '.85rem', color: '#555', margin: '0 0 .8rem', lineHeight: 1.55 }}>
            A sheet with a <strong>Pincode</strong> column (.xlsx, .xls or .csv). With no such heading, every 6-digit number in the sheet is taken.
            Customers in these pincodes can still order by paying online.{' '}
            <button type="button" onClick={sample} style={{ background: 'none', border: 0, padding: 0, color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}>
              Download sample sheet
            </button>
          </p>

          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
                 onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); }}
                 style={{ display: 'block', marginBottom: '.8rem', maxWidth: '100%' }} />

          {pins.length > 0 && (
            <>
              <div style={{ fontSize: '.83rem', background: '#f6f6f7', borderRadius: 8, padding: '.6rem .75rem', marginBottom: '.8rem', lineHeight: 1.6 }}>
                <strong>{fileName}</strong>: {pins.length.toLocaleString('en-IN')} pincodes
                <div style={{ fontFamily: 'monospace', color: '#555', marginTop: 2, wordBreak: 'break-word' }}>
                  {pins.slice(0, 12).join(', ')}{pins.length > 12 ? ` … +${(pins.length - 12).toLocaleString('en-IN')} more` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '.85rem', marginBottom: '.9rem' }}>
                <label style={{ display: 'flex', gap: '.35rem', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" checked={blocked} onChange={() => setBlocked(true)} /> Switch COD <strong style={{ color: '#c0392b' }}>off</strong>
                </label>
                <label style={{ display: 'flex', gap: '.35rem', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" checked={!blocked} onChange={() => setBlocked(false)} /> Turn COD back <strong style={{ color: '#2e7d32' }}>on</strong>
                </label>
              </div>
              <button className="adm-btn adm-btn-primary" disabled={busy} onClick={apply}>
                {busy ? 'Saving…' : `Apply to ${pins.length.toLocaleString('en-IN')} pincodes`}
              </button>
            </>
          )}

          {err && <p style={{ color: '#a3122b', fontSize: '.85rem', marginTop: '.7rem' }}>{err}</p>}
          {done && <p style={{ background: '#eaf7f0', color: '#1a7f4b', borderRadius: 8, padding: '.6rem .75rem', fontSize: '.85rem', fontWeight: 600, marginTop: '.7rem' }}>{done}</p>}
        </Card>
      </div>
    </div>
  );
}
