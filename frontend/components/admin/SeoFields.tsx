'use client';
import { useMemo } from 'react';

// The shared parts of the three SEO editors.
//
// The Google preview is the point of this file. Writing a meta title blind —
// into a plain text box, with no idea where Google stops reading — is how
// titles end up cut off mid-word, and it is not something you can learn from a
// character count alone. Showing the result as it will appear turns it into
// something anyone can get right on the first try.

export const TITLE_LIMIT = 60;
export const DESC_LIMIT = 160;

const SITE = 'www.mahalaxmifashionhub.com';

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  // Cut at the last space so the preview breaks where Google would, not mid-word.
  const cut = s.slice(0, n);
  const space = cut.lastIndexOf(' ');
  return (space > n * 0.6 ? cut.slice(0, space) : cut) + '…';
}

export function GooglePreview({ title, description, path }: { title: string; description: string; path: string }) {
  const t = title.trim() || 'Untitled page';
  const d = description.trim();

  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '1rem 1.1rem' }}>
      <div style={{ fontSize: '.7rem', color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.6rem' }}>
        How this looks on Google
      </div>
      <div style={{ fontFamily: 'arial, sans-serif' }}>
        <div style={{ fontSize: '.78rem', color: '#202124', marginBottom: '.15rem' }}>
          {SITE}<span style={{ color: '#5f6368' }}> › {path.replace(/^\//, '') || ''}</span>
        </div>
        <div style={{ fontSize: '1.15rem', color: '#1a0dab', lineHeight: 1.3, marginBottom: '.2rem' }}>
          {truncate(t, TITLE_LIMIT)}
        </div>
        <div style={{ fontSize: '.86rem', color: '#4d5156', lineHeight: 1.45 }}>
          {d ? truncate(d, DESC_LIMIT) : <span style={{ color: '#bbb' }}>Google will pick a sentence from the page itself.</span>}
        </div>
      </div>
      {(title.length > TITLE_LIMIT || description.length > DESC_LIMIT) && (
        <p style={{ margin: '.7rem 0 0', fontSize: '.78rem', color: '#c26a12' }}>
          The … above is where Google stops. Everything after it is written for nobody.
        </p>
      )}
    </div>
  );
}

export function Counter({ value, limit }: { value: string; limit: number }) {
  const n = value.length;
  const colour = n === 0 ? '#bbb' : n > limit ? '#c0392b' : n > limit * 0.85 ? '#c26a12' : '#888';
  return (
    <span style={{ fontSize: '.72rem', color: colour, fontWeight: n > limit ? 700 : 400 }}>
      {n}/{limit}
    </span>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  fontSize: '.74rem', fontWeight: 800, color: '#7d736d', marginBottom: '.3rem',
};

const boxStyle: React.CSSProperties = {
  width: '100%', border: '1px solid #e5dcdd', borderRadius: 10,
  padding: '.55rem .7rem', fontSize: '.85rem', fontFamily: 'inherit',
  background: '#fff', color: '#2d2724',
};

export function Field({
  label, value, onChange, limit, placeholder, hint, rows, mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  limit?: number;
  placeholder?: string;
  hint?: string;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <div style={{ marginBottom: '.9rem' }}>
      <div style={labelStyle}>
        <span>{label}</span>
        {limit ? <Counter value={value} limit={limit} /> : null}
      </div>
      {rows ? (
        <textarea
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{ ...boxStyle, resize: 'vertical', fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }}
        />
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{ ...boxStyle, fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }}
        />
      )}
      {hint && <p style={{ margin: '.25rem 0 0', fontSize: '.74rem', color: '#999' }}>{hint}</p>}
    </div>
  );
}

export function Paragraphs({ value, onChange, label = 'Intro paragraphs' }: {
  value: string[];
  onChange: (v: string[]) => void;
  label?: string;
}) {
  const text = useMemo(() => value.join('\n\n'), [value]);
  return (
    <Field
      label={label}
      value={text}
      rows={6}
      hint="Leave a blank line between paragraphs. This is the text that appears on the page itself — write it for a shopper, not for Google."
      onChange={v => onChange(v.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean))}
    />
  );
}

export interface Faq { q: string; a: string }

export function Faqs({ value, onChange }: { value: Faq[]; onChange: (v: Faq[]) => void }) {
  const set = (i: number, patch: Partial<Faq>) =>
    onChange(value.map((f, k) => (k === i ? { ...f, ...patch } : f)));

  return (
    <div style={{ marginBottom: '.9rem' }}>
      <div style={labelStyle}>
        <span>Questions &amp; answers</span>
        <span style={{ fontSize: '.72rem', color: '#888' }}>{value.length}</span>
      </div>
      <p style={{ margin: '0 0 .5rem', fontSize: '.74rem', color: '#999' }}>
        Real questions customers ask you on WhatsApp work best. Google can show these directly in the search result.
      </p>

      {value.map((f, i) => (
        <div key={i} style={{ border: '1px solid #f0eae7', borderRadius: 10, padding: '.6rem .7rem', marginBottom: '.5rem', background: '#fbf9f8' }}>
          <input
            value={f.q}
            placeholder="Question"
            onChange={e => set(i, { q: e.target.value })}
            style={{ ...boxStyle, marginBottom: '.4rem', fontWeight: 600 }}
          />
          <textarea
            value={f.a}
            rows={2}
            placeholder="Answer"
            onChange={e => set(i, { a: e.target.value })}
            style={{ ...boxStyle, resize: 'vertical' }}
          />
          <button
            onClick={() => onChange(value.filter((_, k) => k !== i))}
            style={{ marginTop: '.4rem', background: 'none', border: 'none', color: '#c0392b', fontSize: '.76rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        className="adm-btn"
        onClick={() => onChange([...value, { q: '', a: '' }])}
        style={{ borderStyle: 'dashed' }}
      >
        Add a question
      </button>
    </div>
  );
}

/** The six SEO screens all reach for this, so it is the one place their buttons
 *  are decided. It matches .adm-btn from globals.css rather than inventing a
 *  second maroon. */
export const btn = (kind: 'primary' | 'ghost' | 'danger' = 'primary'): React.CSSProperties => ({
  background: kind === 'primary' ? '#722f37' : '#fff',
  color: kind === 'primary' ? '#fff' : kind === 'danger' ? '#c0392b' : '#463d38',
  border: kind === 'primary' ? '1px solid #722f37' : '1px solid #e5dcdd',
  borderRadius: 10,
  padding: '.5rem .95rem',
  fontSize: '.8rem',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});
