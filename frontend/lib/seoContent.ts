import { COLLECTIONS, type CollectionDef } from '@/lib/collections';
import { CATEGORY_SEO, type CategorySeo } from '@/lib/categorySeo';
import { POSTS, type BlogPost } from '@/lib/blog';

// Where the site's SEO writing comes from now.
//
// The blog articles, the keyword collection pages and the category copy used to
// live only in the three files imported above, which meant a new article or a
// new keyword page needed a developer and a deploy. They are now also editable
// from the admin panel, and this is the seam between the two.
//
// The rule is: the files are the floor, the database is the edit on top.
//  - A stored entry with the same slug replaces the one in the file.
//  - A stored entry with a new slug is added.
//  - An entry only in the file stays exactly as it is.
//  - Anything marked unpublished disappears from the site — including entries
//    that came from a file, which is how the owner retires a page (the empty
//    saree collections, say) without touching code.
//
// If the API is down or the stored JSON is unreadable, every function here
// falls back to the files. A backend hiccup must never blank the shop's pages.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

interface StoredPost extends BlogPost {
  published?: boolean;
}

interface StoredCollection extends Omit<CollectionDef, 'label'> {
  label?: string;
  published?: boolean;
}

/** One door on the homepage's "Shop by category" row. */
export interface HomeTile {
  label: string;
  href: string;
  /** Empty means: borrow a photo from the products behind the tile. */
  image?: string;
  /** Subcategory words that decide what is counted behind it. */
  terms?: string[];
  published?: boolean;
}

interface SeoContent {
  blog: StoredPost[];
  collections: StoredCollection[];
  categories: Record<string, CategorySeo>;
  homeTiles: HomeTile[];
}

const EMPTY: SeoContent = { blog: [], collections: [], categories: {}, homeTiles: [] };

/**
 * Read the stored content. Cached for a minute by the Next data cache, so a
 * page render costs nothing most of the time; a save in the admin clears it
 * explicitly, so edits show up at once rather than up to a minute later.
 */
export async function loadSeoContent(): Promise<SeoContent> {
  try {
    const res = await fetch(`${API_BASE}/seo-content`, {
      next: { revalidate: 60, tags: ['seo-content'] },
    });
    if (!res.ok) return EMPTY;
    const body = await res.json();
    return {
      blog: Array.isArray(body?.blog) ? body.blog : [],
      collections: Array.isArray(body?.collections) ? body.collections : [],
      categories: body?.categories && typeof body.categories === 'object' ? body.categories : {},
      homeTiles: Array.isArray(body?.homeTiles) ? body.homeTiles : [],
    };
  } catch {
    return EMPTY;
  }
}

// ── Blog ──────────────────────────────────────────────────────────────────────
export async function getPosts(): Promise<BlogPost[]> {
  const { blog } = await loadSeoContent();

  const bySlug = new Map<string, BlogPost>();
  for (const p of POSTS) bySlug.set(p.slug, p);

  for (const p of blog) {
    if (!p?.slug) continue;
    if (p.published === false) {
      bySlug.delete(p.slug);
      continue;
    }
    bySlug.set(p.slug, {
      slug: p.slug,
      title: p.title,
      description: p.description ?? '',
      date: p.date,
      readMinutes: p.readMinutes || 3,
      excerpt: p.excerpt ?? '',
      content: p.content ?? '',
    });
  }

  // Newest first, which is the order the blog index and the sitemap both want.
  return [...bySlug.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function getPost(slug: string): Promise<BlogPost | undefined> {
  return (await getPosts()).find(p => p.slug === slug);
}

// ── Collections ───────────────────────────────────────────────────────────────
export async function getCollections(): Promise<Record<string, CollectionDef>> {
  const { collections } = await loadSeoContent();
  const out: Record<string, CollectionDef> = { ...COLLECTIONS };

  for (const c of collections) {
    if (!c?.slug) continue;
    if (c.published === false) {
      delete out[c.slug];
      continue;
    }
    out[c.slug] = {
      slug: c.slug,
      label: c.label || c.title,
      title: c.title,
      description: c.description ?? '',
      eyebrow: c.eyebrow || 'Collection',
      h1: c.h1 || c.title,
      sub: c.sub ?? '',
      intro: Array.isArray(c.intro) ? c.intro : [],
      faqs: Array.isArray(c.faqs) ? c.faqs : [],
      subcategory: c.subcategory,
      terms: Array.isArray(c.terms) && c.terms.length > 0 ? c.terms : undefined,
      maxPrice: typeof c.maxPrice === 'number' ? c.maxPrice : undefined,
    };
  }

  return out;
}

export async function getCollection(slug: string): Promise<CollectionDef | undefined> {
  return (await getCollections())[slug];
}

export async function getCollectionSlugs(): Promise<string[]> {
  return Object.keys(await getCollections());
}

// ── Category copy ─────────────────────────────────────────────────────────────
export async function getCategorySeo(): Promise<Record<string, CategorySeo>> {
  const { categories } = await loadSeoContent();
  const out: Record<string, CategorySeo> = { ...CATEGORY_SEO };

  for (const [key, c] of Object.entries(categories)) {
    if (!c?.title) continue;
    out[key] = {
      title: c.title,
      description: c.description ?? '',
      heading: c.heading ?? '',
      intro: Array.isArray(c.intro) ? c.intro : [],
      faqs: Array.isArray(c.faqs) ? c.faqs : [],
    };
  }

  return out;
}

// ── Homepage category tiles ───────────────────────────────────────────────────

/**
 * The five doors that ship with the site. They are the floor, not the answer:
 * the moment the owner saves a row in Admin → Home Categories, that replaces
 * this list entirely — including adding categories that did not exist when
 * this code was written, which was the whole point.
 */
export const DEFAULT_HOME_TILES: HomeTile[] = [
  { label: 'Nightwear',      href: '/collections/cotton-nighty',          terms: ['nighty', 'night gown', 'nightwear'] },
  { label: 'Petticoats',     href: '/collections/saree-petticoat',        terms: ['petticoat'] },
  { label: "Men's Footwear", href: '/collections/formal-shoes-for-men',   terms: ['shoe', 'footwear', 'sandal'] },
  { label: 'Innerwear',      href: '/men',                                terms: ['undergarment', 'innerwear', 'shorts'] },
  { label: 'Perfume',        href: '/beauty',                             terms: ['perfume', 'fragrance', 'deo'] },
];

export async function getHomeTiles(): Promise<HomeTile[]> {
  const { homeTiles } = await loadSeoContent();
  const source = homeTiles.length > 0 ? homeTiles : DEFAULT_HOME_TILES;
  return source
    .filter(t => t?.label && t?.href && t.published !== false)
    .map(t => ({ ...t, terms: Array.isArray(t.terms) ? t.terms : [] }));
}
