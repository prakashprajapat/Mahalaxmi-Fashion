'use client';
import { useState } from 'react';
import { customersApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Stat, StatGrid } from '@/components/admin/Ui';

export default function BulkCampaignsPage() {
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [onlyConsent, setOnlyConsent] = useState(true);
  const [templateId, setTemplateId] = useState('');
  const [var1, setVar1] = useState('');
  const [var2, setVar2] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [audience, setAudience] = useState<{ count: number; total: number; optedIn: number } | null>(null);

  const who = onlyConsent ? 'customers who opted in' : 'every customer';

  const sendCampaign = async () => {
    const token = getAdminToken();
    if (!token) { setSendResult({ kind: 'err', text: 'Sign in again — your session has expired.' }); return; }
    if (!templateId.trim()) { setSendResult({ kind: 'err', text: 'The DLT-approved template ID is needed first.' }); return; }
    if (!window.confirm(`Send a real SMS to ${who} now? This costs money from your MSG91 balance and cannot be taken back.`)) return;
    setSending(true); setSendResult(null);
    try {
      const vars: Record<string, string> = {};
      if (var1.trim()) { vars.var1 = var1.trim(); vars.coupon = var1.trim(); }
      if (var2.trim()) { vars.var2 = var2.trim(); }
      const r = await customersApi.sendCampaign({ templateId: templateId.trim(), optedInOnly: onlyConsent, vars }, token);
      setSendResult(r.success
        ? { kind: 'ok', text: `${r.message} — ${r.sent} of ${r.total} sent.` }
        : { kind: 'warn', text: `${r.message} — ${r.sent} sent, ${r.failed} failed.` });
    } catch (e) {
      setSendResult({ kind: 'err', text: (e as Error).message });
    } finally { setSending(false); }
  };

  const exportContacts = async () => {
    const token = getAdminToken();
    if (!token) { setMsg({ kind: 'err', text: 'Sign in again — your session has expired.' }); return; }
    setDownloading(true); setMsg(null);
    try {
      const res = await customersApi.phones(onlyConsent, token);
      const phones = res.phones ?? [];
      setAudience({ count: phones.length, total: res.totalCustomers, optedIn: res.optedIn });
      if (phones.length === 0) { setMsg({ kind: 'err', text: 'No usable mobile numbers in that group.' }); return; }

      // MSG91 wants the country code on the front of every number.
      const csv = 'mobile\n' + phones.map(p => `91${p}`).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mfh-contacts-${onlyConsent ? 'optedin' : 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ kind: 'ok', text: `${phones.length} number${phones.length === 1 ? '' : 's'} downloaded, out of ${res.totalCustomers} customers. Upload this file in MSG91 as the campaign list — or skip it and send from here instead.` });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally { setDownloading(false); }
  };

  return (
    <div className="admin-page">
      <PageHeader
        title="Bulk SMS"
        sub="Sends a real SMS through MSG91 to your customers. It costs money from your MSG91 balance and cannot be taken back."
      />

      <StatGrid cols={3}>
        <Stat label="Sending to" value={onlyConsent ? 'Opted in only' : 'Everyone'}
              action={onlyConsent ? 'Switch to everyone' : 'Switch to opted in only'}
              onClick={() => setOnlyConsent(v => !v)} />
        <Stat label="Numbers in that group" value={audience ? audience.count : '—'}
              action={audience ? undefined : 'Check with the download'} />
        <Stat label="Customers in total" value={audience ? audience.total : '—'} />
      </StatGrid>

      <Card title="Who it goes to">
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', fontSize: '.86rem', color: '#463d38', cursor: 'pointer', lineHeight: 1.5 }}>
          <input type="checkbox" checked={onlyConsent} onChange={e => setOnlyConsent(e.target.checked)} style={{ marginTop: '.2rem' }} />
          <span>
            <strong>Only customers who opted in to marketing.</strong> Leave this ticked for anything
            promotional — a customer who never agreed to messages can report them, and reported numbers get the
            whole sender blocked, not just that message.
          </span>
        </label>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.8rem' }}>
          <button className="adm-btn" onClick={exportContacts} disabled={downloading}>
            {downloading ? 'Preparing…' : 'Download the numbers as CSV'}
          </button>
          <span style={{ fontSize: '.78rem', color: '#9a908a' }}>
            Only needed if you would rather send from the MSG91 website.
          </span>
        </div>
        {msg && (
          <p style={{ marginTop: '.7rem', fontSize: '.84rem', fontWeight: 600, lineHeight: 1.55,
                      color: msg.kind === 'ok' ? '#2e7d32' : '#c0392b' }}>{msg.text}</p>
        )}
      </Card>

      <Card title="Send it from here">
        <p style={{ fontSize: '.84rem', color: '#7d736d', margin: '0 0 .8rem', lineHeight: 1.6 }}>
          A promotional SMS in India needs a template that DLT has already approved — you cannot type your own
          wording here. Paste that template&apos;s ID, fill in whatever it leaves blank, and the message goes out
          through MSG91 without opening their website.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.65rem', maxWidth: 620 }}>
          <label style={{ display: 'block', gridColumn: '1 / -1' }}>
            <span className="adm-stat-l">DLT template ID *</span>
            <input className="adm-input" style={{ width: '100%', marginTop: '.2rem', fontFamily: 'monospace' }}
                   value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="6612ab34cd…" />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">First blank — usually the coupon</span>
            <input className="adm-input" style={{ width: '100%', marginTop: '.2rem' }}
                   value={var1} onChange={e => setVar1(e.target.value)} placeholder="SAVE30" />
          </label>
          <label style={{ display: 'block' }}>
            <span className="adm-stat-l">Second blank (if the template has one)</span>
            <input className="adm-input" style={{ width: '100%', marginTop: '.2rem' }}
                   value={var2} onChange={e => setVar2(e.target.value)} />
          </label>
        </div>

        <button className="adm-btn adm-btn-primary" style={{ marginTop: '.9rem' }}
                onClick={sendCampaign} disabled={sending || !templateId.trim()}>
          {sending ? 'Sending…' : `Send to ${who}`}
        </button>

        {sendResult && (
          <p style={{ marginTop: '.75rem', fontSize: '.85rem', fontWeight: 700, lineHeight: 1.55,
                      color: sendResult.kind === 'ok' ? '#2e7d32' : sendResult.kind === 'warn' ? '#b26b00' : '#c0392b' }}>
            {sendResult.text}
          </p>
        )}
      </Card>

      <Card style={{ background: '#fdf8f9', borderColor: '#f0dde1' }}>
        <p style={{ margin: 0, fontSize: '.82rem', color: '#7a3540', lineHeight: 1.65 }}>
          <strong>Two things stop a campaign dead:</strong> a template DLT has not approved, and an MSG91 balance
          that has run out. Both fail quietly at their end, so if the count comes back as zero sent, check those
          before anything else.
        </p>
      </Card>
    </div>
  );
}
