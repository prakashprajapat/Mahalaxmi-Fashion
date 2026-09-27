import { colourNameToHex } from './googleColours';
// Maps preset colour NAMES (saved in extraJson.colors without hex codes) to a
// valid CSS colour, so swatches render correctly in Quick View and the product
// page even when no explicit colorCodes map was saved by the admin panel.
// "Dark Green" → "darkgreen", "Sky Blue" → "skyblue", etc.

const CSS_COLOUR_KEYWORDS = new Set([
  'red', 'blue', 'green', 'black', 'white', 'yellow', 'pink', 'orange',
  'purple', 'grey', 'gray', 'maroon', 'navy', 'darkgreen', 'darkblue',
  'darkred', 'skyblue', 'lightblue', 'lightgreen', 'lightpink', 'teal',
  'olive', 'brown', 'beige', 'gold', 'silver', 'magenta', 'cyan',
  'lavender', 'violet', 'indigo', 'coral', 'salmon', 'khaki', 'turquoise',
  'chocolate', 'crimson', 'orchid', 'plum', 'tan', 'wheat', 'ivory',
  'peachpuff', 'hotpink', 'deeppink', 'tomato', 'orangered', 'firebrick',
  'seagreen', 'forestgreen', 'limegreen', 'royalblue', 'steelblue',
  'slategrey', 'slategray', 'mistyrose', 'mintcream', 'aqua', 'lime',
]);

/** Returns a valid CSS colour for a preset colour name, or undefined if unknown. */
export function presetColourCode(name?: string): string | undefined {
  if (!name) return undefined;
  const key = name.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (CSS_COLOUR_KEYWORDS.has(key)) return key;
  // CSS ke keywords me "Mustard", "Rust", "Navy Blue", "Off White" jaise naam
  // nahi hain, lekin admin ki colour list me unka hex hai — wahan se le lo.
  return colourNameToHex(name);
}

/**
 * "Navy/White/Red" jaise print colour ka swatch — barabar hisson me banta hua
 * circle, taaki customer ko dikhe ki kapda ek rang ka nahi hai.
 * Ek hi colour ho to wahi flat colour wapas aata hai.
 */
export function swatchBackground(name?: string, shades?: string[]): string | undefined {
  const list = (shades && shades.length > 0)
    ? shades
    : String(name ?? '').split('/').map(s => colourNameToHex(s.trim()) ?? presetColourCode(s.trim()) ?? '').filter(Boolean);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  const stops = list.map((c, i) =>
    `${c} ${Math.round((i / list.length) * 100)}%, ${c} ${Math.round(((i + 1) / list.length) * 100)}%`).join(', ');
  return `linear-gradient(135deg, ${stops})`;
}
