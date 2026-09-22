import { NextRequest, NextResponse } from 'next/server';
import { productsApi } from '@/lib/api';
import { matchesCollection } from '@/lib/collections';
import { getCollections, getCategorySeo, getPosts } from '@/lib/seoContent';
import type { Product } from '@/types';

// The SEO check, run on the server so it can see things the browser cannot:
// the live sitemap, robots.txt, and the admin-only settings that decide the
// homepage title.
//
// What this does NOT do, and cannot: improve rankings. Rankings come from
// backlinks, the Google Business Profile, and content that people actually
// want — none of which a button can produce. What it does is find the
// mechanical faults that quietly hold a shop back: pages that exist but are
// empty, two pages competing for the same keyword, products Google cannot
// describe because they have no text. Those are worth finding, and they are
// the sort of thing that is invisible until something goes looking.
//
// It changes nothing. Every check is a read.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Severity = 'critical' | 'warning' | 'info';

interface FindingItem {
  label: string;
  href?: string;
  note?: string;
}

interface Finding {
  id: string;
  severity: Severity;
  area: string;
  title: string;
  /** Why this matters, in plain language — no jargon, no scare tactics. */
  detail: string;
  /** What to actually do about it. */
  fix: string;
  count?: number;
  items?: FindingItem[];
}

const SITE = 'https://www.mahalaxmifashionhub.com';

// Mirrors lib/api.ts. This route only ever runs on the server, so the
// localhost fallback is the one that matters.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

/** Google shows roughly 60 characters of a title and 160 of a description. */
const TITLE_MAX = 60;
const DESC_MAX = 160;
const DESC_MIN = 70;

/** A product description shorter than this tells Google almost nothing. */
const PRODUCT_DESC_MIN = 50;

function sizesOf(p: Product): string[] {
  if (!p.extraJson) return [];
  try {
    const ex = typeof p.extraJson === 'string' ? JSON.parse(p.extraJson) : p.extraJson;
    const s = ex?.sizes;
    return Array.isArray(s) ? s.filter((x: unknown) => typeof x === 'string' && x.trim()) : [];
  } catch {
    return [];
  }
}

/**
 * Names like "ID6026BROWN FORMAL SHEOS" are warehouse codes that escaped onto
 * the website. They become the Google result title, so a shopper searching for
 * formal shoes sees a serial number and scrolls past.
 *
 * The test is deliberately narrow: two or more capitals followed by two or
 * more digits. That catches ID6026BROWN and MFH11 while leaving alone the
 * things that legitimately mix letters and numbers in a product name —
 * "100ML", "50ML EDP", "UK7", "R15", "6.5 Meter". A false positive here costs
 * the owner a pointless edit, so the rule errs towards saying nothing.
 */
function looksLikeInternalCode(name: string): boolean {
  return /\b[A-Z]{2,}\d{2,}[A-Z0-9]*\b/.test(name);
}

/**
 * Verify the caller really is an admin by asking the backend, not by trusting
 * the token's own claims — a JWT says whatever whoever made it wanted it to say.
 *
 * This deliberately does not go through settingsApi. That helper opts server-side
 * GETs into the Next Data Cache, and /settings/admin returns the shop's secrets.
 * A cached copy of that is not something to leave lying around a shared cache,
 * so this asks for it directly with caching off.
 */
async function authorisedSettings(token: string): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`${API_BASE}/settings/admin`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = await res.json();
    return (body?.settings ?? {}) as Record<string, string>;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ success: false, message: 'Sign in as admin first.' }, { status: 401 });
  }

  const settings = await authorisedSettings(token);
  if (!settings) {
    return NextResponse.json(
      { success: false, message: 'That account cannot run the SEO check — it needs the Settings permission.' },
      { status: 403 },
    );
  }

  let products: Product[] = [];
  let productsError: string | null = null;
  try {
    const r = await productsApi.getAll({ pageSize: 1000 });
    products = (r.products ?? []) as Product[];
  } catch (e) {
    productsError = e instanceof Error ? e.message : 'The product API did not answer.';
  }

  // The live definitions: the code files plus whatever has been edited in the
  // admin. Checking the code defaults would mean reporting on a version of the
  // site that no longer exists.
  const [COLLECTIONS, CATEGORY_SEO, POSTS] = await Promise.all([
    getCollections(),
    getCategorySeo(),
    getPosts(),
  ]);

  const findings: Finding[] = [];
  let checksRun = 0;
  let checksPassed = 0;

  /** Record a check. Passing checks are counted but produce no noise. */
  const check = (passed: boolean, finding: () => Finding) => {
    checksRun++;
    if (passed) checksPassed++;
    else findings.push(finding());
  };

  // ── Homepage ────────────────────────────────────────────────────────────────
  // The default lives in app/layout.tsx; Settings overrides it when filled in.
  const homeTitle = (settings.seoHomeTitle ?? '').trim();
  const homeDesc = (settings.seoHomeDescription ?? '').trim();

  const titleSource = homeTitle ? 'Settings → seoHomeTitle' : 'the code default in layout.tsx';
  const effectiveTitle = homeTitle || '(code default)';

  check(!homeTitle || homeTitle.length <= TITLE_MAX, () => ({
    id: 'home-title-long',
    severity: 'warning',
    area: 'Homepage',
    title: `Homepage title is ${homeTitle.length} characters — Google will cut it off`,
    detail:
      `Google shows about ${TITLE_MAX} characters. Everything past that is invisible to shoppers, ` +
      `so anything important — including the shop name — has to come early.`,
    fix: `Shorten it in ${titleSource}, or accept that only the first ${TITLE_MAX} characters are read.`,
    items: [{ label: effectiveTitle, note: `${homeTitle.length} characters` }],
  }));

  check(!homeDesc || homeDesc.length <= DESC_MAX, () => ({
    id: 'home-desc-long',
    severity: 'warning',
    area: 'Homepage',
    title: `Homepage description is ${homeDesc.length} characters — the snippet will be cut`,
    detail: `Google shows about ${DESC_MAX} characters of the description underneath the title.`,
    fix: 'Trim it in Settings → seoHomeDescription so the sentence finishes.',
  }));

  check(!homeDesc || homeDesc.length >= DESC_MIN, () => ({
    id: 'home-desc-short',
    severity: 'info',
    area: 'Homepage',
    title: `Homepage description is only ${homeDesc.length} characters`,
    detail: 'A very short description wastes the space Google gives you to persuade someone to click.',
    fix: `Aim for ${DESC_MIN}–${DESC_MAX} characters in Settings → seoHomeDescription.`,
  }));

  check(Boolean((settings.googleSiteVerification ?? '').trim()), () => ({
    id: 'no-gsc',
    severity: 'critical',
    area: 'Homepage',
    title: 'Google Search Console is not verified',
    detail:
      'Without it you cannot see which searches bring people here, which pages Google has refused to index, ' +
      'or ask Google to re-read a page you have just fixed. Every other SEO decision is guesswork until this exists.',
    fix: 'Create the property at search.google.com/search-console, then paste the verification code into Settings → googleSiteVerification.',
  }));

  check(Boolean((settings.seoOgImage ?? '').trim()), () => ({
    id: 'no-og',
    severity: 'info',
    area: 'Homepage',
    title: 'No social sharing image set',
    detail:
      'When someone shares a link on WhatsApp or Facebook, this is the picture that appears. ' +
      'Without it the link looks bare and gets fewer taps.',
    fix: 'Upload one in Settings → seoOgImage. It falls back to /og-image.jpg for now.',
  }));

  // ── Technical ───────────────────────────────────────────────────────────────
  const origin = (() => {
    try {
      return new URL(req.url).origin;
    } catch {
      return SITE;
    }
  })();

  const sitemap = await fetchText(`${origin}/sitemap.xml`);
  const sitemapUrls = sitemap ? (sitemap.match(/<loc>/g) ?? []).length : 0;

  check(sitemapUrls > 20, () => ({
    id: 'sitemap',
    severity: 'critical',
    area: 'Technical',
    title: sitemap ? `The sitemap lists only ${sitemapUrls} pages` : 'The sitemap could not be read',
    detail:
      'The sitemap is the list of pages you are asking Google to look at. It is built live from the product API, ' +
      'so a short or missing sitemap usually means the API was not answering when it was built.',
    fix: 'Open /sitemap.xml yourself. If it is short, check that the backend API is up, then run this check again.',
  }));

  const robots = await fetchText(`${origin}/robots.txt`);
  const blocksEverything = Boolean(robots && /^\s*Disallow:\s*\/\s*$/im.test(robots));

  check(Boolean(robots) && !blocksEverything, () => ({
    id: 'robots',
    severity: 'critical',
    area: 'Technical',
    title: blocksEverything ? 'robots.txt is blocking the whole site from Google' : 'robots.txt could not be read',
    detail:
      'robots.txt tells search engines which pages they may read. A bare "Disallow: /" hides everything, ' +
      'and a site hidden this way disappears from Google entirely within a few weeks.',
    fix: 'Open /robots.txt. It should disallow only /admin and /api/ — nothing else.',
  }));

  // ── Collection pages ────────────────────────────────────────────────────────
  // Each collection is a keyword landing page that fills itself from the
  // catalogue. An empty one is a page built for a keyword you have no stock for.
  const collectionSets = new Map<string, number[]>();
  const empties: FindingItem[] = [];

  for (const def of Object.values(COLLECTIONS)) {
    const inSub = products.filter(
      p => (p.subcategory ?? '').trim().toLowerCase() === def.subcategory.trim().toLowerCase(),
    );
    const matched = inSub.filter(p => matchesCollection(p, def));
    collectionSets.set(
      def.slug,
      matched.map(p => p.dbId).sort((a, b) => a - b),
    );
    if (matched.length === 0) {
      empties.push({
        label: def.label,
        href: `/collections/${def.slug}`,
        note: `targets "${def.slug.replace(/-/g, ' ')}" — 0 products`,
      });
    }
  }

  check(empties.length === 0 || products.length === 0, () => ({
    id: 'empty-collections',
    severity: 'critical',
    area: 'Collections',
    title: `${empties.length} collection ${empties.length === 1 ? 'page is' : 'pages are'} empty`,
    detail:
      'These pages are built for keywords you have no stock for. They hide themselves from Google while empty, ' +
      'so they do no harm — but they also do no work. Anyone who does reach one finds nothing and leaves.',
    fix: 'Either add products in those subcategories, or remove the collection from lib/collections.ts.',
    count: empties.length,
    items: empties,
  }));

  // Two collections returning the same products are two pages competing for one
  // keyword. Google picks one and usually picks the wrong one.
  const dupes: FindingItem[] = [];
  const slugs = [...collectionSets.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = collectionSets.get(slugs[i])!;
      const b = collectionSets.get(slugs[j])!;
      if (a.length > 0 && a.length === b.length && a.every((id, k) => id === b[k])) {
        dupes.push({
          label: `${COLLECTIONS[slugs[i]].label}  ·  ${COLLECTIONS[slugs[j]].label}`,
          href: `/collections/${slugs[i]}`,
          note: `both show the same ${a.length} products`,
        });
      }
    }
  }

  check(dupes.length === 0, () => ({
    id: 'duplicate-collections',
    severity: 'warning',
    area: 'Collections',
    title: `${dupes.length} pair${dupes.length === 1 ? '' : 's'} of collection pages show identical products`,
    detail:
      'Two pages with the same products are two pages competing for the same search. Google picks one of them ' +
      'and the other earns nothing — and the one it picks is often not the one you would have chosen.',
    fix: 'Give each collection a different filter (a price cap, or different terms) so they hold genuinely different products.',
    count: dupes.length,
    items: dupes,
  }));

  const longTitles = Object.values(COLLECTIONS)
    .filter(d => d.title.length > TITLE_MAX)
    .map(d => ({ label: d.label, href: `/collections/${d.slug}`, note: `${d.title.length} characters` }));

  check(longTitles.length === 0, () => ({
    id: 'collection-title-long',
    severity: 'info',
    area: 'Collections',
    title: `${longTitles.length} collection title${longTitles.length === 1 ? '' : 's'} will be cut off in Google`,
    detail: `Anything past about ${TITLE_MAX} characters is not shown.`,
    fix: 'Shorten the title in lib/collections.ts.',
    count: longTitles.length,
    items: longTitles,
  }));

  const longDescs = Object.values(COLLECTIONS)
    .filter(d => d.description.length > DESC_MAX)
    .map(d => ({ label: d.label, href: `/collections/${d.slug}`, note: `${d.description.length} characters` }));

  check(longDescs.length === 0, () => ({
    id: 'collection-desc-long',
    severity: 'info',
    area: 'Collections',
    title: `${longDescs.length} collection description${longDescs.length === 1 ? '' : 's'} will be cut off`,
    detail: `Google shows about ${DESC_MAX} characters.`,
    fix: 'Shorten the description in lib/collections.ts.',
    count: longDescs.length,
    items: longDescs,
  }));

  // ── Category pages ──────────────────────────────────────────────────────────
  const emptyCats: FindingItem[] = [];
  for (const key of Object.keys(CATEGORY_SEO)) {
    const n = products.filter(p => (p.category ?? '').trim().toLowerCase() === key.toLowerCase()).length;
    if (n === 0) emptyCats.push({ label: key, href: `/${key}`, note: '0 products' });
  }

  check(emptyCats.length === 0 || products.length === 0, () => ({
    id: 'empty-categories',
    severity: 'warning',
    area: 'Categories',
    title: `${emptyCats.length} category page${emptyCats.length === 1 ? ' has' : 's have'} no products`,
    detail:
      'These pages have full SEO copy written for them but nothing to sell. They are linked from the menu, ' +
      'so a shopper can reach an empty shelf.',
    fix: 'Add stock to these categories, or take them out of the navigation until you do.',
    count: emptyCats.length,
    items: emptyCats,
  }));

  // ── Products ────────────────────────────────────────────────────────────────
  const pItems = (list: Product[], note?: (p: Product) => string): FindingItem[] =>
    list.slice(0, 40).map(p => ({
      label: p.name || `(no name — #${p.dbId})`,
      href: `/admin/products/${p.dbId}`,
      note: note?.(p),
    }));

  const noDesc = products.filter(p => !(p.description ?? '').trim());
  check(noDesc.length === 0, () => ({
    id: 'product-no-desc',
    severity: 'critical',
    area: 'Products',
    title: `${noDesc.length} product${noDesc.length === 1 ? ' has' : 's have'} no description`,
    detail:
      'The description is what Google shows underneath the product in search results, and it is most of what ' +
      'Google has to work out what the product even is. Without it the product competes on its name alone.',
    fix: 'Open each product and write two or three honest sentences — fabric, fit, and who it suits.',
    count: noDesc.length,
    items: pItems(noDesc),
  }));

  const thinDesc = products.filter(p => {
    const d = (p.description ?? '').trim();
    return d.length > 0 && d.length < PRODUCT_DESC_MIN;
  });
  check(thinDesc.length === 0, () => ({
    id: 'product-thin-desc',
    severity: 'warning',
    area: 'Products',
    title: `${thinDesc.length} description${thinDesc.length === 1 ? ' is' : 's are'} too short to say anything`,
    detail: `Under ${PRODUCT_DESC_MIN} characters there is no room for the words a shopper would actually search for.`,
    fix: 'Add fabric, fit, sleeve length, and the occasion it suits.',
    count: thinDesc.length,
    items: pItems(thinDesc, p => `${(p.description ?? '').trim().length} characters`),
  }));

  const noImage = products.filter(p => !(p.image ?? '').trim());
  check(noImage.length === 0, () => ({
    id: 'product-no-image',
    severity: 'critical',
    area: 'Products',
    title: `${noImage.length} product${noImage.length === 1 ? ' has' : 's have'} no photo`,
    detail:
      'Clothing is bought by eye. A product with no photo will not sell, and it cannot appear in Google Images, ' +
      'which is where a good share of fashion searches start.',
    fix: 'Add a photo to each of these.',
    count: noImage.length,
    items: pItems(noImage),
  }));

  const nameCount = new Map<string, number>();
  for (const p of products) {
    const n = (p.name ?? '').trim().toLowerCase();
    if (n) nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
  }
  const dupNames = products.filter(p => (nameCount.get((p.name ?? '').trim().toLowerCase()) ?? 0) > 1);
  check(dupNames.length === 0, () => ({
    id: 'product-dup-name',
    severity: 'warning',
    area: 'Products',
    title: `${dupNames.length} products share a name with another product`,
    detail:
      'Identical names give Google two pages it cannot tell apart, so it shows one and ignores the other. ' +
      'It also confuses shoppers comparing them.',
    fix: 'Add what actually differs — colour, print, or size — to each name.',
    count: dupNames.length,
    items: pItems(dupNames),
  }));

  const noSizes = products.filter(p => sizesOf(p).length === 0);
  check(noSizes.length === 0, () => ({
    id: 'product-no-sizes',
    severity: 'warning',
    area: 'Products',
    title: `${noSizes.length} product${noSizes.length === 1 ? ' has' : 's have'} no sizes set`,
    detail:
      'Size is the first thing a clothing or footwear shopper checks. Without it the size filter skips the product, ' +
      'Google cannot show it as available, and most people will not risk the order.',
    fix: 'Set the sizes on each product. Footwear without sizes is effectively unbuyable.',
    count: noSizes.length,
    items: pItems(noSizes, p => p.subcategory || p.category),
  }));

  const codeNames = products.filter(p => looksLikeInternalCode(p.name ?? ''));
  check(codeNames.length === 0, () => ({
    id: 'product-code-name',
    severity: 'warning',
    area: 'Products',
    title: `${codeNames.length} product name${codeNames.length === 1 ? ' looks like' : 's look like'} a warehouse code`,
    detail:
      'The product name becomes the title in Google. A name carrying a stock code reads as a serial number ' +
      'to a shopper, and nobody searches for a stock code.',
    fix: 'Move the code into the SKU field and give the product a name a customer would type.',
    count: codeNames.length,
    items: pItems(codeNames),
  }));

  const longNames = products.filter(p => (p.name ?? '').trim().length > 70);
  check(longNames.length === 0, () => ({
    id: 'product-long-name',
    severity: 'info',
    area: 'Products',
    title: `${longNames.length} product name${longNames.length === 1 ? ' is' : 's are'} too long for Google`,
    detail: 'Past about 70 characters the name is cut off mid-word in the search result.',
    fix: 'Put the important words first and trim the rest.',
    count: longNames.length,
    items: pItems(longNames, p => `${(p.name ?? '').trim().length} characters`),
  }));

  // ── Blog ────────────────────────────────────────────────────────────────────
  check(POSTS.length >= 6, () => ({
    id: 'thin-blog',
    severity: 'info',
    area: 'Blog',
    title: `Only ${POSTS.length} blog article${POSTS.length === 1 ? '' : 's'}`,
    detail:
      'Articles are how a small shop competes for searches that are questions rather than products — ' +
      '"which nighty fabric for summer", "how to measure petticoat length". Those searches are winnable ' +
      'when a category page is not.',
    fix: 'Write one article a month answering a question customers actually ask you on WhatsApp.',
  }));

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return NextResponse.json({
    success: true,
    ranAt: new Date().toISOString(),
    checksRun,
    checksPassed,
    productCount: products.length,
    productsError,
    sitemapUrls,
    findings,
    counts: {
      critical: findings.filter(f => f.severity === 'critical').length,
      warning: findings.filter(f => f.severity === 'warning').length,
      info: findings.filter(f => f.severity === 'info').length,
    },
  });
}
