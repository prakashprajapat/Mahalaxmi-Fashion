'use client';
import { useEffect, useState } from 'react';
import { seoContentApi, settingsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { btn } from '@/components/admin/SeoFields';
import InstagramReels from '@/components/home/InstagramReels';
import {
  CAPTION_LIMIT, MAX_REELS, handleOf, parseReels, profileUrlOf, serialiseReels, type Reel,
} from '@/lib/instagramReels';

// The "As Seen on Instagram" strip, and the switch that decides whether the
// homepage has one.
//
// The switch is the point of this screen. The strip was asked for with one
// condition attached - build it, but it only goes live from a button here - and
// that condition is right: a section like this is worth having when there are
// six fresh reels in it and actively harmful when there are two from last
// season, because a shopper reads a stale strip as a shop nobody is minding.
// So "off" here is not a half-measure or a hidden div. The homepage is rendered
// on the server, reads this setting there, and when it is off the section is
// never built at all - no markup, no clips, no requests.
//
// The preview below is the real component with the real files, so there is no
// guessing between saving and looking.

const SWITCH = 'instagramReelsOn';
const HANDLE = 'instagramHandle';
const REELS = 'instagramReels';

const blank = (): Reel => ({ poster: '', video: '', href: '', caption: '' });

export default function InstagramStripPage() {
  const [on, setOn] = useState(false);
  const [handle, setHandle] = useState('');
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) { setLoading(false); return; }
    settingsApi.getAllAdmin(token)
      .then(res => {
        const s = res.settings ?? {};
        setOn((s[SWITCH] ?? '').trim() === 'true');
        setHandle(s[HANDLE] ?? '');
        const stored = parseReels(s[REELS]);
        setReels(stored.length > 0 ? stored : [blank()]);
      })
      .catch(() => setMsg({ kind: 'err', text: 'Could not read the current settings.' }))
      .finally(() => setLoading(false));
  }, []);

  const patch = (i: number, p: Partial<Reel>) =>
    setReels(rs => rs.map((r, n) => (n === i ? { ...r, ...p } : r)));

  const remove = (i: number) => setReels(rs => rs.filter((_, n) => n !== i));

  const move = (i: number, by: number) => setReels(rs => {
    const to = i + by;
    if (to < 0 || to >= rs.length) return rs;
    const copy = [...rs];
    [copy[i], copy[to]] = [copy[to], copy[i]];
    return copy;
  });

  async function upload(i: number, field: 'poster' | 'video', file: File) {
    const token = getAdminToken();
    if (!token) { setMsg({ kind: 'err', text: 'Sign in again — your session has expired.' }); return; }
    setBusy(`${i}:${field}`);
    setMsg(null);
    try {
      const url = await settingsApi.uploadMedia(file, token);
      patch(i, { [field]: url } as Partial<Reel>);
    } catch (e) {
      setMsg({ kind: 'err', text: 'Upload failed: ' + (e instanceof Error ? e.message : 'unknown error') });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const kept = reels.filter(r => (r.poster ?? '').trim());

    // Turning it on with nothing to show would put an empty heading on the
    // homepage. The switch and the tiles are saved together, so this is caught
    // before either lands rather than after one of them does.
    if (on && kept.length === 0) {
      setMsg({ kind: 'err', text: 'Nothing to show yet. Add at least one tile with a photo, or leave the strip off.' });
      return;
    }

    const badLink = kept.find(r => (r.href ?? '').trim() && !(r.href ?? '').trim().startsWith('/'));
    if (badLink) {
      setMsg({ kind: 'err', text: 'A tile link must be a page on this site, so it starts with "/" — for example /products/41.' });
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      const token = getAdminToken();
      if (!token) throw new Error('Sign in again — your session has expired.');
      await settingsApi.bulkUpsert({
        [SWITCH]: on ? 'true' : '',
        [HANDLE]: handleOf(handle),
        [REELS]: serialiseReels(kept),
      }, token);
      // The homepage is cached for five minutes. Without this, a switch pressed
      // here does nothing visible for up to five minutes, which reads as a
      // broken button.
      await seoContentApi.publish(token);
      setReels(kept.length > 0 ? kept : [blank()]);
      setMsg({
        kind: 'ok',
        text: on
          ? `Saved and live — ${kept.length} ${kept.length === 1 ? 'tile is' : 'tiles are'} on the homepage now.`
          : 'Saved. The strip is off, so the homepage does not show it at all.',
      });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="admin-page"><div style={{ padding: '3rem', textAlign: 'center', color: '#a49a94' }}>Loading…</div></div>;
  }

  const ready = reels.filter(r => (r.poster ?? '').trim());
  const withVideo = ready.filter(r => (r.video ?? '').trim()).length;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>As Seen on Instagram</h1>
        <p className="admin-page-sub">
          A row of your reels on the homepage, below “Most loved”. It is the only place on the
          site where a customer sees the cloth on a person in ordinary light — which is the one
          thing a product photo cannot show, and the reason most returns say “it did not look
          like the picture”.
        </p>
      </div>

      {/* ── the switch ──────────────────────────────────────────────────── */}
      <div style={{
        background: on ? '#f2f8f3' : '#fff', border: `1.5px solid ${on ? '#bcd9c3' : '#e5dcdd'}`,
        borderRadius: 14, padding: '1.1rem 1.25rem', marginBottom: '1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div>
          <strong style={{ display: 'block', fontSize: '.95rem', color: '#2c2724' }}>
            {on ? 'The strip is ON' : 'The strip is OFF'}
          </strong>
          <span style={{ fontSize: '.82rem', color: '#6b625c' }}>
            {on
              ? 'It is on the homepage. Press Save after any change here, or the homepage keeps showing the old row.'
              : 'The homepage does not build this section at all. Nothing is hidden — it simply is not there.'}
          </span>
        </div>
        <button type="button" onClick={() => setOn(v => !v)} style={btn(on ? 'ghost' : 'primary')}>
          {on ? 'Turn it off' : 'Turn it on'}
        </button>
      </div>

      {/* ── the handle ──────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '1.1rem 1.25rem', marginBottom: '1.25rem' }}>
        <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 700, color: '#6b625c', marginBottom: '.4rem' }}>
          Instagram username
        </label>
        <input
          value={handle}
          onChange={e => setHandle(e.target.value)}
          placeholder="mahalaxmifashionhub"
          style={{ width: '100%', maxWidth: 380, border: '1.5px solid #e5dcdd', borderRadius: 10, padding: '.55rem .75rem', fontSize: '.88rem' }}
        />
        <p style={{ margin: '.5rem 0 0', fontSize: '.78rem', color: '#8a817b' }}>
          Shown as a link in the corner of the section. Paste the @name or the whole profile
          address — either works. Leave it blank and the corner link is left off.
        </p>
      </div>

      {/* ── the tiles ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {reels.map((r, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '1rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.8rem' }}>
              <strong style={{ fontSize: '.85rem', color: '#722f37' }}>Tile {i + 1}</strong>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={btn('ghost')}>↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === reels.length - 1} style={btn('ghost')}>↓</button>
                <button type="button" onClick={() => remove(i)} style={btn('danger')}>Remove</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {/* poster */}
              <Field
                label="Photo (required)"
                hint="The still the tile shows. Portrait, 9:16 — a reel's own cover frame is exactly right. Max 8 MB."
              >
                <MediaBox
                  value={r.poster}
                  kind="image"
                  busy={busy === `${i}:poster`}
                  accept="image/*"
                  onPick={f => upload(i, 'poster', f)}
                  onClear={() => patch(i, { poster: '' })}
                />
              </Field>

              {/* video */}
              <Field
                label="Clip (optional)"
                hint="A .mp4 under 8 MB — about 10 seconds at 720p. Without one the tile is a still photo, which is fine."
              >
                <MediaBox
                  value={r.video ?? ''}
                  kind="video"
                  busy={busy === `${i}:video`}
                  accept="video/mp4,video/webm,video/quicktime"
                  onPick={f => upload(i, 'video', f)}
                  onClear={() => patch(i, { video: '' })}
                />
              </Field>
            </div>

            <div style={{ display: 'grid', gap: '.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: '.9rem' }}>
              <Field label="Opens (optional)" hint="A page on this site, like /products/41 or /collections/cotton-nighty. Blank means the tile is not tappable.">
                <input
                  value={r.href ?? ''}
                  onChange={e => patch(i, { href: e.target.value })}
                  placeholder="/products/41"
                  style={inputStyle}
                />
              </Field>
              <Field label={`Caption (optional, ${(r.caption ?? '').length}/${CAPTION_LIMIT})`} hint="One short line under the tile. Say the thing a photo cannot — the fabric, or the size she is wearing.">
                <input
                  value={r.caption ?? ''}
                  maxLength={CAPTION_LIMIT}
                  onChange={e => patch(i, { caption: e.target.value })}
                  placeholder="Cotton nighty, size L"
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', margin: '1.1rem 0 0' }}>
        <button
          type="button"
          onClick={() => setReels(rs => [...rs, blank()])}
          disabled={reels.length >= MAX_REELS}
          style={btn('ghost')}
        >
          + Add a tile
        </button>
        <button type="button" onClick={save} disabled={saving} style={btn('primary')}>
          {saving ? 'Saving…' : on ? 'Save and put it live' : 'Save'}
        </button>
      </div>

      {reels.length >= MAX_REELS && (
        <p style={{ margin: '.6rem 0 0', fontSize: '.78rem', color: '#8a817b' }}>
          {MAX_REELS} is the most. Past that it stops being a strip and becomes a second gallery
          between the products and the reviews.
        </p>
      )}

      {msg && (
        <p style={{
          margin: '1rem 0 0', padding: '.7rem .9rem', borderRadius: 10, fontSize: '.85rem',
          background: msg.kind === 'ok' ? '#f2f8f3' : '#fdf3f2',
          color: msg.kind === 'ok' ? '#2f6b3d' : '#9c2f28',
          border: `1px solid ${msg.kind === 'ok' ? '#bcd9c3' : '#f0cfcb'}`,
        }}>
          {msg.text}
        </p>
      )}

      {/* ── the honest part ─────────────────────────────────────────────── */}
      <div style={{ background: '#fffaf2', border: '1px solid #f0e2cc', borderRadius: 14, padding: '1rem 1.15rem', marginTop: '1.25rem' }}>
        <strong style={{ display: 'block', fontSize: '.85rem', color: '#8a6420', marginBottom: '.35rem' }}>
          Worth knowing before you leave this on
        </strong>
        <p style={{ margin: 0, fontSize: '.82rem', color: '#6b5a3c', lineHeight: 1.6 }}>
          This section only works while it is fresh. Four to six reels a month, swapped in here,
          and it reads as a shop that is busy. The same three reels in November that were there in
          August read as a shop that stopped — which is worse than not having the section, because
          the homepage is now carrying a dated row instead of nothing. If a month goes by without
          new reels, turn it off with the button above rather than leaving the old ones up.
          {withVideo === 0 && ready.length > 0 && ' Right now none of the tiles has a clip, so the row will not move — stills only.'}
        </p>
      </div>

      {/* ── preview ─────────────────────────────────────────────────────── */}
      {ready.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ fontSize: '.7rem', color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.6rem' }}>
            How this looks on the homepage{on ? '' : ' once you turn it on'}
          </div>
          <div style={{ background: '#fdfaf7', border: '1px solid #eee', borderRadius: 14, padding: '.5rem 0 1.5rem' }}>
            <InstagramReels reels={ready} handle={handleOf(handle)} profileUrl={profileUrlOf(handle)} />
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1.5px solid #e5dcdd', borderRadius: 10,
  padding: '.55rem .75rem', fontSize: '.85rem',
};

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '.76rem', fontWeight: 700, color: '#6b625c', marginBottom: '.35rem' }}>
        {label}
      </label>
      {children}
      <p style={{ margin: '.35rem 0 0', fontSize: '.73rem', color: '#9a918b', lineHeight: 1.5 }}>{hint}</p>
    </div>
  );
}

/**
 * A file box that shows what is already there.
 *
 * The thumbnail matters more than it looks: eight tiles of identical grey
 * "Choose file" buttons is how a photo ends up on the wrong row, and there is
 * no way to notice until it is on the homepage.
 */
function MediaBox({
  value, kind, busy, accept, onPick, onClear,
}: {
  value: string;
  kind: 'image' | 'video';
  busy: boolean;
  accept: string;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem' }}>
      <div style={{
        width: 54, height: 96, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
        background: '#f2ece7', border: '1px solid #e5dcdd',
        display: 'grid', placeItems: 'center', fontSize: '.65rem', color: '#a49a94',
      }}>
        {value
          ? (kind === 'video'
            // eslint-disable-next-line jsx-a11y/media-has-caption
            ? <video src={value} muted loop playsInline autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
          : (kind === 'video' ? 'no clip' : 'no photo')}
      </div>
      <div style={{ display: 'grid', gap: '.35rem' }}>
        <input
          type="file"
          accept={accept}
          disabled={busy}
          onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }}
          style={{ fontSize: '.74rem', maxWidth: 180 }}
        />
        {busy && <span style={{ fontSize: '.73rem', color: '#722f37' }}>Uploading…</span>}
        {value && !busy && (
          <button type="button" onClick={onClear} style={{ ...btn('ghost'), padding: '.3rem .6rem', fontSize: '.72rem', justifySelf: 'start' }}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
