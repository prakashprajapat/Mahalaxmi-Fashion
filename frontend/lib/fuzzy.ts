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
