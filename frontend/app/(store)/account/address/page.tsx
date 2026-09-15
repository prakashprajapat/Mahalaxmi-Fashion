"use client";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCustomer, getToken } from '@/lib/auth';
import { addressesApi } from '@/lib/api';
import type { SavedAddress, AddressInput } from '@/lib/api';
import type { Customer } from '@/types';
import { INDIA_STATES } from '@/lib/indianLocations';

// Rough PIN → state lookup so the shopper does not have to pick it by hand.
function getPincodeState(pincode: string): string {
  if (pincode.length < 2) return '';
  const prefix = parseInt(pincode.substring(0, 2), 10);
  if (prefix === 11) return 'Delhi';
  if (prefix >= 12 && prefix <= 13) return 'Haryana';
  if (prefix >= 14 && prefix <= 16) return 'Punjab';
  if (prefix === 17) return 'Himachal Pradesh';
  if (prefix >= 18 && prefix <= 19) return 'Jammu and Kashmir';
  if (prefix >= 20 && prefix <= 28) return 'Uttar Pradesh';
  if (prefix >= 30 && prefix <= 34) return 'Rajasthan';
  if (prefix >= 36 && prefix <= 39) return 'Gujarat';
  if (prefix >= 40 && prefix <= 44) return 'Maharashtra';
  if (prefix >= 45 && prefix <= 49) return 'Madhya Pradesh';
  if (prefix >= 50 && prefix <= 53) return 'Telangana';
  if (prefix >= 56 && prefix <= 59) return 'Karnataka';
  if (prefix >= 60 && prefix <= 64) return 'Tamil Nadu';
  if (prefix >= 67 && prefix <= 69) return 'Kerala';
  if (prefix >= 70 && prefix <= 74) return 'West Bengal';
  if (prefix >= 75 && prefix <= 77) return 'Odisha';
  if (prefix === 78) return 'Assam';
  if (prefix >= 80 && prefix <= 85) return 'Bihar';
  return '';
}

const LABELS = ['Home', 'Office', 'Other'];

const EMPTY: AddressInput = {
  label: 'Home', fullName: '', phone: '', addrLine1: '', addrLine2: '',
  pincode: '', city: '', state: '', isDefault: false,
};

export default function AddressPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [list, setList] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // null = form closed, 0 = adding, >0 = editing that address
  const [formFor, setFormFor] = useState<number | null>(null);
  const [form, setForm] = useState<AddressInput>(EMPTY);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const r = await addressesApi.list(token);
      setList(r.addresses ?? []);
    } catch (e) {
      setError((e as Error).message || 'Could not load your addresses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const c = getCustomer();
    if (!c) { router.push('/account'); return; }
    setCustomer(c);
    refresh();
  }, [router, refresh]);

  const set = (field: keyof AddressInput) => (value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const onPincode = (raw: string) => {
    const pincode = raw.replace(/\D/g, '').slice(0, 6);
    const state = getPincodeState(pincode);
    setForm(f => ({ ...f, pincode, ...(state ? { state } : {}) }));
  };

  const openAdd = () => {
    setError(''); setMsg('');
    setForm({
      ...EMPTY,
      fullName: customer ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() : '',
      phone: customer?.phone ?? '',
      isDefault: list.length === 0,
    });
    setFormFor(0);
  };

  const openEdit = (a: SavedAddress) => {
    setError(''); setMsg('');
    setForm({
      label: a.label, fullName: a.fullName, phone: a.phone,
      addrLine1: a.addrLine1, addrLine2: a.addrLine2,
      pincode: a.pincode, city: a.city, state: a.state, isDefault: a.isDefault,
    });
    setFormFor(a.id);
  };

  // Existing customers already gave us one address on their profile — offer it
  // as a starting point instead of making them type it again.
  const importProfileAddress = () => {
    if (!customer) return;
    setError(''); setMsg('');
    setForm({
      ...EMPTY,
      label: 'Home',
      fullName: `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim(),
      phone: customer.phone ?? '',
      addrLine1: customer.addrLine1 ?? '',
      addrLine2: customer.addrLine2 ?? '',
      pincode: customer.pincode ?? '',
      city: customer.district ?? '',
      state: customer.state ?? '',
      isDefault: true,
    });
    setFormFor(0);
  };

  const save = async () => {
    const token = getToken();
    if (!token) return;
    if (!form.fullName.trim()) { setError('Full name is required.'); return; }
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, ''))) { setError('Enter a valid 10-digit mobile number.'); return; }
    if (!form.addrLine1.trim()) { setError('Address is required.'); return; }
    if (!/^\d{6}$/.test(form.pincode)) { setError('Enter a valid 6-digit PIN code.'); return; }

    setSaving(true); setError(''); setMsg('');
    try {
      if (formFor && formFor > 0) await addressesApi.update(formFor, form, token);
      else await addressesApi.create(form, token);
      setFormFor(null);
      setMsg(formFor ? 'Address updated.' : 'Address saved.');
      await refresh();
    } catch (e) {
      setError((e as Error).message || 'Could not save this address.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: SavedAddress) => {
    const token = getToken();
    if (!token) return;
    if (!window.confirm(`Delete the ${a.label} address of ${a.fullName}?`)) return;
    setError(''); setMsg('');
    try {
      await addressesApi.remove(a.id, token);
      setMsg('Address deleted.');
      await refresh();
    } catch (e) { setError((e as Error).message || 'Could not delete.'); }
  };

  const makeDefault = async (a: SavedAddress) => {
    const token = getToken();
    if (!token) return;
    setError(''); setMsg('');
    try {
      await addressesApi.setDefault(a.id, token);
      await refresh();
    } catch (e) { setError((e as Error).message || 'Could not update.'); }
  };

  if (!customer) return null;

  const hasProfileAddress = Boolean(customer.addrLine1);

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">My Account</p>
        <h1>My Addresses</h1>
        <p>Save your Home and Office addresses to check out faster.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          <div className="form-card">
            <div className="addr-head">
              <h2>Saved Addresses</h2>
              {formFor === null && (
                <button onClick={openAdd} className="button primary addr-add">+ Add New Address</button>
              )}
            </div>

            {error && <p className="addr-msg err">{error}</p>}
            {msg && <p className="addr-msg ok">{msg}</p>}

            {loading ? (
              <p style={{ color: '#888', fontSize: '.9rem' }}>Loading your addresses…</p>
            ) : (
              <>
                {list.length === 0 && formFor === null && (
                  <div className="addr-empty">
                    <p>No saved addresses yet.</p>
                    {hasProfileAddress && (
                      <button onClick={importProfileAddress} className="button secondary">
                        Use my profile address
                      </button>
                    )}
                  </div>
                )}

                {list.length > 0 && (
                  <div className="addr-grid">
                    {list.map(a => (
                      <div key={a.id} className={`addr-card${a.isDefault ? ' is-default' : ''}`}>
                        <span className="addr-label">
                          {a.label.toUpperCase()}
                          {a.isDefault && <em>DEFAULT</em>}
                        </span>
                        <strong>{a.fullName}</strong>
                        <span className="addr-phone">+91 {a.phone}</span>
                        <span className="addr-lines">
                          {[a.addrLine1, a.addrLine2].filter(Boolean).join(', ')}
                          <br />{[a.city, a.state].filter(Boolean).join(', ')}{a.pincode ? ` - ${a.pincode}` : ''}
                        </span>
                        <div className="addr-actions">
                          <button onClick={() => openEdit(a)}>Edit</button>
                          <button onClick={() => remove(a)} className="danger">Delete</button>
                          {!a.isDefault && <button onClick={() => makeDefault(a)} className="mark">Set as default</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {formFor !== null && (
                  <div className="addr-form">
                    <h3>{formFor > 0 ? 'Edit Address' : 'Add New Address'}</h3>

                    <span className="addr-flabel">Address Type</span>
                    <div className="addr-chips">
                      {LABELS.map(l => (
                        <button key={l} type="button"
                          className={form.label === l ? 'on' : ''}
                          onClick={() => set('label')(l)}>{l}</button>
                      ))}
                    </div>

                    <div className="addr-two">
                      <label>
                        <span className="addr-flabel">Full Name *</span>
                        <input value={form.fullName} onChange={e => set('fullName')(e.target.value)} />
                      </label>
                      <label>
                        <span className="addr-flabel">Mobile Number *</span>
                        <input value={form.phone} inputMode="numeric"
                          onChange={e => set('phone')(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                      </label>
                    </div>

                    <label>
                      <span className="addr-flabel">Address (House / Street / Area) *</span>
                      <textarea rows={2} value={form.addrLine1} onChange={e => set('addrLine1')(e.target.value)} />
                    </label>

                    <label>
                      <span className="addr-flabel">Landmark (optional)</span>
                      <input value={form.addrLine2} onChange={e => set('addrLine2')(e.target.value)} />
                    </label>

                    <div className="addr-three">
                      <label>
                        <span className="addr-flabel">PIN Code *</span>
                        <input value={form.pincode} inputMode="numeric" onChange={e => onPincode(e.target.value)} />
                      </label>
                      <label>
                        <span className="addr-flabel">City / District</span>
                        <input value={form.city} onChange={e => set('city')(e.target.value)} />
                      </label>
                      <label>
                        <span className="addr-flabel">State</span>
                        <select value={form.state} onChange={e => set('state')(e.target.value)}>
                          <option value="">Select state</option>
                          {INDIA_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </label>
                    </div>

                    <label className="addr-check">
                      <input type="checkbox" checked={Boolean(form.isDefault)}
                        onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
                      <span>Make this my default delivery address</span>
                    </label>

                    <div className="addr-form-actions">
                      <button onClick={save} disabled={saving} className="button primary">
                        {saving ? 'Saving…' : formFor > 0 ? 'Update Address' : 'Save Address'}
                      </button>
                      <button onClick={() => { setFormFor(null); setError(''); }} className="button secondary">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
