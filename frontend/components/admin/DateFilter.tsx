'use client';

// "Came in" was a sort arrow and nothing more: the whole list, newest first.
// Fine at twenty rows, useless at two hundred - and the question a shop actually
// asks is not "what is the order of these" but "who came in this week".
//
// The windows are computed in the BROWSER on purpose. The server runs in UTC,
// and India is five and a half hours ahead of it, so a server-side "today"
// starts at half past five in the morning and quietly puts every early-morning
// lead on the previous day. The shopkeeper's own clock is the right one here.

export type DateWindowKey = 'any' | 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export interface DateWindow {
  key: DateWindowKey;
  /** yyyy-mm-dd, only used when key === 'custom'. Either side may be left blank. */
  from: string;
  to: string;
}

export const ANY_DATES: DateWindow = { key: 'any', from: '', to: '' };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const endOfDay = (d: Date) => startOfDay(d) + 86400000 - 1;

/** Does this timestamp fall inside the chosen window? */
export function inDateWindow(raw: string, w: DateWindow): boolean {
  if (!w || w.key === 'any') return true;
  const t = new Date(raw).getTime();
  if (isNaN(t)) return true;              // an unreadable date is never hidden

  const now = new Date();
  switch (w.key) {
    case 'today':
      return t >= startOfDay(now) && t <= endOfDay(now);
    case 'yesterday': {
      const y = new Date(now.getTime() - 86400000);
      return t >= startOfDay(y) && t <= endOfDay(y);
    }
    case '7d':
      return t >= startOfDay(new Date(now.getTime() - 6 * 86400000));
    case '30d':
      return t >= startOfDay(new Date(now.getTime() - 29 * 86400000));
    case 'custom': {
      // A one-sided range is a legitimate question: "everything since Diwali".
      if (w.from && t < startOfDay(new Date(w.from + 'T00:00:00'))) return false;
      if (w.to && t > endOfDay(new Date(w.to + 'T00:00:00'))) return false;
      return true;
    }
    default:
      return true;
  }
}

/** A short line saying what is being shown, for the row count above the table. */
export function describeDateWindow(w: DateWindow): string {
  switch (w?.key) {
    case 'today':     return 'today';
    case 'yesterday': return 'yesterday';
    case '7d':        return 'in the last 7 days';
    case '30d':       return 'in the last 30 days';
    case 'custom':
      if (w.from && w.to) return `between ${w.from} and ${w.to}`;
      if (w.from)         return `since ${w.from}`;
      if (w.to)           return `up to ${w.to}`;
      return '';
    default: return '';
  }
}

export default function DateFilter({
  value, onChange, label = 'Came in',
}: {
  value: DateWindow;
  onChange: (w: DateWindow) => void;
  label?: string;
}) {
  return (
    <>
      <select
        className="adm-input"
        style={{ width: 150 }}
        value={value.key}
        aria-label={label}
        onChange={e => {
          const key = e.target.value as DateWindowKey;
          // Switching away from custom clears the dates, so a range left behind
          // cannot quietly keep filtering something it no longer describes.
          onChange(key === 'custom' ? { ...value, key } : { key, from: '', to: '' });
        }}
      >
        <option value="any">{label}: all</option>
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="custom">Custom dates</option>
      </select>

      {value.key === 'custom' && (
        <>
          <input
            className="adm-input" type="date" style={{ width: 150 }}
            value={value.from} max={value.to || undefined}
            aria-label={`${label} from`}
            onChange={e => onChange({ ...value, from: e.target.value })}
          />
          <span style={{ fontSize: '.8rem', color: '#8a7f76' }}>to</span>
          <input
            className="adm-input" type="date" style={{ width: 150 }}
            value={value.to} min={value.from || undefined}
            aria-label={`${label} to`}
            onChange={e => onChange({ ...value, to: e.target.value })}
          />
        </>
      )}
    </>
  );
}
