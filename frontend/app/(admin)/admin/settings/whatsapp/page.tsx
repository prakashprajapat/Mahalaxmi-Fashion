'use client';
import { useEffect, useRef, useState } from 'react';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Pill } from '@/components/admin/Ui';

/* Connect the WhatsApp Business app number to the Cloud API without taking it
   off the phone (Meta "coexistence", via Embedded Signup). Needs the Meta app
   to be a Tech Provider; see the checklist on the page. */

interface Cfg {
  appId: string; configId: string; graphVersion: string; secretSet: boolean; verifyTokenSet: boolean;
  wabaId: string; phoneNumberId: string; connectedAt: string; tokenSaved: boolean;
  contactsSyncAt: string; historySyncAt: string;
  interaktSecretSet?: boolean; interaktLastEventAt?: string; whatsappLeads?: number;
}
type Step = { step: string; ok: boolean; detail?: string };

declare global {
  interface Window { FB?: any; fbAsyncInit?: () => void }
}

const auth = () => ({ Authorization: `Bearer ${getAdminToken() ?? ''}`, 'Content-Type': 'application/json' });

export default function WhatsAppConnectPage() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const ids = useRef<{ waba?: string; phone?: string }>({});
  const code = useRef<string | null>(null);

  const load = async () => {
    const r = await fetch('/api/whatsapp/onboard/config', { headers: auth() });
    if (r.ok) setCfg(await r.json());
  };
  useEffect(() => { load(); }, []);

  // Meta's SDK, only on this page.
  useEffect(() => {
    if (!cfg?.appId) return;
    const init = () => {
      window.FB?.init({ appId: cfg.appId, autoLogAppEvents: true, xfbml: false, version: cfg.graphVersion || 'v26.0' });
      setSdkReady(true);
    };
    if (window.FB) { init(); return; }
    window.fbAsyncInit = init;
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
    document.body.appendChild(s);
  }, [cfg?.appId, cfg?.graphVersion]);

  // The Embedded Signup window reports the account ids by postMessage.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(e.origin).hostname)) return;
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (String(d.event || '').startsWith('FINISH')) {
          ids.current = { waba: d.data?.waba_id, phone: d.data?.phone_number_id };
          trySubmit();
        } else if (d.event === 'CANCEL') {
          setMsg(`Stopped at: ${d.data?.current_step || 'unknown step'}${d.data?.error_message ? ` (${d.data.error_message})` : ''}`);
          setBusy(false);
        }
      } catch { /* not ours */ }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Both halves arrive separately (the code from FB.login, the ids from the
  // message); submit once both are in.
  const trySubmit = async () => {
    if (!code.current || !ids.current.waba) return;
    const c = code.current; code.current = null;
    setMsg('Finishing the connection with Meta…');
    try {
      const r = await fetch('/api/whatsapp/onboard/complete', {
        method: 'POST', headers: auth(),
        body: JSON.stringify({ code: c, wabaId: ids.current.waba, phoneNumberId: ids.current.phone }),
      });
      const b = await r.json().catch(() => ({}));
      setSteps(b.steps ?? []);
      setMsg(b.success ? 'Connected. Contacts and chat history are being synced; numbers will appear in Popup Leads.' : (b.message || 'Something did not finish - see the steps below.'));
      load();
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };

  const connect = () => {
    if (!window.FB || !cfg?.configId) return;
    setBusy(true); setMsg('Follow the steps in the Meta window, and on your phone when WhatsApp asks.'); setSteps([]);
    window.FB.login((res: { authResponse?: { code?: string } }) => {
      if (res?.authResponse?.code) { code.current = res.authResponse.code; trySubmit(); }
      else { setMsg('The Meta window was closed before finishing.'); setBusy(false); }
    }, {
      config_id: cfg.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
    });
  };

  const resync = async () => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/whatsapp/onboard/sync', { method: 'POST', headers: auth() });
    const b = await r.json().catch(() => ({}));
    setSteps(b.steps ?? []); setMsg(b.message || 'Sync requested.'); setBusy(false); load();
  };

  const ready = !!cfg?.appId && !!cfg?.configId && !!cfg?.secretSet && !!cfg?.verifyTokenSet;
  const when = (s?: string) => (s ? new Date(s).toLocaleString('en-IN') : '');

  return (
    <div className="admin-page">
      <PageHeader title="Connect WhatsApp (keep using the app)"
                  sub="Every number that messages your WhatsApp becomes a Popup Lead. Your number +91 94294 29880 is connected through Interakt." />

      <Card title="Through Interakt (in use)">
        {!cfg ? 'Loading…' : (
          <div style={{ fontSize: 14, lineHeight: 1.9 }}>
            <div>Number: <Pill tone="green">Connected in Interakt</Pill> +91 94294 29880</div>
            <div>Secret Key in Settings: {cfg.interaktSecretSet ? <Pill tone="green">saved</Pill> : <Pill tone="red">missing</Pill>}</div>
            <div>Last message from Interakt: {cfg.interaktLastEventAt
              ? <Pill tone="green">{when(cfg.interaktLastEventAt)}</Pill>
              : <Pill tone="amber">nothing received yet</Pill>}</div>
            <div>WhatsApp leads so far: <b>{cfg.whatsappLeads ?? 0}</b> <a href="/admin/popup-leads" style={{ color: '#2563eb' }}>open Popup Leads</a></div>
            <ol style={{ margin: '.6rem 0 0', paddingLeft: '1.2rem', color: '#444' }}>
              <li>Interakt → Settings → <b>Developer Settings</b> → Webhook URL:{' '}
                <code>https://www.mahalaxmifashionhub.com/api/whatsapp/interakt</code></li>
              <li>Secret Key: the same one saved in Settings → &ldquo;WhatsApp auto leads&rdquo;.</li>
              <li>Tick the event <b>message_received</b> (Interakt offers it on its Advanced / Enterprise plans) and save.</li>
              <li>Send &ldquo;Hi&rdquo; to your number from another phone: the time above changes and the number appears in Popup Leads.</li>
            </ol>
          </div>
        )}
      </Card>

      <details style={{ margin: '0 0 1rem' }}>
        <summary style={{ cursor: 'pointer', fontSize: 14, color: '#555', padding: '.4rem 0' }}>
          Direct Meta connection (not needed while Interakt is used)
        </summary>

      <Card title="Before you press Connect (on Meta)">
        <ol style={{ fontSize: 14, lineHeight: 1.8, margin: 0, paddingLeft: '1.2rem' }}>
          <li>Meta app → Use cases → WhatsApp → Customize → <b>Tech Provider onboarding</b>: Business verification, then App Review with
            <b> whatsapp_business_messaging</b> and <b>whatsapp_business_management</b> (Advanced access).</li>
          <li>The app must be <b>Published (Live)</b>.</li>
          <li>WhatsApp → <b>Embedded Signup Builder</b>: create a configuration with <b>WhatsApp Business App Onboarding</b> and copy its <b>Configuration ID</b>.</li>
          <li>Facebook Login for Business settings: add <code>https://www.mahalaxmifashionhub.com</code> to Allowed domains / Valid OAuth redirect URIs.</li>
          <li>WhatsApp → Configuration → Webhook: subscribe <b>messages</b>, <b>account_update</b>, <b>history</b>, <b>smb_app_state_sync</b>, <b>smb_message_echoes</b>.</li>
          <li>The WhatsApp Business app on your phone must be version 2.24.17 or newer.</li>
          <li>If Meta says &ldquo;This Meta Business Account owns the app&rdquo;, the app has to belong to a <b>different</b> business portfolio than the one that owns the WhatsApp number.</li>
        </ol>
      </Card>

      <Card title="Settings">
        {!cfg ? 'Loading…' : (
          <div style={{ fontSize: 14, lineHeight: 1.9 }}>
            <div>App ID: {cfg.appId ? <code>{cfg.appId}</code> : <Pill tone="red">missing</Pill>}</div>
            <div>Embedded Signup Configuration ID: {cfg.configId ? <code>{cfg.configId}</code> : <Pill tone="red">missing</Pill>}</div>
            <div>App Secret: {cfg.secretSet ? <Pill tone="green">saved</Pill> : <Pill tone="red">missing</Pill>} · Webhook verify token: {cfg.verifyTokenSet ? <Pill tone="green">saved</Pill> : <Pill tone="red">missing</Pill>}</div>
            <div style={{ color: '#777', fontSize: 13 }}>Fill these in Settings → &ldquo;WhatsApp auto leads&rdquo;.</div>
          </div>
        )}
      </Card>

      <Card title="Connect">
        {cfg?.connectedAt ? (
          <div style={{ fontSize: 14, lineHeight: 1.9, marginBottom: 12 }}>
            <Pill tone="green">Connected</Pill> on {when(cfg.connectedAt)} · WhatsApp account <code>{cfg.wabaId || '-'}</code> · Phone number id <code>{cfg.phoneNumberId || '-'}</code>
            <div>Contacts sync: {cfg.contactsSyncAt ? `started ${when(cfg.contactsSyncAt)}` : 'not started'} · History sync: {cfg.historySyncAt ? `started ${when(cfg.historySyncAt)}` : 'not started'}</div>
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="adm-btn adm-btn-primary" disabled={!ready || !sdkReady || busy} onClick={connect}>
            {busy ? 'Working…' : cfg?.connectedAt ? 'Connect again' : 'Connect my WhatsApp Business app number'}
          </button>
          {cfg?.connectedAt && (!cfg.contactsSyncAt || !cfg.historySyncAt) && (
            <button className="adm-btn" disabled={busy} onClick={resync}>Start the syncs again (within 24 h of connecting)</button>
          )}
        </div>
        {!ready && cfg && <p style={{ color: '#a3122b', fontSize: 13, marginTop: 8 }}>Fill the missing settings above first.</p>}
        {msg && <p style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>{msg}</p>}
        {steps.length > 0 && (
          <ul style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: '1.1rem' }}>
            {steps.map((s, i) => (
              <li key={i} style={{ color: s.ok ? '#1a7f4b' : '#a3122b' }}>
                {s.ok ? 'OK' : 'FAILED'}: {s.step}{s.detail && s.detail !== 'ok' ? ` - ${s.detail}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>
      </details>
    </div>
  );
}
