'use client';
import { useState, useEffect } from 'react';
import { authApi, staffApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Pill } from '@/components/admin/Ui';

// Every section a staff account can be given, keyed by the first part of its
// /admin/<key> route. A section missing from this list cannot be granted at
// all, so it stays invisible to staff for ever — eight of them were missing,
// which is why nobody could be given the ad or lead screens.
//
// `enforced` marks the sections the SERVER also refuses, via [RequirePerm] on
// the controller. For the rest, unticking the box only takes the link out of
// the menu: someone who knows the address can still open the page and the API
// will answer them. That is worth knowing before handing out a login, so the
// page says it rather than implying a lock that is not there.
const ENFORCED = new Set([
  'orders', 'products', 'customers', 'reviews', 'reconcile',
  'settings', 'suppliers', 'popup-leads', 'campaigns', 'birthday',
]);

const SECTIONS: { key: string; label: string; group: string }[] = [
  { key: 'orders',        label: 'Orders',                 group: 'Sales' },
  { key: 'risk',          label: 'Fraud & risk',           group: 'Sales' },
  { key: 'products',      label: 'Products / Add product', group: 'Catalogue' },
  { key: 'stock',         label: 'Stock',                  group: 'Catalogue' },
  { key: 'categories',    label: 'Categories',             group: 'Catalogue' },
  { key: 'customers',     label: 'Customers',              group: 'Customers' },
  { key: 'reviews',       label: 'Reviews',                group: 'Customers' },
  { key: 'suppliers',     label: 'Seller applications',    group: 'Customers' },
  { key: 'meta-leads',    label: 'Meta ad leads',          group: 'Marketing' },
  { key: 'google-leads',  label: 'Google ad leads',        group: 'Marketing' },
  { key: 'google-ads',    label: 'Google Ads',             group: 'Marketing' },
  { key: 'meta-ads',      label: 'Meta Ads',               group: 'Marketing' },
  { key: 'audiences',     label: 'Audiences',              group: 'Marketing' },
  { key: 'popup-leads',   label: 'Popup leads',            group: 'Marketing' },
  { key: 'campaigns',     label: 'Bulk SMS',               group: 'Marketing' },
  { key: 'notifications', label: 'Push notifications',     group: 'Marketing' },
  { key: 'influencers',   label: 'Influencer marketing',   group: 'Marketing' },
  { key: 'coupons',       label: 'Coupons',                group: 'Marketing' },
  { key: 'birthday',      label: 'Birthday & anniversary', group: 'Marketing' },
  { key: 'seo',           label: 'SEO (all six screens)',  group: 'SEO' },
  { key: 'reports',       label: 'Reports & GSTR-1',       group: 'Accounts' },
  { key: 'reconcile',     label: 'Payment reconcile',      group: 'Accounts' },
  { key: 'staff',         label: 'Staff management',       group: 'Settings' },
  { key: 'settings',      label: 'Settings',               group: 'Settings' },
];

const GROUPS = [...new Set(SECTIONS.map(s => s.group))];

// The owner row, shown first. Real staff come from the staff_members table.
const ADMIN_ENTRY = {
  id: 0, name: 'Admin (owner)', username: 'admin',
  email: 'admin@mahalaxmifashionhub.com', role: 'admin', lastLogin: '—', isActive: true,
};

/** The permission checkboxes, grouped — used by both the create form and the edit dialog. */
function PermissionPicker({ chosen, toggle, setAll }: {
  chosen: string[];
  toggle: (key: string) => void;
  setAll: (keys: string[]) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className="adm-stat-l">Which sections can they use?</span>
        <span style={{ display: 'flex', gap: '.55rem' }}>
          <button type="button" className="adm-btn" style={{ padding: '.25rem .6rem', fontSize: '.73rem' }}
                  onClick={() => setAll(SECTIONS.map(s => s.key))}>Everything</button>
          <button type="button" className="adm-btn" style={{ padding: '.25rem .6rem', fontSize: '.73rem' }}
                  onClick={() => setAll([])}>Nothing</button>
        </span>
      </div>
      {GROUPS.map(group => (
        <div key={group} style={{ marginTop: '.6rem' }}>
          <div style={{ fontSize: '.71rem', fontWeight: 800, color: '#a49a94', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            {group}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: '.3rem .75rem', marginTop: '.25rem' }}>
            {SECTIONS.filter(s => s.group === group).map(sec => (
              <label key={sec.key} style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.84rem', cursor: 'pointer', color: '#463d38' }}>
                <input type="checkbox" checked={chosen.includes(sec.key)} onChange={() => toggle(sec.key)} />
                <span>
                  {sec.label}
                  {ENFORCED.has(sec.key) && (
                    <span style={{ color: '#a49a94', fontSize: '.73rem', fontWeight: 700 }} title="The server refuses this section too, not just the menu"> · locked</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <p style={{ fontSize: '.76rem', color: '#9a908a', margin: '.6rem 0 0', lineHeight: 1.65 }}>
        The menu shows them only the ticked sections, and the Dashboard is always visible. A section marked
        <strong style={{ color: '#7d736d' }}> · locked</strong> is also refused by the server, so unticking it
        really does shut the door. The others are only taken out of the menu — someone who knows the web address
        can still open those pages. So treat an unticked box as “not their job”, not as a lock, and tick Staff
        management only for someone you would trust to create logins.
      </p>
    </div>
  );
}

export default function AdminStaffPage() {
  const [extraStaff, setExtraStaff] = useState<any[]>([]);
  const [staffForm, setStaffForm] = useState({ name: '', username: '', password: '', role: 'staff', permissions: [] as string[] });
  const [pwForm, setPwForm] = useState({ newPassword: '', confirmPassword: '' });

  // Two separate messages. They used to share one, and it was printed under both
  // forms — so creating a staff account said "Staff account created" underneath
  // Change Admin Password, and changing the password said so under Add Staff.
  const [staffMsg, setStaffMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [editStaff, setEditStaff] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: 'staff', permissions: [] as string[] });
  const [editMsg, setEditMsg] = useState('');

  const togglePerm = (key: string) => setStaffForm(f => ({
    ...f,
    permissions: f.permissions.includes(key) ? f.permissions.filter(k => k !== key) : [...f.permissions, key],
  }));
  const toggleEditPerm = (key: string) => setEditForm(f => ({
    ...f,
    permissions: f.permissions.includes(key) ? f.permissions.filter(k => k !== key) : [...f.permissions, key],
  }));

  const refresh = () => { staffApi.list(getAdminToken() ?? '').then(setExtraStaff).catch(() => {}); };
  useEffect(() => { refresh(); }, []);

  const allStaff = [ADMIN_ENTRY, ...extraStaff];

  const openEdit = (s: any) => {
    setEditMsg('');
    setEditForm({
      name: s.name || '',
      role: s.role === 'manager' ? 'manager' : 'staff',
      permissions: (s.permissions || '').split(',').map((p: string) => p.trim()).filter(Boolean),
    });
    setEditStaff(s);
  };

  const handleSaveEdit = async () => {
    if (!editStaff) return;
    if (!editForm.name.trim()) { setEditMsg('A name is needed.'); return; }
    setSaving(true); setEditMsg('');
    try {
      await staffApi.update(editStaff.id, {
        name: editForm.name.trim(),
        role: editForm.role,
        permissions: editForm.permissions.join(','),
      }, getAdminToken() ?? '');
      const who = editStaff.username;
      setEditStaff(null);
      setStaffMsg(`${who}'s access has been changed. It applies the next time they sign in.`);
      refresh();
    } catch (e) {
      setEditMsg((e as Error).message || 'Could not save that.');
    } finally { setSaving(false); }
  };

  const handlePasswordChange = async () => {
    if (!pwForm.newPassword || pwForm.newPassword.length < 8) {
      setPwMsg('The password must be at least 8 characters.'); return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg('The two passwords do not match.'); return;
    }
    setSaving(true); setPwMsg('');
    try {
      await authApi.changeAdminPassword(pwForm.newPassword, getAdminToken() ?? '');
      setPwMsg('Owner password changed. Use the new one next time you sign in.');
      setPwForm({ newPassword: '', confirmPassword: '' });
    } catch (e) {
      setPwMsg((e as Error).message);
    } finally { setSaving(false); }
  };

  const handleAddStaff = async () => {
    if (!staffForm.name.trim() || !staffForm.username.trim()) {
      setStaffMsg('A name and a username are both needed.'); return;
    }
    if (staffForm.password.length < 8) {
      setStaffMsg('The password must be at least 8 characters.'); return;
    }
    if (staffForm.permissions.length === 0
        && !confirm('This login has no sections ticked, so they will see only the Dashboard. Create it anyway?')) return;
    setSaving(true); setStaffMsg('');
    try {
      await staffApi.create({
        name: staffForm.name.trim(),
        username: staffForm.username.trim().toLowerCase(),
        email: `${staffForm.username.trim().toLowerCase()}@staff.local`,
        password: staffForm.password,
        role: staffForm.role,
        permissions: staffForm.permissions.join(','),
      }, getAdminToken() ?? '');
      const who = staffForm.username.trim().toLowerCase();
      setStaffForm({ name: '', username: '', password: '', role: 'staff', permissions: [] });
      setShowForm(false);
      setStaffMsg(`${who} can sign in now with the password you typed. Tell them to change it.`);
      refresh();
    } catch (e) {
      setStaffMsg((e as Error).message || 'Could not create that login.');
    } finally { setSaving(false); }
  };

  const handleRemoveStaff = async (id: number, username: string) => {
    if (id === 0) return;   // the owner row is not removable
    if (!confirm(`Remove the login "${username}"? They will not be able to sign in again.`)) return;
    try {
      await staffApi.remove(id, getAdminToken() ?? '');
      setStaffMsg(`${username} can no longer sign in.`);
      refresh();
    } catch (e) {
      setStaffMsg((e as Error).message || 'Could not remove that login.');
    }
  };

  const permCountOf = (s: any) =>
    (s.permissions || '').split(',').map((p: string) => p.trim()).filter(Boolean).length;

  return (
    <div className="admin-page">
      <PageHeader
        title="Staff"
        sub="Who can sign in to this panel, and which parts of it they see."
        right={
          <button className="adm-btn adm-btn-primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Close' : 'Add a login'}
          </button>
        }
      />

      {staffMsg && (
        <div className="adm-card" style={{ marginBottom: '.85rem', fontSize: '.86rem', fontWeight: 600,
                                           background: '#fbf9f8', color: '#463d38' }}>
          {staffMsg}
        </div>
      )}

      <Card title={`${allStaff.length} ${allStaff.length === 1 ? 'login' : 'logins'}`}>
        {allStaff.map(s => {
          const owner = s.role === 'admin';
          const perms = permCountOf(s);
          return (
            <div key={s.id} className="adm-item" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
              <div style={{ minWidth: 0 }}>
                <div className="adm-item-t" style={{ display: 'flex', gap: '.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {s.name}
                  <Pill tone={owner ? 'green' : s.role === 'manager' ? 'amber' : 'grey'}>
                    {owner ? 'Owner' : s.role}
                  </Pill>
                  {!owner && perms === 0 && <Pill tone="red">No sections</Pill>}
                </div>
                <div className="adm-item-s">
                  <span style={{ fontFamily: 'monospace' }}>{s.username}</span>
                  {owner ? ' · sees everything' : ` · ${perms} section${perms === 1 ? '' : 's'}`}
                  {' · last signed in '}{s.lastLogin || '—'}
                </div>
                {!owner && (
                  <div className="adm-actions" style={{ marginTop: '.35rem' }}>
                    <button onClick={() => openEdit(s)}>Change access</button>
                    <button onClick={() => handleRemoveStaff(s.id, s.username)} style={{ color: '#c0392b' }}>Remove</button>
                  </div>
                )}
              </div>
              <div />
            </div>
          );
        })}
      </Card>

      {showForm && (
        <Card title="New staff login">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '.65rem' }}>
            <label style={{ display: 'block' }}>
              <span className="adm-stat-l">Name</span>
              <input className="adm-input" style={{ width: '100%', marginTop: '.2rem' }} placeholder="Their name"
                     value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))} />
            </label>
            <label style={{ display: 'block' }}>
              <span className="adm-stat-l">Username they sign in with</span>
              <input className="adm-input" style={{ width: '100%', marginTop: '.2rem' }} placeholder="cashier1"
                     value={staffForm.username} onChange={e => setStaffForm(f => ({ ...f, username: e.target.value }))} />
            </label>
            <label style={{ display: 'block' }}>
              <span className="adm-stat-l">First password (8+ characters)</span>
              <input className="adm-input" type="password" style={{ width: '100%', marginTop: '.2rem' }}
                     value={staffForm.password} onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))} />
            </label>
            <label style={{ display: 'block' }}>
              <span className="adm-stat-l">Role</span>
              <select className="adm-input" style={{ width: '100%', marginTop: '.2rem' }}
                      value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}>
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: '.9rem', borderTop: '1px solid #f4efec', paddingTop: '.8rem' }}>
            <PermissionPicker chosen={staffForm.permissions} toggle={togglePerm}
                              setAll={keys => setStaffForm(f => ({ ...f, permissions: keys }))} />
          </div>

          <button className="adm-btn adm-btn-primary" style={{ marginTop: '.9rem' }}
                  onClick={handleAddStaff} disabled={saving}>
            {saving ? 'Creating…' : 'Create the login'}
          </button>
        </Card>
      )}

      <Card title="Owner password">
        <p style={{ fontSize: '.82rem', color: '#7d736d', margin: '0 0 .75rem', lineHeight: 1.6 }}>
          This changes the password for <strong>admin</strong> — the login that can see everything. It does not
          touch any staff login.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.65rem', maxWidth: 480 }}>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">New password</span>
            <input className="adm-input" type="password" style={{ width: '100%', marginTop: '.2rem' }}
                   placeholder="8 characters or more" value={pwForm.newPassword}
                   onChange={e => { setPwForm(f => ({ ...f, newPassword: e.target.value })); setPwMsg(''); }} />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Type it again</span>
            <input className="adm-input" type="password" style={{ width: '100%', marginTop: '.2rem' }}
                   value={pwForm.confirmPassword}
                   onChange={e => { setPwForm(f => ({ ...f, confirmPassword: e.target.value })); setPwMsg(''); }} />
          </label>
        </div>
        {pwMsg && (
          <p style={{ fontSize: '.85rem', fontWeight: 700, margin: '.7rem 0 0',
                      color: pwMsg.startsWith('Owner password changed') ? '#2e7d32' : '#c0392b' }}>{pwMsg}</p>
        )}
        <button className="adm-btn adm-btn-primary" style={{ marginTop: '.8rem' }}
                onClick={handlePasswordChange} disabled={saving}>
          {saving ? 'Saving…' : 'Change the owner password'}
        </button>
      </Card>

      {editStaff && (
        <div onClick={() => setEditStaff(null)}
             style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: '#fff', borderRadius: 14, padding: '1.4rem', width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Change access</h2>
                <p className="admin-page-sub" style={{ marginBottom: 0 }}>
                  <span style={{ fontFamily: 'monospace' }}>{editStaff.username}</span> — takes effect the next
                  time they sign in.
                </p>
              </div>
              <button onClick={() => setEditStaff(null)}
                      style={{ background: 'none', border: 0, fontSize: '1.4rem', cursor: 'pointer', color: '#a49a94', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.65rem', marginTop: '.9rem' }}>
              <label style={{ display: 'block' }}>
                <span className="adm-stat-l">Name</span>
                <input className="adm-input" style={{ width: '100%', marginTop: '.2rem' }}
                       value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </label>
              <label style={{ display: 'block' }}>
                <span className="adm-stat-l">Role</span>
                <select className="adm-input" style={{ width: '100%', marginTop: '.2rem' }}
                        value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                </select>
              </label>
            </div>

            <div style={{ marginTop: '.9rem', borderTop: '1px solid #f4efec', paddingTop: '.8rem' }}>
              <PermissionPicker chosen={editForm.permissions} toggle={toggleEditPerm}
                                setAll={keys => setEditForm(f => ({ ...f, permissions: keys }))} />
            </div>

            {editMsg && <p style={{ color: '#c0392b', fontSize: '.85rem', fontWeight: 700, margin: '.7rem 0 0' }}>{editMsg}</p>}

            <div style={{ display: 'flex', gap: '.55rem', marginTop: '1rem' }}>
              <button className="adm-btn adm-btn-primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="adm-btn" onClick={() => setEditStaff(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
