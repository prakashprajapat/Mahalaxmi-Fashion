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
  return CSS_COLOUR_KEYWORDS.has(key) ? key : undefined;
}
