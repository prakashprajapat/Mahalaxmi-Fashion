// Photos past the four named views, and the one way they are stored.
//
// Front, side, back and zoomed are the four every garment should have, so they
// keep their names and their places. Everything after them - a fabric close-up,
// the stitched label, the same kurti on somebody taller - is just "another
// photo". There is no name worth giving those, so they are numbered: extra1,
// extra2, and so on.
//
// Numbered keys rather than a nested array, because both places that hold
// photos are flat maps of named slots (productPhotos, and each pack column),
// and every reader of them walks a list of key names. A nested array would have
// meant two shapes and two readers, and the reader that got forgotten is the
// one that silently drops half a product's photographs.
//
// This file exists because the same twelve lines had been written three times -
// in the product page, the quick view, and the edit screen's loader - and the
// fourth copy is where a sort gets left out and photo 10 appears before photo 2.

/** Four named views plus six more. Ten is where a customer stops scrolling. */
export const MAX_PHOTOS = 10;
export const MAX_EXTRA = MAX_PHOTOS - 4;

/**
 * The numbered photos out of a stored slot map, in their own order.
 *
 * Sorted by the number, not by the key: a plain string sort puts extra10
 * between extra1 and extra2, which is how the tenth photograph ends up second
 * in the gallery.
 */
export function numberedExtras(slots: Record<string, unknown> | null | undefined): string[] {
  if (!slots) return [];
  return Object.keys(slots)
    .filter(k => /^extra\d+$/.test(k))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
    .map(k => slots[k])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .slice(0, MAX_EXTRA);
}

/**
 * The other way round: a list of photos written back out as extra1..extraN.
 *
 * It tolerates a missing list rather than throwing, because the one caller that
 * can hand it one is a product being SAVED - a column loaded from older data
 * that has no extras field at all. Crashing there would lose the whole save.
 */
export function asNumberedExtras(extra: (string | undefined)[] | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  (extra ?? [])
    .map(v => (v ?? '').trim())
    .filter(Boolean)
    .slice(0, MAX_EXTRA)
    .forEach((url, i) => { out[`extra${i + 1}`] = url; });
  return out;
}

/** Every photo in a stored slot map, named views first, in gallery order. */
export function allSlotPhotos(slots: Record<string, unknown> | null | undefined): string[] {
  if (!slots) return [];
  const named = ['front', 'side', 'back', 'zoomed']
    .map(k => slots[k])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return [...named, ...numberedExtras(slots)];
}
