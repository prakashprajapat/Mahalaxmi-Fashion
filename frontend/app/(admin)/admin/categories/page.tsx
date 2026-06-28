'use client';
import { useState } from 'react';

interface Category {
  id: number;
  name: string;
  icon: string;
  slug: string;
  productCount?: number;
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 1, name: 'Saree', icon: '👗', slug: 'saree', productCount: 0 },
  { id: 2, name: 'Women', icon: '👩', slug: 'women', productCount: 0 },
  { id: 3, name: 'Men', icon: '👔', slug: 'men', productCount: 0 },
  { id: 4, name: 'Nighty', icon: '🌙', slug: 'nighty', productCount: 0 },
  { id: 5, name: 'Petticoat', icon: '👘', slug: 'petticoat', productCount: 0 },
  { id: 6, name: 'Popline', icon: '🧵', slug: 'popline', productCount: 0 },
  { id: 7, name: 'Nighty Cloth', icon: '🪡', slug: 'nighty-cloth', productCount: 0 },
];

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🏷️');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [msg, setMsg] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) { setMsg('Category name is required.'); return; }
    const slug = newName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const newCat: Category = { id: Date.now(), name: newName.trim(), icon: newIcon, slug };
    setCategories(prev => [...prev, newCat]);
    setNewName(''); setNewIcon('🏷️');
    setMsg(`Category "${newName}" added.`);
  };

  const handleEdit = (cat: Category) => {
    setEditId(cat.id); setEditName(cat.name); setEditIcon(cat.icon);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) { setMsg('Name cannot be empty.'); return; }
    setCategories(prev => prev.map(c => c.id === editId ? { ...c, name: editName, icon: editIcon } : c));
    setEditId(null); setMsg('Category updated.');
  };

  const handleDelete = (id: number) => {
    if (!confirm('Delete this category?')) return;
    setCategories(prev => prev.filter(c => c.id !== id));
    setMsg('Category deleted.');
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: '#1a1a1a' }}>Categories</h1>

      {msg && (
        <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '.75rem 1rem', marginBottom: '1rem', fontSize: '.9rem', color: '#2e7d32', display: 'flex', justifyContent: 'space-between' }}>
          {msg} <button onClick={() => setMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2e7d32', fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Add New Category */}
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,.07)', marginBottom: '1.5rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1rem' }}>Add New Category</h2>
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '.82rem', color: '#666', display: 'block', marginBottom: '.3rem' }}>Icon Emoji</label>
            <input value={newIcon} onChange={e => setNewIcon(e.target.value)} style={{ width: '60px', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem', fontSize: '1.2rem', textAlign: 'center' }} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ fontSize: '.82rem', color: '#666', display: 'block', marginBottom: '.3rem' }}>Category Name *</label>
            <input value={newName} onChange={e => { setNewName(e.target.value); setMsg(''); }} placeholder="e.g. Lingerie"
              style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.5rem .75rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
          </div>
          <button onClick={handleAdd}
            style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.6rem 1.25rem', fontSize: '.9rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Add Category
          </button>
        </div>
      </div>

      {/* Categories Table */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
          <thead style={{ background: '#f9f9f9' }}>
            <tr>
              {['Icon', 'Name', 'Slug', 'Products', 'Actions'].map(h => (
                <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '.8rem', color: '#888', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, i) => (
              <tr key={cat.id} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : undefined }}>
                <td style={{ padding: '.75rem 1rem', fontSize: '1.5rem' }}>{cat.icon}</td>
                <td style={{ padding: '.75rem 1rem' }}>
                  {editId === cat.id ? (
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                      <input value={editIcon} onChange={e => setEditIcon(e.target.value)} style={{ width: '44px', border: '1.5px solid #ddd', borderRadius: '6px', padding: '.3rem', fontSize: '1rem', textAlign: 'center' }} />
                      <input value={editName} onChange={e => setEditName(e.target.value)} style={{ border: '1.5px solid #ddd', borderRadius: '6px', padding: '.3rem .6rem', fontSize: '.9rem', flex: 1 }} />
                      <button onClick={handleSaveEdit} style={{ background: '#27ae60', color: '#fff', border: 'none', borderRadius: '6px', padding: '.3rem .75rem', cursor: 'pointer', fontSize: '.82rem' }}>Save</button>
                      <button onClick={() => setEditId(null)} style={{ background: '#eee', color: '#555', border: 'none', borderRadius: '6px', padding: '.3rem .75rem', cursor: 'pointer', fontSize: '.82rem' }}>×</button>
                    </div>
                  ) : (
                    <strong>{cat.name}</strong>
                  )}
                </td>
                <td style={{ padding: '.75rem 1rem', color: '#888', fontFamily: 'monospace', fontSize: '.82rem' }}>{cat.slug}</td>
                <td style={{ padding: '.75rem 1rem', color: '#555' }}>{cat.productCount ?? 0}</td>
                <td style={{ padding: '.75rem 1rem' }}>
                  {editId !== cat.id && (
                    <div style={{ display: 'flex', gap: '.5rem' }}>
                      <button onClick={() => handleEdit(cat)} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '.3rem .6rem', cursor: 'pointer', fontSize: '.82rem', color: '#555' }}>✏️ Edit</button>
                      <button onClick={() => handleDelete(cat.id)} style={{ background: 'none', border: '1px solid #fcc', borderRadius: '6px', padding: '.3rem .6rem', cursor: 'pointer', fontSize: '.82rem', color: '#c0392b' }}>🗑️</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
