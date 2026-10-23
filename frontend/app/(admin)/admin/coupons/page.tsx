'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { couponsApi } from '@/lib/api';
import { downloadCsv } from '@/lib/adminPaged';
import { PageHeader, Card, Stat, StatGrid, Chips, Pill, Empty } from '@/components/admin/Ui';

interface Coupon {
  id: number; code: string; type: string; value: number; occasion: string;
  minOrder: number; maxUses: number | null; usedCount: number; oncePerCustomer?: boolean;
  // 0 = no limit per customer, N = N times each. Undefined only from an older server.
  maxPerCustomer?: number | null;
  expiresAt: string | null; isActive: boolean; createdAt: string;
}

const empty = { code: '', type: 'flat', value: '', occasion: 'none', minOrder: '0', maxUses: '', expiresAt: '', isActive: true, maxPerCustomer: '1' };

/** What the per-customer box shows for a coupon the server sent back. */
const perCustomerOf = (c: Coupon): string => {
  if (c.maxPerCustomer !== undefined && c.maxPerCustomer !== null) return String(c.maxPerCustomer);
  return c.oncePerCustomer ? '1' : '0';          // older server, still only the tick
};

const OCCASION_LABEL: Record<string, string> = { none: 'Anyone', birthday: 'Birthday', anniversary: 'Anniversary' };

/** A coupon is expired the moment its end-of-day has passed, whatever isActive says. */
const isExpired = (c: Coupon) => Boolean(c.expiresAt && new Date(c.expiresAt) < new Date());
const isUsedUp = (c: Coupon) => Boolean(c.maxUses && c.usedCount >= c.maxUses);

function shortDate(raw: string | null) {
  if (!raw) return '';
  return new Date(raw).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Din bache hue - jo khatam hone wala hai use pahechanne ka sabse saaf tarika. */
function daysLeft(raw: string | null): number | null {
  if (!raw) return null;
  const ms = new Date(raw).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

/** The one sentence that says what a coupon actually does. */
function inWords(f: typeof empty): string {
  const v = parseFloat(f.value);
  if (!f.code.trim() || !v) return 'Fill in a code and a value to see what this coupon will do.';
  const off = f.type === 'percent' ? `${v}% off` : `₹${v} off`;
  const min = parseFloat(f.minOrder) > 0 ? ` on orders over ₹${parseFloat(f.minOrder).toLocaleString('en-IN')}` : '';
  const who = f.occasion === 'none' ? '' : ` — only in the customer's ${f.occasion} month`;
  const uses = f.maxUses ? `, usable ${f.maxUses} time${Number(f.maxUses) === 1 ? '' : 's'} in total` : '';
  const per = parseInt(f.maxPerCustomer, 10);
  const each = !f.maxPerCustomer.trim() || per === 1 ? ', once per customer'
    : per <= 0 ? ', as many times as one customer likes'
    : `, up to ${per} times per customer`;
  const till = f.expiresAt ? `, until the end of ${new Date(f.expiresAt + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}` : ', with no end date';
  return `${f.code.trim().toUpperCase()} gives ${off}${min}${who}${each}${uses}${till}.`;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [tab, setTab] = useState('live');
  // Popup leads ki tarah - pahele khaana chuniye, phir likhiye. Ek rupaye ki
  // raqam ko code ke khaane me dhoondhne ka koi matlab nahi hota.
  const [search, setSearch] = useState('');
  const [searchIn, setSearchIn] = useState('all');
  const [filterKind, setFilterKind] = useState('');
  const [filterWho, setFilterWho] = useState('');
  const [sortBy, setSortBy] = useState<'created' | 'used' | 'expires'>('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Settings names one coupon as the welcome code. A name with nothing behind it
  // is the quietest way to break the popup, so this screen says so out loud.
  const [welcomeCode, setWelcomeCode] = useState('');

  const load = async () => {
    setLoading(true);
    try { setCoupons((await couponsApi.list(getAdminToken() ?? '')) as Coupon[]); }
    catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => setWelcomeCode((d?.settings?.welcomeCouponCode ?? '').trim()))
      .catch(() => { /* the coupons themselves still load */ });
  }, []);

  const resetForm = () => { setForm({ ...empty }); setEditId(null); setMsg(null); setShowForm(false); };

  // Recording a past use. Kept beside the list rather than inside the edit
  // form: it is about a customer, not about the coupon's own settings.
  const [usedCouponId, setUsedCouponId] = useState('');
  const [usedPhone, setUsedPhone] = useState('');
  const [usedEmail, setUsedEmail] = useState('');
  const [usedBusy, setUsedBusy] = useState(false);

  const markUsed = async (record: boolean) => {
    const id = Number(usedCouponId);
    if (!id) { setMsg({ kind: 'err', text: 'Choose which coupon this is about.' }); return; }
    if (!usedPhone.trim() && !usedEmail.trim()) {
      setMsg({ kind: 'err', text: 'A mobile number or an email is how a customer is recognised.' });
      return;
    }
    setUsedBusy(true);
    try {
      const body = { phone: usedPhone.trim() || undefined, email: usedEmail.trim() || undefined };
      const token = getAdminToken() ?? '';
      const r = record
        ? await couponsApi.markUsed(id, body, token)
        : await couponsApi.clearUsed(id, body, token);
      setMsg({ kind: 'ok', text: r.message });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally { setUsedBusy(false); }
  };

  const startEdit = (c: Coupon) => {
    setEditId(c.id);
    setForm({
      code: c.code, type: c.type, value: String(c.value), occasion: c.occasion ?? 'none',
      minOrder: String(c.minOrder), maxUses: c.maxUses ? String(c.maxUses) : '',
      maxPerCustomer: perCustomerOf(c),
      expiresAt: c.expiresAt ? c.expiresAt.split('T')[0] : '', isActive: c.isActive,
    });
    setMsg(null);
    setShowForm(true);
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
        // Blank reads as once, which is the safe end of the two: a code that
        // should have been limited and was not is money out of the shop, and a
        // code limited by mistake is one edit away.
        maxPerCustomer: form.maxPerCustomer.trim() ? Math.max(0, parseInt(form.maxPerCustomer, 10) || 0) : 1,
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

  /* Ek click me chalu/band - har bar Edit kholna nahi padta. */
  const toggleLive = async (c: Coupon) => {
    try {
      await couponsApi.update(c.id, {
        code: c.code, type: c.type, value: c.value, occasion: c.occasion ?? 'none',
        minOrder: c.minOrder, maxUses: c.maxUses, expiresAt: c.expiresAt,
        // This sends the WHOLE coupon back, so leaving the limit out would
        // quietly reset it every time somebody flicked the on/off switch.
        maxPerCustomer: Number(perCustomerOf(c)),
        isActive: !c.isActive,
      }, getAdminToken() ?? '');
      setCoupons(list => list.map(x => (x.id === c.id ? { ...x, isActive: !x.isActive } : x)));
    } catch (e) { alert((e as Error).message); }
  };

  const copyCode = async (code: string) => {
    try { await navigator.clipboard.writeText(code); setMsg({ kind: 'ok', text: `${code} copied.` }); }
    catch { /* clipboard blocked - nothing worth saying */ }
  };

  const groupOf = (c: Coupon) => {
    if (isExpired(c)) return 'expired';
    if (isUsedUp(c)) return 'usedup';
    if (!c.isActive) return 'off';
    return 'live';
  };

  const counts: Record<string, number> = { all: coupons.length };
  coupons.forEach(c => { const k = groupOf(c); counts[k] = (counts[k] ?? 0) + 1; });

  const filtered = coupons.filter(c => {
    const q = search.trim().toLowerCase();
    const hit: Record<string, boolean> = {
      code: c.code.toLowerCase().includes(q),
      value: String(c.value).includes(search.trim()),
    };
    const matchSearch = !q || (searchIn === 'all' ? Object.values(hit).some(Boolean) : !!hit[searchIn]);
    const matchKind = !filterKind || c.type === filterKind;
    const matchWho = !filterWho || (c.occasion || 'none') === filterWho;
    const matchTab = tab === 'all' || groupOf(c) === tab;
    return matchSearch && matchKind && matchWho && matchTab;
  });

  const shown = [...filtered].sort((a, b) => {
    let d = 0;
    if (sortBy === 'used') d = a.usedCount - b.usedCount;
    else if (sortBy === 'expires') {
      // No end date sits at the far end whichever way the arrow points.
      const av = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bv = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
      d = av - bv;
    } else d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortDir === 'asc' ? d : -d;
  });

  const sortHead = (key: typeof sortBy, label: string) => (
    <button type="button" className="adm-sort"
            onClick={() => {
              if (sortBy === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
              else { setSortBy(key); setSortDir('desc'); }
            }}>
      {label}{sortBy === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </button>
  );

  const redemptions = coupons.reduce((s, c) => s + c.usedCount, 0);
  const neverUsed = coupons.filter(c => c.usedCount === 0).length;
  // Saat din me khatam hone wale - inhe aaj hi badhaya ja sakta hai.
  const endingSoon = coupons.filter(c => {
    const d = daysLeft(c.expiresAt);
    return c.isActive && d !== null && d >= 0 && d <= 7;
  }).length;

  // Why the welcome code is not reaching anybody - said in the words of the
  // thing that is wrong, not as a generic "check your settings".
  const welcomeProblem = (() => {
    if (!welcomeCode || loading) return '';
    const c = coupons.find(x => x.code.toLowerCase() === welcomeCode.toLowerCase());
    if (!c) return `Settings says the welcome code is ${welcomeCode}, but there is no coupon with that code. Make it below, or the popup and every new account get nothing.`;
    if (isExpired(c)) return `The welcome code ${c.code} expired on ${shortDate(c.expiresAt)}. New customers are being promised a code that no longer works.`;
    if (isUsedUp(c)) return `The welcome code ${c.code} has been used ${c.usedCount} of ${c.maxUses} times and is finished. Raise its limit or clear it.`;
    if (!c.isActive) return `The welcome code ${c.code} is switched off, so nobody can use it.`;
    if (c.occasion && c.occasion !== 'none') return `The welcome code ${c.code} is a ${c.occasion} coupon, so most new customers cannot use it. The welcome code has to be open to anyone.`;
    return '';
  })();

  const exportCsv = () => {
    downloadCsv(
      [['Code', 'Discount', 'Smallest order', 'Who', 'Used', 'Allowed', 'Per customer', 'Last day', 'Status'],
       ...shown.map(c => [
         c.code,
         c.type === 'percent' ? `${c.value}%` : `Rs.${c.value}`,
         c.minOrder > 0 ? String(c.minOrder) : '',
         OCCASION_LABEL[c.occasion] ?? c.occasion,
         String(c.usedCount),
         c.maxUses ? String(c.maxUses) : 'No limit',
         perCustomerOf(c) === '0' ? 'No limit' : perCustomerOf(c),
         c.expiresAt ? shortDate(c.expiresAt) : 'No end date',
         isExpired(c) ? 'Expired' : isUsedUp(c) ? 'Used up' : c.isActive ? 'Working' : 'Switched off',
       ])],
      `coupons-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  return (
    <div className="admin-page">
      <PageHeader
        title="Coupons"
        sub="A coupon works the moment it is live. Nothing here is announced to anyone — you still have to tell customers the code."
        right={
          <>
            <button className="adm-btn" onClick={load}>Refresh</button>
            <button className="adm-btn" onClick={exportCsv} disabled={!shown.length}>
              Export CSV ({shown.length})
            </button>
            {showForm
              ? <button className="adm-btn" onClick={resetForm}>{editId ? 'Cancel edit' : 'Close'}</button>
              : <button className="adm-btn adm-btn-primary" onClick={() => { setForm({ ...empty }); setEditId(null); setShowForm(true); }}>
                  New coupon
                </button>}
          </>
        }
      />

      <StatGrid>
        <Stat label="Working right now" value={counts.live ?? 0} tone="green"
              action={tab === 'live' ? undefined : 'Show these'} onClick={() => setTab('live')} />
        <Stat label="Times used" value={redemptions} />
        <Stat label="Never used once" value={neverUsed} tone={neverUsed > 0 ? 'red' : undefined}
              action={neverUsed > 0 ? 'Nobody has typed these' : undefined} />
        <Stat label="Ending within a week" value={endingSoon} tone={endingSoon > 0 ? 'red' : undefined}
              action={endingSoon > 0 && tab !== 'expired' ? 'Extend them before they stop' : undefined} />
      </StatGrid>

      {showForm && (
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
            <label style={{ gridColumn: '1 / -1' }}>
              <span className="adm-stat-l">Uses per customer</span>
              <input className="adm-input" type="number" min={0} style={{ width: '100%', marginTop: '.2rem' }}
                     placeholder="1" value={form.maxPerCustomer}
                     onChange={e => setForm(f => ({ ...f, maxPerCustomer: e.target.value }))} />
              <span style={{ display: 'block', fontSize: '.78rem', color: '#777', marginTop: '.3rem' }}>
                How many times <strong>one</strong> customer may use this code.
                <strong> 1</strong> is the usual answer for a welcome, birthday or anniversary
                offer. <strong>0</strong> means no limit &mdash; she can use it on every order.
                Recognised by mobile number or email, either one being enough, so changing
                one of the two does not earn the discount again.
                <br />
                This is different from &ldquo;Total uses allowed&rdquo; above, which is the ceiling
                on the whole code. A welcome code usually wants both: once each, and a total
                that is high or blank so it does not run out for everyone at once.
              </span>
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

          <div style={{ display: 'flex', gap: '.55rem', marginTop: '.9rem' }}>
            <button className="adm-btn adm-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editId ? 'Update coupon' : 'Create coupon'}
            </button>
            <button className="adm-btn" onClick={resetForm}>Cancel</button>
          </div>
        </Card>
      )}

      {welcomeProblem && (
        <Card style={{ background: '#fdf4f3', borderColor: '#f0d4d0' }}>
          <p style={{ margin: 0, fontSize: '.85rem', color: '#8a3127', lineHeight: 1.6 }}>
            <strong>The welcome code is not working.</strong> {welcomeProblem}
          </p>
        </Card>
      )}

      {welcomeCode && !welcomeProblem && (
        <Card style={{ background: '#f3faf4', borderColor: '#cfe8d3' }}>
          <p style={{ margin: 0, fontSize: '.85rem', color: '#2e6b33', lineHeight: 1.6 }}>
            <strong>{welcomeCode}</strong> is the welcome code. It is shown in the popup after someone
            leaves their details, and emailed to every new account the moment it is made.
          </p>
        </Card>
      )}

      {msg && (
        <Card style={{ background: msg.kind === 'ok' ? '#f3faf4' : '#fdf4f3',
                       borderColor: msg.kind === 'ok' ? '#cfe8d3' : '#f0d4d0' }}>
          <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 700,
                      color: msg.kind === 'ok' ? '#2e7d32' : '#c0392b' }}>{msg.text}</p>
        </Card>
      )}

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center', marginBottom: '.65rem' }}>
          <span style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase',
                         letterSpacing: '.04em', color: '#8a7f76' }}>Filter by</span>
          <select className="adm-input" style={{ width: '116px' }} value={searchIn}
                  onChange={e => setSearchIn(e.target.value)}>
            <option value="all">All fields</option>
            <option value="code">Code</option>
            <option value="value">Value</option>
          </select>
          <input className="adm-input" style={{ flex: '1 1 180px', maxWidth: 320 }}
                 placeholder={searchIn === 'all' ? 'Search code or value' : 'Search'}
                 value={search} onChange={e => setSearch(e.target.value)} />
          <select className="adm-input" style={{ width: '140px' }} value={filterKind}
                  onChange={e => setFilterKind(e.target.value)}>
            <option value="">Discount: any</option>
            <option value="flat">₹ off</option>
            <option value="percent">% off</option>
          </select>
          <select className="adm-input" style={{ width: '150px' }} value={filterWho}
                  onChange={e => setFilterWho(e.target.value)}>
            <option value="">Who: anyone</option>
            <option value="none">Open to all</option>
            <option value="birthday">Birthday month</option>
            <option value="anniversary">Anniversary month</option>
          </select>
          {(search || filterKind || filterWho) && (
            <button className="adm-btn" onClick={() => { setSearch(''); setFilterKind(''); setFilterWho(''); }}>Clear</button>
          )}
        </div>
        <Chips value={tab} onChange={setTab}
               items={[
                 { key: 'live', label: 'Working', count: counts.live ?? 0 },
                 { key: 'off', label: 'Switched off', count: counts.off ?? 0 },
                 { key: 'expired', label: 'Expired', count: counts.expired ?? 0 },
                 { key: 'usedup', label: 'Used up', count: counts.usedup ?? 0 },
                 { key: 'all', label: 'All', count: coupons.length },
               ]} />
      </Card>

      <Card title={`${shown.length} ${shown.length === 1 ? 'coupon' : 'coupons'}`}>
        {loading ? (
          <Empty>Loading coupons…</Empty>
        ) : shown.length === 0 ? (
          <Empty>
            {coupons.length === 0
              ? 'No coupons yet. Press "New coupon" to make your first one.'
              : 'Nothing matches that search.'}
          </Empty>
        ) : (
          /* Popup leads ki tarah khaane me - code, chhoot, kam se kam order,
             kiske liye, kitni bar chala, kab tak. Aankh seedhi neeche utarti
             hai aur ek jaisi cheez ek hi khaane me milti hai. */
          <div className="adm-table-wrap">
            <table className="adm-table adm-table-sticky">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Smallest order</th>
                  <th>Who</th>
                  <th>{sortHead('used', 'Used')}</th>
                  <th>Per customer</th>
                  <th>{sortHead('expires', 'Last day')}</th>
                  <th>Status</th>
                  <th>{sortHead('created', 'Made')}</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(c => {
                  const expired = isExpired(c);
                  const usedUp = isUsedUp(c);
                  const dead = expired || usedUp || !c.isActive;
                  const left = daysLeft(c.expiresAt);
                  const soon = !dead && left !== null && left >= 0 && left <= 7;
                  return (
                    <tr key={c.id} style={{ opacity: dead ? .72 : 1 }}>
                      <td data-label="Code">
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#722f37', letterSpacing: '.03em' }}>
                          {c.code}
                        </span>
                      </td>
                      <td data-label="Discount" style={{ fontWeight: 650, color: '#2d2724', whiteSpace: 'nowrap' }}>
                        {c.type === 'percent' ? `${c.value}% off` : `₹${c.value} off`}
                      </td>
                      <td data-label="Smallest order" className="mono">
                        {c.minOrder > 0
                          ? `₹${c.minOrder.toLocaleString('en-IN')}`
                          : <span style={{ color: '#c4bab5' }}>&mdash;</span>}
                      </td>
                      <td data-label="Who">
                        {c.occasion && c.occasion !== 'none'
                          ? <Pill tone="grey">{OCCASION_LABEL[c.occasion] ?? c.occasion}</Pill>
                          : <span style={{ color: '#9a908a' }}>Anyone</span>}
                      </td>
                      <td data-label="Used" className="mono" style={{ whiteSpace: 'nowrap' }}>
                        {c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}
                      </td>
                      {/* On the page, not behind an Edit click.
                          WELCOME10 sat at 0 - no limit per customer - for days,
                          and nothing on this screen said so. One customer took
                          it three times while every explanation looked at the
                          rule instead of at the number the rule was reading. A
                          setting that decides whether money goes out should be
                          visible from the list. */}
                      <td data-label="Per customer" className="mono" style={{ whiteSpace: 'nowrap' }}>
                        {perCustomerOf(c) === '0'
                          ? <span style={{ color: '#c0392b', fontWeight: 700 }} title="Anyone can use this code again and again. Open Edit to set a limit.">No limit</span>
                          : perCustomerOf(c)}
                      </td>
                      <td data-label="Last day" style={{ whiteSpace: 'nowrap' }}>
                        {c.expiresAt
                          ? <span style={{ display: 'flex', gap: '.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                              {shortDate(c.expiresAt)}
                              {soon && <Pill tone="amber">{left === 0 ? 'Last day' : `${left}d left`}</Pill>}
                            </span>
                          : <span style={{ color: '#9a908a' }}>No end date</span>}
                      </td>
                      <td data-label="Status">
                        {expired ? <Pill tone="grey">Expired</Pill>
                          : usedUp ? <Pill tone="grey">Used up</Pill>
                          : !c.isActive ? <Pill tone="amber">Switched off</Pill>
                          : <Pill tone="green">Working</Pill>}
                      </td>
                      <td data-label="Made" style={{ whiteSpace: 'nowrap', color: '#8a7f76' }}>
                        {shortDate(c.createdAt)}
                      </td>
                      <td data-label="Action">
                        <div className="adm-actions" style={{ flexWrap: 'wrap', margin: 0 }}>
                          <button onClick={() => copyCode(c.code)}>Copy</button>
                          <button onClick={() => startEdit(c)}>Edit</button>
                          {!expired && !usedUp && (
                            <button onClick={() => toggleLive(c)}>{c.isActive ? 'Switch off' : 'Switch on'}</button>
                          )}
                          <button onClick={() => handleDelete(c.id, c.code)} style={{ color: '#c0392b' }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Who has already used a code.
          The limit can only refuse what it can see, and nothing was written
          down for the prepaid orders the webhook used to create - so a
          customer who had taken a welcome code three times looked like
          somebody who never had. Fixing the writing does not fill in the past.
          This does, without anyone opening the database. */}
      <Card title="Already used by a customer">
        <p style={{ fontSize: '.85rem', color: '#777', margin: '0 0 .8rem' }}>
          Records that someone has <strong>already used</strong> a code, so the next
          attempt is refused like any other repeat. Recognised by mobile number or
          email &mdash; fill in whichever you have, or both if the order carried both.
        </p>
        <div style={{ display: 'grid', gap: '.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', alignItems: 'end' }}>
          <label>
            <span className="adm-stat-l">Coupon</span>
            <select className="adm-input" style={{ width: '100%', marginTop: '.2rem' }}
                    value={usedCouponId} onChange={e => setUsedCouponId(e.target.value)}>
              <option value="">Choose a code…</option>
              {coupons.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          </label>
          <label>
            <span className="adm-stat-l">Mobile number</span>
            <input className="adm-input" style={{ width: '100%', marginTop: '.2rem' }}
                   placeholder="10 digits" value={usedPhone}
                   onChange={e => setUsedPhone(e.target.value)} />
          </label>
          <label>
            <span className="adm-stat-l">Email</span>
            <input className="adm-input" style={{ width: '100%', marginTop: '.2rem' }}
                   placeholder="optional" value={usedEmail}
                   onChange={e => setUsedEmail(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: '.4rem' }}>
            <button className="adm-btn" disabled={usedBusy} onClick={() => markUsed(true)}>
              {usedBusy ? 'Saving…' : 'Mark as used'}
            </button>
            <button className="adm-btn" disabled={usedBusy} onClick={() => markUsed(false)}
                    title="Undo — lets this customer use the code again">
              Clear
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
