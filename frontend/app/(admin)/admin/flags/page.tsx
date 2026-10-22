'use client';
import { useState, useEffect, useCallback } from 'react';
import { flagsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Card, Empty } from '@/components/admin/Ui';

type Flag = {
  key: string;
  title: string;
  what: string;
  ifItBreaks: string;
  state: 'off' | 'staff' | 'on';
};

// Deploying a change and turning it on are two different acts. A feature can
// sit in production switched off, behaving exactly as the shop did yesterday,
// and be turned on later while somebody is watching - then turned back off in
// the time it takes to press a button, instead of the minutes a deploy takes.
//
// No percentages here on purpose. A 1% rollout needs enough traffic for 1% to
// mean something; at this shop it is a couple of people a day. The useful
// middle setting is Staff: live on the real site for whoever is signed into
// the panel, invisible to every customer.
const CHOICES: { value: Flag['state']; label: string; hint: string; colour: string }[] = [
  { value: 'off',   label: 'Off',        hint: 'Nobody. The shop behaves as it did before this feature existed.', colour: '#7d736d' },
  { value: 'staff', label: 'Staff only', hint: 'You and your staff, on the live site. No customer sees it.',      colour: '#b8860b' },
  { value: 'on',    label: 'Everyone',   hint: 'Every customer.',                                                 colour: '#2e7d32' },
];

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await flagsApi.list(getAdminToken() ?? '');
      setFlags(res.flags as Flag[]);
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const set = async (key: string, state: Flag['state']) => {
    setBusy(key); setMsg('');
    try {
      await flagsApi.set(key, state, getAdminToken() ?? '');
      setFlags(f => f.map(x => (x.key === key ? { ...x, state } : x)));
      setMsg(`Saved. It takes effect within about ten seconds — no deploy needed.`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title="Feature Switches" />

      <p style={{ fontSize: '.85rem', color: '#7d736d', margin: '0 0 1rem', lineHeight: 1.7, maxWidth: 760 }}>
        New code can be live on the server and still switched off. Turn something on when you
        have a few minutes to watch it; if it misbehaves, switch it back off here — that takes
        seconds, where a deploy takes minutes. <strong>Off means the shop behaves exactly as it
        did before the feature existed</strong>, not an approximation of it.
      </p>

      {msg && (
        <p style={{ fontSize: '.85rem', fontWeight: 700, margin: '0 0 1rem',
                    color: msg.startsWith('Saved') ? '#2e7d32' : '#c0392b' }}>{msg}</p>
      )}

      {loading ? <Empty>Loading…</Empty>
        : flags.length === 0 ? <Empty>No switches.</Empty>
        : flags.map(f => (
          <Card key={f.key} title={f.title}>
            <p style={{ fontSize: '.84rem', color: '#4a4440', margin: '0 0 .6rem', lineHeight: 1.65 }}>
              {f.what}
            </p>
            <p style={{ fontSize: '.8rem', color: '#c0392b', margin: '0 0 .9rem', lineHeight: 1.6 }}>
              <strong>If it misbehaves:</strong> {f.ifItBreaks}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
              {CHOICES.map(c => {
                const picked = f.state === c.value;
                return (
                  <button
                    key={c.value}
                    onClick={() => set(f.key, c.value)}
                    disabled={busy === f.key || picked}
                    title={c.hint}
                    className="adm-btn"
                    style={{
                      background: picked ? c.colour : undefined,
                      color: picked ? '#fff' : undefined,
                      borderColor: picked ? c.colour : undefined,
                      fontWeight: picked ? 800 : 600,
                      opacity: busy === f.key && !picked ? 0.5 : 1,
                    }}>
                    {c.label}
                  </button>
                );
              })}
            </div>

            <p style={{ fontSize: '.76rem', color: '#7d736d', margin: '.6rem 0 0' }}>
              Now: <strong>{CHOICES.find(c => c.value === f.state)?.label ?? f.state}</strong>
              {' — '}{CHOICES.find(c => c.value === f.state)?.hint}
            </p>
          </Card>
        ))}
    </>
  );
}
