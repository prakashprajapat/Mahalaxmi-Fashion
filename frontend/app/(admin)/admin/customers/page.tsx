'use client';
import { useEffect, useState } from 'react';
import { customersApi, walletApi, ordersApi, type WalletTxn } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { exportCustomers } from '@/lib/exportExcel';
import type { Customer } from '@/types';
import { PageHeader, Card, Stat, StatGrid, Pill, Empty } from '@/components/admin/Ui';

// The server hands out fifty at a time; the paging maths has to agree with it.
const PAGE_SIZE = 50;
// The most the server will return in one request, used for the export.
const EXPORT_CHUNK = 500;

function formatDate(raw?: string) {
  if (!raw) return '—';
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

  const [editCust, setEditCust] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [editMsg, setEditMsg] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [walletCust, setWalletCust] = useState<Customer | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTxns, setWalletTxns] = useState<WalletTxn[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletAmt, setWalletAmt] = useState('');
  const [walletNote, setWalletNote] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    dateOfBirth: '', marriageDate: '', state: '', district: '',
    password: 'Mfh@12345',
  });

  // More than two cancelled orders: Cash on Delivery is off for them.
  const [highRiskIds, setHighRiskIds] = useState<Set<string>>(new Set());

  const fetchCustomers = () => {
    setLoading(true);
    customersApi.getAll(getAdminToken() ?? '', { search, page })
      .then(r => { setCustomers(r.customers); setTotal(r.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCustomers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

  useEffect(() => {
    ordersApi.riskSummary(getAdminToken() ?? '')
      .then(r => setHighRiskIds(new Set((r.riskyCustomers || []).map(c => String(c.customerId)))))
      .catch(() => { /* not worth blocking the page for */ });
  }, []);

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

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = getAdminToken() ?? '';
      let all: Customer[] = [];
      for (let p = 1; ; p++) {
        const r = await customersApi.getAll(token, { page: p, pageSize: EXPORT_CHUNK });
        all = [...all, ...r.customers];
        if (all.length >= r.total || r.customers.length === 0) break;
      }
      exportCustomers(all);
    } finally { setExporting(false); }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (!form.firstName.trim()) { setMessage('First name is required.'); return; }
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) { setMessage('A valid email is required.'); return; }
    if (form.password.length < 8) { setMessage('The password must be at least 8 characters.'); return; }
    setAdding(true);
    try {
      await customersApi.register({
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        email: form.email.trim(), phone: form.phone.trim(), password: form.password,
        gender: '', dateOfBirth: form.dateOfBirth, marriageDate: form.marriageDate,
        addrLine1: '', addrLine2: '', pincode: '', postOffice: '',
        state: form.state.trim(), district: form.district.trim(), marketingConsent: true,
      }, getAdminToken() ?? '');
      setForm({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', marriageDate: '', state: '', district: '', password: 'Mfh@12345' });
      setMessage('Customer added.');
      setAddOpen(false);
      setPage(1);
      fetchCustomers();
    } catch (err) {
      setMessage((err as Error).message || 'Could not add the customer.');
    } finally {
      setAdding(false);
    }
  };

  const birthdaysToday = customers.filter(c => isToday(c.dateOfBirth)).length;
  const annivToday = customers.filter(c => isToday(c.marriageDate)).length;
  const riskyOnPage = customers.filter(c => highRiskIds.has(String(c.id))).length;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page">
      <PageHeader
        title="Customers"
        sub={`${total.toLocaleString('en-IN')} accounts. Search covers name, email, phone and customer code.`}
        right={
          <>
            <button className="adm-btn" onClick={() => setAddOpen(v => !v)}>{addOpen ? 'Close' : 'Add Customer'}</button>
            <button className="adm-btn adm-btn-primary" disabled={exporting} onClick={handleExport}>
              {exporting ? 'Exporting…' : `Excel (${total})`}
            </button>
          </>
        }
      />

      <StatGrid>
        <Stat label="Customers" value={total.toLocaleString('en-IN')} />
        <Stat label="Birthdays today" value={birthdaysToday}
              action={birthdaysToday > 0 ? 'Send an offer' : undefined}
              href={birthdaysToday > 0 ? '/admin/birthday' : undefined} />
        <Stat label="Anniversaries today" value={annivToday}
              action={annivToday > 0 ? 'Send an offer' : undefined}
              href={annivToday > 0 ? '/admin/birthday' : undefined} />
        <Stat label="High risk on this page" value={riskyOnPage} tone={riskyOnPage > 0 ? 'red' : undefined}
              action="See why" href="/admin/risk" />
      </StatGrid>

      {addOpen && (
        <Card title="Add a customer">
          <p style={{ fontSize: '.82rem', color: '#7d736d', margin: '0 0 .7rem' }}>
            For a customer who ordered over the phone or in the shop. The birthday and anniversary dates are what
            the offer emails go out on.
          </p>
          <form onSubmit={handleAddCustomer}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.6rem' }}>
            <input className="adm-input" placeholder="First name *" value={form.firstName}
                   onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
            <input className="adm-input" placeholder="Last name" value={form.lastName}
                   onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
            <input className="adm-input" placeholder="Email *" type="email" value={form.email}
                   onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <input className="adm-input" placeholder="Mobile" value={form.phone}
                   onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            <label style={{ display: 'block' }}>
              <span className="adm-stat-l">Birthday</span>
              <input className="adm-input" type="date" style={{ width: '100%', marginTop: '.2rem' }}
                     value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
            </label>
            <label style={{ display: 'block' }}>
              <span className="adm-stat-l">Anniversary</span>
              <input className="adm-input" type="date" style={{ width: '100%', marginTop: '.2rem' }}
                     value={form.marriageDate} onChange={e => setForm(f => ({ ...f, marriageDate: e.target.value }))} />
            </label>
            <input className="adm-input" placeholder="State" value={form.state}
                   onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
            <input className="adm-input" placeholder="District" value={form.district}
                   onChange={e => setForm(f => ({ ...f, district: e.target.value }))} />
            <input className="adm-input" placeholder="Temporary password" value={form.password}
                   onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            <button className="adm-btn adm-btn-primary" disabled={adding} style={{ justifyContent: 'center' }}>
              {adding ? 'Adding…' : 'Create customer'}
            </button>
          </form>
          {message && (
            <p style={{ fontSize: '.82rem', fontWeight: 700, marginTop: '.6rem',
                        color: message === 'Customer added.' ? '#2e7d32' : '#c0392b' }}>{message}</p>
          )}
        </Card>
      )}

      <Card>
        <input className="adm-input" style={{ width: '100%', maxWidth: '340px' }}
               placeholder="Search name, email, phone or code"
               value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </Card>

      <Card
        title={`${customers.length} shown${total > customers.length ? ` of ${total}` : ''}`}
        right={total > PAGE_SIZE && (
          <span style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            <button className="adm-btn" style={{ padding: '.3rem .6rem' }} disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}>Prev</button>
            <span style={{ fontSize: '.76rem', color: '#7d736d', fontWeight: 700 }}>{page} / {lastPage}</span>
            <button className="adm-btn" style={{ padding: '.3rem .6rem' }} disabled={page >= lastPage}
                    onClick={() => setPage(p => p + 1)}>Next</button>
          </span>
        )}
      >
        {loading ? (
          <Empty>Loading customers…</Empty>
        ) : customers.length === 0 ? (
          <Empty>{search ? 'Nobody matches that search.' : 'No customers yet.'}</Empty>
        ) : customers.map(c => {
          const risky = highRiskIds.has(String(c.id));
          const bday = isToday(c.dateOfBirth);
          const anniv = isToday(c.marriageDate);
          return (
            <div key={c.id} className="adm-item">
              {c.photoUrl
                ? <img src={c.photoUrl} alt="" className="adm-item-thumb" style={{ borderRadius: '50%' }} />
                : <div className="adm-item-thumb" style={{ borderRadius: '50%', background: '#fbf1f3', color: '#722f37', fontWeight: 800, fontSize: '1rem' }}>
                    {(c.firstName || '?').charAt(0).toUpperCase()}
                  </div>}
              <div style={{ minWidth: 0 }}>
                <div className="adm-item-t" style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {c.firstName} {c.lastName}
                  {risky && <Pill tone="red">High risk — COD off</Pill>}
                  {bday && <Pill tone="amber">Birthday today</Pill>}
                  {anniv && <Pill tone="amber">Anniversary today</Pill>}
                </div>
                <div className="adm-item-s">
                  <span style={{ fontFamily: 'monospace' }}>{c.customerCode}</span>
                  {c.email ? ` · ${c.email}` : ''}{c.phone ? ` · ${c.phone}` : ''}
                </div>
                <div className="adm-item-s">
                  {[c.district, c.state].filter(Boolean).join(', ') || 'no address'}
                  {' · '}b {formatDate(c.dateOfBirth)}
                  {' · '}a {formatDate(c.marriageDate)}
                </div>
                <div className="adm-actions" style={{ marginTop: '.35rem' }}>
                  <button onClick={() => openEdit(c)}>Edit</button>
                  <button onClick={() => openWallet(c)} style={{ color: '#b26b00' }}>Wallet</button>
                  <button onClick={() => handleDelete(c)} style={{ color: '#c0392b' }}>Delete</button>
                </div>
              </div>
              <div />
            </div>
          );
        })}
      </Card>

      {editCust && (
        <div onClick={() => setEditCust(null)}
             style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: '#fff', borderRadius: 14, padding: '1.4rem', width: '100%', maxWidth: 420 }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Edit customer</h2>
            <p className="admin-page-sub" style={{ marginBottom: '.9rem' }}>
              {editCust.customerCode} — use this to merge a duplicate account, or fix a wrong number.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
              <input className="adm-input" placeholder="First name" value={editForm.firstName}
                     onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} />
              <input className="adm-input" placeholder="Last name" value={editForm.lastName}
                     onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} />
              <input className="adm-input" style={{ gridColumn: '1 / -1' }} placeholder="Email" type="email"
                     value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              <input className="adm-input" style={{ gridColumn: '1 / -1' }} placeholder="Mobile"
                     value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            {editMsg && <p style={{ fontSize: '.84rem', color: '#c0392b', fontWeight: 700, marginTop: '.6rem' }}>{editMsg}</p>}
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="adm-btn" onClick={() => setEditCust(null)}>Cancel</button>
              <button className="adm-btn adm-btn-primary" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {walletCust && (
        <div onClick={() => setWalletCust(null)}
             style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: '#fff', borderRadius: 14, padding: '1.4rem', width: '100%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
              Wallet — {walletCust.firstName} {walletCust.lastName}
            </h2>
            <p className="admin-page-sub" style={{ marginBottom: '.9rem' }}>{walletCust.customerCode}</p>

            <div style={{ background: 'linear-gradient(135deg,#5e262d,#8c3d47)', color: '#fff', borderRadius: 12, padding: '.9rem 1.15rem', marginBottom: '.9rem' }}>
              <div style={{ fontSize: '.78rem', opacity: .85 }}>Balance</div>
              <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>
                ₹{walletBalance.toLocaleString('en-IN', { minimumFractionDigits: walletBalance % 1 ? 2 : 0 })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: '.5rem' }}>
              <input className="adm-input" placeholder="Amount ₹" type="number" min="0"
                     value={walletAmt} onChange={e => setWalletAmt(e.target.value)} />
              <input className="adm-input" placeholder="Note (optional)"
                     value={walletNote} onChange={e => setWalletNote(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
              <button className="adm-btn" style={{ flex: 1, justifyContent: 'center', color: '#2e7d32' }}
                      onClick={() => doAdjust(1)} disabled={walletBusy || !walletAmt}>Add money</button>
              <button className="adm-btn" style={{ flex: 1, justifyContent: 'center', color: '#c0392b' }}
                      onClick={() => doAdjust(-1)} disabled={walletBusy || !walletAmt}>Take money out</button>
            </div>

            <h3 className="adm-card-h">Recent activity</h3>
            {walletLoading ? (
              <Empty>Loading…</Empty>
            ) : walletTxns.length === 0 ? (
              <Empty>Nothing has gone in or out of this wallet yet.</Empty>
            ) : walletTxns.map(t => (
              <div key={t.id} className="adm-row">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="adm-row-t" style={{ display: 'block', textTransform: 'capitalize' }}>{t.type.replace('_', ' ')}</span>
                  <span className="adm-row-s" style={{ display: 'block' }}>{t.note || t.orderId || ''}</span>
                </span>
                <strong style={{ color: t.amount >= 0 ? '#2e7d32' : '#c0392b', fontSize: '.88rem' }}>
                  {t.amount >= 0 ? '+' : '−'}₹{Math.abs(t.amount).toLocaleString('en-IN')}
                </strong>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="adm-btn" onClick={() => setWalletCust(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
