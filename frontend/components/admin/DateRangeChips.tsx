'use client';
import { useState } from 'react';

// What a page is currently asking for. `days` set = one of the quick chips;
// `days` null = the shop typed two dates of its own.
export interface DateRange {
  days: number | null;
  from: string;   // yyyy-MM-dd
  to: string;     // yyyy-MM-dd
}

export const DEFAULT_RANGE: DateRange = { days: 30, from: '', to: '' };

// The query string for the ads endpoints. The server falls back to `days`
// whenever the two dates are missing or unreadable, so sending days as well
// would be harmless — but sending only what is meant keeps the URL honest.
export function rangeQuery(r: DateRange): string {
  return r.days === null && r.from && r.to
    ? `from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`
    : `days=${r.days ?? 30}`;
}

export function rangeLabel(r: DateRange): string {
  return r.days === null && r.from && r.to ? `${r.from} → ${r.to}` : `Last ${r.days ?? 30} days`;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
  options?: number[];
  disabled?: boolean;
}

// Quick chips plus a Custom one that opens two date boxes.
//
// The dates are only sent when Apply is pressed. Firing on every keystroke
// would send half-typed years (0002-10-03) to Google and Meta, and each of
// those is a real API call that the shop waits through.
export default function DateRangeChips({ value, onChange, options = [7, 30, 90], disabled = false }: Props) {
  const custom = value.days === null;
  const [open, setOpen] = useState(custom);
  const today = iso(new Date());
  const [from, setFrom] = useState(value.from || iso(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(value.to || today);

  const chip = (active: boolean): React.CSSProperties => ({
    border: '1.5px solid ' + (active ? '#a7354d' : '#ddd'),
    background: active ? '#a7354d' : '#fff',
    color: active ? '#fff' : '#555',
    borderRadius: 999, padding: '.35rem .9rem', fontSize: '.84rem', fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .6 : 1,
  });
  const box: React.CSSProperties = {
    border: '1.5px solid #ddd', borderRadius: 8, padding: '.3rem .5rem', fontSize: '.84rem',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
      {options.map(d => (
        <button key={d} type="button" disabled={disabled}
          onClick={() => { setOpen(false); onChange({ days: d, from: '', to: '' }); }}
          style={chip(!custom && value.days === d)}>
          Last {d} days
        </button>
      ))}
      <button type="button" disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={chip(custom)}>
        Custom dates
      </button>

      {open && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
          <input type="date" value={from} max={to || today} style={box}
            aria-label="From date" onChange={e => setFrom(e.target.value)} />
          <span style={{ color: '#888', fontSize: '.84rem' }}>to</span>
          <input type="date" value={to} min={from} max={today} style={box}
            aria-label="To date" onChange={e => setTo(e.target.value)} />
          <button type="button" disabled={disabled || !from || !to}
            onClick={() => { onChange({ days: null, from, to }); setOpen(true); }}
            className="adm-btn" style={{ padding: '.35rem .8rem', fontSize: '.8rem' }}>
            Apply
          </button>
        </span>
      )}
    </div>
  );
}
