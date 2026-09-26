'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { couponsApi } from '@/lib/api';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';

interface Coupon {
  id: number; code: string; type: string; value: number; occasion: string;
  minOrder: number; maxUses: number | null; usedCount: number;
  expiresAt: string | null; isActive: boolean; createdAt: string;
}

const empty = { code: '', type: 'flat', value: '', occasion: 'none', minOrder: '0', maxUses: '', expiresAt: '', isActive: true };

const OCCASION_LABEL: Record<string, string> = { none: 'Anyone', birthday: 'Birthday', anniversary: 'Anniversary' };

/** A coupon is expired the moment its end-of-day has passed, whatever isActive says. */
const isExpired = (c: Coupon) => Boolean(c.expiresAt && new Date(c.expiresAt) < new Date());
const isUsedUp = (c: Coupon) => Boolean(c.maxUses && c.usedCount >= c.maxUses);

/** The one sentence that says what a coupon actually does. */
function inWords(f: typeof empty): string {
  const v = parseFloat(f.value);
  if (!f.code.trim() || !v) return 'Fill in a code and a value to see what this coupon will do.';
  const off = f.type === 'percent' ? `${v}% off` : `₹${v} off`;
  const min = parseFloat(f.minOrder) > 0 ? ` on orders over ₹${parseFloat(f.minOrder).toLocaleString('en-IN')}` : '';
  const who = f.occasion === 'none' ? '' : ` — only in the customer's ${f.occasion} month`;
  const uses = f.maxUses ? `, usable ${f.maxUses} time${Number(f.maxUses) === 1 ? '' : 's'} in total` : '';
  const till = f.expiresAt ? `, until the end of ${new Date(f.expiresAt + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}` : ', with no end date';
  return `${f.code.trim().toUpperCase()} gives ${off}${min}${who}${uses}${till}.`;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [tab, setTab] = useState('live');

  const load = async () => {
    setLoading(true);
    try { setCoupons((await couponsApi.list(getAdminToken() ?? '')) as Coupon[]); }
    catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => { setForm({ ...empty }); setEditId(null); setMsg(null); };

  const startEdit = (c: Coupon) => {
    setEditId(c.id);
    setForm({
      code: c.code, type: c.type, value: String(c.value), occasion: c.occasion ?? 'none',
      minOrder: String(c.minOrder), maxUses: c.maxUses ? String(c.maxUses) : '',
      expiresAt: c.expiresAt ? c.expiresAt.split('T')[0] : '', isActive: c.isActive,
    });
    setMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.value) { setMsg({ kind: 'err', text: 'A code and a value are needed.' }); return; }
    const val = parseFloat(form.value);
    if (!val || val <= 0) { setMsg({ kind: 'err', text: 'The value has to be more than zero.' }); return; }
    if (form.type === 'percent' && val > 100) { setMsg({ kind: 'err', text: 'A percentage discount cannot be more than 100%.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: val,
        occasion: form.occasion,
        minOrder: parseFloat(form.minOrder) || 0,
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        // End of the chosen day, in local time. Set as UTC midnight, a coupon
        // marked "expires 31 Aug" stopped working at half past five that morning.
        expiresAt: form.expiresAt ? new Date(form.expiresAt + 'T23:59:59').toISOString() : null,
        isActive: form.isActive,
      };
      if (editId) await couponsApi.update(editId, payload, getAdminToken() ?? '');
      else await couponsApi.create(payload, getAdminToken() ?? '');
      // resetForm clears the message, so the message is set after it, not before.
      const said = `${payload.code} ${editId ? 'updated' : 'created'}.`;
      resetForm();
      setMsg({ kind: 'ok', text: said });
      await load();
    } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number, code: string) => {
    if (!confirm(`Delete coupon "${code}"? Anyone typing it will be told it does not exist.`)) return;
    try { await couponsApi.delete(id, getAdminToken() ?? ''); await load(); }
    catch (e) { alert((e as Error).message); }
  };

  const groupOf = (c: Coupon) => {
    if (isExpired(c)) return 'expired';
    if (isUsedUp(c)) return 'usedup';
    if (!c.isActive) return 'off';
    return 'live';
  };

  const counts: Record<string, number> = { all: coupons.length };
  coupons.forEach(c => { const k = groupOf(c); counts[k] = (counts[k] ?? 0) + 1; });

  const shown = coupons.filter(c => tab === 'all' || groupOf(c) === tab);
  const redemptions = coupons.reduce((s, c) => s + c.usedCount, 0);

  return (
    <div className="admin-page">
      <PageHeader
        title="Coupons"
        sub="A coupon works the moment it is live. Nothing here is announced to anyone — you still have to tell customers the code."
        right={editId ? <button className="adm-btn" onClick={resetForm}>Cancel edit</button> : undefined}
      />

      <StatGrid>
        <Stat label="Working right now" value={counts.live ?? 0} tone="green"
              action={tab === 'live' ? undefined : 'Show these'} onClick={() => setTab('live')} />
        <Stat label="Times used" value={redemptions} />
        <Stat label="Expired" value={counts.expired ?? 0}
              action={(counts.expired ?? 0) > 0 && tab !== 'expired' ? 'Show these' : undefined}
              onClick={() => setTab('expired')} />
        <Stat label="Used up" value={counts.usedup ?? 0}
              action={(counts.usedup ?? 0) > 0 && tab !== 'usedup' ? 'Show these' : undefined}
              onClick={() => setTab('usedup')} />
      </StatGrid>

      <Card title={editId ? 'Edit this coupon' : 'New coupon'}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '.7rem' }}>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Code *</span>
            <input className="adm-input" style={{ width: '100%', marginTop: '.2rem', textTransform: 'uppercase' }}
                   placeholder="SAVE10" value={form.code}
                   onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Flat ₹ or percent</span>
            <select className="adm-input" style={{ width: '100%', marginTop: '.2rem' }}
                    value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="flat">₹ off</option>
              <option value="percent">% off</option>
            </select>
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Value *</span>
            <input className="adm-input" type="number" style={{ width: '100%', marginTop: '.2rem' }}
                   placeholder={form.type === 'percent' ? '10' : '100'} value={form.value}
                   onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Smallest order (₹)</span>
            <input className="adm-input" type="number" style={{ width: '100%', marginTop: '.2rem' }}
                   placeholder="0" value={form.minOrder}
                   onChange={e => setForm(f => ({ ...f, minOrder: e.target.value }))} />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Total uses allowed</span>
            <input className="adm-input" type="number" style={{ width: '100%', marginTop: '.2rem' }}
                   placeholder="No limit" value={form.maxUses}
                   onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Last day</span>
            <input className="adm-input" type="date" style={{ width: '100%', marginTop: '.2rem' }}
                   value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Who can use it</span>
            <select className="adm-input" style={{ width: '100%', marginTop: '.2rem' }}
                    value={form.occasion} onChange={e => setForm(f => ({ ...f, occasion: e.target.value }))}>
              <option value="none">Anyone</option>
              <option value="birthday">Only in their birthday month</option>
              <option value="anniversary">Only in their anniversary month</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.84rem', fontWeight: 700, color: '#463d38', cursor: 'pointer', alignSelf: 'end', paddingBottom: '.5rem' }}>
            <input type="checkbox" checked={form.isActive}
                   onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
            Live
          </label>
        </div>

        {/* Six boxes are hard to read back. One sentence is not. */}
        <p style={{ background: '#fbf9f8', border: '1px solid #f0eae7', borderRadius: 10, padding: '.6rem .8rem',
                    fontSize: '.84rem', color: '#463d38', margin: '.8rem 0 0', lineHeight: 1.55 }}>
          {inWords(form)}
        </p>
        {form.occasion !== 'none' && (
          <p style={{ fontSize: '.78rem', color: '#9a908a', margin: '.4rem 0 0' }}>
            Using a birthday or anniversary coupon locks that date on the customer&apos;s profile, so it cannot be
            changed afterwards to claim it twice.
          </p>
        )}

        {msg && (
          <p style={{ marginTop: '.7rem', fontSize: '.85rem', fontWeight: 700,
                      color: msg.kind === 'ok' ? '#2e7d32' : '#c0392b' }}>{msg.text}</p>
        )}

        <div style={{ display: 'flex', gap: '.55rem', marginTop: '.9rem' }}>
          <button className="adm-btn adm-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editId ? 'Update coupon' : 'Create coupon'}
          </button>
          {editId && <button className="adm-btn" onClick={resetForm}>Cancel</button>}
        </div>
      </Card>

      <Card title={`${shown.length} ${shown.length === 1 ? 'coupon' : 'coupons'}`}>
        <Chips value={tab} onChange={setTab}
               items={[
                 { key: 'live', label: 'Working', count: counts.live ?? 0 },
                 { key: 'off', label: 'Switched off', count: counts.off ?? 0 },
                 { key: 'expired', label: 'Expired', count: counts.expired ?? 0 },
                 { key: 'usedup', label: 'Used up', count: counts.usedup ?? 0 },
                 { key: 'all', label: 'All', count: coupons.length },
               ]} />
        {loading ? (
          <Empty>Loading coupons…</Empty>
        ) : shown.length === 0 ? (
          <Empty>{coupons.length === 0 ? 'No coupons yet. Make your first one above.' : 'Nothing in this group.'}</Empty>
        ) : shown.map(c => {
          const expired = isExpired(c);
          const usedUp = isUsedUp(c);
          const dead = expired || usedUp || !c.isActive;
          return (
            <div key={c.id} className="adm-item" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', opacity: dead ? .7 : 1 }}>
              <div style={{ minWidth: 0 }}>
                <div className="adm-item-t" style={{ display: 'flex', gap: '.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#722f37', letterSpacing: '.03em' }}>{c.code}</span>
                  {expired ? <Pill tone="grey">Expired</Pill>
                    : usedUp ? <Pill tone="grey">Used up</Pill>
                    : !c.isActive ? <Pill tone="amber">Switched off</Pill>
                    : <Pill tone="green">Working</Pill>}
                  {c.occasion !== 'none' && <Pill tone="grey">{OCCASION_LABEL[c.occasion] ?? c.occasion}</Pill>}
                </div>
                <div className="adm-item-s">
                  {c.type === 'percent' ? `${c.value}% off` : `₹${c.value} off`}
                  {c.minOrder > 0 ? ` · over ₹${c.minOrder.toLocaleString('en-IN')}` : ''}
                  {' · used '}{c.usedCount}{c.maxUses ? ` of ${c.maxUses}` : ' times'}
                  {c.expiresAt ? ` · till ${new Date(c.expiresAt).toLocaleDateString('en-IN')}` : ' · no end date'}
                </div>
                <div className="adm-actions" style={{ marginTop: '.35rem' }}>
                  <button onClick={() => startEdit(c)}>Edit</button>
                  <button onClick={() => handleDelete(c.id, c.code)} style={{ color: '#c0392b' }}>Delete</button>
                </div>
              </div>
              <div />
            </div>
          );
        })}
      </Card>
    </div>
  );
}
