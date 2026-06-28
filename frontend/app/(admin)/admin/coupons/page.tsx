'use client';
import { useState, useEffect } from 'react';
import { getAdminToken } from '@/lib/auth';
import { couponsApi } from '@/lib/api';

interface Coupon {
  id: number; code: string; type: string; value: number;
  minOrder: number; maxUses: number | null; usedCount: number;
  expiresAt: string | null; isActive: boolean; createdAt: string;
}

const empty = { code: '', type: 'flat', value: '', minOrder: '0', maxUses: '', expiresAt: '', isActive: true };

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const token = getAdminToken() ?? '';

  const load = async () => {
    setLoading(true);
    try { setCoupons((await couponsApi.list(token)) as Coupon[]); }
    catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => { setForm({ ...empty }); setEditId(null); setMsg(''); };

  const startEdit = (c: Coupon) => {
    setEditId(c.id);
    setForm({
      code: c.code, type: c.type, value: String(c.value),
      minOrder: String(c.minOrder), maxUses: c.maxUses ? String(c.maxUses) : '',
      expiresAt: c.expiresAt ? c.expiresAt.split('T')[0] : '', isActive: c.isActive,
    });
    setMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.value) return setMsg('Code and Value are required.');
    setSaving(true); setMsg('');
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: parseFloat(form.value),
        minOrder: parseFloat(form.minOrder) || 0,
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        isActive: form.isActive,
      };
      if (editId) { await couponsApi.update(editId, payload, token); setMsg('Updated!'); }
      else { await couponsApi.create(payload, token); setMsg('Created!'); }
      resetForm(); await load();
    } catch (e) { setMsg((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number, code: string) => {
    if (!confirm(`Delete coupon "${code}"?`)) return;
    try { await couponsApi.delete(id, token); await load(); }
    catch (e) { alert((e as Error).message); }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1.5rem' }}>🎟️ Coupons & Discounts</h1>

      {/* Form */}
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '1.25rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#a7354d' }}>
          {editId ? 'Edit Coupon' : 'Create New Coupon'}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {[
            { label: 'Code *', key: 'code', type: 'text', placeholder: 'e.g. SAVE10' },
            { label: 'Value *', key: 'value', type: 'number', placeholder: 'e.g. 10' },
            { label: 'Min Order (₹)', key: 'minOrder', type: 'number', placeholder: '0' },
            { label: 'Max Uses', key: 'maxUses', type: 'number', placeholder: 'Unlimited' },
            { label: 'Expires On', key: 'expiresAt', type: 'date', placeholder: '' },
          ].map(({ label, key, type, placeholder }) => (
            <label key={key} style={{ display: 'block', fontSize: '.85rem', fontWeight: 600 }}>
              {label}
              <input type={type} value={(form as Record<string,unknown>)[key] as string}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                style={{ display: 'block', width: '100%', marginTop: '.3rem', border: '1.5px solid #ddd', borderRadius: '7px', padding: '.5rem .75rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
            </label>
          ))}

          <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600 }}>
            Type
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              style={{ display: 'block', width: '100%', marginTop: '.3rem', border: '1.5px solid #ddd', borderRadius: '7px', padding: '.5rem .75rem', fontSize: '.9rem', boxSizing: 'border-box' }}>
              <option value="flat">Flat (₹ off)</option>
              <option value="percent">Percentage (% off)</option>
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem', fontWeight: 600, marginTop: '1.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
            Active
          </label>
        </div>

        {msg && <p style={{ marginTop: '.75rem', color: msg.includes('!') ? '#27ae60' : '#c0392b', fontSize: '.88rem' }}>{msg}</p>}

        <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.25rem' }}>
          <button onClick={handleSave} disabled={saving}
            style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.6rem 1.5rem', fontWeight: 700, cursor: 'pointer' }}>
            {saving ? 'Saving…' : editId ? 'Update Coupon' : 'Create Coupon'}
          </button>
          {editId && (
            <button onClick={resetForm}
              style={{ background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '8px', padding: '.6rem 1rem', cursor: 'pointer' }}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? <p>Loading…</p> : coupons.length === 0 ? (
        <p style={{ color: '#888' }}>No coupons yet. Create your first one above.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
            <thead>
              <tr style={{ background: '#f8f8f8', textAlign: 'left' }}>
                {['Code','Type','Value','Min Order','Uses','Expires','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '.65rem .75rem', fontWeight: 700, borderBottom: '2px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '.6rem .75rem', fontWeight: 700, color: '#a7354d' }}>{c.code}</td>
                  <td style={{ padding: '.6rem .75rem' }}>{c.type === 'percent' ? '%' : '₹'}</td>
                  <td style={{ padding: '.6rem .75rem' }}>{c.type === 'percent' ? `${c.value}%` : `₹${c.value}`}</td>
                  <td style={{ padding: '.6rem .75rem' }}>₹{c.minOrder}</td>
                  <td style={{ padding: '.6rem .75rem' }}>{c.usedCount}{c.maxUses ? `/${c.maxUses}` : ''}</td>
                  <td style={{ padding: '.6rem .75rem' }}>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-IN') : '—'}</td>
                  <td style={{ padding: '.6rem .75rem' }}>
                    <span style={{ background: c.isActive ? '#e8f5e9' : '#fce4e4', color: c.isActive ? '#1b5e20' : '#b71c1c', borderRadius: '20px', padding: '.2rem .7rem', fontSize: '.8rem', fontWeight: 600 }}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '.6rem .75rem' }}>
                    <div style={{ display: 'flex', gap: '.5rem' }}>
                      <button onClick={() => startEdit(c)}
                        style={{ background: '#f0f0f0', border: 'none', borderRadius: '6px', padding: '.3rem .7rem', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600 }}>Edit</button>
                      <button onClick={() => handleDelete(c.id, c.code)}
                        style={{ background: '#fce4e4', color: '#b71c1c', border: 'none', borderRadius: '6px', padding: '.3rem .7rem', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600 }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
