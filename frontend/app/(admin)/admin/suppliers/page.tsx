'use client';
import { useEffect, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Stat, StatGrid, Pill, Empty } from '@/components/admin/Ui';

interface SupplierApplication {
  id: number;
  firmName: string;
  contactName: string;
  phone: string;
  email: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  businessType: string | null;
  categories: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  website: string | null;
  yearsInBusiness: string | null;
  message: string | null;
  status: string | null;
  createdAt: string;
}

function formatDate(raw: string) {
  const d = new Date(raw);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isToday(raw: string) {
  const d = new Date(raw);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

const digits = (s: string | null) => (s || '').replace(/\D/g, '');

export default function SuppliersPage() {
  const [apps, setApps] = useState<SupplierApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const res = await fetch('/api/suppliers', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setApps(data.applications || []);
    } catch { setApps([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const exportCsv = () => {
    const rows = [['ID','Firm','Contact','Phone','Email','GST','PAN','Business Type','Categories','City','State','Pincode','Website','Years','Message','Status','Date']];
    apps.forEach(a => rows.push([
      String(a.id), a.firmName, a.contactName, a.phone, a.email || '', a.gstNumber || '', a.panNumber || '',
      a.businessType || '', a.categories || '', a.city || '', a.state || '', a.pincode || '',
      a.website || '', a.yearsInBusiness || '', (a.message || '').replace(/\n/g, ' '), a.status || '', formatDate(a.createdAt),
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `seller-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  };

  const filtered = apps.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (a.firmName || '').toLowerCase().includes(q)
      || (a.contactName || '').toLowerCase().includes(q)
      || (a.phone || '').includes(search)
      || (a.email || '').toLowerCase().includes(q)
      || (a.city || '').toLowerCase().includes(q);
  });

  const todayCount = apps.filter(a => isToday(a.createdAt)).length;
  const withGst = apps.filter(a => a.gstNumber).length;

  return (
    <div className="admin-page">
      <PageHeader
        title="Seller applications"
        sub="People who filled in the “Become a Seller” form. Nobody here has been contacted yet unless you did it."
        right={
          <>
            <button className="adm-btn" onClick={load}>Refresh</button>
            <button className="adm-btn adm-btn-primary" onClick={exportCsv} disabled={!apps.length}>Export CSV</button>
          </>
        }
      />

      <StatGrid cols={3}>
        <Stat label="Applications" value={apps.length} />
        <Stat label="Came in today" value={todayCount} tone={todayCount > 0 ? 'green' : undefined} />
        <Stat label="With a GST number" value={withGst} />
      </StatGrid>

      <Card>
        <input className="adm-input" style={{ width: '100%', maxWidth: '340px' }}
               placeholder="Search firm, contact, phone, email or city"
               value={search} onChange={e => setSearch(e.target.value)} />
      </Card>

      <Card title={`${filtered.length} ${filtered.length === 1 ? 'application' : 'applications'}`}>
        {loading ? (
          <Empty>Loading applications…</Empty>
        ) : filtered.length === 0 ? (
          <Empty>
            {apps.length === 0
              ? 'Nobody has applied yet. Applications arrive here the moment the form is submitted.'
              : 'Nothing matches that search.'}
          </Empty>
        ) : filtered.map(a => {
          const open = expanded === a.id;
          const ph = digits(a.phone);
          return (
            <div key={a.id} style={{ borderBottom: '1px solid #f4efec', padding: '.8rem 0',
                                     background: isToday(a.createdAt) ? '#fffdf6' : undefined }}>
              <div style={{ display: 'flex', gap: '.7rem', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="adm-item-t" style={{ display: 'flex', gap: '.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {a.firmName || '(no firm name)'}
                    {isToday(a.createdAt) && <Pill tone="green">Today</Pill>}
                    {a.gstNumber && <Pill tone="grey">GST</Pill>}
                  </div>
                  <div className="adm-item-s">
                    {a.contactName || 'no contact name'}
                    {' · '}{[a.city, a.state].filter(Boolean).join(', ') || 'no city'}
                    {a.categories ? ` · ${a.categories}` : ''}
                  </div>
                  <div className="adm-item-s">{formatDate(a.createdAt)}</div>
                  <div className="adm-actions" style={{ marginTop: '.4rem', flexWrap: 'wrap' }}>
                    {ph && <a href={`https://wa.me/91${ph}`} target="_blank" rel="noopener noreferrer" style={{ color: '#128C7E' }}>WhatsApp</a>}
                    {ph && <a href={`tel:+91${ph}`}>{a.phone}</a>}
                    {a.email && <a href={`mailto:${a.email}`}>{a.email}</a>}
                    <button onClick={() => setExpanded(open ? null : a.id)}>{open ? 'Hide details' : 'Details'}</button>
                  </div>
                </div>
              </div>
              {open && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                              gap: '.7rem 1.4rem', fontSize: '.84rem', marginTop: '.7rem',
                              background: '#fbf9f8', borderRadius: 10, padding: '.8rem .9rem' }}>
                  {([
                    ['GST', a.gstNumber], ['PAN', a.panNumber],
                    ['Business type', a.businessType], ['Years in business', a.yearsInBusiness],
                    ['Pincode', a.pincode], ['Website', a.website],
                    ['Address', a.address], ['Status', a.status], ['Message', a.message],
                  ] as [string, string | null][]).map(([label, val]) => (
                    <div key={label}>
                      <div className="adm-stat-l" style={{ textTransform: 'uppercase', letterSpacing: '.04em', fontSize: '.68rem' }}>{label}</div>
                      <div style={{ color: '#463d38', marginTop: '.1rem', wordBreak: 'break-word' }}>{val || '—'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
