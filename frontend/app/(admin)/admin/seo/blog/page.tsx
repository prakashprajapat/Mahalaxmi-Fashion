'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { seoContentApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';
import { POSTS } from '@/lib/blog';
import { Field, Faqs, GooglePreview, btn, TITLE_LIMIT, DESC_LIMIT } from '@/components/admin/SeoFields';

// Writing articles without a developer.
//
// A shop this size will not out-rank Amazon on "cotton nighty". It can very
// easily out-rank them on "which nighty fabric is best for summer", because
// nobody at Amazon is writing that and the owner answers it on WhatsApp five
// times a week. That only works if writing an article takes ten minutes and no
// deploy — which is what this screen is for.

interface Post {
  slug: string;
  title: string;
  description: string;
  date: string;
  readMinutes: number;
  excerpt: string;
  content: string;
  published: boolean;
  /** True for the articles that ship in lib/blog.ts — they can be hidden but not truly deleted. */
  fromCode?: boolean;
}

const blank = (): Post => ({
  slug: '',
  title: '',
  description: '',
  date: new Date().toISOString().slice(0, 10),
  readMinutes: 3,
  excerpt: '',
  content: '<p></p>',
  published: true,
});

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);

/** Rough reading time, the way every blog does it: about 200 words a minute. */
const estimateMinutes = (html: string) =>
  Math.max(1, Math.round(html.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length / 200));

export default function BlogEditorPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    seoContentApi.get()
      .then(r => {
        const stored = new Map<string, any>((r.blog ?? []).map((p: any) => [p.slug, p]));
        // Everything that ships in the code, plus everything stored, with the
        // stored version winning. That way the first save does not lose the
        // three articles that are already live.
        const merged: Post[] = POSTS.map(p => {
          const s = stored.get(p.slug);
          stored.delete(p.slug);
          return { ...p, published: s?.published !== false, ...(s ?? {}), fromCode: true } as Post;
        });
        for (const s of stored.values()) merged.push({ ...s, published: s.published !== false });
        merged.sort((a, b) => (a.date < b.date ? 1 : -1));
        setPosts(merged);
      })
      .catch(() => setPosts(POSTS.map(p => ({ ...p, published: true, fromCode: true }))))
      .finally(() => setLoading(false));
  }, []);

  const patch = (i: number, p: Partial<Post>) =>
    setPosts(ps => ps.map((x, k) => (k === i ? { ...x, ...p } : x)));

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const token = getAdminToken();
      if (!token) throw new Error('Sign in again — your session has expired.');
      // fromCode is a note to this screen, not something the website needs.
      const payload = posts.map(({ fromCode: _drop, ...p }) => p);
      await seoContentApi.saveBlog(payload, token);
      await seoContentApi.publish(token);
      setMsg({ kind: 'ok', text: 'Saved and live on the website.' });
      setEditing(null);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  function remove(i: number) {
    const p = posts[i];
    // An article that ships in the code cannot be deleted from here — hiding it
    // is the honest equivalent, and it can be brought back.
    if (p.fromCode) patch(i, { published: false });
    else setPosts(ps => ps.filter((_, k) => k !== i));
    setEditing(null);
  }

  if (loading) {
    return <div className="admin-page"><div style={{ padding: '3rem', textAlign: 'center', color: '#a49a94' }}>Loading articles…</div></div>;
  }

  const p = editing === null ? null : posts[editing];

  return (
    <div className="admin-page">
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Blog Articles</h1>
          <p className="admin-page-sub">
            Every article is a new page Google can rank. Write one, press Save, it is live — no deploy.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          {editing !== null && (
            <button onClick={() => { setEditing(null); setPreview(false); }} style={btn('ghost')}>← Back to list</button>
          )}
          <button onClick={save} disabled={saving} style={{ ...btn('primary'), opacity: saving ? .6 : 1 }}>
            {saving ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{
          background: msg.kind === 'ok' ? '#eaf6ec' : '#fdecea',
          border: `1px solid ${msg.kind === 'ok' ? '#c3e3c8' : '#f5c6c2'}`,
          color: msg.kind === 'ok' ? '#2e7d32' : '#c0392b',
          borderRadius: 10, padding: '.8rem 1rem', marginBottom: '1rem', fontSize: '.88rem',
        }}>{msg.text}</div>
      )}

      {p === null ? (
        <>
          <button
            onClick={() => { setPosts(ps => [blank(), ...ps]); setEditing(0); }}
            style={{ ...btn('primary'), marginBottom: '1rem' }}
          >
            + Write a new article
          </button>

          <div style={{ background: '#fff', border: '1px solid #eae3e4', borderRadius: 13, overflow: 'hidden' }}>
            {posts.map((post, i) => (
              <div key={post.slug || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '.85rem 1.1rem', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '.92rem', color: post.published ? '#222' : '#aaa' }}>
                    {post.title || <span style={{ color: '#ccc' }}>Untitled</span>}
                    {!post.published && <span style={{ marginLeft: '.5rem', fontSize: '.7rem', color: '#c26a12', fontWeight: 700 }}>HIDDEN</span>}
                  </div>
                  <div style={{ fontSize: '.74rem', color: '#9a908a', marginTop: '.15rem' }}>
                    /blog/{post.slug || '…'} · {post.date} · {post.readMinutes} min read
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '.4rem', flexShrink: 0 }}>
                  {post.published && post.slug && (
                    <Link href={`/blog/${post.slug}`} target="_blank" style={{ ...btn('ghost'), padding: '.35rem .8rem', fontSize: '.78rem', textDecoration: 'none' }}>View</Link>
                  )}
                  <button onClick={() => setEditing(i)} style={{ ...btn('primary'), padding: '.35rem .9rem', fontSize: '.78rem' }}>Edit</button>
                </div>
              </div>
            ))}
            {posts.length === 0 && <div style={{ padding: '3rem', textAlign: 'center', color: '#a49a94' }}>No articles yet.</div>}
          </div>

          <p style={{ fontSize: '.78rem', color: '#9a908a', marginTop: '1rem' }}>
            Nothing is saved until you press <strong>Save &amp; publish</strong> — that one button saves every article on this screen.
          </p>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: '1.25rem', alignItems: 'start' }}>
          <div style={{ background: '#fff', border: '1px solid #eae3e4', borderRadius: 13, padding: '1.25rem' }}>
            <Field
              label="Title" value={p.title} limit={TITLE_LIMIT}
              placeholder="Which Nighty Fabric Is Best for Summer?"
              hint="Write the question a customer would type into Google."
              onChange={v => patch(editing!, { title: v, slug: p.slug || slugify(v) })}
            />
            <Field
              label="Web address (slug)" value={p.slug} mono
              placeholder="best-nighty-fabric-summer"
              hint="Appears as /blog/your-slug. Changing it on a published article loses the ranking it had built — only change it early."
              onChange={v => patch(editing!, { slug: slugify(v) })}
            />
            <Field
              label="Google description" value={p.description} limit={DESC_LIMIT} rows={2}
              hint="The sentence under the title in Google. Say what the reader gets."
              onChange={v => patch(editing!, { description: v })}
            />
            <Field
              label="Excerpt (shown on the blog list page)" value={p.excerpt} rows={2} limit={300}
              onChange={v => patch(editing!, { excerpt: v })}
            />

            <div style={{ display: 'flex', gap: '.75rem', marginBottom: '.9rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#555', marginBottom: '.3rem' }}>Date</div>
                <input type="date" value={p.date.slice(0, 10)} onChange={e => patch(editing!, { date: e.target.value })}
                  style={{ width: '100%', border: '1px solid #e5dcdd', borderRadius: 8, padding: '.55rem .7rem', fontSize: '.88rem' }} />
              </div>
              <div style={{ width: 130 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#555', marginBottom: '.3rem' }}>Read time</div>
                <input type="number" min={1} max={90} value={p.readMinutes}
                  onChange={e => patch(editing!, { readMinutes: Number(e.target.value) || 1 })}
                  style={{ width: '100%', border: '1px solid #e5dcdd', borderRadius: 8, padding: '.55rem .7rem', fontSize: '.88rem' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.3rem' }}>
              <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#555' }}>Article</span>
              <span style={{ display: 'flex', gap: '.6rem', alignItems: 'baseline' }}>
                <button onClick={() => patch(editing!, { readMinutes: estimateMinutes(p.content) })}
                  style={{ background: 'none', border: 'none', color: '#722f37', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                  Set read time from length
                </button>
                <button onClick={() => setPreview(v => !v)}
                  style={{ background: 'none', border: 'none', color: '#722f37', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                  {preview ? 'Edit' : 'Preview'}
                </button>
              </span>
            </div>

            {preview ? (
              <div
                style={{ border: '1px solid #eae3e4', borderRadius: 8, padding: '1rem', fontSize: '.9rem', lineHeight: 1.6, minHeight: 240 }}
                dangerouslySetInnerHTML={{ __html: p.content }}
              />
            ) : (
              <textarea
                value={p.content} rows={18}
                onChange={e => patch(editing!, { content: e.target.value })}
                style={{ width: '100%', border: '1px solid #e5dcdd', borderRadius: 8, padding: '.7rem', fontSize: '.84rem', fontFamily: 'ui-monospace, monospace', lineHeight: 1.6, resize: 'vertical' }}
              />
            )}
            <p style={{ margin: '.3rem 0 0', fontSize: '.74rem', color: '#9a908a' }}>
              Use <code>&lt;p&gt;</code> for paragraphs, <code>&lt;h2&gt;</code> for headings, <code>&lt;ul&gt;&lt;li&gt;</code> for lists,
              <code>&lt;strong&gt;</code> for bold. Anything else is removed when you save, so the website cannot be broken from here.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f2f2f2' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.86rem', fontWeight: 600, color: '#444', cursor: 'pointer' }}>
                <input type="checkbox" checked={p.published} onChange={e => patch(editing!, { published: e.target.checked })} />
                Show on the website
              </label>
              <button onClick={() => remove(editing!)} style={{ ...btn('danger') }}>
                {p.fromCode ? 'Hide this article' : 'Delete'}
              </button>
            </div>
          </div>

          <div style={{ position: 'sticky', top: '1rem', display: 'grid', gap: '1rem' }}>
            <GooglePreview title={p.title} description={p.description} path={`blog/${p.slug}`} />
            <div style={{ background: '#fff', border: '1px solid #eae3e4', borderRadius: 10, padding: '1rem 1.1rem', fontSize: '.8rem', color: '#666', lineHeight: 1.6 }}>
              <strong style={{ display: 'block', marginBottom: '.4rem', color: '#444' }}>What actually ranks</strong>
              Answer one real question per article — the ones customers ask you on WhatsApp. One honest 600-word
              answer beats five thin ones, and an article you would be happy to send a customer is the same thing
              Google is trying to find.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
