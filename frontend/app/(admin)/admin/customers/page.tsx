'use client';
import { useEffect, useState } from 'react';
import { customersApi } from '@/lib/api';
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

function offerLink(customer: Customer) {
  const digits = (customer.phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Customer';
  const message = encodeURIComponent(
    `Namaste ${name}, Mahalaxmi Fashion Hub ki taraf se aapke special day ke liye exclusive offer ready hai.`
  );
  return `https://wa.me/${phone}?text=${message}`;
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
      });
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

  const specialToday = customers.filter(c => isToday(c.dateOfBirth) || isToday(c.marriageDate));

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
            <p className="text-xs text-gray-500">Admin se customer add karo, birthday/anniversary offer dates ke saath.</p>
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

      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">Birthday / Anniversary Offers</p>
          <p className="text-xs text-gray-500">
            Aaj ke due customers: {specialToday.length}. Register page se dates yahan auto show hoti hain.
          </p>
        </div>
        {specialToday.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {specialToday.slice(0, 4).map(c => {
              const href = offerLink(c);
              return href ? (
                <a key={c.id} href={href} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-semibold">
                  Offer: {c.firstName}
                </a>
              ) : null;
            })}
          </div>
        )}
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
              {['Code', 'Name', 'Email', 'Phone', 'Birthday', 'Anniv.', 'District', 'State', 'Status', 'Offer', 'Joined', 'Time'].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={12} className="text-center py-10 text-gray-400">Loading...</td></tr>
            ) : customers.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{c.customerCode}</td>
                <td className="px-4 py-3">{c.firstName} {c.lastName}</td>
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
                <td className="px-4 py-3">
                  <span className={`badge text-xs ${c.accountStatus === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {c.accountStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {offerLink(c) ? (
                    <a href={offerLink(c)} target="_blank" rel="noopener noreferrer"
                      className="px-2 py-1 rounded bg-green-50 text-green-700 font-semibold">
                      WhatsApp
                    </a>
                  ) : '-'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {new Date(c.createdAt).toLocaleDateString('en-IN')}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {new Date(c.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
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
    </div>
  );
}
