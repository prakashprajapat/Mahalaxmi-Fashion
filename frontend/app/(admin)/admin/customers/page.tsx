'use client';
import { useEffect, useState } from 'react';
import { customersApi, walletApi, ordersApi, type WalletTxn } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { exportCustomers } from '@/lib/exportExcel';
import type { Customer } from '@/types';

function formatDate(raw?: string) {
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function isToday(raw?: string) {
  if (!raw) return false;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return date.getDate() === today.getDate() && date.getMonth() === today.getMonth();
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Edit customer (fix/merge duplicates — change name / email / mobile)
  const [editCust, setEditCust] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [editMsg, setEditMsg] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Wallet modal state
  const [walletCust, setWalletCust] = useState<Customer | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTxns, setWalletTxns] = useState<WalletTxn[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletAmt, setWalletAmt] = useState('');
  const [walletNote, setWalletNote] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);

  const openWallet = async (c: Customer) => {
    setWalletCust(c); setWalletBalance(0); setWalletTxns([]); setWalletAmt(''); setWalletNote('');
    setWalletLoading(true);
    try {
      const r = await walletApi.forCustomer(c.id, getAdminToken() ?? '');
      setWalletBalance(r.balance || 0); setWalletTxns(r.transactions || []);
    } catch { /* ignore */ }
    finally { setWalletLoading(false); }
  };

  const doAdjust = async (sign: 1 | -1) => {
    const amt = Math.abs(parseFloat(walletAmt)) * sign;
    if (!walletCust || !amt) return;
    setWalletBusy(true);
    try {
      await walletApi.adjust({ customerId: walletCust.id, amount: amt, note: walletNote || undefined }, getAdminToken() ?? '');
      const r = await walletApi.forCustomer(walletCust.id, getAdminToken() ?? '');
      setWalletBalance(r.balance || 0); setWalletTxns(r.transactions || []);
      setWalletAmt(''); setWalletNote('');
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setWalletBusy(false); }
  };
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    marriageDate: '',
    state: '',
    district: '',
    password: 'Mfh@12345',
  });

  // High-risk customers (>2 cancelled orders) — shown as a red "HIGH RISK" badge.
  const [highRiskIds, setHighRiskIds] = useState<Set<string>>(new Set());

  const fetchCustomers = () => {
    const token = getAdminToken() ?? '';
    setLoading(true);
    customersApi.getAll(token, { search, page })
      .then(r => { setCustomers(r.customers); setTotal(r.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCustomers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

  // Load the high-risk "red zone" list once, so we can flag those customers.
  useEffect(() => {
    ordersApi.riskSummary(getAdminToken() ?? '')
      .then(r => setHighRiskIds(new Set((r.riskyCustomers || []).map(c => String(c.customerId)))))
      .catch(() => { /* non-blocking */ });
  }, []);

  const openEdit = (c: Customer) => {
    setEditCust(c);
    setEditForm({ firstName: c.firstName || '', lastName: c.lastName || '', email: c.email || '', phone: c.phone || '' });
    setEditMsg('');
  };

  const saveEdit = async () => {
    if (!editCust) return;
    setEditSaving(true); setEditMsg('');
    try {
      await customersApi.updateProfile(editCust.id, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
      }, getAdminToken() ?? '');
      setEditCust(null);
      fetchCustomers();
    } catch (e) {
      setEditMsg((e as Error).message || 'Update failed.');
    } finally { setEditSaving(false); }
  };

  const handleDelete = async (c: Customer) => {
    if (!confirm(`Delete customer "${c.firstName} ${c.lastName}" (${c.email || c.phone})?\nThis permanently removes the account.`)) return;
    try {
      await customersApi.delete(c.id, getAdminToken() ?? '');
      fetchCustomers();
    } catch (e) {
      alert((e as Error).message || 'Delete failed.');
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (!form.firstName.trim()) { setMessage('First name required.'); return; }
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) { setMessage('Valid email required.'); return; }
    if (form.password.length < 8) { setMessage('Password must be at least 8 characters.'); return; }
    setAdding(true);
    try {
      await customersApi.register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        gender: '',
        dateOfBirth: form.dateOfBirth,
        marriageDate: form.marriageDate,
        addrLine1: '',
        addrLine2: '',
        pincode: '',
        postOffice: '',
        state: form.state.trim(),
        district: form.district.trim(),
        marketingConsent: true,
      }, getAdminToken() ?? '');
      setForm({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', marriageDate: '', state: '', district: '', password: 'Mfh@12345' });
      setMessage('Customer added successfully.');
      setAddOpen(false);
      setPage(1);
      fetchCustomers();
    } catch (err) {
      setMessage((err as Error).message || 'Customer add failed.');
    } finally {
      setAdding(false);
    }
  };


  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <h1 className="text-2xl font-bold text-gray-800">Customers ({total})</h1>
        <button
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              const token = getAdminToken() ?? '';
              // Fetch ALL customers (large pageSize) for complete export
              const r = await customersApi.getAll(token, { page: 1 });
              // If more pages exist, fetch remaining
              let all = r.customers;
              if (r.total > all.length) {
                const pages = Math.ceil(r.total / 50);
                for (let p = 2; p <= pages; p++) {
                  const pr = await customersApi.getAll(token, { page: p });
                  all = [...all, ...pr.customers];
                }
              }
              exportCustomers(all);
            } finally { setExporting(false); }
          }}
          style={{ background: exporting ? '#888' : '#1b5e20', color: '#fff', border: 'none', borderRadius: '8px', padding: '.5rem 1.25rem', fontSize: '.88rem', fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer' }}>
          {exporting ? '⏳ Exporting…' : `📊 Export Excel (${total})`}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">Add Customer</p>
            <p className="text-xs text-gray-500">Add a customer from admin, along with birthday/anniversary offer dates.</p>
          </div>
          <button type="button" onClick={() => setAddOpen(v => !v)}
            className="px-4 py-2 rounded-lg bg-pink-700 text-white text-sm font-semibold">
            {addOpen ? 'Close' : '+ Add Customer'}
          </button>
        </div>

        {addOpen && (
          <form onSubmit={handleAddCustomer} className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="First name *"
              value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Last name"
              value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Email *" type="email"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Mobile"
              value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            <label className="text-xs text-gray-500">
              Birthday
              <input className="border rounded-lg px-3 py-2 text-sm w-full mt-1" type="date"
                value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
            </label>
            <label className="text-xs text-gray-500">
              Anniversary
              <input className="border rounded-lg px-3 py-2 text-sm w-full mt-1" type="date"
                value={form.marriageDate} onChange={e => setForm(f => ({ ...f, marriageDate: e.target.value }))} />
            </label>
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="State"
              value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="District"
              value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} />
            <input className="border rounded-lg px-3 py-2 text-sm md:col-span-2" placeholder="Temporary password"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            <button disabled={adding} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-60">
              {adding ? 'Adding...' : 'Create Customer'}
            </button>
          </form>
        )}

        {message && <p className={`text-xs mt-3 ${message.includes('success') ? 'text-green-700' : 'text-red-600'}`}>{message}</p>}
      </div>

      <input
        placeholder="Search by name, email, phone..."
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="border rounded-lg px-3 py-2 text-sm w-72 mb-4"
      />

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              {['Code', 'Photo', 'Name', 'Email', 'Phone', 'Birthday', 'Anniv.', 'District', 'State', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={10} className="text-center py-10 text-gray-400">Loading...</td></tr>
            ) : customers.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{c.customerCode}</td>
                <td className="px-4 py-3">
                  {c.photoUrl
                    ? <img src={c.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                    : <span className="w-9 h-9 rounded-full bg-pink-50 text-pink-700 font-bold flex items-center justify-center text-xs">{(c.firstName || '?').charAt(0).toUpperCase()}</span>}
                </td>
                <td className="px-4 py-3">
                  {c.firstName} {c.lastName}
                  {highRiskIds.has(String(c.id)) && (
                    <span title="More than 2 cancelled orders — Cash on Delivery is blocked for this customer"
                      style={{ marginLeft: 6, background: '#ffebee', color: '#c62828', borderRadius: 20, padding: '2px 8px', fontSize: '.66rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                      🚩 HIGH RISK
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{c.email}</td>
                <td className="px-4 py-3 text-xs">{c.phone}</td>
                <td className={`px-4 py-3 text-xs ${isToday(c.dateOfBirth) ? 'font-bold text-pink-700' : ''}`}>
                  {formatDate(c.dateOfBirth)}
                </td>
                <td className={`px-4 py-3 text-xs ${isToday(c.marriageDate) ? 'font-bold text-pink-700' : ''}`}>
                  {formatDate(c.marriageDate)}
                </td>
                <td className="px-4 py-3 text-xs">{c.district || '—'}</td>
                <td className="px-4 py-3 text-xs">{c.state || '—'}</td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">
                  <button onClick={() => openEdit(c)}
                    className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-semibold mr-1">Edit</button>
                  <button onClick={() => openWallet(c)}
                    className="px-2 py-1 rounded bg-amber-50 text-amber-700 font-semibold mr-1">👛 Wallet</button>
                  <button onClick={() => handleDelete(c)}
                    className="px-2 py-1 rounded bg-red-50 text-red-600 font-semibold">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4 text-sm text-gray-500">
        <span>Page {page} · {customers.length} of {total}</span>
        <div className="flex gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 border rounded disabled:opacity-40">← Prev</button>
          <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 border rounded disabled:opacity-40">Next →</button>
        </div>
      </div>

      {/* Edit customer modal — fix name / email / mobile (to resolve duplicates) */}
      {editCust && (
        <div onClick={() => setEditCust(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', width: '100%', maxWidth: 420 }}>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Edit Customer</h2>
            <p className="text-xs text-gray-500 mb-4">Code: {editCust.customerCode}</p>
            <div className="grid grid-cols-2 gap-3">
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="First name"
                value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} />
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Last name"
                value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} />
              <input className="border rounded-lg px-3 py-2 text-sm col-span-2" placeholder="Email" type="email"
                value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              <input className="border rounded-lg px-3 py-2 text-sm col-span-2" placeholder="Mobile"
                value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            {editMsg && <p className="text-sm text-red-600 font-semibold mt-3">{editMsg}</p>}
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setEditCust(null)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={saveEdit} disabled={editSaving}
                className="px-4 py-2 rounded-lg bg-pink-700 text-white text-sm font-semibold">
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet modal — view balance & statement, and credit / debit manually */}
      {walletCust && (
        <div onClick={() => setWalletCust(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', width: '100%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 className="text-lg font-bold text-gray-800 mb-1">👛 Wallet — {walletCust.firstName} {walletCust.lastName}</h2>
            <p className="text-xs text-gray-500 mb-3">Code: {walletCust.customerCode}</p>

            <div style={{ background: 'linear-gradient(135deg,#7a0a22,#a7354d)', color: '#fff', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '.8rem', opacity: .9 }}>Balance</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>₹{walletBalance.toLocaleString('en-IN', { minimumFractionDigits: walletBalance % 1 ? 2 : 0 })}</div>
            </div>

            {/* Adjust */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Amount ₹" type="number" min="0"
                value={walletAmt} onChange={e => setWalletAmt(e.target.value)} />
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Note (optional)"
                value={walletNote} onChange={e => setWalletNote(e.target.value)} />
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => doAdjust(1)} disabled={walletBusy || !walletAmt}
                className="flex-1 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-40">+ Credit</button>
              <button onClick={() => doAdjust(-1)} disabled={walletBusy || !walletAmt}
                className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-40">− Debit</button>
            </div>

            {/* History */}
            <div className="text-xs font-semibold text-gray-500 mb-1">Recent activity</div>
            {walletLoading ? (
              <div className="text-center text-gray-400 py-4 text-sm">Loading…</div>
            ) : walletTxns.length === 0 ? (
              <div className="text-center text-gray-400 py-4 text-sm">No activity yet.</div>
            ) : (
              <div className="border rounded-lg divide-y">
                {walletTxns.map(t => (
                  <div key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-800 capitalize">{t.type.replace('_', ' ')}</div>
                      <div className="text-xs text-gray-400 truncate">{t.note || t.orderId || ''}</div>
                    </div>
                    <div className={`font-bold ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {t.amount >= 0 ? '+' : '−'}₹{Math.abs(t.amount).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button onClick={() => setWalletCust(null)} className="px-4 py-2 rounded-lg border text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
