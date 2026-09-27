// Google Merchant Center ka `color` attribute — saare niyam ek hi jagah.
// Spec: https://support.google.com/merchants/answer/6324487
//
//   • Total 1–100 characters, har ek colour 1–40 characters
//   • Zyada se zyada 3 colours: pehla PRIMARY, uske baad 2 aur, "/" se alag
//         Navy/White/Red      ✓
//         Navy, White, Red    ✗   (comma allowed nahi)
//   • Ek pehchana jaane wala colour ka NAAM hona chahiye
//   • Google ye values REJECT karta hai:
//         "multicolour", "various", "variety", "mens", "womens", "N/A",
//         "see image", hex code (#fff000), number, akela ek letter ("R")
//
// Apparel ke liye colour free listings me ZARURI hai — isliye khali chhodna bhi
// option nahi hai. Jis product ka koi ek fix colour nahi (print/pattern), uske
// liye sahi tarika hai: print ke 1-3 asli base colours bhejo, primary pehle.
//   Is chaddi ke liye:  Navy/White/Red

export type NamedColour = { name: string; r: number; g: number; b: number };

/** Colour naam jinhe Google pehchanta hai, RGB ke saath (nearest-match ke liye). */
export const NAMED_COLOURS: NamedColour[] = ([
  ['Red',         220, 30,  30 ], ['Dark Red',    139, 0,   0  ], ['Crimson',     220, 20,  60 ],
  ['Maroon',      128, 0,   0  ], ['Rose',        255, 102, 130], ['Coral',       255, 127, 80 ],
  ['Salmon',      250, 128, 114], ['Light Pink',  255, 182, 193], ['Pink',        255, 105, 180],
  ['Hot Pink',    255, 20,  147], ['Deep Pink',   200, 0,   100], ['Peach',       255, 200, 150],
  ['Orange',      255, 140, 0  ], ['Dark Orange', 210, 100, 0  ], ['Amber',       255, 180, 0  ],
  ['Gold',        255, 215, 0  ], ['Yellow',      255, 230, 0  ], ['Lemon',       255, 245, 100],
  ['Olive',       128, 128, 0  ], ['Light Green', 144, 238, 144], ['Green',       34,  139, 34 ],
  ['Dark Green',  0,   100, 0  ], ['Mint',        152, 251, 152], ['Teal',        0,   128, 128],
  ['Turquoise',   64,  224, 208], ['Cyan',        0,   200, 200], ['Sky Blue',    135, 206, 235],
  ['Light Blue',  173, 216, 230], ['Blue',        30,  80,  200], ['Royal Blue',  65,  105, 225],
  ['Navy Blue',   0,   0,   128], ['Dark Blue',   0,   0,   100], ['Indigo',      75,  0,   130],
  ['Violet',      148, 0,   211], ['Purple',      128, 0,   128], ['Dark Purple', 80,  0,   80 ],
  ['Lavender',    190, 160, 210], ['Plum',        142, 69,  133], ['Mauve',       200, 150, 170],
  ['Brown',       139, 69,  19 ], ['Dark Brown',  100, 40,  10 ], ['Chocolate',   80,  40,  20 ],
  ['Tan',         210, 180, 140], ['Beige',       245, 225, 195], ['Camel',       193, 154, 107],
  ['Cream',       255, 253, 208], ['Ivory',       255, 250, 240], ['Off White',   245, 240, 230],
  ['White',       255, 255, 255], ['Silver',      192, 192, 192], ['Light Grey',  211, 211, 211],
  ['Grey',        128, 128, 128], ['Dark Grey',   64,  64,  64 ], ['Black',       20,  20,  20 ],
  ['Rust',        183, 65,  14 ], ['Brick Red',   156, 50,  30 ], ['Wine',        114, 47,  55 ],
  ['Burgundy',    128, 0,   32 ], ['Mustard',     210, 175, 10 ], ['Khaki',       189, 183, 107],
  ['Copper',      184, 115, 51 ], ['Bronze',      150, 100, 50 ],
] as [string, number, number, number][]).map(([name, r, g, b]) => ({ name, r, g, b }));

/**
 * Wahi naam, lekin asli kapde wale shades.
 *
 * Upar wali list "kitaabi" rang hai — Navy Blue matlab (0,0,128). Asli navy
 * kapda (27,42,74) hota hai, aur usse sabse kareeb "Dark Grey" nikalta tha.
 * Ye list sirf naam dhoondhne ke liye hai (swatch ka rang upar wali se aata
 * hai), taaki photo se uthaya hua rang sahi naam par baithe.
 */
const FABRIC_SHADES: NamedColour[] = ([
  ['Navy Blue',   31,  42,  68 ], ['Navy Blue',   20,  35,  60 ], ['Blue',        45,  78,  140],
  ['Royal Blue',  40,  70,  160], ['Sky Blue',    150, 195, 225], ['Charcoal',    54,  58,  64 ],
  ['Red',         176, 45,  40 ], ['Red',         196, 52,  47 ], ['Brick Red',   170, 60,  45 ],
  ['Maroon',      104, 34,  44 ], ['Wine',        95,  40,  50 ], ['Burgundy',    110, 25,  45 ],
  ['Dark Green',  32,  68,  52 ], ['Green',       60,  120, 70 ], ['Olive',       110, 110, 60 ],
  ['Brown',       110, 75,  55 ], ['Dark Brown',  78,  55,  40 ], ['Beige',       225, 210, 185],
  ['Off White',   238, 234, 226], ['Cream',       245, 238, 215], ['Grey',        150, 150, 150],
  ['Light Grey',  195, 195, 195], ['Dark Grey',   80,  80,  80 ], ['Black',       35,  35,  35 ],
  ['Pink',        232, 140, 160], ['Light Pink',  245, 205, 210], ['Purple',      110, 60,  130],
  ['Mustard',     205, 165, 50 ], ['Teal',        40,  110, 110], ['Rust',        170, 80,  45 ],
] as [string, number, number, number][]).map(([name, r, g, b]) => ({ name, r, g, b }));

/** Naam se hex — pehli (canonical) entry hi chalti hai, fabric shades nahi. */
const BY_KEY = new Map<string, NamedColour>();
for (const c of NAMED_COLOURS) if (!BY_KEY.has(key(c.name))) BY_KEY.set(key(c.name), c);

// Naam dhoondhne ke liye dono lists — kitaabi + asli kapde wale shades.
const MATCH_SET: NamedColour[] = [...NAMED_COLOURS, ...FABRIC_SHADES];

function key(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/**
 * Do colours kitne alag dikhte hain. Plain RGB distance aankh se match nahi
 * karta, isliye "redmean" weighting — sasta hai aur nazar ke kaafi kareeb.
 */
export function colourDistance(a: { r: number; g: number; b: number }, b2: { r: number; g: number; b: number }): number {
  const rmean = (a.r + b2.r) / 2;
  const dr = a.r - b2.r, dg = a.g - b2.g, db = a.b - b2.b;
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

/** Hex se sabse kareeb ka Google-safe colour NAAM. */
export function nearestColourName(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '';
  let best = MATCH_SET[0];
  let bestDist = Infinity;
  for (const c of MATCH_SET) {
    const d = colourDistance(rgb, c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best.name;
}

/** Colour naam se hex — swatch circle bharne ke liye. Na mile to undefined. */
export function colourNameToHex(name?: string | null): string | undefined {
  if (!name) return undefined;
  const c = BY_KEY.get(key(name));
  return c ? rgbToHex(c.r, c.g, c.b) : undefined;
}

/** "Navy/White/Red" → ["Navy","White","Red"] */
export function splitColourValue(value?: string | null): string[] {
  return String(value ?? '').split('/').map(s => s.trim()).filter(Boolean);
}

/** ["Navy","White","Red"] → "Navy/White/Red" (Google ki 3-colour limit ke andar). */
export function joinColourValue(names: string[]): string {
  return names.map(s => s.trim()).filter(Boolean).slice(0, 3).join('/');
}

// Google in generic values ko colour maanta hi nahi.
const BANNED = new Set([
  'multicolour', 'multicolor', 'multi', 'multicoloured', 'multicolored',
  'various', 'variety', 'assorted', 'mixed', 'random', 'any', 'other',
  'mens', 'men', 'womens', 'women', 'kids', 'unisex',
  'na', 'n/a', 'none', 'nil', 'null', 'default', 'standard', 'normal',
  'seeimage', 'asperimage', 'asshown', 'image', 'photo', 'picture',
  'colour', 'color', 'colours', 'colors', 'shade', 'shades',
  'design', 'print', 'printed', 'pattern', 'style', 'model', 'fancy',
]);

/**
 * Ek colour value Google ke niyam pass karti hai ya nahi.
 * Pass hone par null, warna admin ke liye seedhi-saadi wajah.
 */
export function colourProblem(value?: string | null): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Colour khali hai — apparel ke liye Google colour maangta hai.';
  if (raw.includes(',')) return `"${raw}" me comma hai — Google sirf "/" maanta hai, jaise Navy/White/Red.`;
  if (raw.length > 100) return `Colour 100 characters se lamba hai (abhi ${raw.length}).`;

  const parts = splitColourValue(raw);
  if (parts.length === 0) return 'Colour khali hai.';
  if (parts.length > 3) return `${parts.length} colours diye hain — Google zyada se zyada 3 leta hai (primary pehle).`;

  for (const p of parts) {
    if (p.length > 40) return `"${p}" 40 characters se lamba hai.`;
    if (p.length < 2) return `"${p}" bahut chhota hai — Google akele ek letter ko colour nahi maanta.`;
    if (!/^[\p{L}\p{N} .'-]+$/u.test(p)) return `"${p}" me special character hai — Google sirf letters/numbers maanta hai (hex code jaise #1B2A4A allowed nahi).`;
    if (/^[\p{N} .'-]+$/u.test(p)) return `"${p}" sirf number hai — colour ka naam chahiye.`;
    if (BANNED.has(key(p))) return `Google "${p}" ko colour nahi maanta. Iski jagah print ke asli colours dein, jaise Navy/White/Red.`;
    if (/^(design|print|colou?r|style|model|shade|pattern)\b/i.test(p.trim()))
      return `"${p}" colour ka naam nahi hai. Print ke asli colours dein, jaise Navy/White/Red.`;
  }
  return null;
}

export function isColourValid(value?: string | null): boolean {
  return colourProblem(value) === null;
}
