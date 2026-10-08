// Client-side fuzzy matching for search. Mirrors the backend (ProductsController) so the
// /products?q= page and navbar suggestions tolerate the SAME typos + synonyms, instantly,
// even before/without the API round-trip.

const SYNONYMS: Record<string, string> = {
  sari: 'saree', sarees: 'saree', saris: 'saree', sadi: 'saree',
  nighty: 'nightie', nighties: 'nightie', nightgown: 'nightie',
  nightwear: 'nightie', nightsuit: 'nightie', nightdress: 'nightie',
  peticoat: 'petticoat', petticoats: 'petticoat', underskirt: 'petticoat',
  kurti: 'kurta', kurtis: 'kurta', kurtas: 'kurta',
  leggings: 'legging',
  lehnga: 'lehenga', lehanga: 'lehenga', langa: 'lehenga', lehengas: 'lehenga',
  duppata: 'dupatta', chunni: 'dupatta', chunri: 'dupatta',
  blouses: 'blouse',
  innerwear: 'inner', undergarment: 'inner', undergarments: 'inner',
  combos: 'combo', combopack: 'combo',
  perfumes: 'perfume', bodyspray: 'spray', deo: 'deodorant', deos: 'deodorant',
  mens: 'men', womens: 'women', ladies: 'women', kid: 'kids',
  cloths: 'fabric', clothes: 'fabric', material: 'fabric', materials: 'fabric',
  cotten: 'cotton', coton: 'cotton',
};

export function normalizeText(s?: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const canon = (t: string): string => SYNONYMS[t] ?? t;

function tokens(s?: string): string[] {
  return normalizeText(s).split(' ').filter(t => t.length >= 2).map(canon);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function tokenScore(qt: string, pTokens: string[]): number {
  let best = 0;
  for (const pt of pTokens) {
    let s = 0;
    if (pt === qt) s = 10;
    else if (pt.startsWith(qt) || qt.startsWith(pt)) s = 7;
    else if (qt.length >= 3 && pt.includes(qt)) s = 6;
    else {
      const allowed = qt.length <= 4 ? 1 : 2;
      const d = levenshtein(qt, pt);
      s = d <= allowed ? 5 - d : 0;
    }
    if (s > best) best = s;
  }
  return best;
}

// Relevance score of a query against a text "haystack" (name + category + …). 0 = no match.
export function fuzzyScore(query: string, haystack: string): number {
  const qNorm = normalizeText(query);
  if (qNorm.length < 2) return 0;
  const qTokens = Array.from(new Set(tokens(query)));
  const hNorm = normalizeText(haystack);
  const pTokens = tokens(haystack);

  let score = 0;
  if (hNorm.includes(qNorm)) score += 30;

  let matched = 0;
  for (const qt of qTokens) {
    const ts = tokenScore(qt, pTokens);
    if (ts > 0) matched++;
    score += ts;
  }
  if (matched === 0 && score < 20) return 0;
  if (qTokens.length && matched === qTokens.length) score += 8;
  return score;
}

export function fuzzyMatch(query: string, haystack: string): boolean {
  return fuzzyScore(query, haystack) > 0;
}

// Convenience: build a product's searchable haystack the same way everywhere.
export function productHaystack(p: {
  name?: string; category?: string; subcategory?: string; description?: string; sku?: string;
}): string {
  return [p.name, p.category, p.subcategory, p.sku, p.description].filter(Boolean).join(' ');
}

/** What a product IS: its name, its shelf, its code. Not what it is written about. */
export function productIdentity(p: {
  name?: string; category?: string; subcategory?: string; sku?: string;
}): string {
  return [p.name, p.category, p.subcategory, p.sku].filter(Boolean).join(' ');
}

// Search a product, with the description kept in its place.
//
// Searching "t-shirt" returned formal shoes. Nothing was broken in the matching
// itself - the description of those shoes mentions wearing them with a shirt, and
// the description sat in the same bag of words as the name, carrying the same
// weight. So a shoe that TALKS about shirts scored like a shirt.
//
// A description is written to sell a thing, not to name it. It says what to wear
// it with, what the weather suits it for, what someone might buy it instead of -
// every one of those words a trap for a shopper searching for that other thing.
//
// So the description can no longer make a product a result on its own: a product
// qualifies on its name, shelf or code, and only then may its description nudge
// the ordering. That nudge is capped at 3 points against a name match worth 30 or
// more, which is the difference between a whisper and a vote.
export function fuzzyScoreProduct(
  query: string,
  p: { name?: string; category?: string; subcategory?: string; description?: string; sku?: string },
): number {
  const base = fuzzyScore(query, productIdentity(p));
  if (base <= 0) return 0;
  const inWords = p.description ? fuzzyScore(query, p.description) : 0;
  return base + Math.min(inWords * 0.1, 3);
}

// ── Product codes ───────────────────────────────────────────────────────────
//
// A code is not a word, and the fuzzy matcher treats it like one. Typing
// MFH1045 used to return twenty products: the right one first, then every
// neighbouring code behind it, because tokenScore forgives a Levenshtein
// distance of two and MFH1042 is one character away. That forgiveness is the
// right behaviour for "peticoat" and exactly the wrong behaviour for a number
// somebody copied off an invoice - the whole point of a code is that it is
// either right or it is not.
//
// So an exact code is matched before any of that runs, and when it hits, it is
// the only answer.

/** A code reduced to what it IS: letters and digits. "mfh 1045" and "MFH-1045" are the same code. */
export function skuKey(s?: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * The single product whose code this is, or null.
 *
 * Null when two products somehow share a code, rather than picking one: a
 * silent guess about which of two things the customer meant is worse than
 * falling through to the ordinary search, which will show them both.
 */
export function exactSkuMatch<T extends { sku?: string }>(query: string, products: T[]): T | null {
  const k = skuKey(query);
  // Three characters is the shortest thing worth treating as a code. Below
  // that, "m" or "mf" would start hijacking ordinary searches.
  if (k.length < 3) return null;
  const hits = products.filter(p => skuKey(p.sku) === k);
  return hits.length === 1 ? hits[0] : null;
}
