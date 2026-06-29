'use client';
import { useState, useEffect, useRef } from 'react';
import { settingsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';

const SECTIONS = [
  {
    title: 'Store Information',
    fields: [
      { key: 'storeName', label: 'Store Name', type: 'text' },
      { key: 'tagline', label: 'Tagline', type: 'text' },
      { key: 'adminDisplayName', label: 'Admin Display Name', type: 'text' },
      { key: 'address', label: 'Store Address', type: 'textarea' },
      { key: 'phone', label: 'Phone Number', type: 'text' },
      { key: 'whatsapp', label: 'WhatsApp Number (with country code)', type: 'text' },
    ]
  },
  {
    title: 'Social Media',
    fields: [
      { key: 'facebook', label: 'Facebook URL', type: 'url' },
      { key: 'instagram', label: 'Instagram URL', type: 'url' },
    ]
  },
  {
    title: 'Offer Banner',
    desc: 'Controls the offer banner shown on the homepage. Toggle it on/off anytime.',
    fields: [
      { key: 'offerEnabled', label: 'Show Offer Banner', type: 'toggle' },
      { key: 'offerEyebrow', label: 'Eyebrow Text (small label above title)', type: 'text' },
      { key: 'offerTitle', label: 'Offer Title', type: 'text' },
      { key: 'offerText', label: 'Offer Description', type: 'textarea' },
      { key: 'offerButtonLabel', label: 'Button Label', type: 'text' },
      { key: 'offerButtonLink', label: 'Button Link (URL or path)', type: 'text' },
    ]
  },
  {
    title: 'Hero Banner',
    fields: [
      { key: 'heroText', label: 'Hero Overlay Text', type: 'textarea' },
    ]
  },
  {
    title: '"Why Customers Stay" Section',
    desc: 'Edit the 3 stat cards shown on the homepage (e.g. 700+, 4.8, 7-day).',
    fields: [
      { key: 'statEyebrow', label: 'Section Eyebrow Label', type: 'text' },
      { key: 'statHeading', label: 'Section Heading', type: 'text' },
      { key: 'stat1Value', label: 'Stat 1 Value (e.g. 700+)', type: 'text' },
      { key: 'stat1Label', label: 'Stat 1 Label', type: 'text' },
      { key: 'stat2Value', label: 'Stat 2 Value (e.g. 4.8)', type: 'text' },
      { key: 'stat2Label', label: 'Stat 2 Label', type: 'text' },
      { key: 'stat3Value', label: 'Stat 3 Value (e.g. 7-day)', type: 'text' },
      { key: 'stat3Label', label: 'Stat 3 Label', type: 'text' },
    ]
  },
  {
    title: 'Customer Registration — OTP Verification Options',
    desc: 'Control which OTP methods are available during customer registration. Email OTP is enabled by default.',
    fields: [
      { key: 'enableEmailOtp',    label: 'Email OTP (Default — always recommended)', type: 'toggle' },
      { key: 'enableMobileOtp',   label: 'SMS OTP (requires MSG91 setup below)', type: 'toggle' },
      { key: 'enableWhatsappOtp', label: 'WhatsApp OTP (requires MSG91 setup below)', type: 'toggle' },
    ]
  },
  {
    title: 'Social Login Options',
    desc: 'Allow customers to sign in with Google or Facebook. Paste credentials from your developer console.',
    fields: [
      { key: 'enableGoogleLogin',   label: 'Enable Google Login', type: 'toggle' },
      { key: 'googleClientId',      label: 'Google OAuth Client ID', type: 'text' },
      { key: 'googleClientSecret',  label: 'Google OAuth Client Secret', type: 'password' },
      { key: 'enableFacebookLogin', label: 'Enable Facebook Login', type: 'toggle' },
      { key: 'facebookAppId',       label: 'Facebook App ID', type: 'text' },
      { key: 'facebookAppSecret',   label: 'Facebook App Secret', type: 'password' },
    ]
  },
  {
    title: 'MSG91 Configuration (SMS & WhatsApp OTP)',
    desc: 'Required for SMS OTP and WhatsApp OTP during registration. Get credentials from msg91.com.',
    fields: [
      { key: 'msg91AuthKey',              label: 'MSG91 Auth Key', type: 'password' },
      { key: 'msg91WhatsappTemplateId',   label: 'WhatsApp OTP Template ID', type: 'text' },
      { key: 'msg91SmsTemplateId',        label: 'SMS OTP Template ID', type: 'text' },
    ]
  },
];

export default function AdminSettingsPage() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    settingsApi.getAll()
      .then(r => setForm(r.settings ?? {}))
      .catch(() => setForm({}))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setMsg('');
    try {
      await settingsApi.bulkUpsert(form, getAdminToken() ?? '');
      setMsg('✅ Settings saved successfully.');
    } catch (e) {
      setMsg('❌ Error: ' + (e as Error).message);
    } finally { setSaving(false); }
  };

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const handleExport = () => {
    const data = { settings: form, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mahalaxmi-settings-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    setBackupMsg('✅ Settings exported successfully.');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const imported: Record<string,string> = parsed.settings ?? parsed;
        setForm(prev => ({ ...prev, ...imported }));
        setBackupMsg('✅ Settings imported — click "Save All Settings" to apply.');
      } catch { setBackupMsg('❌ Invalid JSON file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a1a' }}>Store Settings</h1>
        <button onClick={handleSave} disabled={saving || loading}
          style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: '8px', padding: '.65rem 2rem', fontSize: '.95rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
          {saving ? 'Saving…' : 'Save All Settings'}
        </button>
      </div>

      {msg && (
        <div style={{ padding: '.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '.9rem', fontWeight: 600,
          background: msg.startsWith('✅') ? '#e8f5e9' : '#fdecea',
          color: msg.startsWith('✅') ? '#2e7d32' : '#c62828', border: `1px solid ${msg.startsWith('✅') ? '#c8e6c9' : '#f5c6cb'}` }}>
          {msg}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#aaa' }}>Loading settings…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Backup Tools */}
          <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '.35rem', color: '#333' }}>🗃️ Backup Tools</h2>
            <p style={{ fontSize: '.85rem', color: '#888', marginBottom: '1rem' }}>Export your settings as JSON, or import a previous backup to restore them.</p>
            {backupMsg && (
              <div style={{ padding: '.6rem .9rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '.85rem', fontWeight: 600,
                background: backupMsg.startsWith('✅') ? '#e8f5e9' : '#fdecea',
                color: backupMsg.startsWith('✅') ? '#2e7d32' : '#c62828' }}>
                {backupMsg}
              </div>
            )}
            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              <button onClick={handleExport}
                style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', padding: '.6rem 1.25rem', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer' }}>
                ⬇️ Export Settings JSON
              </button>
              <button onClick={() => importRef.current?.click()}
                style={{ background: '#fff', color: '#333', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem 1.25rem', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer' }}>
                ⬆️ Import Settings JSON
              </button>
              <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
            </div>
          </div>

          {SECTIONS.map(section => (
            <div key={section.title} style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: section.desc ? '.35rem' : '1rem', color: '#333' }}>{section.title}</h2>
              {section.desc && <p style={{ fontSize: '.85rem', color: '#888', marginBottom: '1rem' }}>{section.desc}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', alignItems: 'start' }}>
                {section.fields.map(f => (
                  <div key={f.key} style={{ gridColumn: ['address', 'offerText', 'heroText', 'statHeading', 'statEyebrow'].includes(f.key) ? '1 / -1' : undefined }}>
                    <label style={{ fontSize: '.82rem', fontWeight: 600, display: 'block', marginBottom: '.3rem', color: '#444' }}>{f.label}</label>
                    {f.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                        <button
                          onClick={() => set(f.key, form[f.key] === 'true' ? 'false' : 'true')}
                          style={{
                            width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer',
                            background: form[f.key] === 'true' ? '#a7354d' : '#ddd',
                            position: 'relative', transition: 'background .2s',
                          }}>
                          <span style={{
                            position: 'absolute', top: '3px',
                            left: form[f.key] === 'true' ? '25px' : '3px',
                            width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                            transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                          }} />
                        </button>
                        <span style={{ fontSize: '.88rem', color: form[f.key] === 'true' ? '#a7354d' : '#888', fontWeight: 600 }}>
                          {form[f.key] === 'true' ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    ) : f.type === 'textarea' ? (
                      <textarea value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}
                        rows={3}
                        style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    ) : f.type === 'password' ? (
                      <input type="text" value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}
                        placeholder="Paste key here"
                        style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                    ) : (
                      <input type={f.type} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}
                        style={{ width: '100%', border: '1.5px solid #ddd', borderRadius: '8px', padding: '.6rem .75rem', fontSize: '.88rem', boxSizing: 'border-box' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom save bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button onClick={handleSave} disabled={saving || loading}
            style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: 8, padding: '.7rem 1.6rem', fontSize: '.95rem', fontWeight: 700, cursor: saving || loading ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : '💾 Save All Settings'}
          </button>
          {msg && <span style={{ fontSize: '.9rem', fontWeight: 600 }}>{msg}</span>}
        </div>
      )}
    </div>
  );
}
