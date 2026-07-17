'use client';
import { useState } from 'react';
import { customersApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';

export default function BulkCampaignsPage() {
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState('');
  const [onlyConsent, setOnlyConsent] = useState(false);
  // Send-from-website state
  const [templateId, setTemplateId] = useState('');
  const [var1, setVar1] = useState('');
  const [var2, setVar2] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');

  const sendCampaign = async () => {
    const token = getAdminToken();
    if (!token) { setSendResult('❌ Admin login required.'); return; }
    if (!templateId.trim()) { setSendResult('❌ Enter your DLT-approved template ID first.'); return; }
    if (!window.confirm(`Send this campaign to ${onlyConsent ? 'opted-in' : 'ALL'} customers now? This will send real SMS via MSG91.`)) return;
    setSending(true); setSendResult('');
    try {
      const vars: Record<string, string> = {};
      if (var1.trim()) { vars.var1 = var1.trim(); vars.coupon = var1.trim(); }
      if (var2.trim()) { vars.var2 = var2.trim(); }
      const r = await customersApi.sendCampaign({ templateId: templateId.trim(), optedInOnly: onlyConsent, vars }, token);
      setSendResult(r.success
        ? `✅ ${r.message} (${r.sent}/${r.total} sent)`
        : `⚠️ ${r.message} — Sent: ${r.sent}, Failed: ${r.failed}`);
    } catch (e) {
      setSendResult('❌ ' + (e as Error).message);
    } finally { setSending(false); }
  };

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

      {/* Step 2: Send from website (no MSG91 site needed) */}
      <div style={card}>
        <div style={{ display: 'flex', gap: '.7rem', alignItems: 'center', marginBottom: '.7rem' }}>
          <span style={stepNum}>2</span>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Send the campaign — right here</h2>
        </div>
        <p style={{ color: '#555', fontSize: '.88rem', margin: '0 0 1rem' }}>
          Enter your <strong>DLT-approved promotional template ID</strong> and its variable values, then send.
          The SMS goes out directly through MSG91 — no need to open the MSG91 website.
        </p>

        <div style={{ display: 'grid', gap: '.9rem', maxWidth: 560 }}>
          <div>
            <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, color: '#444', marginBottom: '.3rem' }}>DLT Template ID *</label>
            <input value={templateId} onChange={e => setTemplateId(e.target.value)}
              placeholder="e.g. 6612ab34cd..."
              style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: 8, padding: '.6rem .8rem', fontSize: '.9rem', boxSizing: 'border-box', fontFamily: 'monospace' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.8rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, color: '#444', marginBottom: '.3rem' }}>Variable 1 <span style={{ color: '#999', fontWeight: 400 }}>(e.g. coupon / discount)</span></label>
              <input value={var1} onChange={e => setVar1(e.target.value)} placeholder="SAVE30"
                style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: 8, padding: '.6rem .8rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, color: '#444', marginBottom: '.3rem' }}>Variable 2 <span style={{ color: '#999', fontWeight: 400 }}>(optional)</span></label>
              <input value={var2} onChange={e => setVar2(e.target.value)} placeholder=""
                style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: 8, padding: '.6rem .8rem', fontSize: '.9rem', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>

        <button onClick={sendCampaign} disabled={sending}
          style={{ marginTop: '1.1rem', background: '#a7354d', color: '#fff', border: 'none', borderRadius: 8, padding: '.65rem 1.6rem', fontWeight: 700, fontSize: '.92rem', cursor: 'pointer', opacity: sending ? .6 : 1 }}>
          {sending ? 'Sending…' : `🚀 Send Campaign to ${onlyConsent ? 'Opted-in' : 'All'} Customers`}
        </button>

        {sendResult && (
          <p style={{ marginTop: '.9rem', fontSize: '.88rem', fontWeight: 600, color: sendResult.startsWith('✅') ? '#2e7d32' : sendResult.startsWith('⚠️') ? '#f57f17' : '#c0392b' }}>{sendResult}</p>
        )}
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
