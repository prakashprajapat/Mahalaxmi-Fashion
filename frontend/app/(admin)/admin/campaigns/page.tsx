'use client';
import { useState } from 'react';
import { customersApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';

const MSG91_CAMPAIGNS_URL = 'https://control.msg91.com/app/m/l/campaigns/flow?module=campaigns';

export default function BulkCampaignsPage() {
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState('');
  const [onlyConsent, setOnlyConsent] = useState(false);

  // Export the customer mobile numbers as a CSV to upload to MSG91.
  const exportContacts = async () => {
    const token = getAdminToken();
    if (!token) { setMsg('❌ Admin login required.'); return; }
    setDownloading(true); setMsg('');
    try {
      const res = await customersApi.phones(onlyConsent, token);
      const phones = res.phones ?? [];
      if (phones.length === 0) { setMsg('No valid mobile numbers found.'); setDownloading(false); return; }

      // MSG91 wants numbers with the 91 country code.
      const csv = 'mobile\n' + phones.map(p => `91${p}`).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mfh-contacts-${onlyConsent ? 'optedin' : 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`✅ Exported ${phones.length} unique mobile number${phones.length > 1 ? 's' : ''} (of ${res.totalCustomers} customers). Upload this CSV in MSG91 as your campaign contact list.`);
    } catch (e) {
      setMsg('❌ Export failed: ' + (e as Error).message);
    } finally { setDownloading(false); }
  };

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1.4rem 1.6rem', marginBottom: '1.2rem' };
  const stepNum: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: '#a7354d', color: '#fff', fontWeight: 800, fontSize: '.85rem', flexShrink: 0 };

  return (
    <div style={{ maxWidth: 820, padding: '1.2rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 .3rem' }}>📣 Bulk Campaigns (SMS / WhatsApp)</h1>
      <p style={{ color: '#777', fontSize: '.9rem', margin: '0 0 1.4rem' }}>
        Send promotional messages to your customers in bulk through MSG91. It works in 2 simple steps.
      </p>

      {/* Step 1: export */}
      <div style={card}>
        <div style={{ display: 'flex', gap: '.7rem', alignItems: 'center', marginBottom: '.7rem' }}>
          <span style={stepNum}>1</span>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Download your customer contact list</h2>
        </div>
        <p style={{ color: '#555', fontSize: '.88rem', margin: '0 0 .8rem' }}>
          This exports all your customers&apos; mobile numbers as a CSV file. You&apos;ll upload it to MSG91 as the campaign audience.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem', color: '#555', marginBottom: '.9rem' }}>
          <input type="checkbox" checked={onlyConsent} onChange={e => setOnlyConsent(e.target.checked)} />
          Only include customers who opted in to marketing (recommended for promos)
        </label>
        <button onClick={exportContacts} disabled={downloading}
          style={{ background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 8, padding: '.6rem 1.4rem', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', opacity: downloading ? .6 : 1 }}>
          {downloading ? 'Preparing…' : '⬇️ Download Contacts CSV'}
        </button>
        {msg && (
          <p style={{ marginTop: '.8rem', fontSize: '.86rem', fontWeight: 600, color: msg.startsWith('✅') ? '#2e7d32' : '#c0392b' }}>{msg}</p>
        )}
      </div>

      {/* Step 2: MSG91 */}
      <div style={card}>
        <div style={{ display: 'flex', gap: '.7rem', alignItems: 'center', marginBottom: '.7rem' }}>
          <span style={stepNum}>2</span>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Create the campaign in MSG91</h2>
        </div>
        <ol style={{ color: '#555', fontSize: '.88rem', lineHeight: 1.7, margin: '0 0 1rem', paddingLeft: '1.2rem' }}>
          <li>Click the button below — MSG91 Campaigns page khulega (naye tab me).</li>
          <li>Top-right <strong>+ New Campaign</strong> dabao.</li>
          <li>Channel chuno (SMS / WhatsApp) aur apna <strong>DLT-approved template</strong> select karo.</li>
          <li><strong>Contacts</strong> step me wo CSV upload karo jo Step 1 me download ki.</li>
          <li>Preview karke <strong>Launch</strong> dabao — bulk message chala jayega.</li>
        </ol>
        <a href={MSG91_CAMPAIGNS_URL} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', background: '#a7354d', color: '#fff', borderRadius: 8, padding: '.6rem 1.4rem', fontWeight: 700, fontSize: '.9rem', textDecoration: 'none' }}>
          🚀 Open MSG91 Campaigns →
        </a>
      </div>

      <div style={{ ...card, background: '#fff8f9', borderColor: '#f3d5dc' }}>
        <p style={{ margin: 0, fontSize: '.82rem', color: '#8a2a3e' }}>
          <strong>Note:</strong> Promotional bulk SMS needs a DLT-approved template and sufficient MSG91 wallet balance.
          Send only to customers who expect messages from you — spam ke messages block ho sakte hain. WhatsApp campaigns
          ke liye customer ka number WhatsApp pe active hona chahiye.
        </p>
      </div>
    </div>
  );
}
