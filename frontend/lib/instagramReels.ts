// The "As Seen on Instagram" strip: what one tile is, and how the row is
// stored.
//
// Two decisions are worth writing down, because both look like the harder
// option until you try the easy one.
//
// FIRST: the clips are our own files, not Instagram embeds. An embed is one
// line of markup and would have been quicker. It also means Instagram's script
// running on every homepage visit, three or four requests to their CDN before
// anything appears, a tile that silently empties the day a post is deleted or
// the account goes private, and - the part that would actually have stopped it -
// `script-src` and `connect-src` in next.config.js opened up to Instagram. Those
// lists were narrowed on purpose after an audit. A reel downloaded once and
// uploaded here costs the shop one file and reopens nothing.
//
// SECOND: a tile's video is OPTIONAL and its poster is not. A reel that has not
// been uploaded yet, or a post that was only ever a photograph, still makes a
// perfectly good tile - it just does not move. The other way round is useless:
// a video with no poster shows a black square until it has downloaded enough to
// paint a frame, which on a phone is exactly where the shopper is looking.
//
// The row is stored as JSON in one site setting (`instagramReels`), the same way
// the hero slides are. It is small - eight tiles of short strings - and it is
// read by the homepage, which already fetches settings on the server. It is not
// in the never-public list in SettingsController because it is meant to be seen.

export interface Reel {
  /** The still frame. Required: it is what the tile shows before, and instead of, any video. */
  poster: string;
  /** A short clip, if there is one. Served from /api/settings/media/... */
  video?: string;
  /** Where tapping the tile goes — a product or a collection on our own site. */
  href?: string;
  /** One line under the tile. Kept short on purpose; this is not a caption field. */
  caption?: string;
}

/** Eight is two full rows on a phone and one on a desktop. More than that is a gallery, not a strip. */
export const MAX_REELS = 8;
export const CAPTION_LIMIT = 70;

const isPath = (v: unknown): v is string =>
  typeof v === 'string' && /^(https?:\/\/|\/)/.test(v.trim());

/**
 * Read the stored setting into tiles.
 *
 * Anything malformed gives an empty row rather than throwing. This is read
 * while the homepage is being rendered on the server, so a stray character in
 * the setting must cost the shop a missing strip, never the whole page.
 */
export function parseReels(raw?: string | null): Reel[] {
  if (!raw || !raw.trim()) return [];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(data)) return [];

  return data
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(r => ({
      poster: isPath(r.poster) ? (r.poster as string).trim() : '',
      video: isPath(r.video) ? (r.video as string).trim() : undefined,
      href: typeof r.href === 'string' && r.href.trim() ? r.href.trim() : undefined,
      caption: typeof r.caption === 'string' ? r.caption.trim().slice(0, CAPTION_LIMIT) : undefined,
    }))
    .filter(r => r.poster !== '')
    .slice(0, MAX_REELS);
}

/** Back to the stored form, with the empty fields left out so the setting stays small. */
export function serialiseReels(reels: Reel[]): string {
  const clean = reels
    .filter(r => isPath(r.poster))
    .slice(0, MAX_REELS)
    .map(r => ({
      poster: r.poster.trim(),
      ...(r.video?.trim() ? { video: r.video.trim() } : {}),
      ...(r.href?.trim() ? { href: r.href.trim() } : {}),
      ...(r.caption?.trim() ? { caption: r.caption.trim().slice(0, CAPTION_LIMIT) } : {}),
    }));
  return JSON.stringify(clean);
}

/** The @handle, however he typed it — with or without the @, or as a full profile URL. */
export function handleOf(raw?: string | null): string {
  const v = (raw ?? '').trim();
  if (!v) return '';
  const fromUrl = v.match(/instagram\.com\/([^/?#]+)/i);
  return (fromUrl ? fromUrl[1] : v).replace(/^@/, '').trim();
}

export function profileUrlOf(raw?: string | null): string {
  const h = handleOf(raw);
  return h ? `https://www.instagram.com/${h}/` : '';
}
