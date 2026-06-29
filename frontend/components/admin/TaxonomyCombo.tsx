'use client';
import { useEffect, useState } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  baseOptions: string[];                  // predefined (taxonomy) options
  storageKey: string;                     // localStorage namespace for custom + deleted entries
  canDelete?: (name: string) => boolean;  // whether an item may be deleted (default: always)
  disabled?: boolean;
  placeholder?: string;
  inpStyle?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
}

// Searchable combo box: type to filter, add custom entries, delete entries.
// Custom additions and deletions persist in localStorage per `storageKey`.
export default function TaxonomyCombo({
  label, value, onChange, baseOptions, storageKey,
  canDelete = () => true, disabled = false, placeholder, inpStyle, labelStyle,
}: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [custom, setCustom] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);

  useEffect(() => { setText(value); }, [value]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setCustom(JSON.parse(localStorage.getItem(`mfh_combo_custom_${storageKey}`) ?? '[]'));
      setDeleted(JSON.parse(localStorage.getItem(`mfh_combo_deleted_${storageKey}`) ?? '[]'));
    } catch { /* ignore */ }
  }, [storageKey]);

  const persist = (c: string[], d: string[]) => {
    setCustom(c); setDeleted(d);
    try {
      localStorage.setItem(`mfh_combo_custom_${storageKey}`, JSON.stringify(c));
      localStorage.setItem(`mfh_combo_deleted_${storageKey}`, JSON.stringify(d));
    } catch { /* ignore */ }
  };

  const all = [...new Set([...baseOptions, ...custom])].filter(o => !deleted.includes(o));
  const q = text.trim().toLowerCase();
  const filtered = q ? all.filter(o => o.toLowerCase().includes(q)) : all;
  const exactExists = all.some(o => o.toLowerCase() === q);

  const pick = (o: string) => { onChange(o); setText(o); setOpen(false); };
  const add = () => {
    const v = text.trim();
    if (!v || exactExists) return;
    persist([...custom, v], deleted.filter(x => x.toLowerCase() !== v.toLowerCase()));
    onChange(v); setOpen(false);
  };
  const del = (o: string) => {
    persist(custom.filter(c => c !== o), [...new Set([...deleted, o])]);
    if (value === o) { onChange(''); setText(''); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={e => { setText(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          style={{ ...inpStyle, width: '100%', boxSizing: 'border-box' }}
        />
        {open && !disabled && (filtered.length > 0 || (!!q && !exactExists)) && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1.5px solid #ddd', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 200, maxHeight: 220, overflowY: 'auto' }}>
            {!!q && !exactExists && (
              <div onMouseDown={e => { e.preventDefault(); add(); }}
                style={{ padding: '.48rem .75rem', cursor: 'pointer', color: '#a7354d', fontWeight: 700, fontSize: '.85rem', borderBottom: '1px solid #f5f5f5' }}>
                ➕ Add &ldquo;{text.trim()}&rdquo;
              </div>
            )}
            {filtered.map(o => (
              <div key={o} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.45rem .75rem', borderBottom: '1px solid #f5f5f5', background: value === o ? '#fdf0f3' : '#fff' }}>
                <span onMouseDown={e => { e.preventDefault(); pick(o); }}
                  style={{ flex: 1, cursor: 'pointer', fontSize: '.85rem', fontWeight: value === o ? 700 : 400, color: value === o ? '#a7354d' : '#333' }}>
                  {o}
                </span>
                {canDelete(o) && (
                  <button type="button" title="Delete from list"
                    onMouseDown={e => { e.preventDefault(); del(o); }}
                    style={{ background: '#fdecea', border: 'none', borderRadius: 4, color: '#c0392b', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer', padding: '.15rem .45rem', marginLeft: '.5rem' }}>
                    🗑
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
