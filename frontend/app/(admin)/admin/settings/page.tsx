'use client';
import { useState, useEffect, useRef } from 'react';
import { settingsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Empty } from '@/components/admin/Ui';

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
    title: 'Homepage Hero',
    desc: 'The right side of the homepage hero is a SLIDER: slide 1 = video/logo (current look), followed by these photos auto-sliding every 3.5 sec. Photo size: 1200×900px (4:3 landscape), JPG/WebP, under 400KB is best. Upload here — no coding needed. To remove a photo, clear its URL and Save.',
    fields: [
      { key: 'heroImg1', label: 'Slider Photo 1 (1200×900, 4:3)', type: 'image' },
      { key: 'heroImg2', label: 'Slider Photo 2 (1200×900, 4:3)', type: 'image' },
      { key: 'heroImg3', label: 'Slider Photo 3 (1200×900, 4:3)', type: 'image' },
      { key: 'heroVideoUrl', label: 'Hero Video URL (.mp4 / .webm — becomes slide 1; blank = logo)', type: 'text' },
    ]
  },
  {
    title: 'Payments',
    desc: 'Online payment gateway selection. Default (blank) = Cashfree first; if Cashfree keys are not configured on the server, checkout automatically falls back to Razorpay. Type "razorpay" to force Razorpay. Cashfree AppId/SecretKey are set in the server appsettings.json (not here) for security.',
    fields: [
      { key: 'paymentGateway', label: 'Gateway ("cashfree" = default, or "razorpay")', type: 'text' },
    ]
  },
  {
    title: 'Delhivery Shipping (Auto AWB)',
    desc: 'For automatic AWB generation via "⚡ Generate" in Orders. Enter the API Token from your Delhivery business account and the exact registered pickup warehouse name. Leave blank to use manual AWB entry.',
    fields: [
      { key: 'delhivery_token', label: 'Delhivery API Token', type: 'password' },
      { key: 'delhivery_pickup_name', label: 'Registered Pickup / Warehouse Name (exact)', type: 'text' },
    ]
  },
  {
    title: 'Cash on Delivery',
    desc: 'Take part of a COD order online before it is accepted. An abandoned payment leaves no order behind, which is what stops fake orders. The courier is automatically told to collect only the remaining amount, so a customer is never charged twice. Set the advance to 0 to switch it off.',
    fields: [
      { key: 'codAdvanceAmount', label: 'Advance paid online for COD (\u20b9) — 0 = off', type: 'text' },
      { key: 'codFeeAmount', label: 'COD handling fee added to the order (\u20b9)', type: 'text' },
    ]
  },
  {
    title: 'Loyalty Wallet & Points',
    desc: 'Customers earn wallet credit on every delivered order and can use it on future orders. Points are added automatically when an order is marked "Delivered". Change the rates here anytime.',
    fields: [
      { key: 'loyaltyEnabled', label: 'Enable Loyalty Wallet', type: 'toggle' },
      { key: 'loyaltyEarnPercent', label: 'Reward % per order (e.g. 5 = ₹5 wallet per ₹100 spent)', type: 'text' },
      { key: 'loyaltyRedeemMaxPercent', label: 'Max % of an order payable from wallet (e.g. 20)', type: 'text' },
    ]
  },
  {
    title: 'Refer & Earn',
    desc: 'Each customer gets a personal referral code. A friend using it gets a discount on their first order, and the referrer earns wallet credit once that order is delivered. Change the amounts here anytime.',
    fields: [
      { key: 'referralEnabled', label: 'Enable Refer & Earn', type: 'toggle' },
      { key: 'referralNewUserDiscount', label: 'Friend gets ₹ off (their first order)', type: 'text' },
      { key: 'referralMinOrder', label: 'Minimum order for the friend discount (₹)', type: 'text' },
      { key: 'referralReferrerReward', label: 'Referrer earns ₹ (wallet, on delivery)', type: 'text' },
    ]
  },
  {
    title: 'Meta Lead Ads (Facebook / Instagram)',
    desc: 'Bring leads from your Facebook & Instagram Lead Ads straight into the "📥 Meta Ad Leads" page. In your Meta app, add the Webhooks product, set the Callback URL to https://mahalaxmifashionhub.com/api/meta/webhook and the Verify Token to the same value you enter below, then subscribe your Page to the "leadgen" field. App Secret is from your Meta app (Settings → Basic). Page Access Token needs the leads_retrieval permission. Secrets stay blank here after saving for security — re-enter only to change them.',
    fields: [
      { key: 'facebookAppSecret', label: 'Meta App Secret', type: 'password' },
      { key: 'metaPageAccessToken', label: 'Page Access Token (with leads_retrieval)', type: 'password' },
      { key: 'metaWebhookVerifyToken', label: 'Webhook Verify Token (choose any secret string — paste same into Meta)', type: 'text' },
    ]
  },
  {
    title: 'SEO — Homepage & Google',
    desc: 'This text appears in Google search results and the browser tab. Leave blank to use defaults. (Product page SEO is generated automatically from each product\'s name/description.)',
    fields: [
      { key: 'seoHomeTitle', label: 'Homepage Meta Title (Google title — best under 60 chars)', type: 'text' },
      { key: 'seoHomeDescription', label: 'Homepage Meta Description (Google snippet — best under 160 chars)', type: 'textarea' },
      { key: 'seoKeywords', label: 'Keywords (comma separated — e.g. saree, nighty, petticoat)', type: 'text' },
      { key: 'seoOgImage', label: 'Social Share Image URL (Open Graph — leave blank for default)', type: 'text' },
      { key: 'seoTwitterSite', label: 'Twitter/X Handle (e.g. @mahalaxmi)', type: 'text' },
    ]
  },
  {
    title: 'SEO — Verification, Analytics & Robots',
    desc: 'Site verification codes, tracking IDs and robots rules. These are added to the HTML head automatically. Leave blank to disable.',
    fields: [
      { key: 'googleSiteVerification', label: 'Google Search Console Verification Code (content value only)', type: 'text' },
      { key: 'bingSiteVerification', label: 'Bing Webmaster Verification Code (content value only)', type: 'text' },
      { key: 'gtmId', label: 'Google Tag Manager ID (e.g. GTM-XXXXXXX)', type: 'text' },
      { key: 'facebookPixelId', label: 'Facebook Pixel ID (numbers only) — leave blank if the Pixel is set up in Cloudflare Zaraz, or every event counts twice', type: 'text' },
      { key: 'facebookDomainVerification', label: 'Meta domain verification token — Business Suite → Brand Safety → Domains → Meta-tag method; paste only the content value', type: 'text' },
      { key: 'metaCapiAccessToken', label: 'Meta Conversions API access token — makes EVERY order reach Meta even when the browser blocks the Pixel, the buyer pays in the app, or through a UPI redirect. Events Manager → your dataset → Settings → Conversions API → Generate access token. Counted once: the order id is sent as the event id on both sides.', type: 'password' },
      { key: 'robotsDisallow', label: 'Robots.txt — extra Disallow paths (one per line, e.g. /admin)', type: 'textarea' },
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
    title: 'Google Ads',
    desc: 'Shows ad spend and the sales it produced under Marketing → Google Ads. It reuses the Google OAuth Client ID and Secret above, so there is no second secret to keep — only the Customer ID is new.',
    fields: [
      { key: 'googleAdsCustomerId',      label: 'Google Ads Customer ID (10 digits, top-right in Google Ads)', type: 'text' },
      { key: 'googleAdsLoginCustomerId', label: 'Manager (MCC) ID — only if your account sits under one', type: 'text' },
      { key: 'googleAdsMaxDailyBudget',  label: 'Highest daily budget admin may set (₹, default 5000)', type: 'text' },
      { key: 'googleAdsApiVersion',      label: 'API version (leave blank unless Google retires the current one)', type: 'text' },
    ]
  },
  {
    title: 'Meta Ads (Facebook & Instagram)',
    desc: 'Shows Facebook/Instagram ad spend and the sales it produced under Marketing \u2192 Meta Ads, and lets you pause, restart and re-budget campaigns from there. Make a System User token in business.facebook.com \u2192 Settings \u2192 Users \u2192 System users, with ads_read and ads_management, and give it access to the ad account. That token does not expire.',
    fields: [
      { key: 'metaAdsAccessToken',   label: 'Meta System User access token', type: 'password' },
      { key: 'metaAdsAccountId',     label: 'Ad Account ID (only the digits after act_ in Ads Manager)', type: 'text' },
      { key: 'metaAdsMaxDailyBudget', label: 'Highest daily budget admin may set (\u20b9, default 5000)', type: 'text' },
      { key: 'metaAdsApiVersion',    label: 'Graph API version (leave blank for v25.0)', type: 'text' },
    ]
  },
  {
    title: 'MSG91 Configuration (SMS & WhatsApp OTP)',
    desc: 'Required for SMS OTP and WhatsApp OTP during registration. Get credentials from msg91.com.',
    fields: [
      { key: 'msg91AuthKey',              label: 'MSG91 Auth Key', type: 'password' },
      { key: 'msg91WhatsappTemplateId',   label: 'WhatsApp OTP Template ID', type: 'text' },
      { key: 'msg91SmsTemplateId',        label: 'SMS OTP Template ID', type: 'text' },
      { key: 'msg91BirthdayTemplateId',         label: '🎂 Birthday UPCOMING — MSG91 id for DLT template "Combirthday" (variables: date, percent, code)', type: 'text' },
      { key: 'msg91BirthdayTodayTemplateId',    label: '🎂 Birthday TODAY — MSG91 id for DLT template "HappyBirthday" (variables: percent, code)', type: 'text' },
      { key: 'msg91AnniversaryTemplateId',      label: '💍 Anniversary UPCOMING — MSG91 id for DLT template "ComAnni" (variables: date, percent, code)', type: 'text' },
      { key: 'msg91AnniversaryTodayTemplateId', label: '💍 Anniversary TODAY — MSG91 id for DLT template "HappyAnniversary" (variables: percent, code)', type: 'text' },
      { key: 'msg91CelebrationTemplateId',      label: 'Fallback OFFER Template ID — only used if a box above is blank. Leave empty once all four are filled.', type: 'text' },
      { key: 'celebrationOfferPercent',   label: 'Offer Discount % (default 10)', type: 'text' },
      { key: 'adminRecoveryPhone',        label: 'Admin Recovery Mobile (for password-reset OTP SMS, with 91)', type: 'text' },
    ]
  },
  {
    title: '📊 Google Analytics — Reliable Purchase Tracking',
    desc: 'Makes EVERY order show as a Purchase in GA4 — even when the customer\'s browser blocks analytics, or they pay through the app / a UPI redirect. Paste your API secret here: GA4 → Admin → Data Streams → your web stream → "Measurement Protocol API secrets" → Create → copy the Secret value. Leave the Measurement ID blank to use the site default.',
    fields: [
      { key: 'ga4ApiSecret',     label: 'GA4 Measurement Protocol API Secret', type: 'password' },
      { key: 'ga4MeasurementId', label: 'GA4 Measurement ID (optional — defaults to G-SFMFYD4NE6)', type: 'text' },
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
    settingsApi.getAllAdmin(getAdminToken() ?? '')
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

  // ── Image upload (hero photos etc.) ──
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const handleImageUpload = async (key: string, file: File | undefined) => {
    if (!file) return;
    setUploadingKey(key);
    try {
      const url = await settingsApi.uploadImage(file, getAdminToken() ?? '');
      set(key, url);
      setMsg('✅ Photo uploaded — now click "Save All Settings".');
    } catch (e) {
      setMsg('❌ Upload failed: ' + (e as Error).message);
    } finally { setUploadingKey(null); }
  };

  // ── Dynamic social links (stored as JSON in form.socialLinks; migrates legacy facebook/instagram) ──
  const socialLinks: { name: string; url: string }[] = (() => {
    try { const r = JSON.parse(form.socialLinks || '[]'); if (Array.isArray(r)) return r; } catch {}
    const legacy: { name: string; url: string }[] = [];
    if (form.facebook)  legacy.push({ name: 'Facebook',  url: form.facebook });
    if (form.instagram) legacy.push({ name: 'Instagram', url: form.instagram });
    return legacy;
  })();
  const saveSocial = (list: { name: string; url: string }[]) => set('socialLinks', JSON.stringify(list));

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

  // Fifteen sections is a long scroll when you know the name of the one thing
  // you came to change. Typing narrows it to the sections that mention it.
  const q = query.trim().toLowerCase();
  const shownSections = !q ? SECTIONS : SECTIONS.filter(sec =>
    sec.title.toLowerCase().includes(q)
    || (sec.desc ?? '').toLowerCase().includes(q)
    || sec.fields.some(f => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)));

  return (
    <div className="admin-page">
      <PageHeader
        title="Store settings"
        sub="Everything the website reads at startup. Nothing here takes effect until you press Save."
        right={
          <button className="adm-btn adm-btn-primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save all settings'}
          </button>
        }
      />

      {msg && (
        <div className="adm-card" style={{ marginBottom: '.85rem', fontSize: '.86rem', fontWeight: 600,
          background: msg.startsWith('✅') ? '#f2faf3' : '#fdf3f2',
          borderColor: msg.startsWith('✅') ? '#cbe6cf' : '#f0cdc9',
          color: msg.startsWith('✅') ? '#2e7d32' : '#c0392b' }}>
          {msg.replace(/^[✅❌]\s*/, '')}
        </div>
      )}

      {!loading && (
        <div className="adm-card" style={{ marginBottom: '.85rem' }}>
          <input className="adm-input" style={{ width: '100%', maxWidth: 360 }}
                 placeholder="Find a setting — try “whatsapp”, “pixel”, “COD”"
                 value={query} onChange={e => setQuery(e.target.value)} />
          {q && (
            <p style={{ margin: '.5rem 0 0', fontSize: '.79rem', color: '#7d736d' }}>
              {shownSections.length} of {SECTIONS.length} sections mention “{query.trim()}”.
              Saving still saves everything, not only what is shown.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <Empty>Loading settings…</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Backup Tools */}
          <div className="adm-card" style={{ padding: '1.1rem 1.15rem' }}>
            <h2 className="adm-card-h">Backup</h2>
            <p style={{ fontSize: '.82rem', color: '#7d736d', margin: '0 0 .9rem', lineHeight: 1.6 }}>Save every setting to a file, or put a saved file back. Worth doing before you change a key you cannot easily get again.</p>
            {backupMsg && (
              <div style={{ padding: '.55rem .8rem', borderRadius: 10, marginBottom: '.85rem', fontSize: '.83rem', fontWeight: 600,
                background: backupMsg.startsWith('✅') ? '#f2faf3' : '#fdf3f2',
                color: backupMsg.startsWith('✅') ? '#2e7d32' : '#c0392b' }}>
                {backupMsg}
              </div>
            )}
            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              <button className="adm-btn" onClick={handleExport}>Download a backup</button>
              <button className="adm-btn" onClick={() => importRef.current?.click()}>Restore from a backup</button>
              <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
            </div>
          </div>

          {shownSections.length === 0 && (
            <div className="adm-card"><Empty>No setting matches that. Clear the search to see them all.</Empty></div>
          )}

          {shownSections.map(section => (
            <div key={section.title} className="adm-card" style={{ padding: '1.1rem 1.15rem' }}>
              <h2 className="adm-card-h" style={{ marginBottom: section.desc ? '.35rem' : '.75rem' }}>{section.title}</h2>
              {section.desc && <p style={{ fontSize: '.82rem', color: '#7d736d', margin: '0 0 .9rem', lineHeight: 1.6 }}>{section.desc}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', alignItems: 'start' }}>
                {section.fields.map(f => (
                  <div key={f.key} style={{ gridColumn: ['address', 'offerText', 'heroText', 'statHeading', 'statEyebrow'].includes(f.key) ? '1 / -1' : undefined }}>
                    <label className="adm-stat-l" style={{ display: 'block', marginBottom: '.3rem' }}>{f.label}</label>
                    {f.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                        <button
                          onClick={() => set(f.key, form[f.key] === 'true' ? 'false' : 'true')}
                          style={{
                            width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer',
                            background: form[f.key] === 'true' ? '#722f37' : '#ddd',
                            position: 'relative', transition: 'background .2s',
                          }}>
                          <span style={{
                            position: 'absolute', top: '3px',
                            left: form[f.key] === 'true' ? '25px' : '3px',
                            width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                            transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                          }} />
                        </button>
                        <span style={{ fontSize: '.85rem', color: form[f.key] === 'true' ? '#722f37' : '#8a7f76', fontWeight: 700 }}>
                          {form[f.key] === 'true' ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    ) : f.type === 'textarea' ? (
                      <textarea className="adm-input" value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}
                        rows={3}
                        style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }} />
                    ) : f.type === 'image' ? (
                      <div>
                        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                          <input className="adm-input" type="text" value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}
                            placeholder="Paste a URL, or upload a photo"
                            style={{ flex: 1, boxSizing: 'border-box' }} />
                          <label className="adm-btn adm-btn-primary" style={{ opacity: uploadingKey === f.key ? .6 : 1 }}>
                            {uploadingKey === f.key ? 'Uploading…' : 'Upload'}
                            <input type="file" accept="image/*" style={{ display: 'none' }}
                              disabled={uploadingKey === f.key}
                              onChange={e => { handleImageUpload(f.key, e.target.files?.[0]); e.target.value = ''; }} />
                          </label>
                        </div>
                        {(form[f.key] ?? '').trim() && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={form[f.key]} alt="preview"
                            style={{ marginTop: '.5rem', width: 90, height: 120, objectFit: 'cover', borderRadius: 9, border: '1px solid #f0eae7', display: 'block' }} />
                        )}
                      </div>
                    ) : f.type === 'password' ? (
                      <input className="adm-input" type="text" value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}
                        placeholder="Paste the key here"
                        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'ui-monospace, monospace' }} />
                    ) : (
                      <input className="adm-input" type={f.type} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Social Media — dynamic list (add any platform + URL) */}
          <div className="adm-card" style={{ padding: '1.1rem 1.15rem' }}>
            <h2 className="adm-card-h">Social media</h2>
            <p style={{ fontSize: '.82rem', color: '#7d736d', margin: '0 0 .9rem', lineHeight: 1.6 }}>These appear in the website footer. Any platform works — the name is the label a visitor sees.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              {socialLinks.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={s.name} onChange={e => saveSocial(socialLinks.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                    placeholder="Platform (e.g. YouTube)" className="adm-input"
                    style={{ flex: '0 0 170px', boxSizing: 'border-box' }} />
                  <input value={s.url} onChange={e => saveSocial(socialLinks.map((x, idx) => idx === i ? { ...x, url: e.target.value } : x))}
                    placeholder="https://…" className="adm-input"
                    style={{ flex: '1 1 240px', boxSizing: 'border-box' }} />
                  <button className="adm-btn" style={{ color: '#c0392b' }}
                    onClick={() => saveSocial(socialLinks.filter((_, idx) => idx !== i))}>Remove</button>
                </div>
              ))}
              {socialLinks.length === 0 && <Empty>No social links yet — add one below and it appears in the footer.</Empty>}
            </div>
            <button className="adm-btn adm-btn-primary" style={{ marginTop: '.8rem' }}
              onClick={() => saveSocial([...socialLinks, { name: '', url: '' }])}>Add a social link</button>
          </div>

          {/* Bottom save bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '.25rem', flexWrap: 'wrap' }}>
            <button className="adm-btn adm-btn-primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save all settings'}
            </button>
            {msg && <span style={{ fontSize: '.9rem', fontWeight: 600 }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
