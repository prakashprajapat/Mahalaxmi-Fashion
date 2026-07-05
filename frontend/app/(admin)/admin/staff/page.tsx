'use client';
import { useState, useEffect } from 'react';
import { authApi, staffApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';

// Owner row shown at the top; real staff come from the backend (staff_members table).
const ADMIN_ENTRY = {
  id: 0, name: 'Admin (Owner)', username: 'admin',
  email: 'admin@mahalaxmifashionhub.com', role: 'admin', lastLogin: '—', isActive: true,
};

export default function AdminStaffPage() {
  const [extraStaff, setExtraStaff] = useState<any[]>([]);
  const [staffForm, setStaffForm] = useState({ name: '', username: '', password: '', role: 'staff' });
  const [pwForm, setPwForm]        = useState({ newPassword: '', confirmPassword: '' });
  const [pwMsg, setPwMsg]          = useState('');
  const [saving, setSaving]        = useState(false);

  const refresh = () => {
    staffApi.list(getAdminToken() ?? '').then(setExtraStaff).catch(() => {});
  };
  useEffect(() => { refresh(); }, []);

  const allStaff = [ADMIN_ENTRY, ...extraStaff];

  const handlePasswordChange = async () => {
    if (!pwForm.newPassword || pwForm.newPassword.length < 8) {
      setPwMsg('Password must be at least 8 characters.'); return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg('Passwords do not match.'); return;
    }
    setSaving(true); setPwMsg('');
    try {
      await authApi.changeAdminPassword(pwForm.newPassword, getAdminToken() ?? '');
      setPwMsg('✅ Password changed successfully.');
      setPwForm({ newPassword: '', confirmPassword: '' });
    } catch (e) {
      setPwMsg('❌ ' + (e as Error).message);
    } finally { setSaving(false); }
  };

  const handleAddStaff = async () => {
    if (!staffForm.name.trim() || !staffForm.username.trim()) {
      setPwMsg('❌ Staff name and username are required.'); return;
    }
    if (staffForm.password.length < 8) {
      setPwMsg('❌ Staff password must be at least 8 characters.'); return;
    }
    setSaving(true); setPwMsg('');
    try {
      await staffApi.create({
        name: staffForm.name.trim(),
        username: staffForm.username.trim().toLowerCase(),
        email: `${staffForm.username.trim().toLowerCase()}@staff.local`,
        password: staffForm.password,
        role: staffForm.role,
      }, getAdminToken() ?? '');
      setStaffForm({ name: '', username: '', password: '', role: 'staff' });
      setPwMsg('✅ Staff account created. They can now log in with this username & password.');
      refresh();
    } catch (e) {
      setPwMsg('❌ ' + ((e as Error).message || 'Failed to create staff.'));
    } finally { setSaving(false); }
  };

  const handleRemoveStaff = async (id: number) => {
    if (id === 0) return; // owner row — not removable
    if (!confirm('Remove this staff account?')) return;
    try {
      await staffApi.remove(id, getAdminToken() ?? '');
      setPwMsg('Staff account removed.');
      refresh();
    } catch (e) {
      setPwMsg('❌ ' + ((e as Error).message || 'Failed to remove.'));
    }
  };

  const inp: React.CSSProperties = {
    width: '100%', border: '1.5px solid #ddd', borderRadius: '8px',
    padding: '.6rem .75rem', fontSize: '.9rem', boxSizing: 'border-box',
  };
  const lbl: React.CSSProperties = {
    fontSize: '.85rem', fontWeight: 600, display: 'block', marginBottom: '.3rem',
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: '#1a1a1a' }}>
        Staff Management
      </h1>

      {/* Staff Table */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f0f0f0' }}>
          <h2 style={{ fontWeight: 700, fontSize: '1rem' }}>Accounts ({allStaff.length})</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
          <thead style={{ background: '#f9f9f9' }}>
            <tr>
              {['Name', 'Username', 'Email', 'Role', 'Last Login', 'Action'].map(h => (
                <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '.78rem', color: '#888', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allStaff.map((s, i) => (
              <tr key={s.id} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : undefined }}>
                <td style={{ padding: '.75rem 1rem', fontWeight: 600 }}>{s.name}</td>
                <td style={{ padding: '.75rem 1rem', color: '#555', fontFamily: 'monospace' }}>{s.username}</td>
                <td style={{ padding: '.75rem 1rem', color: '#555' }}>{s.email}</td>
                <td style={{ padding: '.75rem 1rem' }}>
                  <span style={{
                    background: s.role === 'admin' ? '#fdf0f3' : '#f0f0ff',
                    color: s.role === 'admin' ? '#a7354d' : '#555',
                    fontSize: '.78rem', fontWeight: 700, padding: '.2rem .6rem', borderRadius: '12px',
                  }}>
                    {s.role.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '.75rem 1rem', color: '#888', fontSize: '.85rem' }}>{s.lastLogin}</td>
                <td style={{ padding: '.75rem 1rem' }}>
                  {s.role !== 'admin' && (
                    <button
                      onClick={() => handleRemoveStaff(s.id)}
                      style={{ background: 'none', border: '1px solid #e74c3c', color: '#e74c3c', borderRadius: '6px', padding: '.2rem .6rem', fontSize: '.78rem', cursor: 'pointer', fontWeight: 600 }}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Staff */}
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,.07)', maxWidth: '760px', marginBottom: '1.5rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1.25rem' }}>Create Staff Login</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={lbl}>Name</label>
            <input value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Staff name" style={inp} />
          </div>
          <div>
            <label style={lbl}>Username</label>
            <input value={staffForm.username} onChange={e => setStaffForm(f => ({ ...f, username: e.target.value }))}
              placeholder="e.g. cashier1" style={inp} />
          </div>
          <div>
            <label style={lbl}>Password</label>
            <input type="password" value={staffForm.password} onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Min 8 characters" style={inp} />
          </div>
          <div>
            <label style={lbl}>Role</label>
            <select value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))} style={inp}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
            </select>
          </div>
        </div>
        {pwMsg && (
          <p style={{ color: pwMsg.startsWith('✅') ? '#27ae60' : '#c0392b', fontSize: '.88rem', margin: '.75rem 0 0', fontWeight: 600 }}>
            {pwMsg}
          </p>
        )}
        <button onClick={handleAddStaff}
          style={{ marginTop: '1rem', background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.65rem 1.5rem', fontSize: '.9rem', fontWeight: 600, cursor: 'pointer' }}>
          Add Staff Login
        </button>
      </div>

      {/* Password Reset */}
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,.07)', maxWidth: '480px' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1.25rem' }}>Change Admin Password</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <label style={lbl}>New Password</label>
            <input type="password" value={pwForm.newPassword}
              onChange={e => { setPwForm(f => ({ ...f, newPassword: e.target.value })); setPwMsg(''); }}
              placeholder="Min 8 characters" style={inp} />
          </div>
          <div>
            <label style={lbl}>Confirm Password</label>
            <input type="password" value={pwForm.confirmPassword}
              onChange={e => { setPwForm(f => ({ ...f, confirmPassword: e.target.value })); setPwMsg(''); }}
              placeholder="Re-enter new password" style={inp} />
          </div>
        </div>
        {pwMsg && (
          <p style={{ color: pwMsg.startsWith('✅') ? '#27ae60' : '#c0392b', fontSize: '.88rem', marginBottom: '1rem', fontWeight: 600 }}>
            {pwMsg}
          </p>
        )}
        <button onClick={handlePasswordChange} disabled={saving}
          style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.65rem 1.5rem', fontSize: '.9rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
          {saving ? 'Saving…' : 'Change Password'}
        </button>
      </div>
    </div>
  );
}
