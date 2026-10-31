'use client';
import { useEffect, useRef, useState } from 'react';

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
  // Renaming the name in this list is only half a rename: the value that the
  // website actually reads sits on every product row. Pass this and the combo
  // will move the products too (merge = rename onto a name that exists).
  onRename?: (from: string, to: string) => Promise<void> | void;
  // How many products still carry this name. Used to refuse a delete that
  // would orphan products, and to warn before a rename or merge.
  countUsers?: (name: string) => Promise<number>;
}

const ADD_SENTINEL = ' __ADD__';

// Searchable combo box: type to filter, add custom entries, rename, merge and
// delete entries. Full keyboard support: ↑/↓ to move, Enter/Tab to select,
// Esc to close. Custom additions and deletions persist in localStorage per
// `storageKey`; renames and merges go to the server when `onRename` is given.
export default function TaxonomyCombo({
  label, value, onChange, baseOptions, storageKey,
  canDelete = () => true, disabled = false, placeholder, inpStyle, labelStyle,
  onRename, countUsers,
}: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [custom, setCustom] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Row-level editing state. While one of these is set the dropdown must stay
  // open: clicking into the little edit box blurs the main input, and the old
  // blur handler would have closed the list out from under the click.
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeTo, setMergeTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const rowOpenRef = useRef(false);
  rowOpenRef.current = editing !== null || merging !== null;

  useEffect(() => { setText(value); }, [value]);
  // Reset the highlighted row whenever the query or open-state changes
  useEffect(() => { setActive(0); }, [text, open]);

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
  const showAdd = !!q && !exactExists;
  // Flat list the keyboard walks through: optional "Add …" row, then the filtered options
  const options = showAdd ? [ADD_SENTINEL, ...filtered] : filtered;

  const closeRow = () => { setEditing(null); setMerging(null); setMergeTo(''); };

  const pick = (o: string) => { onChange(o); setText(o); setOpen(false); };
  const add = () => {
    const v = text.trim();
    if (!v || exactExists) return;
    persist([...custom, v], deleted.filter(x => x.toLowerCase() !== v.toLowerCase()));
    onChange(v); setOpen(false);
  };

  // Delete only removes the NAME from this list — it never touches products.
  // So a name that products still carry must not be deletable: those products
  // would keep a subcategory that no longer appears anywhere, which is exactly
  // how a stray page ends up live on the website with nothing pointing at it.
  const del = async (o: string) => {
    setNotice(null);
    if (countUsers) {
      setBusy(o);
      try {
        const n = await countUsers(o);
        if (n > 0) {
          setNotice({ kind: 'warn', text: `${n} product${n === 1 ? '' : 's'} still use “${o}”. Merge it into another subcategory instead of deleting it.` });
          return;
        }
      } catch { /* if the check cannot run, fall through and just hide the name */ }
      finally { setBusy(null); }
    }
    persist(custom.filter(c => c !== o), [...new Set([...deleted, o])]);
    if (value === o) { onChange(''); setText(''); }
  };

  // Rename and merge are the same operation: merge is a rename onto a name
  // that already exists. The server moves the products; this only fixes up the
  // local list afterwards.
  const applyRename = async (from: string, toRaw: string) => {
    const to = toRaw.trim();
    setNotice(null);
    if (!to || to === from) { closeRow(); return; }
    setBusy(from);
    try {
      if (onRename) await onRename(from, to);
      const nextCustom = [...new Set([
        ...custom.filter(c => c !== from),
        ...(baseOptions.includes(to) ? [] : [to]),
      ])];
      // A name that came from the fixed taxonomy cannot be removed from it, so
      // hide it instead; a name the shop added is simply dropped.
      const nextDeleted = [...new Set([
        ...deleted,
        ...(baseOptions.includes(from) ? [from] : []),
      ])].filter(x => x !== to);
      persist(nextCustom, nextDeleted);
      if (value === from) { onChange(to); setText(to); }
      setNotice({ kind: 'ok', text: `“${from}” → “${to}” done.` });
      closeRow();
    } catch (e) {
      setNotice({ kind: 'warn', text: (e as Error).message || 'Could not rename.' });
    } finally {
      setBusy(null);
    }
  };

  const choose = (idx: number) => {
    const o = options[idx];
    if (o === undefined) return;
    if (o === ADD_SENTINEL) add();
    else pick(o);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive(a => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && options.length > 0) { e.preventDefault(); choose(active); }
    } else if (e.key === 'Tab') {
      // Select the highlighted option, then let focus move to the next field
      if (open && options.length > 0) choose(active);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const dropdownVisible = (open || rowOpenRef.current) && !disabled && (options.length > 0 || !!notice);
  const listId = 'taxcombo-' + (label || 'field').replace(/\s+/g, '-').toLowerCase();

  const actionBtn = (bg: string, fg: string): React.CSSProperties => ({
    background: bg, border: 'none', borderRadius: 4, color: fg,
    fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
    padding: '.15rem .45rem', marginLeft: '.3rem', whiteSpace: 'nowrap',
  });
  const smallInput: React.CSSProperties = {
    flex: 1, fontSize: '.85rem', padding: '.25rem .4rem',
    border: '1.5px solid #a7354d', borderRadius: 4, minWidth: 0,
  };

  return (
    <div style={{ position: 'relative' }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={dropdownVisible}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={e => { setText(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => { if (!rowOpenRef.current) setOpen(false); }, 180)}
          style={{ ...inpStyle, width: '100%', boxSizing: 'border-box' }}
        />
        {dropdownVisible && (
          <div ref={listRef} id={listId} role="listbox" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1.5px solid #ddd', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 200, maxHeight: 260, overflowY: 'auto' }}>
            {notice && (
              <div role="status" onMouseDown={e => e.preventDefault()}
                style={{ padding: '.45rem .75rem', fontSize: '.78rem', lineHeight: 1.4, borderBottom: '1px solid #f0f0f0',
                  background: notice.kind === 'warn' ? '#fff6e5' : '#eaf7ee',
                  color: notice.kind === 'warn' ? '#8a4b00' : '#1b5e20' }}>
                {notice.text}
              </div>
            )}
            {options.map((o, idx) => {
              const isActive = idx === active;
              if (o === ADD_SENTINEL) {
                return (
                  <div key="__add__" onMouseDown={e => { e.preventDefault(); add(); }}
                    onMouseEnter={() => setActive(idx)}
                    style={{ padding: '.48rem .75rem', cursor: 'pointer', color: '#a7354d', fontWeight: 700, fontSize: '.85rem', borderBottom: '1px solid #f5f5f5', background: isActive ? '#fdf0f3' : '#fff' }}>
                    Add &ldquo;{text.trim()}&rdquo;
                  </div>
                );
              }

              if (editing === o) {
                return (
                  <div key={o} onMouseDown={e => e.preventDefault()}
                    style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.4rem .5rem', borderBottom: '1px solid #f5f5f5', background: '#fdf0f3' }}>
                    <input autoFocus value={editText} style={smallInput}
                      onMouseDown={e => e.stopPropagation()}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); void applyRename(o, editText); }
                        else if (e.key === 'Escape') { e.preventDefault(); closeRow(); }
                      }} />
                    <button type="button" disabled={busy === o} style={actionBtn('#eaf7ee', '#1b5e20')}
                      onMouseDown={e => { e.preventDefault(); void applyRename(o, editText); }}>
                      {busy === o ? '…' : 'Save'}
                    </button>
                    <button type="button" style={actionBtn('#f1f1f1', '#555')}
                      onMouseDown={e => { e.preventDefault(); closeRow(); }}>Cancel</button>
                  </div>
                );
              }

              if (merging === o) {
                const targets = all.filter(x => x !== o);
                return (
                  <div key={o} onMouseDown={e => e.preventDefault()}
                    style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.4rem .5rem', borderBottom: '1px solid #f5f5f5', background: '#fdf0f3' }}>
                    <span style={{ fontSize: '.78rem', color: '#555', whiteSpace: 'nowrap' }}>Merge into</span>
                    <select value={mergeTo} style={{ ...smallInput, padding: '.22rem .3rem' }}
                      onMouseDown={e => e.stopPropagation()}
                      onChange={e => setMergeTo(e.target.value)}>
                      <option value="">Choose…</option>
                      {targets.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button type="button" disabled={!mergeTo || busy === o} style={actionBtn('#eaf7ee', '#1b5e20')}
                      onMouseDown={e => { e.preventDefault(); if (mergeTo) void applyRename(o, mergeTo); }}>
                      {busy === o ? '…' : 'Merge'}
                    </button>
                    <button type="button" style={actionBtn('#f1f1f1', '#555')}
                      onMouseDown={e => { e.preventDefault(); closeRow(); }}>Cancel</button>
                  </div>
                );
              }

              return (
                <div key={o} onMouseEnter={() => setActive(idx)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.45rem .75rem', borderBottom: '1px solid #f5f5f5', background: isActive ? '#fdf0f3' : (value === o ? '#faf0f3' : '#fff') }}>
                  <span onMouseDown={e => { e.preventDefault(); pick(o); }}
                    style={{ flex: 1, cursor: 'pointer', fontSize: '.85rem', fontWeight: value === o ? 700 : 400, color: value === o ? '#a7354d' : '#333' }}>
                    {o}
                  </span>
                  <button type="button" title="Rename this subcategory" aria-label={`Rename ${o}`}
                    onMouseDown={e => { e.preventDefault(); setNotice(null); setMerging(null); setEditing(o); setEditText(o); }}
                    style={actionBtn('#eef3fb', '#1a4a7a')}>Modify</button>
                  <button type="button" title="Merge into another subcategory" aria-label={`Merge ${o}`}
                    onMouseDown={e => { e.preventDefault(); setNotice(null); setEditing(null); setMergeTo(''); setMerging(o); }}
                    style={actionBtn('#f4eefb', '#5b2d86')}>Merge</button>
                  {canDelete(o) && (
                    <button type="button" title="Remove from this list" aria-label={`Delete ${o}`}
                      disabled={busy === o}
                      onMouseDown={e => { e.preventDefault(); void del(o); }}
                      style={actionBtn('#fdecea', '#b02a1c')}>
                      {busy === o ? '…' : 'Delete'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
