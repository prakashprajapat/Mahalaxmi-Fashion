import Link from 'next/link';
import type { ReactNode, CSSProperties } from 'react';

// The pieces every admin screen is built from.
//
// Thirty-five screens had each grown their own card, their own heading and
// their own idea of grey, because there was nothing shared to reach for — the
// class names twelve of them used were never even given a rule. These are that
// shared thing. A screen converted to them looks like the Dashboard without
// repeating a single style, and the next change to how a card looks happens
// once, here, instead of thirty-five times.
//
// Deliberately plain: no state, no data fetching, no business rules. They must
// be safe to drop into a page without changing what it does.

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="admin-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
      <div>
        <h1>{title}</h1>
        {sub && <p className="admin-page-sub">{sub}</p>}
      </div>
      {right && <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>{right}</div>}
    </div>
  );
}

export function Card({ title, right, children, style }: { title?: string; right?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="adm-card" style={style}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '.75rem' }}>
          {title && <h2 className="adm-card-h">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/** A number worth acting on. `href` or `onClick` makes it a link, which is the
 *  point of it: a count you cannot click is a count you have to go hunting for.
 *  Use `onClick` when the destination is a filter on the page you are already
 *  on — a Link to the same route would not re-run the page's effects. */
export function Stat({ label, value, action, href, onClick, tone }: {
  label: string; value: ReactNode; action?: string; href?: string; onClick?: () => void; tone?: 'green' | 'red';
}) {
  const body = (
    <>
      <div className="adm-stat-l">{label}</div>
      <div className="adm-stat-n" style={tone === 'green' ? { color: '#2e7d32' } : tone === 'red' ? { color: '#c0392b' } : undefined}>
        {value}
      </div>
      {action && <div className="adm-stat-a">{action} →</div>}
    </>
  );
  if (href) return <Link href={href} className="adm-card" style={{ display: 'block' }}>{body}</Link>;
  if (onClick) return (
    <button type="button" onClick={onClick} className="adm-card"
            style={{ display: 'block', textAlign: 'left', cursor: 'pointer', font: 'inherit', width: '100%' }}>
      {body}
    </button>
  );
  return <div className="adm-card">{body}</div>;
}

export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 }) {
  return <div className={cols === 3 ? 'adm-grid-3' : 'adm-grid'} style={{ marginBottom: '.85rem' }}>{children}</div>;
}

/** One line in a list: what it is, a note under it, and something on the right. */
export function Row({ title, sub, right, href, last }: {
  title: ReactNode; sub?: ReactNode; right?: ReactNode; href?: string; last?: boolean;
}) {
  const body = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="adm-row-t" style={{ display: 'block' }}>{title}</span>
        {sub && <span className="adm-row-s" style={{ display: 'block' }}>{sub}</span>}
      </span>
      {right && <span style={{ flexShrink: 0 }}>{right}</span>}
    </>
  );
  const style = last ? { borderBottom: 'none' } : undefined;
  return href
    ? <Link href={href} className="adm-row" style={style}>{body}</Link>
    : <div className="adm-row" style={style}>{body}</div>;
}

export function Pill({ children, tone = 'grey' }: { children: ReactNode; tone?: 'red' | 'amber' | 'green' | 'grey' }) {
  return <span className={`adm-pill adm-pill-${tone}`}>{children}</span>;
}

/** Says what is missing and what to do, never just "No data". */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="adm-empty">{children}</p>;
}

export function Chips({ items, value, onChange }: {
  items: { key: string; label: string; count?: number }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="adm-toolbar">
      {items.map(i => (
        <button key={i.key} type="button" onClick={() => onChange(i.key)}
          className={`adm-chip${value === i.key ? ' on' : ''}`}>
          {i.label}{typeof i.count === 'number' ? ` ${i.count}` : ''}
        </button>
      ))}
    </div>
  );
}
