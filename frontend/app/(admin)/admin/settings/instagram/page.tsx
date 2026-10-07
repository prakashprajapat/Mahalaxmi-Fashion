'use client';
import { useCallback, useEffect, useState } from 'react';
import { instagramApi, seoContentApi, settingsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { btn } from '@/components/admin/SeoFields';
import InstagramReels from '@/components/home/InstagramReels';
import {
  CAPTION_LIMIT, MAX_REELS, handleOf, parseReels, profileUrlOf,
  serialiseOverrides, serialiseReels, type Reel,
} from '@/lib/instagramReels';

// The "As Seen on Instagram" strip: the switch that puts it on the homepage,
// and where its reels come from.
//
// THE SWITCH was the condition this was built under - it goes live from here
// and from nowhere else - so it is read on the server, in app/(store)/page.tsx,
// before anything is built. Off is not a hidden section: there is no heading in
// the HTML, no tiles, no video requests, nothing for Google to read.
//
// WHERE THE REELS COME FROM is the second decision, and it is separate on
// purpose. Automatic means the server reads the shop's own Instagram account
// every six hours and keeps the row current by itself. By hand means files
// uploaded here. The strip works either way, and the switch above governs both
// - connecting Instagram does not put anything on the website, and turning the
// strip off does not disconnect anything.
//
// In automatic mode the photographs and the clips belong to the pull, so their
// boxes go read-only; the product each tile opens, and a caption worth writing
// instead of thirty hashtags, stay his and are kept against the Instagram
// post's id, so they survive a reel moving up the row.

const SWITCH = 'instagramReelsOn';
const HANDLE = 'instagramHandle';
const REELS = 'instagramReels';
const AUTO = 'instagramAutoSync';
const COUNT = 'instagramSyncCount';
const TOKEN = 'instagramAccessToken';
const OVERRIDES = 'instagramOverrides';

type Status = Awaited<ReturnType<typeof instagramApi.status>>;

const blank = (): Reel => ({ poster: '', video: '', href: '', caption: '' });

const shortDate = (raw?: string | null) => {
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function InstagramStripPage() {
  const [on, setOn] = useState(false);
  const [auto, setAuto] = useState(false);
  const [count, setCount] = useState(6);
  const [handle, setHandle] = useState('');
  const [reels, setReels] = useState<Reel[]>([]);
  const [newToken, setNewToken] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const token = getAdminToken();
    if (!token) { setLoading(false); return; }
    try {
      const [res, st] = await Promise.all([
        settingsApi.getAllAdmin(token),
        instagramApi.status(token).catch(() => null),
      ]);
      const s = res.settings ?? {};
      setOn((s[SWITCH] ?? '').trim() === 'true');
      setAuto((s[AUTO] ?? '').trim() === 'true');
      setCount(Math.min(MAX_REELS, Math.max(1, Number(s[COUNT]) || 6)));
      setHandle(s[HANDLE] ?? '');
      const stored = parseReels(s[REELS]);
      setReels(stored.length > 0 ? stored : [blank()]);
      if (st) setStatus(st);
    } catch {
      setMsg({ kind: 'err', text: 'Could not read the current settings.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  /** Pull now, then show what came back. */
  async function fetchNow() {
    const token = getAdminToken();
    if (!token) { setMsg({ kind: 'err', text: 'Sign in again — your session has expired.' }); return; }
    setPulling(true);
    setMsg(null);
    try {
      const res = await instagramApi.sync(token);
      const notes = (res.notes ?? []).join(' ');
      setMsg({ kind: res.success ? 'ok' : 'err', text: res.message + (notes ? ' ' + notes : '') });
      await load();
      // The homepage is cached; without this the new row is up to five minutes
      // behind the button that fetched it.
      if (res.success) await seoContentApi.publish(token);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not reach Instagram.' });
    } finally {
      setPulling(false);
    }
  }

  async function save() {
    const token = getAdminToken();
    if (!token) { setMsg({ kind: 'err', text: 'Sign in again — your session has expired.' }); return; }

    const kept = reels.filter(r => (r.poster ?? '').trim());

    if (on && !auto && kept.length === 0) {
      setMsg({ kind: 'err', text: 'Nothing to show yet. Add a tile with a photo, switch to automatic, or leave the strip off.' });
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
      // In automatic mode the row itself belongs to the pull, so it is NOT
      // written from here - saving the tiles he is looking at would freeze a
      // snapshot of them and the next pull would have to fight it. Only his own
      // additions go in, keyed by Instagram post id.
      const payload: Record<string, string> = {
        [SWITCH]: on ? 'true' : '',
        [AUTO]: auto ? 'true' : '',
        [COUNT]: String(Math.min(MAX_REELS, Math.max(1, count))),
        [HANDLE]: handleOf(handle),
        ...(auto ? { [OVERRIDES]: serialiseOverrides(kept) } : { [REELS]: serialiseReels(kept) }),
        ...(newToken.trim() ? { [TOKEN]: newToken.trim() } : {}),
      };

      await settingsApi.bulkUpsert(payload, token);
      await seoContentApi.publish(token);

      if (newToken.trim()) {
        // A token is only believable once something has been fetched with it,
        // so connecting runs a pull rather than reporting success on a string
        // that was merely saved.
        setNewToken('');
        await fetchNow();
        return;
      }

      if (auto) await load();
      else setReels(kept.length > 0 ? kept : [blank()]);

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
  const connected = status?.connected === true;

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

      {/* ── where the reels come from ───────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '1.1rem 1.25rem', marginBottom: '1.25rem' }}>
        <strong style={{ display: 'block', fontSize: '.85rem', color: '#2c2724', marginBottom: '.7rem' }}>
          Where the reels come from
        </strong>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setAuto(true)} style={btn(auto ? 'primary' : 'ghost')}>
            Automatically from Instagram
          </button>
          <button type="button" onClick={() => setAuto(false)} style={btn(auto ? 'ghost' : 'primary')}>
            I choose them by hand
          </button>
        </div>
        <p style={{ margin: '.65rem 0 0', fontSize: '.8rem', color: '#8a817b', lineHeight: 1.6 }}>
          {auto
            ? 'The server reads your account every six hours and keeps this row as your newest reels. The files are copied here rather than linked, because Instagram’s own links expire within days — so the row keeps working, and a reel you later delete off Instagram does not vanish from the homepage mid-week.'
            : 'You upload the photos and clips yourself, below. Nothing talks to Instagram.'}
        </p>
      </div>

      {/* ── the connection ──────────────────────────────────────────────── */}
      {auto && (
        <div style={{
          background: connected ? '#f2f8f3' : '#fffaf2',
          border: `1px solid ${connected ? '#bcd9c3' : '#f0e2cc'}`,
          borderRadius: 14, padding: '1.1rem 1.25rem', marginBottom: '1.25rem',
        }}>
          <strong style={{ display: 'block', fontSize: '.85rem', color: '#2c2724', marginBottom: '.4rem' }}>
            {connected ? `Connected${status?.handle ? ` as @${status.handle}` : ''}` : 'Not connected yet'}
          </strong>

          {connected && (
            <p style={{ margin: '0 0 .8rem', fontSize: '.8rem', color: '#5c6b5f', lineHeight: 1.6 }}>
              Last pull {shortDate(status?.lastSyncAt) || 'never'}
              {status?.lastResult ? ` — ${status.lastResult}` : ''}.
              {status?.tokenExpiresAt
                ? ` The connection renews itself on every pull, so it stays alive as long as the site is up; on the last renewal it was good until ${shortDate(status.tokenExpiresAt)}.`
                : ''}
            </p>
          )}

          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="password"
              value={newToken}
              onChange={e => setNewToken(e.target.value)}
              placeholder={connected ? 'Paste a new token to reconnect' : 'Paste the long-lived access token'}
              autoComplete="off"
              style={{ flex: '1 1 320px', border: '1.5px solid #e5dcdd', borderRadius: 10, padding: '.55rem .75rem', fontSize: '.85rem' }}
            />
            {connected && (
              <button type="button" onClick={fetchNow} disabled={pulling} style={btn('ghost')}>
                {pulling ? 'Fetching…' : 'Fetch now'}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginTop: '.8rem' }}>
            <label style={{ fontSize: '.8rem', color: '#6b625c', fontWeight: 600 }}>How many to show</label>
            <input
              type="number" min={1} max={MAX_REELS} value={count}
              onChange={e => setCount(Math.min(MAX_REELS, Math.max(1, Number(e.target.value) || 1)))}
              style={{ width: 70, border: '1.5px solid #e5dcdd', borderRadius: 10, padding: '.4rem .5rem', fontSize: '.85rem' }}
            />
            <span style={{ fontSize: '.78rem', color: '#9a918b' }}>newest first, {MAX_REELS} at most</span>
          </div>

          {!connected && (
            <div style={{ marginTop: '1rem', fontSize: '.8rem', color: '#6b5a3c', lineHeight: 1.75 }}>
              <strong style={{ display: 'block', marginBottom: '.3rem', color: '#8a6420' }}>
                What to do once, on Meta’s side
              </strong>
              <ol style={{ margin: 0, paddingLeft: '1.1rem' }}>
                <li>In the Instagram app, make the account a <b>professional</b> one — Business or Creator. Free, and it takes a minute.</li>
                <li>At developers.facebook.com, create an app and add the <b>Instagram</b> product.</li>
                <li>In its Instagram settings, generate a <b>long-lived access token</b> for your own account.</li>
                <li>Paste it in the box above and press Save.</li>
              </ol>
              <p style={{ margin: '.6rem 0 0' }}>
                No App Review and no business verification: reading your own account needs only
                Standard Access. Paste the token here and nowhere else — it is the whole key to
                that account, and this screen is the only place on this site that should ever hold it.
              </p>
            </div>
          )}
        </div>
      )}

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
          address — either works. {auto ? 'On automatic it fills itself in from the account.' : 'Leave it blank and the corner link is left off.'}
        </p>
      </div>

      {/* ── the tiles ───────────────────────────────────────────────────── */}
      {auto && ready.length === 0 ? (
        <p style={{ fontSize: '.85rem', color: '#8a817b', padding: '1.5rem', textAlign: 'center', background: '#fff', border: '1px dashed #e5dcdd', borderRadius: 14 }}>
          Nothing fetched yet. Connect the account above and press Fetch now.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {reels.map((r, i) => (
            <div key={r.id ?? i} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '1rem 1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.8rem' }}>
                <strong style={{ fontSize: '.85rem', color: '#722f37' }}>Tile {i + 1}</strong>
                {!auto && (
                  <div style={{ display: 'flex', gap: '.4rem' }}>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={btn('ghost')}>&uarr;</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === reels.length - 1} style={btn('ghost')}>&darr;</button>
                    <button type="button" onClick={() => remove(i)} style={btn('danger')}>Remove</button>
                  </div>
                )}
              </div>

              {auto ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', marginBottom: '.9rem' }}>
                  <Thumb value={r.poster} kind="image" />
                  {r.video ? <Thumb value={r.video} kind="video" /> : null}
                  <span style={{ fontSize: '.78rem', color: '#9a918b' }}>
                    From Instagram{r.video ? '' : ' — still photo, no clip'}
                  </span>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                  <Field label="Photo (required)" hint="The still the tile shows. Portrait, 9:16 — a reel’s own cover frame is exactly right. Max 8 MB.">
                    <MediaBox
                      value={r.poster} kind="image" busy={busy === `${i}:poster`} accept="image/*"
                      onPick={f => upload(i, 'poster', f)} onClear={() => patch(i, { poster: '' })} />
                  </Field>
                  <Field label="Clip (optional)" hint="A .mp4 under 8 MB — about 10 seconds at 720p. Without one the tile is a still photo, which is fine.">
                    <MediaBox
                      value={r.video ?? ''} kind="video" busy={busy === `${i}:video`} accept="video/mp4,video/webm,video/quicktime"
                      onPick={f => upload(i, 'video', f)} onClear={() => patch(i, { video: '' })} />
                  </Field>
                </div>
              )}

              <div style={{ display: 'grid', gap: '.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: auto ? 0 : '.9rem' }}>
                <Field label="Opens (optional)" hint="A page on this site, like /products/41. Blank means the tile is not tappable.">
                  <input value={r.href ?? ''} onChange={e => patch(i, { href: e.target.value })} placeholder="/products/41" style={inputStyle} />
                </Field>
                <Field
                  label={`Caption (optional, ${(r.caption ?? '').length}/${CAPTION_LIMIT})`}
                  hint={auto
                    ? 'Replaces the Instagram caption on the website. Kept through every pull.'
                    : 'One short line under the tile. Say the thing a photo cannot — the fabric, or the size she is wearing.'}>
                  <input value={r.caption ?? ''} maxLength={CAPTION_LIMIT} onChange={e => patch(i, { caption: e.target.value })} placeholder="Cotton nighty, size L" style={inputStyle} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', margin: '1.1rem 0 0' }}>
        {!auto && (
          <button type="button" onClick={() => setReels(rs => [...rs, blank()])} disabled={reels.length >= MAX_REELS} style={btn('ghost')}>
            + Add a tile
          </button>
        )}
        <button type="button" onClick={save} disabled={saving || pulling} style={btn('primary')}>
          {saving ? 'Saving…' : on ? 'Save and put it live' : 'Save'}
        </button>
      </div>

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
          {auto
            ? 'Automatic keeps the row current, but it cannot make reels. If nothing new is posted for a month, the homepage quietly shows a month-old row — which reads as a shop that stopped, and is worse than having no section at all. Four to six reels a month is what this is worth having for.'
            : 'This section only works while it is fresh. Four to six reels a month, swapped in here, and it reads as a shop that is busy. The same three reels in November that were there in August read as a shop that stopped — turn it off with the button above rather than leaving the old ones up.'}
          {withVideo === 0 && ready.length > 0 ? ' Right now none of the tiles has a clip, so the row will not move — stills only.' : ''}
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
 * What is actually in a slot, at a glance.
 *
 * It matters more than it looks: eight rows of identical grey "Choose file"
 * buttons is how a photo ends up on the wrong tile, and there is no way to
 * notice until it is on the homepage.
 */
function Thumb({ value, kind }: { value: string; kind: 'image' | 'video' }) {
  return (
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
  );
}

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
      <Thumb value={value} kind={kind} />
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
